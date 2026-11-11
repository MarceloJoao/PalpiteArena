package br.edu.arenapro.resources.dto;

import org.eclipse.microprofile.openapi.annotations.media.Schema;

@Schema(name = "LoginResponse", description = "Resposta de autenticação com token JWT e dados do usuário")
public record LoginResponse(
        @Schema(description = "Token JWT assinado (HS256)") String token,
        @Schema(example = "Bearer") String tipo,
        @Schema(example = "86400") long expiraEmSegundos,
        @Schema(example = "1") Long usuarioId,
        @Schema(example = "Maria Silva") String nome,
        @Schema(example = "maria@email.com") String email,
        @Schema(example = "TORCEDOR") String papel) {
}
