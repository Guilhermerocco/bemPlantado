"""Fontes de dados do sensor, trocáveis por uma linha no .env:  FONTE_DADOS=...

  simulada  -> gera leituras fictícias (padrão, para desenvolver e apresentar)
  mqtt      -> recebe da caixinha real pelo broker MQTT
  nenhuma   -> não inicia fonte nenhuma (útil em testes)

Qualquer fonte entrega um dict com os mesmos atributos da caixinha
(temperature, pressure, altitude, humidity, CO2, particula1, particula2, timestamp)
para `ingestao.processar_payload`, que valida e grava. Por isso API, dashboard e
regras de rega não sabem (nem precisam saber) de onde veio a leitura.

Para criar uma nova fonte (ex.: serial/USB, HTTP, outro broker): escreva uma função
`iniciar_xxx(app)` que chame `processar_payload(dados)` dentro de `app.app_context()`
e registre-a em FONTES.
"""
import calendar
import math
import os
import random
import threading
import time
from datetime import datetime, timezone

from sqlalchemy.exc import IntegrityError

from bemplantado.ingestao import CAMPOS, iniciar_mqtt, processar_payload
from bemplantado.models import Configuracao, Registro, db

PASSO_HISTORICO_SEG = 600  # histórico fictício: 1 leitura a cada 10 min

# cenário -> (variação de temperatura em °C, variação de umidade em pontos %)
CENARIOS = {"normal": (0, 0), "calor": (8, -15), "frio": (-9, 5), "seco": (0, -25)}


def gerar_leitura(ts, cenario="normal"):
    """Leitura fictícia plausível para o instante `ts` (Unix). Determinística por instante."""
    rng = random.Random(int(ts))
    dtemp, dumid = CENARIOS.get(cenario, CENARIOS["normal"])
    hora = ((ts - 3 * 3600) % 86400) / 3600  # hora aproximada de Brasília
    onda = math.sin((hora - 9) / 24 * 2 * math.pi)  # máxima por volta das 15 h
    temperatura = 23 + 5 * onda + dtemp + rng.uniform(-0.3, 0.3)
    umidade = min(95.0, max(15.0, 62 - 14 * onda + dumid + rng.uniform(-1, 1)))
    return {
        "temperature": round(temperatura, 1),
        "pressure": round(rng.uniform(1009, 1014), 1),
        "altitude": 760.0,
        "humidity": round(umidade, 1),
        "CO2": rng.randint(420, 700),
        "particula1": round(rng.uniform(3, 12), 1),
        "particula2": round(rng.uniform(5, 20), 1),
        "timestamp": int(ts),
    }


# ------------------------------------------------------------------ simulada
PASSO_SOB_DEMANDA_SEG = 300  # no modo serverless: 1 leitura fictícia a cada 5 min
_ultima_sincronizacao = {"quando": 0.0}


def _config_simulada():
    horas = max(1, int(os.getenv("SIM_HISTORICO_HORAS", "72")))
    cenario = os.getenv("SIM_CENARIO", "normal")
    if cenario not in CENARIOS:
        print(f"[SIM] cenário '{cenario}' desconhecido; usando 'normal'. Opções: {', '.join(CENARIOS)}")
        cenario = "normal"
    return horas, cenario


def modo_sob_demanda():
    """Na Vercel (serverless) não há processo ligado o tempo todo: as leituras fictícias
    são geradas quando alguém acessa a API, numa grade fixa de 5 min (igual em todas as instâncias)."""
    return bool(os.getenv("VERCEL")) or os.getenv("SIM_SOB_DEMANDA") == "1"


def sincronizar_simulada(app, forcar=False):
    """Completa as leituras fictícias até agora. Barato: no máximo a cada 20 s por instância."""
    if not app.config.get("SIM_SOB_DEMANDA"):
        return 0
    agora = time.time()
    if not forcar and agora - _ultima_sincronizacao["quando"] < 20:
        return 0
    _ultima_sincronizacao["quando"] = agora

    horas, cenario = _config_simulada()
    passo = PASSO_SOB_DEMANDA_SEG
    with app.app_context():
        inicio = -(-int(agora - horas * 3600) // passo) * passo  # arredonda para cima na grade
        ultimo = db.session.query(db.func.max(Registro.registro_tempo)).scalar()
        if ultimo is not None:
            inicio = max(inicio, calendar.timegm(ultimo.timetuple()) + passo)
        fim = int(agora) // passo * passo
        instantes = range(inicio, fim + 1, passo)
        if not instantes:
            return 0

        linhas = []
        for ts in instantes:
            d = gerar_leitura(ts, cenario)
            linha = {col: d[campo] for campo, col in CAMPOS.items()}
            linha["registro_tempo"] = datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
            linhas.append(linha)
        try:
            db.session.bulk_insert_mappings(Registro, linhas)
            db.session.commit()
            return len(linhas)
        except IntegrityError:  # outra instância gravou os mesmos instantes ao mesmo tempo
            db.session.rollback()
            return sum(processar_payload(gerar_leitura(ts, cenario))[0] for ts in instantes)


def iniciar_simulada(app):
    intervalo = max(1, int(os.getenv("SIM_INTERVALO_SEG", "30")))
    horas, cenario = _config_simulada()

    if modo_sob_demanda():
        app.config["SIM_SOB_DEMANDA"] = True
        n = sincronizar_simulada(app, forcar=True)
        print(f"[SIM] fonte simulada SOB DEMANDA (cenário '{cenario}'); {n} leituras preenchidas")
        return None

    agora = int(time.time())
    with app.app_context():
        ultimo = db.session.query(db.func.max(Registro.registro_tempo)).scalar()
        inicio = agora - horas * 3600
        if ultimo is not None:  # só completa o que falta desde a última leitura
            inicio = max(inicio, calendar.timegm(ultimo.timetuple()) + PASSO_HISTORICO_SEG)
        gravados = 0
        for ts in range(inicio, agora, PASSO_HISTORICO_SEG):
            ok, _ = processar_payload(gerar_leitura(ts, cenario))
            gravados += ok
    print(f"[SIM] fonte simulada ativa (cenário '{cenario}', 1 leitura a cada {intervalo}s); "
          f"{gravados} leituras de histórico preenchidas")

    parar = threading.Event()

    def laco():
        while not parar.is_set():
            with app.app_context():
                processar_payload(gerar_leitura(time.time(), cenario))
            parar.wait(intervalo)

    threading.Thread(target=laco, name="fonte-simulada", daemon=True).start()
    return parar


# ---------------------------------------------------------------- escolha
FONTES = {"simulada": iniciar_simulada, "mqtt": iniciar_mqtt}


def fonte_gravada():
    c = db.session.get(Configuracao, "fonte_dados")
    return c.valor if c else None


def _gravar_fonte(nome):
    c = db.session.get(Configuracao, "fonte_dados")
    if c:
        c.valor = nome
    else:
        db.session.add(Configuracao(chave="fonte_dados", valor=nome))
    db.session.commit()


def iniciar_fonte(app):
    """Inicia a fonte escolhida em FONTE_DADOS, sem nunca misturar dados fictícios com reais."""
    nome = os.getenv("FONTE_DADOS", "simulada").strip().lower()
    if nome == "nenhuma":
        return None
    if nome not in FONTES:
        raise ValueError(f"FONTE_DADOS='{nome}' inválida. Use: {', '.join(FONTES)} ou nenhuma.")

    with app.app_context():
        anterior = fonte_gravada()
        tem_registros = db.session.query(Registro.id).first() is not None
        if nome == "simulada":
            if tem_registros and anterior != "simulada":
                print("[FONTE] O banco já tem leituras reais (ou de origem desconhecida). "
                      "A fonte simulada NÃO foi iniciada para não misturar dados. "
                      "Use outro DATABASE_URL para a demonstração.")
                return None
        elif anterior == "simulada" and tem_registros:
            apagados = Registro.query.delete()
            db.session.commit()
            print(f"[FONTE] Troca de simulada para {nome}: {apagados} leituras fictícias apagadas. "
                  "Suas plantas foram mantidas.")
        _gravar_fonte(nome)
    return FONTES[nome](app)
