"""Simula a caixinha PELO MQTT: publica leituras no mesmo tópico que o sensor real usa.
Só é necessário para testar o caminho MQTT (FONTE_DADOS=mqtt). Com FONTE_DADOS=simulada
o próprio app já gera as leituras, sem broker.

Uso (na pasta do projeto):  python -m bemplantado.simulador            (uma leitura a cada 10 s)
      python -m bemplantado.simulador --historico 48   (publica antes as últimas 48 h, 1 leitura/10 min)
"""
import argparse
import json
import os
import time

import paho.mqtt.client as mqtt
from dotenv import load_dotenv

load_dotenv()

from bemplantado.fontes import gerar_leitura  # noqa: E402

BROKER = os.getenv("MQTT_BROKER", "test.mosquitto.org")
PORTA = int(os.getenv("MQTT_PORT", "1883"))
TOPICO = os.getenv("MQTT_TOPIC", "projeto_integrado/SENAI134/Cienciadedados/GrupoX")


def leitura(ts):
    return gerar_leitura(ts, os.getenv("SIM_CENARIO", "normal"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--historico", type=int, default=0, help="horas de histórico a enviar antes")
    args = ap.parse_args()

    try:
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    except AttributeError:
        client = mqtt.Client()
    client.connect(BROKER, PORTA, 60)
    client.loop_start()

    agora = time.time()
    for ts in range(int(agora - args.historico * 3600), int(agora), 600):
        client.publish(TOPICO, json.dumps(leitura(ts)))
        time.sleep(0.05)

    print(f"Publicando em {TOPICO} a cada 10 s. Ctrl+C para parar.")
    try:
        while True:
            dados = leitura(time.time())
            client.publish(TOPICO, json.dumps(dados))
            print(dados)
            time.sleep(10)
    except KeyboardInterrupt:
        client.loop_stop()


if __name__ == "__main__":
    main()
