package br.edu.arenapro.domain;

import java.util.Optional;

/**
 * Porta de saída do domínio para comunicação com o microsserviço Go:
 * - Notificar o usuário sobre o resultado apurado de seu palpite;
 * - Consultar na API externa de esportes o placar oficial de uma partida.
 * O domínio não conhece gRPC, Protobuf nem rede.
 */
public interface NotificadorPalpite {

    boolean notificarResultado(Palpite palpite);

    default Optional<String> consultarPlacarExterno(Partida partida) {
        return Optional.empty();
    }
}
