"""Ingestão MQTT: recebe a mensagem da caixinha, valida e grava em `registro`.

Atributos esperados no JSON (nomes exigidos pelo projeto):
  temperature, pressure, altitude, humidity, CO2, particula1, particula2, timestamp
`timestamp` (Unix, segundos) vira `registro_tempo`.
"""
import json
import os
from datetime import datetime, timezone

import paho.mqtt.client as mqtt

from bemplantado.models import Registro, db

CAMPOS = {  # campo do MQTT -> coluna do banco
    "temperature": "temperature",
    "pressure": "pressure",
    "altitude": "altitude",
    "humidity": "humidity",
    "CO2": "CO2",
    "particula1": "particula1",
    "particula2": "particula2",
}


def _numero(valor):
    try:
        return None if valor is None else float(valor)
    except (TypeError, ValueError):
        return None


def processar_payload(dados: dict):
    """Valida e grava uma leitura. Retorna (ok, mensagem). Precisa de app context."""
    if not isinstance(dados, dict):
        return False, "payload não é um objeto JSON"
    ts = dados.get("timestamp")
    if ts is None:
        return False, "timestamp não encontrado no payload"
    try:
        ts = int(ts)
        if ts > 10**11:  # veio em milissegundos
            ts //= 1000
        momento = datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
    except (ValueError, TypeError, OverflowError, OSError):
        return False, "timestamp inválido"

    if db.session.query(Registro.id).filter_by(registro_tempo=momento).first():
        return False, "registro duplicado ignorado"

    registro = Registro(registro_tempo=momento,
                        **{col: _numero(dados.get(campo)) for campo, col in CAMPOS.items()})
    try:
        db.session.add(registro)
        db.session.commit()
    except Exception as exc:  # noqa: BLE001
        db.session.rollback()
        return False, f"erro ao gravar: {exc}"
    return True, "registro gravado"


# Situação da ligação com o broker, mostrada por GET /api/mqtt/status (para demonstrar o fluxo).
ESTADO = {"conectado": False, "broker": None, "topico": None, "mensagens_recebidas": 0, "gravadas": 0,
          "ignoradas": 0, "ultima_mensagem_em": None, "ultimo_resultado": None}


def criar_cliente(app):
    """Cria o cliente MQTT com os tratadores prontos, SEM conectar (assim dá para testar sem rede)."""
    ESTADO["broker"] = os.getenv("MQTT_BROKER", "test.mosquitto.org")
    ESTADO["topico"] = os.getenv("MQTT_TOPIC", "projeto_integrado/SENAI134/Cienciadedados/GrupoX")
    topico = ESTADO["topico"]

    try:  # paho-mqtt 2.x
        client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
    except AttributeError:  # paho-mqtt 1.x
        client = mqtt.Client()

    def on_connect(client, userdata, flags, rc, properties=None):
        ESTADO["conectado"] = (getattr(rc, "value", rc) == 0)
        print(f"[MQTT] conectado (código {rc}); assinando {topico}")
        client.subscribe(topico)  # assina de novo a cada (re)conexão

    def on_disconnect(client, userdata, *args):
        ESTADO["conectado"] = False
        print("[MQTT] desconectado; o cliente tenta reconectar sozinho")

    def on_message(client, userdata, msg):
        ESTADO["mensagens_recebidas"] += 1
        ESTADO["ultima_mensagem_em"] = datetime.now(timezone.utc).isoformat().replace("+00:00", "Z")
        try:
            dados = json.loads(msg.payload.decode("utf-8"))
        except (UnicodeDecodeError, json.JSONDecodeError):
            ESTADO["ignoradas"] += 1
            ESTADO["ultimo_resultado"] = "mensagem ignorada: não é JSON válido"
            print("[MQTT] mensagem ignorada: não é JSON válido")
            return
        with app.app_context():
            ok, info = processar_payload(dados)
        ESTADO["gravadas" if ok else "ignoradas"] += 1
        ESTADO["ultimo_resultado"] = info
        print(f"[MQTT] {info}")

    client.on_connect = on_connect
    client.on_disconnect = on_disconnect
    client.on_message = on_message
    client.reconnect_delay_set(min_delay=2, max_delay=60)
    return client


def iniciar_mqtt(app):
    """Liga a API ao broker: conecta em segundo plano e grava cada mensagem válida em `registro`."""
    client = criar_cliente(app)
    porta = int(os.getenv("MQTT_PORT", "1883"))
    client.connect_async(ESTADO["broker"], porta, 60)  # não trava a API se o broker estiver fora
    client.loop_start()
    return client
