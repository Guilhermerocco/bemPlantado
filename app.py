"""BemPlantado. - API Flask + dashboard.

Fluxo: caixinha -> MQTT -> ingestao.py -> banco -> esta API -> dashboard (static/).
O dashboard só lê dados por /api/...; nunca acessa o banco direto.
"""
import hashlib
import os
import secrets
from datetime import date, datetime, timedelta, timezone

from dotenv import load_dotenv
from flask import Flask, abort, jsonify, request, send_from_directory

load_dotenv()

from bemplantado import servicos  # noqa: E402
from bemplantado.contas import bp as contas_bp, exige_login, usuario_logado  # noqa: E402
from bemplantado.fontes import fonte_gravada, iniciar_fonte, sincronizar_simulada  # noqa: E402
from bemplantado.grupos import buscar_por_nome, grupo_dict, semear_grupos  # noqa: E402
from bemplantado.models import Configuracao, GrupoPlanta, Planta, Registro, Rega, agora_utc, db, iso_utc  # noqa: E402
from sqlalchemy import inspect, text  # noqa: E402
from bemplantado.recomendacao import LIMITE_DADOS_ANTIGOS_MIN, ambiente, calcular_rega  # noqa: E402

LIMITE_PADRAO = 1000
LIMITE_MAXIMO = 5000


def _parse_data(texto, padrao):
    """Converte ISO 8601 (com ou sem 'Z') para UTC sem fuso. Retorna `padrao` se vazio."""
    if not texto:
        return padrao
    dt = datetime.fromisoformat(texto.replace("Z", "+00:00"))
    if dt.tzinfo:
        dt = dt.astimezone(timezone.utc).replace(tzinfo=None)
    return dt


def _local():
    return float(os.getenv("LATITUDE", "-23.55")), float(os.getenv("LONGITUDE", "-46.63"))


BASE = os.path.dirname(os.path.abspath(__file__))
NA_VERCEL = bool(os.getenv("VERCEL"))


def _url_banco():
    """DATABASE_URL, ou SQLite local. Na Vercel o único disco gravável é /tmp (some a cada instância)."""
    url = os.getenv("DATABASE_URL") or ("sqlite:////tmp/bemplantado.db" if NA_VERCEL
                                         else "sqlite:///bemplantado.db")
    for antigo in ("postgres://", "postgresql://"):  # usa o driver psycopg 3
        if url.startswith(antigo):
            url = "postgresql+psycopg://" + url[len(antigo):]
    if NA_VERCEL and "pooler.supabase.com:5432" in url:
        # Serverless abre muitas instâncias ao mesmo tempo; o modo "session" do pooler do Supabase tem poucas conexões (erro 500).
        # O modo "transaction" (porta 6543) aguenta muito mais clientes.
        url = url.replace("pooler.supabase.com:5432", "pooler.supabase.com:6543")
    return url


def _opcoes_motor(url):
    """Postgres atrás do pooler: sem prepared statements (modo transaction) e poucas conexões por instância."""
    if url.startswith("postgresql"):
        return {"connect_args": {"prepare_threshold": None}, "pool_size": 1, "max_overflow": 2, "pool_pre_ping": True, "pool_recycle": 240}
    return {}


def _migrar():
    """Bancos criados antes dos grupos: acrescenta a coluna planta.grupo_id (não apaga nada)."""
    insp = inspect(db.engine)
    if "grupo_planta" in insp.get_table_names():  # modelo do projeto: dica_base, exemplos, umid_max
        cols = {c["name"] for c in insp.get_columns("grupo_planta")}
        if "cuidados_gerais" in cols and "dica_base" not in cols:
            db.session.execute(text("ALTER TABLE grupo_planta RENAME COLUMN cuidados_gerais TO dica_base"))
        if "exemplos" not in cols:
            db.session.execute(text("ALTER TABLE grupo_planta ADD COLUMN exemplos VARCHAR(255)"))
        if "umid_max" not in cols:
            db.session.execute(text("ALTER TABLE grupo_planta ADD COLUMN umid_max FLOAT"))
        for extra in ("como_reconhecer", "onde_cultivadas"):  # textos da tabela de grupos que o DDL enxuto do grupo não traz
            if extra not in cols:
                db.session.execute(text(f"ALTER TABLE grupo_planta ADD COLUMN {extra} TEXT"))
        db.session.commit()
    if db.engine.dialect.name == "postgresql":
        # Supabase: tabela sem RLS fica aberta na API pública. Liga o RLS só nas que ainda NÃO têm (o app conecta como dono e não é afetado).
        # Só mexe se faltar: o ALTER TABLE pede trava exclusiva, e fazê-lo a cada partida travaria/derrubaria instâncias simultâneas.
        sem_rls = db.session.execute(text(
            "SELECT c.relname FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace "
            "WHERE n.nspname = 'public' AND c.relkind = 'r' AND NOT c.relrowsecurity")).scalars().all()
        for tabela in sem_rls:
            db.session.execute(text(f'ALTER TABLE "{tabela}" ENABLE ROW LEVEL SECURITY'))
        db.session.commit()
    if "planta" in insp.get_table_names():
        colunas = {c["name"] for c in insp.get_columns("planta")}
        if "grupo_id" not in colunas:
            db.session.execute(text("ALTER TABLE planta ADD COLUMN grupo_id INTEGER"))
            db.session.commit()
        if "usuario_id" not in colunas:  # contas: cada planta passa a ter dona (vazio = planta de demonstração)
            db.session.execute(text("ALTER TABLE planta ADD COLUMN usuario_id INTEGER REFERENCES usuario (id) ON DELETE CASCADE"))
            db.session.execute(text("CREATE INDEX IF NOT EXISTS ix_planta_usuario_id ON planta (usuario_id)"))
            db.session.commit()


def _nova_planta(grupo, apelido, ambiente, dias_desde_rega, nome_popular=None, nome_cientifico=None):
    """Cria a planta copiando os valores de referência do grupo."""
    return Planta(
        grupo_id=grupo.id, apelido=apelido, nome_popular=nome_popular, nome_cientifico=nome_cientifico,
        ambiente=ambiente, intervalo_rega_dias=grupo.intervalo_rega_dias, temp_min=grupo.temp_min,
        temp_max=grupo.temp_max, umid_min=grupo.umid_min, dica=(grupo.cuidados_gerais or "")[:300],
        fonte_dados=f"Grupo: {grupo.nome}", ultima_rega=date.today() - timedelta(days=dias_desde_rega))


def _semear_plantas():
    """Plantas de exemplo quando o banco está vazio (útil na demonstração)."""
    if Planta.query.count():
        return
    for apelido, grupo, popular, local, dias in [
        ("Violeta da sala", "Flores ornamentais", "Violeta", "interno", 2),
        ("Samambaia da varanda", "Samambaias e avencas", "Samambaia-americana", "externo", 1),
        ("Babosa da janela", "Suculentas", "Babosa", "interno", 4),
    ]:
        g = GrupoPlanta.query.filter_by(nome=grupo).first()
        db.session.add(_nova_planta(g, apelido, local, dias, nome_popular=popular))
    db.session.commit()


def _versao_do_banco():
    """Muda quando o esquema (models.py) ou os textos dos 15 grupos (grupos.py) mudam; se mexer só em _migrar, aumente o número do "v3" (assim o banco é preparado de novo, uma vez)."""
    with open(os.path.join(BASE, "bemplantado", "grupos.py"), "rb") as f1, open(os.path.join(BASE, "bemplantado", "models.py"), "rb") as f2:
        return "v4-" + hashlib.md5(f1.read() + f2.read()).hexdigest()[:10]


def _preparar_banco():
    """Cria/atualiza tabelas e grupos. Pula tudo se o banco já foi preparado nesta versão (1 consulta só)."""
    versao = _versao_do_banco()
    try:
        atual = db.session.execute(text("SELECT valor FROM configuracao WHERE chave = 'esquema_versao'")).scalar()
    except Exception:  # tabela ainda não existe
        db.session.rollback()
        atual = None
    if atual == versao:
        return
    db.create_all()
    _migrar()
    semear_grupos()  # os 15 grupos de plantas (criados ou atualizados)
    if os.getenv("SEMEAR_PLANTAS", "1" if NA_VERCEL else "0") == "1":
        _semear_plantas()
    cfg = db.session.get(Configuracao, "esquema_versao")
    if cfg:
        cfg.valor = versao
    else:
        db.session.add(Configuracao(chave="esquema_versao", valor=versao))
    db.session.commit()


def criar_app(com_fonte=False):
    app = Flask(__name__, static_folder=os.path.join(BASE, "static"), static_url_path="/static")
    app.config["SQLALCHEMY_DATABASE_URI"] = _url_banco()
    app.config["SQLALCHEMY_ENGINE_OPTIONS"] = _opcoes_motor(app.config["SQLALCHEMY_DATABASE_URI"])
    app.config["MAX_CONTENT_LENGTH"] = 8 * 1024 * 1024  # fotos até 8 MB
    # Contas: sessão em cookie assinado. SECRET_KEY precisa ser a MESMA em todas as instâncias (na Vercel, defina em Environment Variables).
    chave = os.getenv("SECRET_KEY")
    if not chave:
        chave = secrets.token_hex(32)
        print("[CONTAS] SECRET_KEY não definida: usando uma chave temporária (as pessoas saem da conta a cada reinício). Defina SECRET_KEY no .env.")
    app.config.update(SECRET_KEY=chave, SESSION_COOKIE_NAME="bp_sessao", SESSION_COOKIE_HTTPONLY=True, SESSION_COOKIE_SAMESITE="Lax",
                      SESSION_COOKIE_SECURE=NA_VERCEL or os.getenv("COOKIE_SECURE") == "1", PERMANENT_SESSION_LIFETIME=timedelta(days=30))
    app.register_blueprint(contas_bp)
    db.init_app(app)

    # Na Vercel cada requisição pode cair numa instância nova. Páginas e arquivos (/static) NÃO precisam do banco,
    # então ele só é preparado na primeira chamada de /api/ de cada instância (antes, 20 arquivos ao mesmo tempo
    # abriam 20 conexões e o Supabase respondia erro 500). Fora da Vercel, prepara na partida, como sempre.
    estado = {"pronto": False}

    def garantir_banco():
        if estado["pronto"]:
            return
        with app.app_context():
            _preparar_banco()
            if com_fonte:
                iniciar_fonte(app)  # simulada, mqtt ou nenhuma (FONTE_DADOS no .env)
        estado["pronto"] = True

    if not NA_VERCEL:
        garantir_banco()

    @app.before_request
    def completar_leituras_simuladas():
        if request.path.startswith("/api/"):
            garantir_banco()
            # só faz algo no modo serverless com fonte simulada (nos demais, retorna na hora)
            sincronizar_simulada(app)

    @app.errorhandler(servicos.ServicoIndisponivel)
    def servico_fora(exc):
        return jsonify(erro=str(exc)), 503

    @app.errorhandler(413)
    def foto_grande(_):
        return jsonify(erro="A foto é grande demais (máximo 8 MB)."), 413

    # ------------------------------------------------------------ páginas
    @app.get("/")
    def index():
        return send_from_directory(app.static_folder, "index.html")

    @app.get("/v1")
    def versao_1():  # primeira versão com calendário, guardada para comparar
        return send_from_directory(os.path.join(app.static_folder, "versoes", "v1"), "index.html")

    @app.get("/v2")
    def versao_2():  # segunda versão (cena 3D + calendário do mês na semana de hoje), guardada para comparar
        return send_from_directory(os.path.join(app.static_folder, "versoes", "v2"), "index.html")

    @app.get("/v3")
    def versao_3():  # terceira versão (mascote em formato de ovo, 3D nos botões e cards), guardada para comparar
        return send_from_directory(os.path.join(app.static_folder, "versoes", "v3"), "index.html")

    @app.get("/identidade")
    def identidade():
        return send_from_directory(os.path.join(app.static_folder, "paginas"), "identidade.html")

    @app.get("/pitch")
    def pitch():
        return send_from_directory(os.path.join(app.static_folder, "paginas"), "pitch.html")

    @app.get("/realista")
    def realista():
        return send_from_directory(os.path.join(app.static_folder, "paginas"), "realista.html")

    @app.get("/api/saude")
    def saude():
        return jsonify(status="ok", fonte_dados=fonte_gravada(),
                       demonstracao=fonte_gravada() == "simulada",
                       plantnet=bool(os.getenv("PLANTNET_API_KEY")),
                       trefle=bool(os.getenv("TREFLE_TOKEN")))

    # ------------------------------------------------------------ sensor
    @app.get("/api/registros")
    def registros():
        """?inicio=ISO&fim=ISO&limite=N  (padrão: últimas 24 h, em ordem crescente)."""
        try:
            fim = _parse_data(request.args.get("fim"), agora_utc())
            inicio = _parse_data(request.args.get("inicio"), fim - timedelta(hours=24))
            limite = min(int(request.args.get("limite", LIMITE_PADRAO)), LIMITE_MAXIMO)
        except ValueError:
            return jsonify(erro="Parâmetros inválidos. Use datas ISO 8601 e limite numérico."), 400
        if inicio > fim:
            return jsonify(erro="'inicio' deve ser anterior a 'fim'."), 400

        linhas = (Registro.query
                  .filter(Registro.registro_tempo >= inicio, Registro.registro_tempo <= fim)
                  .order_by(Registro.registro_tempo.asc()).limit(20000).all())
        total = len(linhas)
        if total > limite:  # reduz a amostra de forma uniforme para o gráfico
            passo = -(-total // limite)
            linhas = linhas[::passo]
        return jsonify(total=total, inicio=iso_utc(inicio), fim=iso_utc(fim),
                       registros=[r.to_dict() for r in linhas])

    @app.get("/api/registros/ultimo")
    def ultimo():
        r = Registro.query.order_by(Registro.registro_tempo.desc()).first()
        if r is None:
            return jsonify(registro=None, idade_minutos=None, desatualizado=True)
        idade = (agora_utc() - r.registro_tempo).total_seconds() / 60
        return jsonify(registro=r.to_dict(), idade_minutos=round(idade),
                       desatualizado=idade > LIMITE_DADOS_ANTIGOS_MIN)

    @app.get("/api/mqtt/status")
    def mqtt_status():
        """Situação da ligação com o broker MQTT: conectado, tópico e contadores de mensagens."""
        from bemplantado.ingestao import ESTADO
        return jsonify(fonte_dados=fonte_gravada(), **ESTADO)

    # ------------------------------------------------------------ tempo
    @app.get("/api/previsao")
    def previsao():
        lat, lon = _local()
        return jsonify(latitude=lat, longitude=lon, dias=servicos.previsao_tempo(lat, lon))

    # ------------------------------------------------------------ grupos de plantas
    @app.get("/api/grupos")
    def listar_grupos():
        return jsonify([grupo_dict(g) for g in GrupoPlanta.query.order_by(GrupoPlanta.id).all()])

    @app.get("/api/grupos/buscar")
    def buscar_grupos():
        """?q=nome  -> grupos cujo exemplo (nome popular) ou nome começa com o texto."""
        return jsonify(resultados=buscar_por_nome((request.args.get("q") or "").strip()))

    @app.get("/api/referencia-botanica")
    def referencia_botanica():
        """?q=nome -> informação extra do Trefle (não define cuidados). {} quando não houver."""
        nome = (request.args.get("q") or "").strip()
        return jsonify(servicos.referencia_botanica(nome) if len(nome) >= 2 else {})

    @app.post("/api/identificar")
    def identificar():
        arquivo = request.files.get("imagem")
        if not arquivo:
            return jsonify(erro="Envie uma foto da planta."), 400
        if not (arquivo.mimetype or "").startswith("image/"):
            return jsonify(erro="O arquivo precisa ser uma imagem."), 400
        resultados = servicos.identificar_planta(arquivo.read(), arquivo.filename, arquivo.mimetype)
        return jsonify(resultados=resultados)

    # ------------------------------------------------------------ plantas
    def _situacao():
        leitura = Registro.query.order_by(Registro.registro_tempo.desc()).first()
        try:
            lat, lon = _local()
            prev = servicos.previsao_tempo(lat, lon)
        except servicos.ServicoIndisponivel:
            prev = None
        return leitura, prev

    def _planta_dict(p, leitura, prev):
        return {
            "id": p.id, "apelido": p.apelido, "nome_popular": p.nome_popular,
            "nome_cientifico": p.nome_cientifico, "ambiente_local": p.ambiente,
            "grupo_id": p.grupo_id, "grupo": p.grupo.nome if p.grupo else None,
            "intervalo_rega_dias": p.intervalo_rega_dias,
            "temp_min": p.temp_min, "temp_max": p.temp_max, "umid_min": p.umid_min,
            "dica": p.dica, "fonte_dados": p.fonte_dados,
            "rega": calcular_rega(p, leitura, prev),
            "ambiente": ambiente(p, leitura),
        }

    @app.get("/api/plantas")
    def listar_plantas():
        leitura, prev = _situacao()
        u = usuario_logado()
        # logada: só as plantas dela; visitante: as plantas de demonstração (sem dona)
        consulta = Planta.query.filter(Planta.usuario_id == u.id) if u else Planta.query.filter(Planta.usuario_id.is_(None))
        plantas = consulta.order_by(Planta.apelido).all()
        return jsonify(plantas=[_planta_dict(p, leitura, prev) for p in plantas],
                       previsao_disponivel=prev is not None, demonstracao=u is None)

    def _planta_da_conta(planta_id):
        u = usuario_logado()
        planta = db.session.get(Planta, planta_id)
        if planta is None or planta.usuario_id != u.id:
            abort(404)
        return planta

    @app.post("/api/plantas")
    @exige_login
    def criar_planta():
        d = request.get_json(silent=True) or {}
        apelido = (d.get("apelido") or "").strip()[:80]
        if not apelido:
            return jsonify(erro="Dê um nome para a sua planta."), 400
        local = d.get("ambiente", "interno")
        if local not in ("interno", "externo"):
            return jsonify(erro="Ambiente deve ser 'interno' ou 'externo'."), 400
        try:
            dias = int(d.get("dias_desde_rega", 0))
        except (TypeError, ValueError):
            return jsonify(erro="Dias desde a última rega inválido."), 400
        dias = max(0, min(dias, 60))

        try:
            grupo = db.session.get(GrupoPlanta, int(d.get("grupo_id")))
        except (TypeError, ValueError):
            grupo = None
        if grupo is None:
            return jsonify(erro="Escolha o grupo da planta."), 400
        popular = (d.get("nome_popular") or "").strip()[:120] or None
        cientifico = (d.get("nome_cientifico") or "").strip()[:160] or None
        planta = _nova_planta(grupo, apelido, local, dias, popular, cientifico)
        planta.usuario_id = usuario_logado().id
        db.session.add(planta)
        db.session.commit()
        leitura, prev = _situacao()
        return jsonify(_planta_dict(planta, leitura, prev)), 201

    @app.post("/api/plantas/<int:planta_id>/regar")
    @exige_login
    def regar(planta_id):
        planta = _planta_da_conta(planta_id)
        planta.ultima_rega = date.today()
        db.session.add(Rega(planta_id=planta.id, data=planta.ultima_rega))
        db.session.commit()
        leitura, prev = _situacao()
        return jsonify(_planta_dict(planta, leitura, prev))

    @app.delete("/api/plantas/<int:planta_id>")
    @exige_login
    def remover(planta_id):
        planta = _planta_da_conta(planta_id)
        db.session.delete(planta)
        db.session.commit()
        return "", 204

    return app


app = criar_app(com_fonte=True)

if __name__ == "__main__":
    app.run(host="0.0.0.0", port=int(os.environ.get("PORT", 8080)), use_reloader=False)
