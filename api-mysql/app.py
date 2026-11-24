from flask import Flask, Response, request
from flask_sqlalchemy import SQLAlchemy
try:
    from flask_cors import CORS  # opcional: só é preciso quando o site chamar a API
except ImportError:
    CORS = None
from sqlalchemy.exc import IntegrityError
from werkzeug.security import generate_password_hash
import paho.mqtt.client as mqtt
from datetime import datetime, timezone
import json
import os
import requests

app = Flask('bemPlantado')
if CORS:
    CORS(app)  # libera o site (Vercel, outro domínio) para chamar esta API
app.config['SQLALCHEMY_TRACK_MODIFICATIONS'] = False
app.config['SQLALCHEMY_ENGINE_OPTIONS'] = {"pool_pre_ping": True, "pool_recycle": 280}

# Senha NÃO fica mais no código: defina a variável de ambiente DATABASE_URL.
# Exemplo local: mysql+pymysql://root:SUA_SENHA@localhost/bemPlantado  (troque @ na senha por %40)
app.config['SQLALCHEMY_DATABASE_URI'] = os.environ.get(
    'DATABASE_URL', 'mysql+pymysql://root:Guiguinho0@localhost/bemPlantado')
# Limite de upload das fotos (a Pl@ntNet aceita até 5 imagens e 50 MB no total)
app.config['MAX_CONTENT_LENGTH'] = 25 * 1024 * 1024

# Chaves das APIs de plantas: SEMPRE por variável de ambiente, nunca no código
PLANTNET_API_KEY = os.environ.get('PLANTNET_API_KEY')
TREFLE_TOKEN = os.environ.get('TREFLE_TOKEN')
PLANTNET_URL = '2b1045txM8lVTMIf2RFLDrrxse'
TREFLE_URL = 'usr-j4uNe5cQqaoYvYi7R1M7EgTek6snJkHz6ggDlEIEUFY'
ORGAOS_VALIDOS = {'auto', 'leaf', 'flower', 'fruit', 'bark'}
EXTENSOES_FOTO = {'jpg', 'jpeg', 'png'}

MQTT_BROKER = os.environ.get('MQTT_BROKER', 'test.mosquitto.org')
MQTT_PORT = int(os.environ.get('MQTT_PORT', 1883))
# Confirme com o professor/caixa qual é o tópico real (GrupoX parece ser um modelo)
MQTT_TOPIC = os.environ.get('MQTT_TOPIC', 'projeto_integrado/SENAI134/Cienciadedados/grupoX')

mybd = SQLAlchemy(app)


class Usuario(mybd.Model):
    __tablename__ = 'usuario'
    id = mybd.Column(mybd.Integer, primary_key=True)
    nome = mybd.Column(mybd.String(120))
    cpf = mybd.Column(mybd.String(11))
    email = mybd.Column(mybd.String(255))
    telefone = mybd.Column(mybd.String(20))
    senha_hash = mybd.Column(mybd.String(255))
    criado_em = mybd.Column(mybd.DateTime)

    def to_json(self):
        return{
            "id": self.id,
            "nome": self.nome,
            "cpf": self.cpf,
            "email": self.email,
            "telefone": self.telefone,
            "criado_em": str(self.criado_em)
        }


class GrupoPlanta(mybd.Model):
    __tablename__ = 'grupo_planta'
    id = mybd.Column(mybd.Integer, primary_key=True)
    nome = mybd.Column(mybd.String(80))
    exemplos = mybd.Column(mybd.String(255))
    temp_min = mybd.Column(mybd.Float)
    temp_max = mybd.Column(mybd.Float)
    umid_min = mybd.Column(mybd.Float)
    umid_max = mybd.Column(mybd.Float)
    intervalo_rega_dias = mybd.Column(mybd.Integer)
    dica_base = mybd.Column(mybd.Text)

    def to_json(self):
        return{
            "id": self.id,
            "nome": self.nome,
            "exemplos": self.exemplos,
            "temp_min": self.temp_min,
            "temp_max": self.temp_max,
            "umid_min": self.umid_min,
            "umid_max": self.umid_max,
            "intervalo_rega_dias": self.intervalo_rega_dias,
            "dica_base": self.dica_base
        }


class Favorito(mybd.Model):
    __tablename__ = 'favorito'
    usuario_id = mybd.Column(mybd.Integer, primary_key=True)
    grupo_id = mybd.Column(mybd.Integer, primary_key=True)
    criado_em = mybd.Column(mybd.DateTime)

    def to_json(self):
        return{
            "usuario_id": self.usuario_id,
            "grupo_id": self.grupo_id,
            "criado_em": str(self.criado_em)
        }


class Registro(mybd.Model):
    __tablename__ = 'registro'
    id = mybd.Column(mybd.Integer, primary_key=True)
    temperature = mybd.Column(mybd.Float)
    pressure = mybd.Column(mybd.Float)
    altitude = mybd.Column(mybd.Float)
    humidity = mybd.Column(mybd.Float)
    CO2 = mybd.Column(mybd.Float)
    particula1 = mybd.Column(mybd.Float)
    particula2 = mybd.Column(mybd.Float)
    registro_tempo = mybd.Column(mybd.DateTime, unique=True)

    def to_json(self):
        return{
            "id": self.id,
            "temperature": self.temperature,
            "pressure": self.pressure,
            "altitude": self.altitude,
            "humidity": self.humidity,
            "CO2": self.CO2,
            "particula1": self.particula1,
            "particula2": self.particula2,
            "registro_tempo": str(self.registro_tempo)
        }


class Insight(mybd.Model):
    __tablename__ = 'insight'
    id = mybd.Column(mybd.Integer, primary_key=True)
    grupo_id = mybd.Column(mybd.Integer)
    registro_id = mybd.Column(mybd.Integer)
    texto = mybd.Column(mybd.Text)
    modelo = mybd.Column(mybd.String(60))
    criado_em = mybd.Column(mybd.DateTime)

    def to_json(self):
        return{
            "id": self.id,
            "grupo_id": self.grupo_id,
            "registro_id": self.registro_id,
            "texto": self.texto,
            "modelo": self.modelo,
            "criado_em": str(self.criado_em)
        }


class Identificacao(mybd.Model):
    __tablename__ = 'identificacao'
    id = mybd.Column(mybd.Integer, primary_key=True)
    usuario_id = mybd.Column(mybd.Integer)
    grupo_id = mybd.Column(mybd.Integer)
    nome_cientifico = mybd.Column(mybd.String(255))
    nome_comum = mybd.Column(mybd.String(255))
    familia = mybd.Column(mybd.String(120))
    genero = mybd.Column(mybd.String(120))
    confianca = mybd.Column(mybd.Float)
    trefle_id = mybd.Column(mybd.Integer)
    analise = mybd.Column(mybd.Text)   # JSON com o resultado da análise
    criado_em = mybd.Column(mybd.DateTime)

    def to_json(self):
        try:
            analise = json.loads(self.analise) if self.analise else None
        except ValueError:
            analise = self.analise
        return{
            "id": self.id,
            "usuario_id": self.usuario_id,
            "grupo_id": self.grupo_id,
            "nome_cientifico": self.nome_cientifico,
            "nome_comum": self.nome_comum,
            "familia": self.familia,
            "genero": self.genero,
            "confianca": self.confianca,
            "trefle_id": self.trefle_id,
            "analise": analise,
            "criado_em": str(self.criado_em)
        }


# ********************* CONEXÃO SENSORES *********************************

mqtt_data = {}
# Status para diagnóstico (veja GET /status)
mqtt_status = {"conectado": False, "topico": MQTT_TOPIC, "broker": MQTT_BROKER,
               "mensagens_recebidas": 0, "registros_salvos": 0,
               "ultima_mensagem": None, "ultimo_erro": None}

def on_connect(client, userdata, flags, rc, properties=None):
    # rc: 0 = sucesso; outro valor = erro. (Assinatura compatível com paho-mqtt 2.x)
    print("Conectado ao broker, código " + str(rc))
    mqtt_status["conectado"] = (rc == 0)
    client.subscribe(MQTT_TOPIC)  # re-inscreve sempre que reconectar
    print("Inscrito no tópico:", MQTT_TOPIC)

def on_disconnect(client, userdata, *args):
    mqtt_status["conectado"] = False
    print("Desconectado do broker; o paho tenta reconectar sozinho")

def on_message(client, userdata, msg):
    global mqtt_data
    mqtt_status["mensagens_recebidas"] += 1
    try:
        payload = msg.payload.decode('utf-8')
        mqtt_data = json.loads(payload)
    except Exception as e:
        mqtt_status["ultimo_erro"] = f"Payload não é JSON: {e}"
        print(mqtt_status["ultimo_erro"], msg.payload[:200])
        return

    mqtt_status["ultima_mensagem"] = mqtt_data
    print(f"Mensagem recebida em {msg.topic}: {mqtt_data}")

    # Adiciona o contexto da aplicação para a manipulação do banco de dados
    with app.app_context():
        try:
            temperatura = mqtt_data.get('temperature')
            pressao = mqtt_data.get('pressure')
            altitude = mqtt_data.get('altitude')
            umidade = mqtt_data.get('humidity')
            co2 = mqtt_data.get('CO2')
            poeira1 = mqtt_data.get('particula1')
            poeira2 = mqtt_data.get('particula2')
            timestamp_unix = mqtt_data.get('timestamp')

            # Converte timestamp Unix para datetime (UTC, sem fuso, que é o que o DATETIME do MySQL guarda).
            # Se a caixa não mandar timestamp, usa a hora do servidor em vez de descartar a leitura.
            try:
                if timestamp_unix is None:
                    timestamp = datetime.now(timezone.utc).replace(tzinfo=None)
                else:
                    ts = float(timestamp_unix)
                    if ts > 1e12:  # veio em milissegundos
                        ts = ts / 1000
                    timestamp = datetime.fromtimestamp(ts, tz=timezone.utc).replace(tzinfo=None)
            except (ValueError, TypeError) as e:
                mqtt_status["ultimo_erro"] = f"Erro ao converter timestamp: {e}"
                print(mqtt_status["ultimo_erro"])
                return

            # Cria o objeto Registro com os dados
            new_data = Registro(
                temperature=temperatura,
                pressure=pressao,
                altitude=altitude,
                humidity=umidade,
                CO2=co2,
                particula1=poeira1,
                particula2=poeira2,
                registro_tempo=timestamp
            )

            # Adiciona o novo registro ao banco de dados
            mybd.session.add(new_data)
            mybd.session.commit()
            mqtt_status["registros_salvos"] += 1
            print("Dados inseridos no banco de dados com sucesso")

        except IntegrityError:
            # registro_tempo é UNIQUE: a mesma leitura chegou duas vezes
            mybd.session.rollback()
            print("Leitura repetida (mesmo timestamp), ignorada")
        except Exception as e:
            mqtt_status["ultimo_erro"] = f"Erro ao salvar no banco: {e}"
            print(mqtt_status["ultimo_erro"])
            mybd.session.rollback()

try:  # paho-mqtt 2.x
    mqtt_client = mqtt.Client(mqtt.CallbackAPIVersion.VERSION2)
except AttributeError:  # paho-mqtt 1.x
    mqtt_client = mqtt.Client()
mqtt_client.on_connect = on_connect
mqtt_client.on_disconnect = on_disconnect
mqtt_client.on_message = on_message

def start_mqtt():
    # connect_async: se o broker estiver fora, a API sobe mesmo assim e fica tentando
    mqtt_client.connect_async(MQTT_BROKER, MQTT_PORT, 60)
    mqtt_client.loop_start()

# ---------------------------- DIAGNÓSTICO ----------------------------

@app.route("/status", methods=["GET"])
def status():
    try:
        total = Registro.query.count()
        ultimo = Registro.query.order_by(Registro.id.desc()).first()
        banco = {"ok": True, "total_registros": total,
                 "ultimo_registro": ultimo.to_json() if ultimo else None}
    except Exception as e:
        banco = {"ok": False, "erro": str(e)}
    return gera_resposta(200, "status", {"mqtt": mqtt_status, "banco": banco})

@app.route("/registros/ultimo", methods=["GET"])
def ultimo_registro():
    ultimo = Registro.query.order_by(Registro.registro_tempo.desc()).first()
    if not ultimo:
        return gera_resposta(404, "registros", {}, "Nenhum registro ainda")
    return gera_resposta(200, "registros", ultimo.to_json())

# CONTEUDO

# ---------------------------- USUARIO ----------------------------

@app.route("/usuarios", methods = ["GET"])
def selecionar_usuario():
    usuario_objeto = Usuario.query.all()
    usuario_json = [usuario.to_json() for usuario in usuario_objeto]
    return gera_resposta(200, "usuarios", usuario_json)

@app.route("/usuarios/<id>", methods=["GET"])
def usuario_por_id(id):
    usuario_objeto = Usuario.query.filter_by(id=id).first()
    usuario_json = usuario_objeto.to_json()
    return gera_resposta(200, "usuarios", usuario_json)

@app.route("/usuarios", methods=["POST"])
def cria_usuarios():
    novo = request.get_json()

    try:
        usuario = Usuario(
            nome = novo["nome"],
            cpf = novo["cpf"],
            email = novo["email"],
            telefone = novo["telefone"],
            senha_hash = generate_password_hash(novo["senha"]),
            criado_em = datetime.now()
        )

        mybd.session.add(usuario)
        mybd.session.commit()

        return gera_resposta(201, "usuarios", usuario.to_json(), "criado com sucesso!")
    except Exception as e:
        print("Erro", e)
        return gera_resposta(400, "usuarios", {}, "Alguma coisa de errado aconteceu!")

@app.route("/usuarios/<id>", methods=["PUT"])
def atualizar_usuario(id):
    usuario_objeto = Usuario.query.filter_by(id=id).first()
    body = request.get_json()
    try:
        if 'nome' in body:
            usuario_objeto.nome = body['nome']
        if 'cpf' in body:
            usuario_objeto.cpf = body['cpf']
        if 'email' in body:
            usuario_objeto.email = body['email']
        if 'telefone' in body:
            usuario_objeto.telefone = body['telefone']
        if 'senha' in body:
            usuario_objeto.senha_hash = generate_password_hash(body['senha'])

        mybd.session.add(usuario_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'usuarios', usuario_objeto.to_json(), "Atualizado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'usuarios', {}, "Erro ao atualizar")

@app.route("/usuarios/<id>", methods=["DELETE"])
def deleta_usuario(id):
    usuario_objeto = Usuario.query.filter_by(id=id).first()

    try:
        mybd.session.delete(usuario_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'usuarios', usuario_objeto.to_json(), "Deletado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'usuarios', {}, "Erro ao deletar")

# ------------------------- GRUPO_PLANTA --------------------------

@app.route("/grupos_planta", methods = ["GET"])
def selecionar_grupo():
    grupo_objeto = GrupoPlanta.query.all()
    grupo_json = [grupo.to_json() for grupo in grupo_objeto]
    return gera_resposta(200, "grupos_planta", grupo_json)

@app.route("/grupos_planta/<id>", methods=["GET"])
def grupo_por_id(id):
    grupo_objeto = GrupoPlanta.query.filter_by(id=id).first()
    grupo_json = grupo_objeto.to_json()
    return gera_resposta(200, "grupos_planta", grupo_json)

@app.route("/grupos_planta", methods=["POST"])
def cria_grupos():
    novo = request.get_json()

    try:
        grupo = GrupoPlanta(
            nome = novo["nome"],
            exemplos = novo["exemplos"],
            temp_min = novo["temp_min"],
            temp_max = novo["temp_max"],
            umid_min = novo["umid_min"],
            umid_max = novo["umid_max"],
            intervalo_rega_dias = novo["intervalo_rega_dias"],
            dica_base = novo["dica_base"]
        )

        mybd.session.add(grupo)
        mybd.session.commit()

        return gera_resposta(201, "grupos_planta", grupo.to_json(), "criado com sucesso!")
    except Exception as e:
        print("Erro", e)
        return gera_resposta(400, "grupos_planta", {}, "Alguma coisa de errado aconteceu!")

@app.route("/grupos_planta/<id>", methods=["PUT"])
def atualizar_grupo(id):
    grupo_objeto = GrupoPlanta.query.filter_by(id=id).first()
    body = request.get_json()
    try:
        if 'nome' in body:
            grupo_objeto.nome = body['nome']
        if 'exemplos' in body:
            grupo_objeto.exemplos = body['exemplos']
        if 'temp_min' in body:
            grupo_objeto.temp_min = body['temp_min']
        if 'temp_max' in body:
            grupo_objeto.temp_max = body['temp_max']
        if 'umid_min' in body:
            grupo_objeto.umid_min = body['umid_min']
        if 'umid_max' in body:
            grupo_objeto.umid_max = body['umid_max']
        if 'intervalo_rega_dias' in body:
            grupo_objeto.intervalo_rega_dias = body['intervalo_rega_dias']
        if 'dica_base' in body:
            grupo_objeto.dica_base = body['dica_base']

        mybd.session.add(grupo_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'grupos_planta', grupo_objeto.to_json(), "Atualizado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'grupos_planta', {}, "Erro ao atualizar")

@app.route("/grupos_planta/<id>", methods=["DELETE"])
def deleta_grupo(id):
    grupo_objeto = GrupoPlanta.query.filter_by(id=id).first()

    try:
        mybd.session.delete(grupo_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'grupos_planta', grupo_objeto.to_json(), "Deletado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'grupos_planta', {}, "Erro ao deletar")

# ---------------------------- FAVORITO ---------------------------

@app.route("/favoritos", methods = ["GET"])
def selecionar_favorito():
    favorito_objeto = Favorito.query.all()
    favorito_json = [favorito.to_json() for favorito in favorito_objeto]
    return gera_resposta(200, "favoritos", favorito_json)

@app.route("/favoritos/<usuario_id>/<grupo_id>", methods=["GET"])
def favorito_por_id(usuario_id, grupo_id):
    favorito_objeto = Favorito.query.filter_by(usuario_id=usuario_id, grupo_id=grupo_id).first()
    favorito_json = favorito_objeto.to_json()
    return gera_resposta(200, "favoritos", favorito_json)

@app.route("/favoritos", methods=["POST"])
def cria_favoritos():
    novo = request.get_json()

    try:
        favorito = Favorito(
            usuario_id = novo["usuario_id"],
            grupo_id = novo["grupo_id"],
            criado_em = datetime.now()
        )

        mybd.session.add(favorito)
        mybd.session.commit()

        return gera_resposta(201, "favoritos", favorito.to_json(), "criado com sucesso!")
    except Exception as e:
        print("Erro", e)
        return gera_resposta(400, "favoritos", {}, "Alguma coisa de errado aconteceu!")

@app.route("/favoritos/<usuario_id>/<grupo_id>", methods=["DELETE"])
def deleta_favorito(usuario_id, grupo_id):
    favorito_objeto = Favorito.query.filter_by(usuario_id=usuario_id, grupo_id=grupo_id).first()

    try:
        mybd.session.delete(favorito_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'favoritos', favorito_objeto.to_json(), "Deletado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'favoritos', {}, "Erro ao deletar")

# ---------------------------- REGISTRO ---------------------------

@app.route("/registros", methods = ["GET"])
def selecionar_registro():
    registro_objeto = Registro.query.all()
    registro_json = [registro.to_json() for registro in registro_objeto]
    return gera_resposta(200, "registros", registro_json)

@app.route("/registros/<id>", methods=["GET"])
def registro_por_id(id):
    registro_objeto = Registro.query.filter_by(id=id).first()
    registro_json = registro_objeto.to_json()
    return gera_resposta(200, "registros", registro_json)

@app.route("/registros", methods=["POST"])
def cria_registros():
    novo = request.get_json()

    try:
        registro = Registro(
            temperature = novo["temperature"],
            pressure = novo["pressure"],
            altitude = novo["altitude"],
            humidity = novo["humidity"],
            CO2 = novo["CO2"],
            particula1 = novo["particula1"],
            particula2 = novo["particula2"],
            registro_tempo = novo["registro_tempo"]
        )

        mybd.session.add(registro)
        mybd.session.commit()

        return gera_resposta(201, "registros", registro.to_json(), "criado com sucesso!")
    except Exception as e:
        print("Erro", e)
        return gera_resposta(400, "registros", {}, "Alguma coisa de errado aconteceu!")

@app.route("/registros/<id>", methods=["PUT"])
def atualizar_registro(id):
    registro_objeto = Registro.query.filter_by(id=id).first()
    body = request.get_json()
    try:
        if 'temperature' in body:
            registro_objeto.temperature = body['temperature']
        if 'pressure' in body:
            registro_objeto.pressure = body['pressure']
        if 'altitude' in body:
            registro_objeto.altitude = body['altitude']
        if 'humidity' in body:
            registro_objeto.humidity = body['humidity']
        if 'CO2' in body:
            registro_objeto.CO2 = body['CO2']
        if 'particula1' in body:
            registro_objeto.particula1 = body['particula1']
        if 'particula2' in body:
            registro_objeto.particula2 = body['particula2']
        if 'registro_tempo' in body:
            registro_objeto.registro_tempo = body['registro_tempo']

        mybd.session.add(registro_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'registros', registro_objeto.to_json(), "Atualizado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'registros', {}, "Erro ao atualizar")

@app.route("/registros/<id>", methods=["DELETE"])
def deleta_registro(id):
    registro_objeto = Registro.query.filter_by(id=id).first()

    try:
        mybd.session.delete(registro_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'registros', registro_objeto.to_json(), "Deletado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'registros', {}, "Erro ao deletar")

# ---------------------------- INSIGHT ----------------------------

@app.route("/insights", methods = ["GET"])
def selecionar_insight():
    insight_objeto = Insight.query.all()
    insight_json = [insight.to_json() for insight in insight_objeto]
    return gera_resposta(200, "insights", insight_json)

@app.route("/insights/<id>", methods=["GET"])
def insight_por_id(id):
    insight_objeto = Insight.query.filter_by(id=id).first()
    insight_json = insight_objeto.to_json()
    return gera_resposta(200, "insights", insight_json)

@app.route("/insights", methods=["POST"])
def cria_insights():
    novo = request.get_json()

    try:
        insight = Insight(
            grupo_id = novo["grupo_id"],
            registro_id = novo["registro_id"],
            texto = novo["texto"],
            modelo = novo["modelo"],
            criado_em = datetime.now()
        )

        mybd.session.add(insight)
        mybd.session.commit()

        return gera_resposta(201, "insights", insight.to_json(), "criado com sucesso!")
    except Exception as e:
        print("Erro", e)
        return gera_resposta(400, "insights", {}, "Alguma coisa de errado aconteceu!")

@app.route("/insights/<id>", methods=["PUT"])
def atualizar_insight(id):
    insight_objeto = Insight.query.filter_by(id=id).first()
    body = request.get_json()
    try:
        if 'grupo_id' in body:
            insight_objeto.grupo_id = body['grupo_id']
        if 'registro_id' in body:
            insight_objeto.registro_id = body['registro_id']
        if 'texto' in body:
            insight_objeto.texto = body['texto']
        if 'modelo' in body:
            insight_objeto.modelo = body['modelo']

        mybd.session.add(insight_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'insights', insight_objeto.to_json(), "Atualizado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'insights', {}, "Erro ao atualizar")

@app.route("/insights/<id>", methods=["DELETE"])
def deleta_insight(id):
    insight_objeto = Insight.query.filter_by(id=id).first()

    try:
        mybd.session.delete(insight_objeto)
        mybd.session.commit()

        return gera_resposta(200, 'insights', insight_objeto.to_json(), "Deletado com sucesso!!!")
    except Exception as e:
        print('Erro', e)
        return gera_resposta(400, 'insights', {}, "Erro ao deletar")

# ============================ PLANTAS (Pl@ntNet + Trefle) ============================
# Pl@ntNet: identifica a espécie pela foto.  Trefle: traz os dados de cultivo da espécie.
# A análise cruza a faixa ideal da planta com a última leitura dos sensores (tabela registro).

class ErroAPI(Exception):
    def __init__(self, status, mensagem):
        super().__init__(mensagem)
        self.status = status
        self.mensagem = mensagem


def identificar_plantnet(fotos, orgaos):
    """fotos: lista de (nome_arquivo, bytes, mimetype). Devolve o JSON da Pl@ntNet."""
    if not PLANTNET_API_KEY:
        raise ErroAPI(500, "PLANTNET_API_KEY não configurada no servidor")
    arquivos = [('images', (nome, conteudo, tipo)) for nome, conteudo, tipo in fotos]
    try:
        resp = requests.post(
            PLANTNET_URL,
            params={'api-key': PLANTNET_API_KEY, 'lang': 'pt', 'nb-results': 3},
            files=arquivos,
            data={'organs': orgaos},
            timeout=40)
    except requests.RequestException as e:
        raise ErroAPI(502, f"Não foi possível falar com a Pl@ntNet: {e}")

    if resp.status_code == 404:
        raise ErroAPI(404, "Nenhuma planta reconhecida na foto. Tente uma foto mais próxima da folha ou flor.")
    if resp.status_code in (401, 403):
        raise ErroAPI(502, "Chave da Pl@ntNet inválida ou sem permissão")
    if resp.status_code == 429:
        raise ErroAPI(429, "Limite diário de identificações da Pl@ntNet atingido")
    if resp.status_code != 200:
        raise ErroAPI(502, f"Pl@ntNet respondeu {resp.status_code}: {resp.text[:200]}")
    return resp.json()


def _trefle_get(caminho, **params):
    """GET na Trefle com 2 tentativas (ela às vezes demora). Devolve o JSON ou None."""
    params['token'] = TREFLE_TOKEN
    for tentativa in (1, 2):
        try:
            r = requests.get(f"{TREFLE_URL}{caminho}", params=params, timeout=30)
            if r.status_code == 200:
                return r.json()
            print(f"Trefle {caminho} respondeu {r.status_code}: {r.text[:200]}")
            if r.status_code in (401, 403, 404):
                return None
        except (requests.RequestException, ValueError) as e:
            print(f"Trefle {caminho} tentativa {tentativa} falhou: {e}")
    return None


def buscar_trefle(nome_cientifico):
    """Procura a espécie na Trefle. Devolve o JSON completo da espécie ou None."""
    if not TREFLE_TOKEN or not nome_cientifico:
        return None
    nome = nome_cientifico.strip()
    alvo = nome.lower()

    itens = []
    # 1) filtro exato por nome científico  2) busca de texto  3) busca só pelo gênero
    for caminho, params in (
        ("/species", {"filter[scientific_name]": nome}),
        ("/species/search", {"q": nome}),
        ("/species/search", {"q": nome.split()[0]}),
    ):
        dados = _trefle_get(caminho, **params)
        itens = (dados or {}).get('data') or []
        if itens:
            break
    if not itens:
        print(f"Trefle: nada encontrado para '{nome}'")
        return None

    escolhido = next((i for i in itens if (i.get('scientific_name') or '').lower() == alvo), itens[0])
    detalhe = _trefle_get(f"/species/{escolhido['id']}")
    return (detalhe or {}).get('data') or escolhido


def _graus(valor):
    # A Trefle manda temperatura como {"deg_c": x, "deg_f": y}
    if isinstance(valor, dict):
        return valor.get('deg_c')
    return valor


def resumir_trefle(especie):
    """Pega só o que interessa para o site."""
    if not especie:
        return None
    growth = especie.get('growth') or {}
    spec = especie.get('specifications') or {}
    return {
        "trefle_id": especie.get('id'),
        "nome_cientifico": especie.get('scientific_name'),
        "nome_comum": especie.get('common_name'),
        "familia": especie.get('family'),
        "imagem": especie.get('image_url'),
        "comestivel": especie.get('edible'),
        "toxicidade": spec.get('toxicity'),
        "crescimento": {
            "temp_min_c": _graus(growth.get('minimum_temperature')),
            "temp_max_c": _graus(growth.get('maximum_temperature')),
            "umidade_ar_0a10": growth.get('atmospheric_humidity'),
            "luz_0a10": growth.get('light'),
            "umidade_solo_0a10": growth.get('soil_humidity'),
            "ph_min": growth.get('ph_minimum'),
            "ph_max": growth.get('ph_maximum'),
        }
    }


def encontrar_grupo(nome_comum, genero, familia):
    """Tenta achar um grupo_planta cadastrado cujos 'exemplos' citem a planta."""
    termos = [t.lower() for t in (nome_comum, genero, familia) if t]
    if not termos:
        return None
    for grupo in GrupoPlanta.query.all():
        exemplos = (grupo.exemplos or '').lower()
        if any(t in exemplos for t in termos):
            return grupo
    return None


def _comparar(valor, minimo, maximo, unidade, nome):
    if valor is None or minimo is None or maximo is None:
        return {"status": "sem_dados", "mensagem": f"Sem dados suficientes de {nome}"}
    if valor < minimo:
        return {"status": "abaixo", "atual": valor, "ideal": [minimo, maximo],
                "mensagem": f"{nome.capitalize()} de {valor}{unidade} está abaixo do ideal ({minimo}–{maximo}{unidade})"}
    if valor > maximo:
        return {"status": "acima", "atual": valor, "ideal": [minimo, maximo],
                "mensagem": f"{nome.capitalize()} de {valor}{unidade} está acima do ideal ({minimo}–{maximo}{unidade})"}
    return {"status": "ok", "atual": valor, "ideal": [minimo, maximo],
            "mensagem": f"{nome.capitalize()} de {valor}{unidade} está dentro do ideal"}


def gerar_analise(resumo_trefle, grupo, registro):
    """Cruza a faixa ideal (grupo cadastrado > Trefle) com a última leitura dos sensores."""
    cresc = (resumo_trefle or {}).get('crescimento') or {}

    # Faixa de temperatura: prioriza o grupo cadastrado por vocês; senão usa a Trefle
    if grupo and grupo.temp_min is not None and grupo.temp_max is not None:
        t_min, t_max, fonte_temp = grupo.temp_min, grupo.temp_max, "grupo_planta"
    else:
        t_min, t_max, fonte_temp = cresc.get('temp_min_c'), cresc.get('temp_max_c'), "trefle"

    # Faixa de umidade do ar: grupo cadastrado; senão converte a escala 0–10 da Trefle (estimativa)
    if grupo and grupo.umid_min is not None and grupo.umid_max is not None:
        u_min, u_max, fonte_umid = grupo.umid_min, grupo.umid_max, "grupo_planta"
    elif cresc.get('umidade_ar_0a10') is not None:
        centro = cresc['umidade_ar_0a10'] * 10
        u_min, u_max, fonte_umid = max(0, centro - 15), min(100, centro + 15), "trefle_estimado"
    else:
        u_min = u_max = None
        fonte_umid = None

    temp_atual = registro.temperature if registro else None
    umid_atual = registro.humidity if registro else None

    analise = {
        "leitura_usada": registro.to_json() if registro else None,
        "temperatura": dict(_comparar(temp_atual, t_min, t_max, "°C", "temperatura"), fonte=fonte_temp),
        "umidade": dict(_comparar(umid_atual, u_min, u_max, "%", "umidade do ar"), fonte=fonte_umid),
        "dicas": []
    }

    if grupo:
        analise["grupo"] = {"id": grupo.id, "nome": grupo.nome}
        if grupo.intervalo_rega_dias:
            analise["dicas"].append(f"Regar a cada {grupo.intervalo_rega_dias} dia(s)")
        if grupo.dica_base:
            analise["dicas"].append(grupo.dica_base)

    luz = cresc.get('luz_0a10')
    if luz is not None:
        if luz >= 7:
            analise["dicas"].append("Gosta de bastante sol direto")
        elif luz >= 4:
            analise["dicas"].append("Prefere luz indireta ou meia-sombra")
        else:
            analise["dicas"].append("Tolera pouca luz; evite sol forte")
    if cresc.get('ph_min') is not None and cresc.get('ph_max') is not None:
        analise["dicas"].append(f"pH do solo ideal entre {cresc['ph_min']} e {cresc['ph_max']}")
    toxic = (resumo_trefle or {}).get('toxicidade')
    if toxic not in (None, 'none'):
        nivel = {'low': 'baixa', 'medium': 'média', 'high': 'alta'}.get(toxic, toxic)
        analise["dicas"].append(f"Atenção: toxicidade {nivel} (cuidado com pets e crianças)")

    if not registro:
        analise["aviso"] = "Ainda não há leitura dos sensores para comparar"
    return analise


@app.route("/plantas/identificar", methods=["POST"])
def identificar_planta():
    """
    multipart/form-data:
      imagens     -> 1 a 5 fotos (jpg/png), campo repetido
      orgaos      -> opcional, um por foto: auto | leaf | flower | fruit | bark
      usuario_id  -> opcional
      grupo_id    -> opcional (se não vier, tenta achar pelo nome)
      salvar      -> opcional, "false" para não gravar no banco
    """
    imagens = request.files.getlist('imagens') or request.files.getlist('imagem')
    imagens = [f for f in imagens if f and f.filename]
    if not imagens:
        return gera_resposta(400, "identificacao", {}, "Envie pelo menos uma foto no campo 'imagens'")
    if len(imagens) > 5:
        return gera_resposta(400, "identificacao", {}, "Máximo de 5 fotos por identificação")

    fotos = []
    for f in imagens:
        ext = f.filename.rsplit('.', 1)[-1].lower() if '.' in f.filename else ''
        if ext not in EXTENSOES_FOTO:
            return gera_resposta(400, "identificacao", {}, f"Formato não aceito: {f.filename} (use jpg ou png)")
        fotos.append((f.filename, f.read(), f.mimetype or 'image/jpeg'))

    orgaos = [o.lower() for o in request.form.getlist('orgaos') if o]
    if not orgaos:
        orgaos = ['auto'] * len(fotos)
    if len(orgaos) != len(fotos) or any(o not in ORGAOS_VALIDOS for o in orgaos):
        return gera_resposta(400, "identificacao", {}, "Envie um 'orgaos' válido por foto (auto, leaf, flower, fruit, bark)")

    try:
        resultado = identificar_plantnet(fotos, orgaos)
    except ErroAPI as e:
        return gera_resposta(e.status, "identificacao", {}, e.mensagem)

    candidatos = []
    for r in (resultado.get('results') or [])[:3]:
        esp = r.get('species') or {}
        candidatos.append({
            "nome_cientifico": esp.get('scientificNameWithoutAuthor'),
            "nomes_comuns": esp.get('commonNames') or [],
            "familia": (esp.get('family') or {}).get('scientificNameWithoutAuthor'),
            "genero": (esp.get('genus') or {}).get('scientificNameWithoutAuthor'),
            "confianca": round(r.get('score', 0), 4),
        })
    if not candidatos:
        return gera_resposta(404, "identificacao", {}, "Nenhuma planta reconhecida na foto")

    melhor = candidatos[0]
    nome_comum = melhor["nomes_comuns"][0] if melhor["nomes_comuns"] else None

    resumo = resumir_trefle(buscar_trefle(melhor["nome_cientifico"]))
    if resumo and not nome_comum:
        nome_comum = resumo.get('nome_comum')

    grupo = None
    grupo_id = request.form.get('grupo_id', type=int)
    if grupo_id:
        grupo = GrupoPlanta.query.get(grupo_id)
    if not grupo:
        grupo = encontrar_grupo(nome_comum, melhor["genero"], melhor["familia"])

    registro = Registro.query.order_by(Registro.registro_tempo.desc()).first()
    analise = gerar_analise(resumo, grupo, registro)

    corpo = {
        "planta": {
            "nome_cientifico": melhor["nome_cientifico"],
            "nome_comum": nome_comum,
            "familia": melhor["familia"],
            "genero": melhor["genero"],
            "confianca": melhor["confianca"],
        },
        "candidatos": candidatos,
        "trefle": resumo,
        "analise": analise,
        "identificacoes_restantes_hoje": resultado.get('remainingIdentificationRequests'),
    }

    if melhor["confianca"] < 0.2:
        corpo["aviso"] = "Confiança baixa: tente outra foto, mais nítida e de perto"

    if request.form.get('salvar', 'true').lower() != 'false':
        try:
            ident = Identificacao(
                usuario_id=request.form.get('usuario_id', type=int),
                grupo_id=grupo.id if grupo else None,
                nome_cientifico=melhor["nome_cientifico"],
                nome_comum=nome_comum,
                familia=melhor["familia"],
                genero=melhor["genero"],
                confianca=melhor["confianca"],
                trefle_id=resumo.get('trefle_id') if resumo else None,
                analise=json.dumps(analise, ensure_ascii=False, default=str),
                criado_em=datetime.now()
            )
            mybd.session.add(ident)
            mybd.session.commit()
            corpo["id"] = ident.id
        except Exception as e:
            mybd.session.rollback()
            print("Erro ao salvar identificação:", e)
            corpo["aviso_banco"] = "Identificado, mas não foi possível salvar no banco"

    return gera_resposta(200, "identificacao", corpo)


@app.route("/plantas/info", methods=["GET"])
def info_planta():
    """GET /plantas/info?nome=Ficus lyrata  -> dados de cultivo da Trefle"""
    nome = request.args.get('nome', '').strip()
    if not nome:
        return gera_resposta(400, "planta", {}, "Informe ?nome=<nome científico>")
    if not TREFLE_TOKEN:
        return gera_resposta(500, "planta", {}, "TREFLE_TOKEN não configurado no servidor")
    resumo = resumir_trefle(buscar_trefle(nome))
    if not resumo:
        return gera_resposta(404, "planta", {}, "Planta não encontrada na Trefle")
    return gera_resposta(200, "planta", resumo)


@app.route("/plantas/analise/<id>", methods=["GET"])
def reanalisar(id):
    """Refaz a análise de uma identificação salva usando a leitura MAIS RECENTE dos sensores."""
    ident = Identificacao.query.filter_by(id=id).first()
    if not ident:
        return gera_resposta(404, "analise", {}, "Identificação não encontrada")
    resumo = resumir_trefle(buscar_trefle(ident.nome_cientifico))
    grupo = GrupoPlanta.query.get(ident.grupo_id) if ident.grupo_id else None
    registro = Registro.query.order_by(Registro.registro_tempo.desc()).first()
    analise = gerar_analise(resumo, grupo, registro)
    return gera_resposta(200, "analise", {"identificacao_id": ident.id,
                                          "nome_cientifico": ident.nome_cientifico,
                                          "analise": analise})


@app.route("/identificacoes", methods=["GET"])
def selecionar_identificacao():
    """GET /identificacoes  (opcional ?usuario_id=1)"""
    consulta = Identificacao.query
    usuario_id = request.args.get('usuario_id', type=int)
    if usuario_id:
        consulta = consulta.filter_by(usuario_id=usuario_id)
    itens = consulta.order_by(Identificacao.criado_em.desc()).all()
    return gera_resposta(200, "identificacoes", [i.to_json() for i in itens])


@app.route("/identificacoes/<id>", methods=["GET"])
def identificacao_por_id(id):
    ident = Identificacao.query.filter_by(id=id).first()
    if not ident:
        return gera_resposta(404, "identificacoes", {}, "Identificação não encontrada")
    return gera_resposta(200, "identificacoes", ident.to_json())


@app.route("/identificacoes/<id>", methods=["DELETE"])
def deleta_identificacao(id):
    ident = Identificacao.query.filter_by(id=id).first()
    if not ident:
        return gera_resposta(404, "identificacoes", {}, "Identificação não encontrada")
    try:
        mybd.session.delete(ident)
        mybd.session.commit()
        return gera_resposta(200, "identificacoes", ident.to_json(), "Deletado com sucesso!!!")
    except Exception as e:
        mybd.session.rollback()
        print('Erro', e)
        return gera_resposta(400, "identificacoes", {}, "Erro ao deletar")


@app.errorhandler(413)
def arquivo_grande(e):
    return gera_resposta(413, "identificacao", {}, "Fotos grandes demais (máximo 25 MB no total)")


def gera_resposta(status, nome_conteudo, conteudo, mensagem=False):
    body = {}
    body[nome_conteudo] = conteudo

    if(mensagem):
        body["mensagem"] = mensagem

    return Response(json.dumps(body, ensure_ascii=False, default=str), status=status, mimetype="application/json")


if __name__ == '__main__':  # Verifica se este arquivo está sendo executado como o programa principal.
    with app.app_context():  # Cria um contexto de aplicativo Flask para executar a criação do banco de dados.
        # mybd.create_all()  # Chama o método 'create_all' para criar todas as tabelas definidas no modelo do banco de dados.

        start_mqtt()  # Chama a função 'start_mqtt', que presumivelmente inicia um cliente MQTT (protocolo de mensagens para dispositivos).
        port = int(os.environ.get("PORT", 8080))  # Azure define a porta automaticamente
        app.run(host='0.0.0.0', port=port)  # Ouvir em todas as interfaces e usar a porta fornecida pela Azure