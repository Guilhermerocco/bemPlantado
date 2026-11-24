-- =====================================================================
-- Exemplos de registros e consultas (funcionam no SQLite e no PostgreSQL)
-- Rode depois de schema.sql (ou schema_sqlite.sql).
-- =====================================================================

-- ---- 1) Exemplos de registros (o que a ingestao grava a cada mensagem MQTT valida)
INSERT INTO registro (temperature, pressure, altitude, humidity, "CO2", particula1, particula2, registro_tempo) VALUES
  (23.4, 1012.1, 760.0, 61.2, 455, 6.1,  9.8, '2026-11-17 12:00:00'),
  (24.1, 1011.8, 760.0, 58.7, 470, 6.4, 10.2, '2026-11-17 12:10:00'),
  (24.9, 1011.5, 760.0, 55.3, 498, 7.0, 11.5, '2026-11-17 12:20:00'),
  (25.6, 1011.2, 760.0, 52.0, 530, 7.8, 12.9, '2026-11-17 12:30:00'),
  (NULL, 1011.0, 760.0, 51.4, 541, NULL, NULL, '2026-11-17 12:40:00');   -- campos ausentes ficam NULL

-- Duplicado: o mesmo instante de novo e ignorado, sem erro (politica de duplicados)
--   PostgreSQL:  INSERT INTO registro (temperature, registro_tempo) VALUES (99, '2026-11-17 12:00:00') ON CONFLICT (registro_tempo) DO NOTHING;
--   SQLite:      INSERT OR IGNORE INTO registro (temperature, registro_tempo) VALUES (99, '2026-11-17 12:00:00');

-- ---- 2) Consultas
-- 2a) Por intervalo de tempo (o que GET /api/registros?inicio=&fim= faz)
SELECT id, temperature, humidity, "CO2", registro_tempo
  FROM registro
 WHERE registro_tempo BETWEEN '2026-11-17 12:00:00' AND '2026-11-17 12:30:00'
 ORDER BY registro_tempo;

-- 2b) Ultima leitura (o que GET /api/registros/ultimo faz)
SELECT * FROM registro ORDER BY registro_tempo DESC LIMIT 1;

-- 2c) Quantas leituras e quantos valores ausentes por campo
SELECT COUNT(*)            AS leituras,
       COUNT(temperature)  AS com_temperatura,
       COUNT(*) - COUNT(particula1) AS sem_particula1
  FROM registro;

-- 2d) Media, minimo e maximo da temperatura no periodo
SELECT ROUND(AVG(temperature), 1) AS media, MIN(temperature) AS minimo, MAX(temperature) AS maximo
  FROM registro
 WHERE registro_tempo >= '2026-11-17 12:00:00';

-- 2e) Leituras em que o ar esta mais seco do que a faixa do grupo (alerta de umidade)
SELECT r.registro_tempo, r.humidity, g.nome AS grupo, g.umid_min
  FROM registro r
  JOIN grupo_planta g ON r.humidity < g.umid_min
 WHERE g.nome = 'Samambaias e avencas'
 ORDER BY r.registro_tempo;

-- 2f) Plantas com o grupo e a data da proxima rega
SELECT p.apelido, g.nome AS grupo, p.ultima_rega, p.intervalo_rega_dias
  FROM planta p
  LEFT JOIN grupo_planta g ON g.id = p.grupo_id
 ORDER BY p.apelido;
