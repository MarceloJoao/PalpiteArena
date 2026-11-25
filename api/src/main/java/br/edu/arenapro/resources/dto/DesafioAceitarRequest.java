package br.edu.arenapro.resources.dto;

import br.edu.arenapro.domain.OpcaoDesafio;
import jakarta.validation.constraints.NotNull;

public record DesafioAceitarRequest(
        @NotNull(message = "não deve ser nulo")
        Long usuarioId,

        @NotNull(message = "não deve ser nulo")
        OpcaoDesafio opcaoDesafiado
) {
}
