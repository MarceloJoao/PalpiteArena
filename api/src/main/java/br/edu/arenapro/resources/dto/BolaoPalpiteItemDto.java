package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

public record BolaoPalpiteItemDto(
        @NotNull(message = "não deve ser nulo")
        Long partidaId,

        @NotBlank(message = "não deve estar em branco")
        String placar
) {
}
