package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.NotNull;

public record DesafioAcaoUsuarioRequest(
        @NotNull(message = "não deve ser nulo")
        Long usuarioId
) {
}
