"""Integrações externas: Pl@ntNet (foto -> espécie), Trefle (dados botânicos extras)
e Open-Meteo (previsão do tempo, sem chave).

Os cuidados e a rega vêm dos GRUPOS de plantas (grupos.py). O Trefle é só informação
complementar sobre a espécie. As chaves ficam em variáveis de ambiente (.env) e só o
servidor as usa: o navegador nunca recebe PLANTNET_API_KEY nem TREFLE_TOKEN.
"""
import os
import time

import requests

from bemplantado import texto

PLANTNET_URL = "https://my-api.plantnet.org/v2/identify/all"
TREFLE_URL = "https://trefle.io/api/v1"
METEO_URL = "https://api.open-meteo.com/v1/forecast"


class ServicoIndisponivel(Exception):
    """Serviço externo sem chave configurada ou fora do ar."""


# ---------------------------------------------------------------- Pl@ntNet
def identificar_planta(conteudo: bytes, nome_arquivo: str, mimetype: str):
    chave = os.getenv("PLANTNET_API_KEY")
    if not chave:
        raise ServicoIndisponivel("Chave do Pl@ntNet não configurada.")
    try:
        r = requests.post(
            PLANTNET_URL,
            params={"api-key": chave, "lang": "pt", "nb-results": 3,
                    "include-related-images": "false"},
            files={"images": (nome_arquivo or "planta.jpg", conteudo, mimetype or "image/jpeg")},
            data={"organs": "auto"},
            timeout=30,
        )
    except requests.RequestException as exc:
        raise ServicoIndisponivel("Não consegui falar com o Pl@ntNet.") from exc
    if r.status_code == 404:
        return []  # Pl@ntNet responde 404 quando não reconhece nenhuma espécie
    if r.status_code == 429:
        raise ServicoIndisponivel("Limite diário do Pl@ntNet atingido. Tente amanhã.")
    if not r.ok:
        raise ServicoIndisponivel(f"Pl@ntNet respondeu com erro {r.status_code}.")

    resultados = []
    for item in r.json().get("results", [])[:3]:
        esp = item.get("species", {})
        nomes = esp.get("commonNames") or []
        resultados.append({
            "nome_cientifico": esp.get("scientificNameWithoutAuthor"),
            "nome_popular": nomes[0] if nomes else None,
            "familia": (esp.get("family") or {}).get("scientificNameWithoutAuthor"),
            "confianca": round(float(item.get("score", 0)) * 100),
        })
    return resultados


# ------------------------------------------------------------------ Trefle
def buscar_especies_trefle(termo: str, limite: int = 5):
    """Busca por nome no Trefle (nomes populares costumam estar em inglês). [] se indisponível."""
    token = os.getenv("TREFLE_TOKEN")
    if not token:
        return []
    try:
        r = requests.get(f"{TREFLE_URL}/species/search",
                         params={"token": token, "q": termo}, timeout=10)
        r.raise_for_status()
        itens = r.json().get("data") or []
    except (requests.RequestException, ValueError):
        return []
    saida = []
    for i in itens:
        # a busca do Trefle é "aproximada": só ficam resultados cujo nome popular, gênero ou nome
        # científico começa com o texto (o epíteto da espécie sozinho não vale: "Ruellia jiboia" não é a jiboia)
        cientifico = i.get("scientific_name") or ""
        genero = cientifico.split()[0] if cientifico else ""
        if not (texto.casa(i.get("common_name"), termo) or texto.casa(genero, termo)
                or texto.norm(cientifico).startswith(texto.norm(termo))):
            continue
        if i.get("scientific_name") and i.get("rank", "species") == "species":
            saida.append({"nome_cientifico": i["scientific_name"],
                          "nome_popular": i.get("common_name")})
        if len(saida) >= limite:
            break
    return saida


def buscar_trefle(nome_cientifico: str):
    """Devolve os dados de cultivo do Trefle, ou None (sem token, sem dados ou fora do ar)."""
    token = os.getenv("TREFLE_TOKEN")
    if not token or not nome_cientifico:
        return None
    try:
        busca = requests.get(f"{TREFLE_URL}/species/search",
                             params={"token": token, "q": nome_cientifico}, timeout=10)
        busca.raise_for_status()
        achados = busca.json().get("data") or []
        if not achados:
            return None
        detalhe = requests.get(f"{TREFLE_URL}/species/{achados[0]['id']}",
                               params={"token": token}, timeout=10)
        detalhe.raise_for_status()
        dados = detalhe.json().get("data") or {}
    except (requests.RequestException, KeyError, ValueError):
        return None

    crescimento = dados.get("growth") or (dados.get("main_species") or {}).get("growth") or {}

    def graus(campo):
        valor = crescimento.get(campo)
        return valor.get("deg_c") if isinstance(valor, dict) else None

    return {
        "nome_popular": dados.get("common_name"),
        "temp_min": graus("minimum_temperature"),
        "temp_max": graus("maximum_temperature"),
        "umidade_solo": crescimento.get("soil_humidity"),  # escala 0 (seco) a 10 (úmido)
        "umidade_ar": crescimento.get("atmospheric_humidity"),  # escala 0 a 10
    }


def referencia_botanica(nome: str):
    """Informação extra do Trefle sobre um nome (não define cuidados nem rega). {} se não achar."""
    for achado in buscar_especies_trefle(nome, 1):
        extra = buscar_trefle(achado["nome_cientifico"]) or {}
        dados = {"temp_min": extra.get("temp_min"), "temp_max": extra.get("temp_max"),
                 "umidade_solo": extra.get("umidade_solo"), "umidade_ar": extra.get("umidade_ar")}
        if all(v is None for v in dados.values()):
            return {}  # achou o nome, mas sem dado de cultivo: não há o que mostrar
        return {"nome_cientifico": achado["nome_cientifico"],
                "nome_popular": achado.get("nome_popular") or extra.get("nome_popular"), **dados}
    return {}


# --------------------------------------------------------------- Open-Meteo
_cache_previsao = {"chave": None, "quando": 0, "dados": None}


def previsao_tempo(latitude: float, longitude: float, dias: int = 7):
    """Previsão diária. Cache de 30 min para respeitar o uso gratuito."""
    chave = (round(latitude, 2), round(longitude, 2), dias)
    if _cache_previsao["chave"] == chave and time.time() - _cache_previsao["quando"] < 1800:
        return _cache_previsao["dados"]
    try:
        r = requests.get(METEO_URL, params={
            "latitude": latitude, "longitude": longitude,
            "daily": "temperature_2m_max,temperature_2m_min,precipitation_sum,"
                     "precipitation_probability_max",
            "timezone": "America/Sao_Paulo", "forecast_days": dias,
        }, timeout=10)
        r.raise_for_status()
        d = r.json()["daily"]
    except (requests.RequestException, KeyError, ValueError) as exc:
        raise ServicoIndisponivel("Previsão do tempo indisponível agora.") from exc

    dados = []
    for i, dia in enumerate(d["time"]):
        dados.append({
            "data": dia,
            "tmax": d["temperature_2m_max"][i],
            "tmin": d["temperature_2m_min"][i],
            "chuva_mm": d["precipitation_sum"][i] or 0,
            "chuva_prob": d["precipitation_probability_max"][i] or 0,
        })
    _cache_previsao.update(chave=chave, quando=time.time(), dados=dados)
    return dados
