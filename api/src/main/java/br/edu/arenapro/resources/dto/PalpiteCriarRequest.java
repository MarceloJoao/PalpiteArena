package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Positive;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

@Schema(name = "PalpiteCriarRequest", description = "Dados para registrar um palpite")
public record PalpiteCriarRequest(
        @NotNull @Positive
        @Schema(description = "Id do usuário que palpita", example = "1") Long usuarioId,
        @NotNull @Positive
        @Schema(description = "Id da partida palpitada", example = "1") Long partidaId,
        // O nome do campo segue o JSON ja devolvido pela API (propriedade "placarprevisto" da entidade)
        @NotBlank @Pattern(regexp = "^\\d{1,3}x\\d{1,3}$", message = "deve estar no formato '2x1'")
        @Schema(description = "Placar previsto", example = "2x1") String placarprevisto) {
}
