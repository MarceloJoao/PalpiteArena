package br.edu.arenapro.domain;

/**
 * Porta de saída do domínio para notificar o usuário sobre o resultado apurado de seu palpite.
 * O domínio não conhece gRPC, Protobuf nem rede; retorna false quando a notificação não pôde
 * ser entregue, sem lançar exceção, pois a notificação é acessória à operação principal.
 */
public interface NotificadorPalpite {

    boolean notificarResultado(Palpite palpite);
}
