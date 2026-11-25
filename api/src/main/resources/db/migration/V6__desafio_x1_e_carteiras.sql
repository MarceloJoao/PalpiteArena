-- V6: Adiciona saldo/carteira aos usuarios, Carteira Casa (comissoes de 5%) e tabela de Desafios X1 entre usuarios

ALTER TABLE usuario
    ADD COLUMN IF NOT EXISTS saldo NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    ADD COLUMN IF NOT EXISTS saldo_retido NUMERIC(12, 2) NOT NULL DEFAULT 0.00;

CREATE TABLE IF NOT EXISTS carteira_casa (
    id BIGSERIAL PRIMARY KEY,
    saldo_total NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    total_apostas_liquidadas INTEGER NOT NULL DEFAULT 0
);

INSERT INTO carteira_casa (id, saldo_total, total_apostas_liquidadas)
VALUES (1, 0.00, 0)
ON CONFLICT (id) DO NOTHING;

CREATE TABLE IF NOT EXISTS desafio_x1 (
    id BIGSERIAL PRIMARY KEY,
    partida_id BIGINT NOT NULL REFERENCES partida(id) ON DELETE CASCADE,
    desafiante_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    desafiado_id BIGINT NOT NULL REFERENCES usuario(id) ON DELETE CASCADE,
    opcao_desafiante VARCHAR(30) NOT NULL,
    opcao_desafiado VARCHAR(30),
    valor NUMERIC(12, 2) NOT NULL,
    status VARCHAR(30) NOT NULL DEFAULT 'PENDENTE',
    vencedor_id BIGINT REFERENCES usuario(id) ON DELETE SET NULL,
    comissao_casa NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    premio_vencedor NUMERIC(12, 2) NOT NULL DEFAULT 0.00,
    criado_em TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_desafio_x1_partida ON desafio_x1(partida_id);
CREATE INDEX IF NOT EXISTS idx_desafio_x1_desafiante ON desafio_x1(desafiante_id);
CREATE INDEX IF NOT EXISTS idx_desafio_x1_desafiado ON desafio_x1(desafiado_id);
