-- Tabela de partidas — referencia dois times (casa e fora)
CREATE TABLE partida (
    id            BIGSERIAL PRIMARY KEY,
    time_casa_id  BIGINT NOT NULL REFERENCES time(id),
    time_fora_id  BIGINT NOT NULL REFERENCES time(id),
    data          TIMESTAMP NOT NULL,
    placar        VARCHAR(10),
    status        VARCHAR(20) NOT NULL DEFAULT 'AGENDADA'
);