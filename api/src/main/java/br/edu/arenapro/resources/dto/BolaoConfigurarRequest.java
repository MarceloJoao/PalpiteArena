package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;
import java.util.List;

public record BolaoConfigurarRequest(
        @NotNull(message = "não deve ser nulo")
        Long usuarioId,

        @NotNull(message = "não deve ser nulo")
        @DecimalMin(value = "0.01", message = "deve ser maior que zero")
        BigDecimal valorCota,

        @NotEmpty(message = "informe ao menos um e-mail de convidado")
        List<String> emailsConvidados
) {
}
