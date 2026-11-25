package br.edu.arenapro.resources.dto;

import br.edu.arenapro.domain.OpcaoDesafio;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record DesafioCriarRequest(
        @NotNull(message = "não deve ser nulo")
        Long desafianteId,

        @NotNull(message = "não deve ser nulo")
        Long partidaId,

        @NotBlank(message = "não deve estar em branco")
        @Email(message = "deve ser um endereço de e-mail bem formado")
        String emailDesafiado,

        @NotNull(message = "não deve ser nulo")
        OpcaoDesafio opcaoDesafiante,

        @NotNull(message = "não deve ser nulo")
        @DecimalMin(value = "0.01", message = "deve ser maior que zero")
        BigDecimal valor
) {
}
