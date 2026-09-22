-- Tabela de palpites — referencia usuario e partida
CREATE TABLE palpite (
  id              BIGSERIAL PRIMARY KEY,
  placar_previsto VARCHAR(10)  NOT NULL,
  pontos_obtidos  INTEGER NOT NULL DEFAULT 0,
  criado_em       TIMESTAMP NOT NULL DEFAULT NOW(),
  usuario_id      BIGINT NOT NULL REFERENCES usuario(id),
  partida_id      BIGINT NOT NULL REFERENCES partida(id)
);