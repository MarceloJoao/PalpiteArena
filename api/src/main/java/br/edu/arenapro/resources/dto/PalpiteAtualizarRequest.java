package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.PositiveOrZero;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

@Schema(name = "PalpiteAtualizarRequest", description = "Dados para atualizar um palpite")
public record PalpiteAtualizarRequest(
        @NotBlank @Pattern(regexp = "^\\d{1,3}x\\d{1,3}$", message = "deve estar no formato '2x1'")
        @Schema(description = "Placar previsto", example = "1x1") String placarprevisto,
        @PositiveOrZero
        @Schema(description = "Pontos obtidos; se omitido, mantém o valor atual", example = "3") Integer pontosObtidos) {
}
