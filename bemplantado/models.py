"""Tabelas do BemPlantado.

Modelo do projeto (docs/modelo-banco-de-dados.jpg): registro, grupo_planta, usuario, favorito, insight.
Tabelas de apoio do sistema: grupo_exemplo, planta, rega e configuracao.
O DDL completo (PostgreSQL e SQLite) está em banco/schema.sql e banco/schema_sqlite.sql.

Registro  -> leituras da caixinha (nomes de campo exigidos pelo documento do projeto).
Planta    -> plantas que a pessoa acompanha.
Rega      -> histórico de regas.

Unidades: temperature °C | pressure hPa | altitude m | humidity % (umidade relativa do ar)
          CO2 ppm | particula1/particula2 µg/m³ | registro_tempo UTC.
Valores ausentes: ficam NULL (a caixinha pode não enviar todos os campos).
Duplicados: registro_tempo é UNIQUE; uma segunda mensagem com o mesmo instante é ignorada.
"""
from datetime import date, datetime, timezone

from flask_sqlalchemy import SQLAlchemy

db = SQLAlchemy()


def agora_utc():
    return datetime.now(timezone.utc).replace(tzinfo=None)


def iso_utc(dt):
    return dt.isoformat() + "Z" if dt else None


class Registro(db.Model):
    __tablename__ = "registro"

    id = db.Column(db.Integer, primary_key=True)
    temperature = db.Column(db.Float)
    pressure = db.Column(db.Float)
    altitude = db.Column(db.Float)
    humidity = db.Column(db.Float)
    CO2 = db.Column(db.Float)
    particula1 = db.Column(db.Float)
    particula2 = db.Column(db.Float)
    registro_tempo = db.Column(db.DateTime, nullable=False, unique=True, index=True)

    def to_dict(self):
        return {
            "id": self.id,
            "temperature": self.temperature,
            "pressure": self.pressure,
            "altitude": self.altitude,
            "humidity": self.humidity,
            "CO2": self.CO2,
            "particula1": self.particula1,
            "particula2": self.particula2,
            "registro_tempo": iso_utc(self.registro_tempo),
        }


class Configuracao(db.Model):
    """Pares chave/valor do sistema. Hoje guarda qual fonte de dados gravou os registros."""
    __tablename__ = "configuracao"

    chave = db.Column(db.String(60), primary_key=True)
    valor = db.Column(db.String(200))


class GrupoPlanta(db.Model):
    """Grupo de plantas por características de cultivo (cactos, suculentas, samambaias…).

    É a base do sistema: os números do grupo (intervalo de rega, faixa de temperatura e umidade
    do ar mínima) são valores de referência usados no cálculo de rega e nos alertas.
    """
    __tablename__ = "grupo_planta"

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(80), nullable=False, unique=True)
    como_reconhecer = db.Column(db.Text)
    onde_cultivadas = db.Column(db.Text)
    cuidados_gerais = db.Column("dica_base", db.Text)  # coluna "dica_base" no banco (modelo do projeto)
    intervalo_rega_dias = db.Column(db.Integer, nullable=False, default=7)
    temp_min = db.Column(db.Float)
    temp_max = db.Column(db.Float)
    umid_min = db.Column(db.Float)
    umid_max = db.Column(db.Float)
    exemplos_texto = db.Column("exemplos", db.String(255))  # resumo dos exemplos (a lista completa está em grupo_exemplo)

    exemplos = db.relationship("GrupoExemplo", backref="grupo", cascade="all, delete-orphan",
                               order_by="GrupoExemplo.id")


class GrupoExemplo(db.Model):
    """Nomes populares de exemplo de cada grupo (o mesmo nome pode estar em mais de um grupo)."""
    __tablename__ = "grupo_exemplo"

    id = db.Column(db.Integer, primary_key=True)
    grupo_id = db.Column(db.Integer, db.ForeignKey("grupo_planta.id"), nullable=False, index=True)
    nome = db.Column(db.String(80), nullable=False)


class Planta(db.Model):
    __tablename__ = "planta"

    id = db.Column(db.Integer, primary_key=True)
    grupo_id = db.Column(db.Integer, db.ForeignKey("grupo_planta.id"), index=True)
    grupo = db.relationship("GrupoPlanta")
    apelido = db.Column(db.String(80), nullable=False)
    nome_popular = db.Column(db.String(120))
    nome_cientifico = db.Column(db.String(160))
    ambiente = db.Column(db.String(10), nullable=False, default="interno")  # interno | externo
    intervalo_rega_dias = db.Column(db.Integer, nullable=False, default=7)
    temp_min = db.Column(db.Float)
    temp_max = db.Column(db.Float)
    umid_min = db.Column(db.Float)  # % de umidade do ar abaixo da qual a planta sofre
    dica = db.Column(db.String(300))
    fonte_dados = db.Column(db.String(160))
    ultima_rega = db.Column(db.Date)
    criada_em = db.Column(db.DateTime, default=agora_utc)
    usuario_id = db.Column(db.Integer, db.ForeignKey("usuario.id", ondelete="CASCADE"), index=True)  # dona da planta; vazio = planta de demonstração

    regas = db.relationship("Rega", backref="planta", cascade="all, delete-orphan")

    def data_base_rega(self):
        return self.ultima_rega or self.criada_em.date()


class Rega(db.Model):
    __tablename__ = "rega"

    id = db.Column(db.Integer, primary_key=True)
    planta_id = db.Column(db.Integer, db.ForeignKey("planta.id"), nullable=False)
    data = db.Column(db.Date, nullable=False, default=date.today)


class Usuario(db.Model):
    """Pessoa que usa o sistema. CPF, e-mail e telefone são dados pessoais (LGPD); a senha só existe como hash."""
    __tablename__ = "usuario"

    id = db.Column(db.Integer, primary_key=True)
    nome = db.Column(db.String(120), nullable=False)
    cpf = db.Column(db.CHAR(11), unique=True)
    email = db.Column(db.String(255), nullable=False, unique=True)
    telefone = db.Column(db.String(20))
    senha_hash = db.Column(db.String(255), nullable=False)
    criado_em = db.Column(db.DateTime, nullable=False, default=agora_utc)


class Favorito(db.Model):
    """Grupos de plantas que cada pessoa acompanha (muitos para muitos entre usuario e grupo_planta)."""
    __tablename__ = "favorito"

    usuario_id = db.Column(db.Integer, db.ForeignKey("usuario.id", ondelete="CASCADE"), primary_key=True)
    grupo_id = db.Column(db.Integer, db.ForeignKey("grupo_planta.id", ondelete="CASCADE"), primary_key=True)
    criado_em = db.Column(db.DateTime, nullable=False, default=agora_utc)


class Insight(db.Model):
    """Texto que explica o que uma medição (registro) significa para um grupo de plantas."""
    __tablename__ = "insight"

    id = db.Column(db.Integer, primary_key=True)
    grupo_id = db.Column(db.Integer, db.ForeignKey("grupo_planta.id", ondelete="CASCADE"), nullable=False, index=True)
    registro_id = db.Column(db.Integer, db.ForeignKey("registro.id", ondelete="CASCADE"), nullable=False, index=True)
    texto = db.Column(db.Text, nullable=False)
    modelo = db.Column(db.String(60))  # qual regra/modelo gerou o texto
    criado_em = db.Column(db.DateTime, nullable=False, default=agora_utc)


class TentativaLogin(db.Model):
    """Tentativas de entrar/criar conta, para limitar abusos (força bruta). Guardada no banco porque a Vercel não guarda memória entre requisições."""
    __tablename__ = "tentativa_login"

    id = db.Column(db.Integer, primary_key=True)
    chave = db.Column(db.String(300), nullable=False, index=True)  # "e:<email>", "i:<ip>" ou "c:<ip>"
    criado_em = db.Column(db.DateTime, nullable=False, default=agora_utc, index=True)
