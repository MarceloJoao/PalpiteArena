package br.edu.arenapro.domain;

/**
 * Ciclo de vida de um Bolão entre múltiplos usuários.
 * - RASCUNHO: partidas e placares do criador selecionados no Mural, aguardando definir valor e convidados;
 * - ABERTO: valor definido e convites enviados;
 * - FINALIZADO: todas as partidas encerradas, ranking apurado e prêmio pago (90% vencedor, 10% Carteira Casa);
 * - CANCELADO: cancelado pelo criador quando nenhum convidado havia aceitado (ou todos desistiram).
 */
public enum StatusBolao {
    RASCUNHO,
    ABERTO,
    FINALIZADO,
    CANCELADO
}
