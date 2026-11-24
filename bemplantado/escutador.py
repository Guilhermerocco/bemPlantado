"""ESCUTADOR DA CAIXINHA: fica ligado, assina o tópico MQTT e grava cada leitura no banco (o do DATABASE_URL, ex.: Supabase).

A Vercel não consegue manter uma conexão MQTT aberta, então este programa precisa rodar em algum computador que fique ligado
(notebook, computador da escola, Raspberry ou um serviço na nuvem). O site publicado só lê o banco; quem escreve é este programa.

Uso (na pasta do projeto):
    python -m bemplantado.escutador

Lê o .env: MQTT_BROKER, MQTT_PORT, MQTT_TOPIC (o tópico do grupo, no lugar de GrupoX) e DATABASE_URL.
Ao subir, troca a fonte de dados para "mqtt": as leituras FICTÍCIAS são apagadas uma vez e as plantas ficam.
Para parar: Ctrl+C.
"""
import os
import sys
import time

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, RAIZ)

from dotenv import load_dotenv  # noqa: E402

load_dotenv(os.path.join(RAIZ, ".env"))
os.environ["FONTE_DADOS"] = "mqtt"  # este programa é sempre a fonte real (força, mesmo que o .env diga "simulada")

from app import app  # noqa: E402  (ao importar, o app prepara o banco e já liga o cliente MQTT)
from bemplantado.ingestao import ESTADO  # noqa: E402


def main():
    topico = ESTADO.get("topico") or os.getenv("MQTT_TOPIC", "")
    print("=" * 64)
    print(" Escutador da caixinha BemPlantado")
    print(f" Broker: {ESTADO.get('broker')}   Tópico: {topico}")
    banco = app.config["SQLALCHEMY_DATABASE_URI"].split("@")[-1]
    print(f" Banco:  {banco}")
    if topico.endswith("/GrupoX"):
        print(" ATENÇÃO: o tópico ainda termina em GrupoX. Troque pelo tópico do seu grupo em MQTT_TOPIC (.env).")
    print("=" * 64)
    print("Aguardando leituras... (Ctrl+C para parar)")
    ultimo_total = -1
    try:
        while True:
            time.sleep(30)
            total = ESTADO["mensagens_recebidas"]
            situacao = "conectado" if ESTADO["conectado"] else "SEM conexão com o broker (tentando de novo)"
            if total != ultimo_total or not ESTADO["conectado"]:
                print(f"[{time.strftime('%H:%M:%S')}] {situacao} | recebidas: {total} | gravadas: {ESTADO['gravadas']} | "
                      f"ignoradas: {ESTADO['ignoradas']} | última: {ESTADO['ultimo_resultado']}")
                ultimo_total = total
    except KeyboardInterrupt:
        print("\nEscutador parado.")


if __name__ == "__main__":
    main()
