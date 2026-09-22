---tabela de usuario
CREATE TABLE usuario (
   id              BIGSERIAL PRIMARY KEY,
   nome            VARCHAR(255) NOT NULL,
   email           VARCHAR(150) NOT NULL UNIQUE,
   senha           VARCHAR(50) NOT NULL,
   pontuacao_total INTEGER NOT NULL DEFAULT 0
);