package br.edu.arenapro.resources.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record BolaoCriarRequest(
        @NotNull(message = "não deve ser nulo")
        Long criadorId,

        @NotEmpty(message = "selecione ao menos uma partida com placar")
        List<@Valid BolaoPalpiteItemDto> palpites
) {
}
