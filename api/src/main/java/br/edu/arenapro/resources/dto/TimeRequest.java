package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

@Schema(name = "TimeRequest", description = "Dados para criar ou atualizar um time")
public record TimeRequest(
        @NotBlank @Size(max = 255)
        @Schema(example = "Flamengo") String nome) {
}
