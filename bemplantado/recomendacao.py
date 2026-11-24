"""Regras do BemPlantado: quando regar e como está o ambiente.

Importante: a caixinha mede a UMIDADE DO AR, não a umidade da terra. Por isso o
cálculo parte do intervalo de rega da espécie e o ajusta com o ambiente:
  - calor acima do ideal  -> rega mais cedo (x0,75)
  - frio abaixo do ideal  -> rega mais tarde (x1,25)
  - ar mais seco que o ideal -> rega mais cedo (x0,85)
  - planta externa: se a chuva prevista (>= 5 mm) cai no dia da rega, adia
O botão "Reguei" (ultima_rega) reinicia a contagem.
"""
from datetime import date, timedelta

CHUVA_QUE_REGA_MM = 5.0
LIMITE_DADOS_ANTIGOS_MIN = 60


def _por_dia(previsao):
    return {p["data"]: p for p in (previsao or [])}


def ambiente(planta, leitura):
    """Compara temperatura e umidade atuais com o que a planta aguenta."""
    if leitura is None:
        return {"temperatura": "sem_dado", "umidade": "sem_dado",
                "mensagem": "Ainda não recebi leituras do sensor."}
    t, u = leitura.temperature, leitura.humidity
    temp, umid, avisos = "ok", "ok", []
    if t is None:
        temp = "sem_dado"
    elif planta.temp_max is not None and t > planta.temp_max:
        temp = "quente"
        avisos.append(f"Está quente ({t:.0f} °C). O ideal é até {planta.temp_max:.0f} °C.")
    elif planta.temp_min is not None and t < planta.temp_min:
        temp = "frio"
        avisos.append(f"Está frio ({t:.0f} °C). O ideal é a partir de {planta.temp_min:.0f} °C.")
    if u is None:
        umid = "sem_dado"
    elif planta.umid_min is not None and u < planta.umid_min:
        umid = "seco"
        avisos.append(f"O ar está seco ({u:.0f}%). Ela prefere pelo menos {planta.umid_min:.0f}%.")
    mensagem = " ".join(avisos) or "O ambiente está bom para ela."
    return {"temperatura": temp, "umidade": umid, "mensagem": mensagem}


def calcular_rega(planta, leitura, previsao, hoje=None):
    hoje = hoje or date.today()
    fator, motivos = 1.0, []

    if leitura is not None:
        t, u = leitura.temperature, leitura.humidity
        if t is not None and planta.temp_max is not None and t > planta.temp_max:
            fator *= 0.75
            motivos.append("Está quente, então ela pede água mais cedo.")
        elif t is not None and planta.temp_min is not None and t < planta.temp_min:
            fator *= 1.25
            motivos.append("Está frio, então ela gasta menos água.")
        if u is not None and planta.umid_min is not None and u < planta.umid_min:
            fator *= 0.85
            motivos.append("O ar está seco, então a terra seca mais rápido.")

    intervalo = max(1, round(planta.intervalo_rega_dias * fator))
    proxima = planta.data_base_rega() + timedelta(days=intervalo)

    # Planta externa: a chuva forte do dia da rega faz o trabalho.
    if planta.ambiente == "externo":
        dias = _por_dia(previsao)
        while True:
            p = dias.get(proxima.isoformat())
            if p and proxima >= hoje and p["chuva_mm"] >= CHUVA_QUE_REGA_MM:
                motivos.append(f"Vai chover forte em {proxima.strftime('%d/%m')}: "
                               "a chuva rega por você.")
                proxima += timedelta(days=1)
            else:
                break

    restante = (proxima - hoje).days
    if restante < 0:
        status, texto = "regar_hoje", f"Está com a rega atrasada há {-restante} dia(s). Regue hoje."
    elif restante == 0:
        status, texto = "regar_hoje", "Hoje é dia de regar."
    elif restante == 1:
        status, texto = "amanha", "Regue amanhã."
    elif restante <= 3:
        status, texto = "em_breve", f"Regue daqui a {restante} dias."
    else:
        status, texto = "ok", f"Está tudo certo. Próxima rega em {restante} dias."

    # Datas de rega dos próximos ~2 meses, para o calendário.
    agenda, d = [], max(proxima, hoje)
    while d <= hoje + timedelta(days=62):
        agenda.append(d.isoformat())
        d += timedelta(days=intervalo)

    return {
        "status": status,
        "mensagem": texto,
        "motivos": motivos,
        "intervalo_ajustado_dias": intervalo,
        "dias_restantes": restante,
        "proxima_rega": proxima.isoformat(),
        "agenda": agenda,
        "ultima_rega": planta.data_base_rega().isoformat(),
    }
