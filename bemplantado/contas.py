"""Contas de usuário: cadastro, entrada, sessão, perfil e favoritos (tabelas `usuario` e `favorito` do projeto).

- Senha: só existe como hash seguro (werkzeug) em `usuario.senha_hash`.
- Sessão: cookie assinado (HttpOnly, SameSite=Lax, Secure na Vercel). Sem estado no servidor, então funciona em serverless.
  Exige a variável SECRET_KEY (a mesma em todas as instâncias).
- Abuso: limite de tentativas de entrada (por e-mail e por IP) e de criação de contas (por IP), guardados na tabela `tentativa_login`.
- CPF e telefone são opcionais e só aparecem no perfil (LGPD: não pedimos o que não precisamos). O CPF nunca volta inteiro para a tela.
"""
import re
from datetime import timedelta
from functools import wraps
from urllib.parse import urlparse

from flask import Blueprint, g, jsonify, request, session
from sqlalchemy.exc import IntegrityError
from werkzeug.security import check_password_hash, generate_password_hash

from bemplantado.models import Favorito, GrupoPlanta, Planta, TentativaLogin, Usuario, agora_utc, db

bp = Blueprint("contas", __name__)

EMAIL_RE = re.compile(r"^[^@\s]+@[^@\s]+\.[^@\s]{2,}$")
JANELA_MIN = 15
MAX_POR_EMAIL = 5
MAX_POR_IP = 20
MAX_CADASTROS_POR_IP_HORA = 10
HASH_FALSO = generate_password_hash("senha-falsa-para-igualar-o-tempo")  # login de e-mail inexistente gasta o mesmo tempo


# ------------------------------------------------------------------ utilidades
def _erro(msg, codigo=400, **extra):
    return jsonify(erro=msg, **extra), codigo


def _ip():
    return (request.headers.get("X-Forwarded-For") or request.remote_addr or "?").split(",")[0].strip()[:100]


def so_digitos(txt):
    return re.sub(r"\D", "", txt or "")


def cpf_valido(cpf):
    if len(cpf) != 11 or cpf == cpf[0] * 11:
        return False
    for n in (9, 10):
        soma = sum(int(cpf[i]) * (n + 1 - i) for i in range(n))
        if int(cpf[n]) != (soma * 10 % 11) % 10:
            return False
    return True


def usuario_logado():
    if "usuario" in g:
        return g.usuario
    g.usuario = None
    uid = session.get("uid")
    if uid:
        g.usuario = db.session.get(Usuario, uid)
        if g.usuario is None:
            session.clear()
    return g.usuario


def exige_login(f):
    @wraps(f)
    def interno(*a, **k):
        if usuario_logado() is None:
            return _erro("Entre na sua conta para fazer isso.", 401, login=True)
        return f(*a, **k)
    return interno


def _dados():
    return request.get_json(silent=True) or {}


def _publico(u):
    cpf = u.cpf.strip() if u.cpf else ""
    return {"id": u.id, "nome": u.nome, "email": u.email, "telefone": u.telefone,
            "cpf_final": cpf[-2:] if cpf else None, "criado_em": u.criado_em.isoformat() + "Z" if u.criado_em else None}


def _entrar(u):
    session.clear()           # nova sessão a cada entrada (evita fixação de sessão)
    session.permanent = True
    session["uid"] = u.id
    g.usuario = u


# ------------------------------------------------------------------ limite de tentativas
def _contar(chave, minutos):
    desde = agora_utc() - timedelta(minutes=minutos)
    return db.session.query(db.func.count(TentativaLogin.id)).filter(TentativaLogin.chave == chave, TentativaLogin.criado_em >= desde).scalar() or 0


def _registrar(*chaves):
    for c in chaves:
        db.session.add(TentativaLogin(chave=c[:300]))
    db.session.commit()


def _limpar_antigas():
    db.session.query(TentativaLogin).filter(TentativaLogin.criado_em < agora_utc() - timedelta(days=1)).delete()
    db.session.commit()


# ------------------------------------------------------------------ rotas
@bp.get("/api/conta")
def ver_conta():
    u = usuario_logado()
    return jsonify(usuario=_publico(u) if u else None)


@bp.post("/api/conta/cadastro")
def cadastrar():
    d = _dados()
    ip = _ip()
    if _contar("c:" + ip, 60) >= MAX_CADASTROS_POR_IP_HORA:
        return _erro("Muitos cadastros deste aparelho. Tente de novo mais tarde.", 429)
    nome = " ".join((d.get("nome") or "").split())[:120]
    email = (d.get("email") or "").strip().lower()[:255]
    senha = d.get("senha") or ""
    if len(nome) < 2:
        return _erro("Digite o seu nome.")
    if not EMAIL_RE.match(email):
        return _erro("Digite um e-mail válido. Ex.: maria@email.com")
    if len(senha) < 8:
        return _erro("A senha precisa ter pelo menos 8 caracteres.")
    if len(senha) > 128:
        return _erro("A senha é grande demais (máximo 128 caracteres).")
    telefone = so_digitos(d.get("telefone"))
    if telefone and not 10 <= len(telefone) <= 11:
        return _erro("Telefone inválido. Use o DDD e o número. Ex.: 11 91234-5678")
    _registrar("c:" + ip)
    if db.session.query(Usuario.id).filter(Usuario.email == email).first():
        return _erro("Este e-mail já tem uma conta. Toque em “Entrar” ou use outro e-mail.", 409)
    u = Usuario(nome=nome, email=email, telefone=telefone or None, senha_hash=generate_password_hash(senha))
    db.session.add(u)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _erro("Este e-mail já tem uma conta. Toque em “Entrar” ou use outro e-mail.", 409)
    _entrar(u)
    return jsonify(usuario=_publico(u)), 201


@bp.post("/api/conta/entrar")
def entrar():
    d = _dados()
    email = (d.get("email") or "").strip().lower()[:255]
    senha = d.get("senha") or ""
    ip = _ip()
    if _contar("e:" + email, JANELA_MIN) >= MAX_POR_EMAIL or _contar("i:" + ip, JANELA_MIN) >= MAX_POR_IP:
        return _erro(f"Muitas tentativas. Espere {JANELA_MIN} minutos e tente de novo.", 429)
    u = db.session.query(Usuario).filter(Usuario.email == email).first() if email else None
    ok = check_password_hash(u.senha_hash if u else HASH_FALSO, senha)
    if not (u and ok):
        _registrar("e:" + email, "i:" + ip)
        if _contar("i:" + ip, JANELA_MIN) % 7 == 0:
            _limpar_antigas()
        return _erro("E-mail ou senha incorretos.", 401)
    db.session.query(TentativaLogin).filter(TentativaLogin.chave == "e:" + email).delete()
    db.session.commit()
    _entrar(u)
    return jsonify(usuario=_publico(u))


@bp.post("/api/conta/sair")
def sair():
    session.clear()
    return jsonify(ok=True)


@bp.put("/api/conta")
@exige_login
def atualizar_conta():
    u = usuario_logado()
    d = _dados()
    if "nome" in d:
        nome = " ".join((d.get("nome") or "").split())[:120]
        if len(nome) < 2:
            return _erro("Digite o seu nome.")
        u.nome = nome
    if "telefone" in d:
        tel = so_digitos(d.get("telefone"))
        if tel and not 10 <= len(tel) <= 11:
            return _erro("Telefone inválido. Use o DDD e o número. Ex.: 11 91234-5678")
        u.telefone = tel or None
    if "cpf" in d:
        cpf = so_digitos(d.get("cpf"))
        if cpf and not cpf_valido(cpf):
            return _erro("CPF inválido. Confira os 11 números (ou deixe em branco, ele é opcional).")
        if cpf and db.session.query(Usuario.id).filter(Usuario.cpf == cpf, Usuario.id != u.id).first():
            return _erro("Este CPF já está em outra conta.", 409)
        u.cpf = cpf or None
    if d.get("nova_senha"):
        if not check_password_hash(u.senha_hash, d.get("senha_atual") or ""):
            return _erro("A senha atual não confere.", 403)
        nova = d["nova_senha"]
        if len(nova) < 8 or len(nova) > 128:
            return _erro("A nova senha precisa ter de 8 a 128 caracteres.")
        u.senha_hash = generate_password_hash(nova)
    try:
        db.session.commit()
    except IntegrityError:
        db.session.rollback()
        return _erro("Não foi possível salvar: este CPF já está em uso.", 409)
    return jsonify(usuario=_publico(u))


@bp.delete("/api/conta")
@exige_login
def apagar_conta():
    u = usuario_logado()
    if not check_password_hash(u.senha_hash, _dados().get("senha") or ""):
        return _erro("A senha não confere.", 403)
    for p in Planta.query.filter_by(usuario_id=u.id).all():
        db.session.delete(p)          # leva as regas junto
    db.session.query(Favorito).filter(Favorito.usuario_id == u.id).delete()
    db.session.delete(u)
    db.session.commit()
    session.clear()
    return jsonify(ok=True)


# ------------------------------------------------------------------ favoritos (grupos de plantas)
@bp.get("/api/favoritos")
def listar_favoritos():
    u = usuario_logado()
    if not u:
        return jsonify(grupos=[])
    ids = [f.grupo_id for f in Favorito.query.filter_by(usuario_id=u.id).order_by(Favorito.criado_em).all()]
    return jsonify(grupos=ids)


@bp.put("/api/favoritos/<int:grupo_id>")
@exige_login
def favoritar(grupo_id):
    u = usuario_logado()
    if db.session.get(GrupoPlanta, grupo_id) is None:
        return _erro("Grupo não encontrado.", 404)
    if db.session.get(Favorito, (u.id, grupo_id)) is None:
        db.session.add(Favorito(usuario_id=u.id, grupo_id=grupo_id))
        try:
            db.session.commit()
        except IntegrityError:
            db.session.rollback()
    return jsonify(ok=True)


@bp.delete("/api/favoritos/<int:grupo_id>")
@exige_login
def desfavoritar(grupo_id):
    u = usuario_logado()
    db.session.query(Favorito).filter(Favorito.usuario_id == u.id, Favorito.grupo_id == grupo_id).delete()
    db.session.commit()
    return jsonify(ok=True)


# ------------------------------------------------------------------ proteção geral
@bp.before_app_request
def proteger():
    """Contra CSRF: pedidos que mudam algo (POST/PUT/DELETE) só valem se vierem do próprio site."""
    if request.method in ("POST", "PUT", "PATCH", "DELETE") and request.path.startswith("/api/"):
        origem = request.headers.get("Origin")
        if origem and urlparse(origem).netloc != request.host:
            return _erro("Pedido bloqueado por segurança.", 403)


@bp.after_app_request
def sem_cache(resp):
    if request.path.startswith(("/api/conta", "/api/plantas", "/api/favoritos")):
        resp.headers["Cache-Control"] = "no-store"
        resp.headers.add("Vary", "Cookie")
    return resp
