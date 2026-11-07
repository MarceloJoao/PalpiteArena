package br.edu.arenapro.violacao.domain;

import io.grpc.Status;

/**
 * Fixture de teste para o ArchitectureTest: simula uma classe no pacote "..domain.."
 * importando io.grpc de propósito, para comprovar que a regra de arquitetura detecta a violação.
 */
public class DominioContaminado {

    public Status statusProibidoNoDominio() {
        return Status.OK;
    }
}
