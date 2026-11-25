package br.edu.arenapro.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;

/**
 * Representa a Carteira Casa (banco da plataforma), que acumula as comissões
 * descontadas na liquidação dos desafios X1 (5% do valor do perdedor, ou 2,5% de cada se ninguém acertar).
 */
@Entity
@Table(name = "carteira_casa")
public class CarteiraCasa {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(name = "saldo_total", nullable = false, precision = 12, scale = 2)
    private BigDecimal saldoTotal = new BigDecimal("0.00");

    @Column(name = "total_apostas_liquidadas", nullable = false)
    private Integer totalApostasLiquidadas = 0;

    public void registrarComissao(BigDecimal comissao) {
        if (comissao == null || comissao.compareTo(BigDecimal.ZERO) < 0) {
            throw new IllegalArgumentException("A comissão da casa não pode ser negativa.");
        }
        BigDecimal atual = this.saldoTotal != null ? this.saldoTotal : BigDecimal.ZERO;
        this.saldoTotal = atual.add(comissao).setScale(2, RoundingMode.HALF_UP);
        this.totalApostasLiquidadas = (this.totalApostasLiquidadas != null ? this.totalApostasLiquidadas : 0) + 1;
    }

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public BigDecimal getSaldoTotal() {
        return saldoTotal != null ? saldoTotal : new BigDecimal("0.00");
    }

    public void setSaldoTotal(BigDecimal saldoTotal) {
        this.saldoTotal = saldoTotal;
    }

    public Integer getTotalApostasLiquidadas() {
        return totalApostasLiquidadas != null ? totalApostasLiquidadas : 0;
    }

    public void setTotalApostasLiquidadas(Integer totalApostasLiquidadas) {
        this.totalApostasLiquidadas = totalApostasLiquidadas;
    }
}
