package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

@Schema(name = "LoginRequest", description = "Credenciais de acesso para autenticação e geração de token JWT")
public record LoginRequest(
        @NotBlank @Email
        @Schema(example = "maria@email.com") String email,
        @NotBlank
        @Schema(example = "segredo123") String senha) {
}
