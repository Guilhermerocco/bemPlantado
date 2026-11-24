-- =====================================================================
-- BemPlantado. - Banco de dados (DDL) - SQLite (versao local, igual ao schema.sql do PostgreSQL)
-- Para usar:  sqlite3 bemplantado.db < banco/schema_sqlite.sql
-- Unidades, valores ausentes (NULL) e duplicados (registro_tempo UNICO): veja o cabecalho de schema.sql.
-- No SQLite as datas ficam como texto 'AAAA-MM-DD HH:MM:SS' em UTC.
-- =====================================================================
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS registro (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    temperature     REAL,
    pressure        REAL,
    altitude        REAL,
    humidity        REAL,
    "CO2"           REAL,
    particula1      REAL,
    particula2      REAL,
    registro_tempo  DATETIME NOT NULL
);
CREATE UNIQUE INDEX IF NOT EXISTS ix_registro_registro_tempo ON registro (registro_tempo);

CREATE TABLE IF NOT EXISTS grupo_planta (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    nome                 VARCHAR(80)  NOT NULL UNIQUE,
    exemplos             VARCHAR(255),
    temp_min             REAL,
    temp_max             REAL,
    umid_min             REAL,
    umid_max             REAL,
    intervalo_rega_dias  INTEGER      NOT NULL DEFAULT 7 CHECK (intervalo_rega_dias > 0),
    dica_base            TEXT,
    como_reconhecer      TEXT,
    onde_cultivadas      TEXT
);

CREATE TABLE IF NOT EXISTS grupo_exemplo (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    grupo_id  INTEGER     NOT NULL REFERENCES grupo_planta (id) ON DELETE CASCADE,
    nome      VARCHAR(80) NOT NULL
);
CREATE INDEX IF NOT EXISTS ix_grupo_exemplo_grupo_id ON grupo_exemplo (grupo_id);

CREATE TABLE IF NOT EXISTS usuario (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    nome        VARCHAR(120) NOT NULL,
    cpf         CHAR(11)     UNIQUE,
    email       VARCHAR(255) NOT NULL UNIQUE,
    telefone    VARCHAR(20),
    senha_hash  VARCHAR(255) NOT NULL,
    criado_em   DATETIME     NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS favorito (
    usuario_id  INTEGER  NOT NULL REFERENCES usuario (id)      ON DELETE CASCADE,
    grupo_id    INTEGER  NOT NULL REFERENCES grupo_planta (id) ON DELETE CASCADE,
    criado_em   DATETIME NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (usuario_id, grupo_id)
);

CREATE TABLE IF NOT EXISTS insight (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    grupo_id     INTEGER  NOT NULL REFERENCES grupo_planta (id) ON DELETE CASCADE,
    registro_id  INTEGER  NOT NULL REFERENCES registro (id)     ON DELETE CASCADE,
    texto        TEXT     NOT NULL,
    modelo       VARCHAR(60),
    criado_em    DATETIME NOT NULL DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_insight_grupo_id    ON insight (grupo_id);
CREATE INDEX IF NOT EXISTS ix_insight_registro_id ON insight (registro_id);

CREATE TABLE IF NOT EXISTS planta (
    id                   INTEGER PRIMARY KEY AUTOINCREMENT,
    grupo_id             INTEGER REFERENCES grupo_planta (id),
    apelido              VARCHAR(80)  NOT NULL,
    nome_popular         VARCHAR(120),
    nome_cientifico      VARCHAR(160),
    ambiente             VARCHAR(10)  NOT NULL DEFAULT 'interno' CHECK (ambiente IN ('interno', 'externo')),
    intervalo_rega_dias  INTEGER      NOT NULL DEFAULT 7 CHECK (intervalo_rega_dias > 0),
    temp_min             REAL,
    temp_max             REAL,
    umid_min             REAL,
    dica                 VARCHAR(300),
    fonte_dados          VARCHAR(160),
    ultima_rega          DATE,
    criada_em            DATETIME DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS ix_planta_grupo_id ON planta (grupo_id);

CREATE TABLE IF NOT EXISTS rega (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    planta_id  INTEGER NOT NULL REFERENCES planta (id) ON DELETE CASCADE,
    data       DATE    NOT NULL DEFAULT (date('now'))
);
CREATE INDEX IF NOT EXISTS ix_rega_planta_data ON rega (planta_id, data);

CREATE TABLE IF NOT EXISTS configuracao (
    chave  VARCHAR(60) PRIMARY KEY,
    valor  VARCHAR(200)
);
