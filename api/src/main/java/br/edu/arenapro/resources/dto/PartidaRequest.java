package br.edu.arenapro.resources.dto;

import br.edu.arenapro.domain.StatusPartida;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

import java.time.LocalDateTime;

@Schema(name = "PartidaRequest", description = "Dados para criar ou atualizar uma partida")
public record PartidaRequest(
        @NotNull @Positive
        @Schema(description = "Id do time da casa", example = "1") Long timeCasaId,
        @NotNull @Positive
        @Schema(description = "Id do time de fora", example = "2") Long timeForaId,
        @NotNull
        @Schema(description = "Data e hora da partida", example = "2026-11-01T16:00:00") LocalDateTime data,
        @Pattern(regexp = "^\\d{1,3}x\\d{1,3}$", message = "deve estar no formato '2x1'")
        @Schema(description = "Placar final; omitir antes de a partida terminar", example = "2x1") String placar,
        @Schema(description = "Status; se omitido, mantém o atual (AGENDADA na criação)") StatusPartida status) {
}
