"""Testa o sistema de contas: cadastro, entrada, sessão, limites, perfil, favoritos e plantas por conta.

Usa um banco SQLite temporário (nunca toca no Supabase).
Uso:  python -m unittest testes.test_contas -v
"""
import os
import sys
import tempfile
import unittest

os.environ["FONTE_DADOS"] = "nenhuma"
os.environ["SEMEAR_PLANTAS"] = "1"
os.environ["SECRET_KEY"] = "chave-de-teste"
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
_pasta = tempfile.mkdtemp()
os.environ["DATABASE_URL"] = "sqlite:///" + os.path.join(_pasta, "contas.db").replace("\\", "/")

from app import criar_app  # noqa: E402
from bemplantado.contas import cpf_valido  # noqa: E402
from bemplantado.models import Favorito, GrupoPlanta, Planta, TentativaLogin, Usuario, db  # noqa: E402

MARIA = {"nome": "Maria Silva", "email": "maria@email.com", "senha": "senha-segura-1"}
JOSE = {"nome": "José Souza", "email": "jose@email.com", "senha": "outra-senha-9"}
CPF_OK = "52998224725"  # CPF de exemplo com dígitos verificadores válidos


class Contas(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.app = criar_app(com_fonte=False)

    def setUp(self):
        with self.app.app_context():
            for m in (Favorito, TentativaLogin):
                db.session.query(m).delete()
            Planta.query.filter(Planta.usuario_id.isnot(None)).delete()
            Usuario.query.delete()
            db.session.commit()
        self.c = self.app.test_client()

    def cadastrar(self, c, dados):
        return c.post("/api/conta/cadastro", json=dados)

    def planta_json(self, grupo_id, apelido="Minha planta"):
        return {"apelido": apelido, "ambiente": "interno", "dias_desde_rega": 1, "grupo_id": grupo_id}

    def grupo_id(self):
        with self.app.app_context():
            return GrupoPlanta.query.first().id

    # ------------------------------------------------------------ cadastro e sessão
    def test_cadastro_cria_conta_e_ja_entra(self):
        r = self.cadastrar(self.c, MARIA)
        self.assertEqual(r.status_code, 201)
        eu = self.c.get("/api/conta").get_json()["usuario"]
        self.assertEqual(eu["email"], "maria@email.com")
        self.assertNotIn("senha", str(eu).lower().replace("senha_hash", ""))  # nada de senha na resposta
        self.assertNotIn("senha_hash", eu)

    def test_senha_fica_so_como_hash(self):
        self.cadastrar(self.c, MARIA)
        with self.app.app_context():
            u = Usuario.query.filter_by(email="maria@email.com").one()
            self.assertNotIn("senha-segura-1", u.senha_hash)
            self.assertLessEqual(len(u.senha_hash), 255)

    def test_validacoes_do_cadastro(self):
        for dados, trecho in [({**MARIA, "nome": " "}, "nome"), ({**MARIA, "email": "sem-arroba"}, "e-mail"),
                              ({**MARIA, "senha": "curta"}, "8 caracteres"), ({**MARIA, "telefone": "123"}, "Telefone")]:
            r = self.cadastrar(self.c, dados)
            self.assertEqual(r.status_code, 400, dados)
            self.assertIn(trecho.lower(), r.get_json()["erro"].lower())

    def test_email_repetido_e_recusado_sem_diferenciar_maiusculas(self):
        self.cadastrar(self.c, MARIA)
        r = self.cadastrar(self.app.test_client(), {**MARIA, "email": "MARIA@Email.com"})
        self.assertEqual(r.status_code, 409)

    def test_entrar_sair_e_erro_generico(self):
        self.cadastrar(self.c, MARIA)
        c2 = self.app.test_client()
        r = c2.post("/api/conta/entrar", json={"email": "maria@email.com", "senha": "errada-errada"})
        self.assertEqual(r.status_code, 401)
        r2 = c2.post("/api/conta/entrar", json={"email": "ninguem@email.com", "senha": "qualquer-coisa"})
        self.assertEqual(r.get_json()["erro"], r2.get_json()["erro"])  # não revela se o e-mail existe
        ok = c2.post("/api/conta/entrar", json={"email": "maria@email.com", "senha": MARIA["senha"]})
        self.assertEqual(ok.status_code, 200)
        self.assertIsNotNone(c2.get("/api/conta").get_json()["usuario"])
        c2.post("/api/conta/sair")
        self.assertIsNone(c2.get("/api/conta").get_json()["usuario"])

    def test_limite_de_tentativas_de_entrada(self):
        self.cadastrar(self.c, MARIA)
        c2 = self.app.test_client()
        for _ in range(5):
            self.assertEqual(c2.post("/api/conta/entrar", json={"email": "maria@email.com", "senha": "errada-errada"}).status_code, 401)
        r = c2.post("/api/conta/entrar", json={"email": "maria@email.com", "senha": MARIA["senha"]})  # até a senha certa é barrada
        self.assertEqual(r.status_code, 429)

    def test_cookie_de_sessao_protegido(self):
        r = self.cadastrar(self.c, MARIA)
        cookie = r.headers.get("Set-Cookie", "")
        self.assertIn("HttpOnly", cookie)
        self.assertIn("SameSite=Lax", cookie)

    def test_pedido_de_outro_site_e_bloqueado(self):
        r = self.c.post("/api/conta/cadastro", json=MARIA, headers={"Origin": "https://site-malicioso.example"})
        self.assertEqual(r.status_code, 403)

    # ------------------------------------------------------------ perfil
    def test_perfil_cpf_telefone_e_senha(self):
        self.cadastrar(self.c, MARIA)
        self.assertEqual(self.c.put("/api/conta", json={"cpf": "11111111111"}).status_code, 400)
        r = self.c.put("/api/conta", json={"cpf": "529.982.247-25", "telefone": "(11) 91234-5678", "nome": "Maria S."})
        self.assertEqual(r.status_code, 200)
        eu = r.get_json()["usuario"]
        self.assertEqual(eu["cpf_final"], "25")             # o CPF inteiro nunca volta para a tela
        self.assertNotIn(CPF_OK, str(eu))
        self.assertEqual(self.c.put("/api/conta", json={"nova_senha": "nova-senha-123", "senha_atual": "errada"}).status_code, 403)
        self.assertEqual(self.c.put("/api/conta", json={"nova_senha": "nova-senha-123", "senha_atual": MARIA["senha"]}).status_code, 200)
        c2 = self.app.test_client()
        self.assertEqual(c2.post("/api/conta/entrar", json={"email": MARIA["email"], "senha": "nova-senha-123"}).status_code, 200)

    def test_cpf_unico_entre_contas(self):
        self.cadastrar(self.c, MARIA)
        self.c.put("/api/conta", json={"cpf": CPF_OK})
        c2 = self.app.test_client()
        self.cadastrar(c2, JOSE)
        self.assertEqual(c2.put("/api/conta", json={"cpf": CPF_OK}).status_code, 409)

    def test_validador_de_cpf(self):
        self.assertTrue(cpf_valido(CPF_OK))
        self.assertFalse(cpf_valido("52998224726"))
        self.assertFalse(cpf_valido("00000000000"))

    # ------------------------------------------------------------ plantas por conta
    def test_visitante_ve_so_a_demonstracao_e_nao_mexe(self):
        r = self.c.get("/api/plantas").get_json()
        self.assertTrue(r["demonstracao"])
        self.assertGreaterEqual(len(r["plantas"]), 1)
        self.assertEqual(self.c.post("/api/plantas", json=self.planta_json(self.grupo_id())).status_code, 401)
        pid = r["plantas"][0]["id"]
        self.assertEqual(self.c.post(f"/api/plantas/{pid}/regar").status_code, 401)
        self.assertEqual(self.c.delete(f"/api/plantas/{pid}").status_code, 401)

    def test_cada_conta_ve_e_mexe_so_nas_suas_plantas(self):
        gid = self.grupo_id()
        self.cadastrar(self.c, MARIA)
        criada = self.c.post("/api/plantas", json=self.planta_json(gid, "Violeta da Maria"))
        self.assertEqual(criada.status_code, 201)
        pid = criada.get_json()["id"]
        self.assertEqual([p["apelido"] for p in self.c.get("/api/plantas").get_json()["plantas"]], ["Violeta da Maria"])
        c2 = self.app.test_client()
        self.cadastrar(c2, JOSE)
        self.assertEqual(c2.get("/api/plantas").get_json()["plantas"], [])           # a do outro não aparece
        self.assertEqual(c2.post(f"/api/plantas/{pid}/regar").status_code, 404)      # nem pode ser regada
        self.assertEqual(c2.delete(f"/api/plantas/{pid}").status_code, 404)          # nem apagada
        self.assertEqual(self.c.post(f"/api/plantas/{pid}/regar").status_code, 200)
        self.assertEqual(self.c.delete(f"/api/plantas/{pid}").status_code, 204)

    # ------------------------------------------------------------ favoritos
    def test_favoritos(self):
        gid = self.grupo_id()
        self.assertEqual(self.c.put(f"/api/favoritos/{gid}").status_code, 401)
        self.assertEqual(self.c.get("/api/favoritos").get_json()["grupos"], [])
        self.cadastrar(self.c, MARIA)
        self.assertEqual(self.c.put(f"/api/favoritos/{gid}").status_code, 200)
        self.assertEqual(self.c.put(f"/api/favoritos/{gid}").status_code, 200)       # repetir não dá erro
        self.assertEqual(self.c.get("/api/favoritos").get_json()["grupos"], [gid])
        self.assertEqual(self.c.put("/api/favoritos/99999").status_code, 404)
        self.c.delete(f"/api/favoritos/{gid}")
        self.assertEqual(self.c.get("/api/favoritos").get_json()["grupos"], [])

    # ------------------------------------------------------------ apagar conta
    def test_apagar_conta_leva_plantas_e_favoritos(self):
        gid = self.grupo_id()
        self.cadastrar(self.c, MARIA)
        self.c.post("/api/plantas", json=self.planta_json(gid))
        self.c.put(f"/api/favoritos/{gid}")
        self.assertEqual(self.c.delete("/api/conta", json={"senha": "errada"}).status_code, 403)
        self.assertEqual(self.c.delete("/api/conta", json={"senha": MARIA["senha"]}).status_code, 200)
        self.assertIsNone(self.c.get("/api/conta").get_json()["usuario"])
        with self.app.app_context():
            self.assertEqual(Usuario.query.count(), 0)
            self.assertEqual(Favorito.query.count(), 0)
            self.assertEqual(Planta.query.filter(Planta.usuario_id.isnot(None)).count(), 0)
            self.assertGreaterEqual(Planta.query.filter(Planta.usuario_id.is_(None)).count(), 1)  # a demonstração fica

    def test_respostas_de_conta_nao_ficam_em_cache(self):
        self.assertIn("no-store", self.c.get("/api/conta").headers.get("Cache-Control", ""))
        self.assertIn("no-store", self.c.get("/api/plantas").headers.get("Cache-Control", ""))


if __name__ == "__main__":
    unittest.main()
