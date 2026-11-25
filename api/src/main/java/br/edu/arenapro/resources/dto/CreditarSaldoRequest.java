package br.edu.arenapro.resources.dto;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import java.math.BigDecimal;

public record CreditarSaldoRequest(
        @NotNull(message = "não deve ser nulo")
        @DecimalMin(value = "0.01", message = "deve ser maior que zero")
        BigDecimal valor
) {
}
