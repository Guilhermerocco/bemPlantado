"""Testa o fluxo MQTT -> ingestão -> banco -> API, sem precisar de internet nem de broker.

A mensagem é entregue ao MESMO tratador (`on_message`) que o cliente MQTT usa de verdade;
só o transporte de rede é substituído por uma mensagem criada na hora.

Uso:  python -m unittest testes.test_mqtt_api -v
"""
import json
import os
import sys
import tempfile
import unittest

os.environ["FONTE_DADOS"] = "nenhuma"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import paho.mqtt.client as mqtt  # noqa: E402

_pasta = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_pasta, "teste.db").replace("\\", "/")

from bemplantado import ingestao  # noqa: E402
from app import criar_app  # noqa: E402
from bemplantado.models import Registro, db  # noqa: E402

TS = 1763380800  # 2025-11-17 12:00:00 UTC


def mensagem(payload, topico="projeto_integrado/SENAI134/Cienciadedados/GrupoX"):
    msg = mqtt.MQTTMessage(topic=topico.encode())
    msg.payload = payload if isinstance(payload, bytes) else json.dumps(payload).encode("utf-8")
    return msg


LEITURA = {"temperature": 24.5, "pressure": 1012.3, "altitude": 760, "humidity": 55.2,
           "CO2": 480, "particula1": 6.5, "particula2": 11.2, "timestamp": TS}


class FluxoMqttApi(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = criar_app(com_fonte=False)
        cls.http = cls.app.test_client()
        cls.cliente = ingestao.criar_cliente(cls.app)  # cliente real, só que sem conectar

    def setUp(self):
        with self.app.app_context():
            Registro.query.delete()
            db.session.commit()
        for k in ("mensagens_recebidas", "gravadas", "ignoradas"):
            ingestao.ESTADO[k] = 0

    def receber(self, payload):
        self.cliente.on_message(self.cliente, None, mensagem(payload))

    def test_mensagem_valida_e_gravada_com_os_nomes_do_projeto(self):
        self.receber(LEITURA)
        r = self.http.get("/api/registros?inicio=2025-11-17T00:00:00Z&fim=2025-11-18T00:00:00Z").get_json()
        self.assertEqual(r["total"], 1)
        reg = r["registros"][0]
        for campo in ("id", "temperature", "pressure", "altitude", "humidity", "CO2", "particula1", "particula2", "registro_tempo"):
            self.assertIn(campo, reg)
        self.assertEqual(reg["temperature"], 24.5)
        self.assertEqual(reg["CO2"], 480)
        self.assertEqual(reg["registro_tempo"], "2025-11-17T12:00:00Z")  # timestamp -> registro_tempo

    def test_api_consulta_por_periodo(self):
        for i in range(5):
            self.receber({**LEITURA, "timestamp": TS + i * 600})
        dentro = self.http.get("/api/registros?inicio=2025-11-17T12:00:00Z&fim=2025-11-17T12:20:00Z").get_json()
        self.assertEqual(dentro["total"], 3)
        fora = self.http.get("/api/registros?inicio=2025-11-18T00:00:00Z&fim=2025-11-19T00:00:00Z").get_json()
        self.assertEqual(fora["total"], 0)

    def test_ultimo_registro(self):
        self.receber(LEITURA)
        self.receber({**LEITURA, "timestamp": TS + 600, "temperature": 30})
        u = self.http.get("/api/registros/ultimo").get_json()
        self.assertEqual(u["registro"]["temperature"], 30)

    def test_mensagem_duplicada_e_ignorada(self):
        self.receber(LEITURA)
        self.receber({**LEITURA, "temperature": 99})  # mesmo timestamp
        with self.app.app_context():
            self.assertEqual(Registro.query.count(), 1)
            self.assertEqual(Registro.query.first().temperature, 24.5)
        self.assertEqual(ingestao.ESTADO["ignoradas"], 1)

    def test_campos_ausentes_ficam_nulos(self):
        self.receber({"temperature": 22.0, "timestamp": TS})
        reg = self.http.get("/api/registros?inicio=2025-11-17T00:00:00Z&fim=2025-11-18T00:00:00Z").get_json()["registros"][0]
        self.assertEqual(reg["temperature"], 22.0)
        self.assertIsNone(reg["CO2"])
        self.assertIsNone(reg["particula1"])

    def test_timestamp_em_milissegundos(self):
        self.receber({**LEITURA, "timestamp": TS * 1000})
        reg = self.http.get("/api/registros/ultimo").get_json()["registro"]
        self.assertEqual(reg["registro_tempo"], "2025-11-17T12:00:00Z")

    def test_mensagens_invalidas_nao_derrubam_nada(self):
        self.receber(b"isto nao e json")
        self.receber({"temperature": 20})  # sem timestamp
        self.receber({**LEITURA, "timestamp": "abc"})
        self.receber([1, 2, 3])
        with self.app.app_context():
            self.assertEqual(Registro.query.count(), 0)
        self.assertEqual(ingestao.ESTADO["mensagens_recebidas"], 4)
        self.assertEqual(ingestao.ESTADO["gravadas"], 0)
        self.receber(LEITURA)  # e a próxima mensagem boa continua funcionando
        with self.app.app_context():
            self.assertEqual(Registro.query.count(), 1)

    def test_status_da_ligacao_mqtt(self):
        self.receber(LEITURA)
        s = self.http.get("/api/mqtt/status").get_json()
        self.assertEqual(s["mensagens_recebidas"], 1)
        self.assertEqual(s["gravadas"], 1)
        self.assertEqual(s["ultimo_resultado"], "registro gravado")
        self.assertIn("GrupoX", s["topico"])

    def test_periodo_invalido_retorna_400(self):
        self.assertEqual(self.http.get("/api/registros?inicio=banana").status_code, 400)
        self.assertEqual(self.http.get("/api/registros?inicio=2025-11-18T00:00:00Z&fim=2025-11-17T00:00:00Z").status_code, 400)


if __name__ == "__main__":
    unittest.main(verbosity=2)
