CREATE DATABASE bemPlantado;
USE bemPlantado;

CREATE TABLE usuario (
	id INT PRIMARY KEY AUTO_INCREMENT,
	nome VARCHAR(120),
	cpf CHAR(11) UNIQUE,
	email VARCHAR(255) UNIQUE,
	telefone VARCHAR(20),
	senha_hash VARCHAR(255),
	criado_em DATETIME
);

CREATE TABLE grupo_planta (
	id INT PRIMARY KEY AUTO_INCREMENT,
	nome VARCHAR(80) UNIQUE,
	exemplos VARCHAR(255),
	temp_min FLOAT,
	temp_max FLOAT,
	umid_min FLOAT,
	umid_max FLOAT,
	intervalo_rega_dias INT,
	dica_base TEXT
);

CREATE TABLE favorito (
	usuario_id INT,
	grupo_id INT,
	criado_em DATETIME,
	PRIMARY KEY (usuario_id, grupo_id),
	FOREIGN KEY (usuario_id) REFERENCES usuario(id),
	FOREIGN KEY (grupo_id) REFERENCES grupo_planta(id)
);

CREATE TABLE registro (
	id INT PRIMARY KEY AUTO_INCREMENT,
	temperature FLOAT,
	pressure FLOAT,
	altitude FLOAT,
	humidity FLOAT,
	CO2 FLOAT,
	particula1 FLOAT,
	particula2 FLOAT,
	registro_tempo DATETIME UNIQUE
);

CREATE TABLE insight (
	id INT PRIMARY KEY AUTO_INCREMENT,
	grupo_id INT,
	registro_id INT,
	texto TEXT,
	modelo VARCHAR(60),
	criado_em DATETIME,
	FOREIGN KEY (grupo_id) REFERENCES grupo_planta(id),
	FOREIGN KEY (registro_id) REFERENCES registro(id)
);