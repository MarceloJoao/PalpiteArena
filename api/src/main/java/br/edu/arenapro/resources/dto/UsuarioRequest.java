package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

@Schema(name = "UsuarioRequest", description = "Dados para criar ou atualizar um usuário")
public record UsuarioRequest(
        @NotBlank @Size(max = 255)
        @Schema(example = "Maria Silva") String nome,
        @NotBlank @Email @Size(max = 150)
        @Schema(example = "maria@email.com") String email,
        @NotBlank @Size(min = 6, max = 50)
        @Schema(example = "segredo123") String senha) {
}
