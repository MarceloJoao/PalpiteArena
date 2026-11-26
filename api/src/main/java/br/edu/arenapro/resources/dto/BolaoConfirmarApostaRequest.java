package br.edu.arenapro.resources.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.util.List;

public record BolaoConfirmarApostaRequest(
        @NotNull(message = "não deve ser nulo")
        Long usuarioId,

        @NotEmpty(message = "preencha o placar de todas as partidas do bolão")
        List<@Valid BolaoPalpiteItemDto> palpites
) {
}
