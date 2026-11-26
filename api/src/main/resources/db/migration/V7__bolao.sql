-- V7: Tabelas da Funcionalidade Bolao (selecao de multiplas partidas, convidados, palpites, ranking e comissao de 10%)

CREATE TABLE IF NOT EXISTS bolao (
    id BIGSERIAL PRIMARY KEY,
    criador_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    valor_cota NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    status VARCHAR(30) NOT NULL DEFAULT 'RASCUNHO',
    vencedor_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
    comissao_casa NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    premio_vencedor NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS bolao_partida (
    id BIGSERIAL PRIMARY KEY,
    bolao_id BIGINT NOT NULL REFERENCES bolao(id) ON DELETE CASCADE,
    partida_id BIGINT NOT NULL REFERENCES partida(id) ON DELETE CASCADE,
    ordem INTEGER NOT NULL DEFAULT 0,
    UNIQUE (bolao_id, partida_id)
);

CREATE TABLE IF NOT EXISTS bolao_participante (
    id BIGSERIAL PRIMARY KEY,
    bolao_id BIGINT NOT NULL REFERENCES bolao(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    papel VARCHAR(20) NOT NULL DEFAULT 'CONVIDADO',
    status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    valor_retido NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    multa_desistencia NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    pontos_totais INTEGER NOT NULL DEFAULT 0,
    UNIQUE (bolao_id, usuario_id)
);

CREATE TABLE IF NOT EXISTS bolao_palpite (
    id BIGSERIAL PRIMARY KEY,
    bolao_id BIGINT NOT NULL REFERENCES bolao(id) ON DELETE CASCADE,
    partida_id BIGINT NOT NULL REFERENCES partida(id) ON DELETE CASCADE,
    usuario_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    placar_previsto VARCHAR(20) NOT NULL,
    pontos_obtidos INTEGER NOT NULL DEFAULT 0,
    UNIQUE (bolao_id, partida_id, usuario_id)
);

CREATE INDEX IF NOT EXISTS idx_bolao_criador ON bolao(criador_id);
CREATE INDEX IF NOT EXISTS idx_bolao_participante_usuario ON bolao_participante(usuario_id);
CREATE INDEX IF NOT EXISTS idx_bolao_palpite_bolao ON bolao_palpite(bolao_id);
