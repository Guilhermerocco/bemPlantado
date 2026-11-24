"""Confere o DDL: roda schema_sqlite.sql, os exemplos e compara com o modelo do código e com schema.sql.

Uso:  python banco/validar_ddl.py
"""
import os
import re
import sqlite3
import sys

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
sys.path.insert(0, RAIZ)


def ler(nome):
    with open(os.path.join(AQUI, nome), encoding="utf8") as f:
        return f.read()


def colunas_do_sql(texto):
    """{tabela: [colunas]} lendo os CREATE TABLE de um arquivo .sql."""
    saida = {}
    for tabela, corpo in re.findall(r"CREATE TABLE IF NOT EXISTS (\w+) \((.*?)\n\);", texto, flags=re.S):
        cols = []
        for linha in corpo.split("\n"):
            linha = linha.split("--")[0].strip().rstrip(",")
            m = re.match(r'^("?\w+"?)\s+(INTEGER|VARCHAR|CHAR|DOUBLE|REAL|TEXT|DATE|DATETIME|TIMESTAMP)', linha)
            if m:
                cols.append(m.group(1).strip('"'))
        saida[tabela] = cols
    return saida


def main():
    erros = []
    con = sqlite3.connect(":memory:")
    con.executescript(ler("schema_sqlite.sql"))
    tabelas = [r[0] for r in con.execute("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'")]
    print("Tabelas criadas pelo DDL (SQLite):", ", ".join(sorted(tabelas)))

    # 1) PostgreSQL e SQLite têm as mesmas tabelas e colunas
    pg, lite = colunas_do_sql(ler("schema.sql")), colunas_do_sql(ler("schema_sqlite.sql"))
    if pg != lite:
        erros.append(f"schema.sql e schema_sqlite.sql diferem: {set(pg) ^ set(lite)}")
    print("PostgreSQL x SQLite: mesmas tabelas e colunas" if pg == lite else "DIFERENÇA entre os dois DDL")

    # 2) o modelo do código (SQLAlchemy) tem as mesmas colunas
    os.environ["DATABASE_URL"] = "sqlite:///:memory:"
    os.environ["FONTE_DADOS"] = "nenhuma"
    from sqlalchemy import inspect
    from app import criar_app
    from bemplantado.models import db
    app = criar_app()
    with app.app_context():
        insp = inspect(db.engine)
        for t in sorted(insp.get_table_names()):
            orm = {c["name"] for c in insp.get_columns(t)}
            ddl = set(lite.get(t, []))
            if orm != ddl:
                erros.append(f"{t}: código {sorted(orm ^ ddl)} diferente do DDL")
        print("Modelo do código x DDL:", "iguais" if not [e for e in erros if ':' in e and 'código' in e] else "DIFERENÇAS")

    # 3) exemplos e consultas rodam; duplicado é ignorado; nomes exigidos existem
    cols = [r[1] for r in con.execute("PRAGMA table_info(registro)")]
    exigidos = ["id", "temperature", "pressure", "altitude", "humidity", "CO2", "particula1", "particula2", "registro_tempo"]
    if cols != exigidos:
        erros.append(f"registro: colunas {cols} != {exigidos}")
    con.execute("INSERT INTO grupo_planta (nome, intervalo_rega_dias, umid_min) VALUES ('Samambaias e avencas', 3, 60)")
    for comando in [c.strip() for c in ler("exemplos.sql").split(";") if c.strip()]:
        linhas = [l for l in comando.split("\n") if not l.strip().startswith("--")]
        sql = "\n".join(linhas).strip()
        if not sql:
            continue
        resultado = con.execute(sql).fetchall() if sql.upper().startswith("SELECT") else con.execute(sql).rowcount
        if sql.upper().startswith("SELECT"):
            print(f"  consulta ok ({len(resultado)} linha(s)): {sql.splitlines()[0][:70]}")
    antes = con.execute("SELECT COUNT(*) FROM registro").fetchone()[0]
    con.execute("INSERT OR IGNORE INTO registro (temperature, registro_tempo) VALUES (99, '2026-11-17 12:00:00')")
    depois = con.execute("SELECT COUNT(*) FROM registro").fetchone()[0]
    if antes != depois:
        erros.append("registro duplicado foi gravado")
    print(f"Duplicado ignorado: {antes} -> {depois} registros")
    try:
        con.execute("INSERT INTO registro (temperature, registro_tempo) VALUES (1, '2026-11-17 12:00:00')")
        erros.append("o banco aceitou registro_tempo repetido")
    except sqlite3.IntegrityError:
        print("Restrição UNIQUE de registro_tempo funcionando")

    print("\nRESULTADO:", "OK, DDL validado" if not erros else "FALHOU")
    for e in erros:
        print(" -", e)
    return 1 if erros else 0


if __name__ == "__main__":
    sys.exit(main())
