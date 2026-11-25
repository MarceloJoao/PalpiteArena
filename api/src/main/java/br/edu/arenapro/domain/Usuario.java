package br.edu.arenapro.domain;

import com.fasterxml.jackson.annotation.JsonIgnore;
import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.persistence.*;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.Locale;

// Entidade que representa um usuário da plataforma
@Entity
@Table(name = "usuario")
public class Usuario {

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @Column(nullable = false)
    private String nome;

    // unique = true garante que não existam dois usuários com o mesmo email
    @Column(nullable = false, unique = true)
    private String email;

    @JsonProperty(access = JsonProperty.Access.WRITE_ONLY)
    @Column(nullable = false)
    private String senha;

    // Pontuação acumulada em todos os palpites — começa em 0
    @Column(name = "pontuacao_total")
    private Integer pontuacaoTotal = 0;

    // Saldo fictício disponível na conta para apostas X1 (creditado pelo Admin ou ganho em desafios)
    @Column(name = "saldo", nullable = false, precision = 12, scale = 2)
    private BigDecimal saldo = new BigDecimal("0.00");

    // Saldo retido em desafios pendentes ou em andamento até o fim da partida
    @Column(name = "saldo_retido", nullable = false, precision = 12, scale = 2)
    private BigDecimal saldoRetido = new BigDecimal("0.00");

    @JsonIgnore
    // Relacionamento 1:N — um usuário tem muitos palpites
    @OneToMany(mappedBy = "usuario", cascade = CascadeType.ALL)
    private List<Palpite> palpites;

    /**
     * Verifica se a senha informada corresponde à senha cadastrada do usuário.
     */
    public boolean conferirSenha(String senhaInformada) {
        return this.senha != null && senhaInformada != null && this.senha.equals(senhaInformada);
    }

    /**
     * Determina o papel do usuário na plataforma (ADMIN para contas administrativas ou TORCEDOR).
     */
    public String obterPapel() {
        if (this.email == null) {
            return "TORCEDOR";
        }
        String emailMin = this.email.trim().toLowerCase(Locale.ROOT);
        if (emailMin.startsWith("admin@") || emailMin.endsWith("@admin.arenapro.com")) {
            return "ADMIN";
        }
        return "TORCEDOR";
    }

    // --- Getters e Setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public String getNome() {
        return nome;
    }

    public void setNome(String nome) {
        this.nome = nome;
    }

    public String getEmail() {
        return email;
    }

    public void setEmail(String email) {
        this.email = email;
    }

    public String getSenha() {
        return senha;
    }

    public void setSenha(String senha) {
        this.senha = senha;
    }

    public Integer getPontuacaoTotal() {
        return pontuacaoTotal;
    }

    public void setPontuacaoTotal(Integer pontuacaoTotal) {
        this.pontuacaoTotal = pontuacaoTotal;
    }

    public List<Palpite> getPalpites() {
        return palpites;
    }

    public void setPalpites(List<Palpite> palpites) {
        this.palpites = palpites;
    }

    public BigDecimal getSaldo() {
        return saldo != null ? saldo : new BigDecimal("0.00");
    }

    public void setSaldo(BigDecimal saldo) {
        this.saldo = saldo != null ? saldo.setScale(2, RoundingMode.HALF_UP) : new BigDecimal("0.00");
    }

    public BigDecimal getSaldoRetido() {
        return saldoRetido != null ? saldoRetido : new BigDecimal("0.00");
    }

    public void setSaldoRetido(BigDecimal saldoRetido) {
        this.saldoRetido = saldoRetido != null ? saldoRetido.setScale(2, RoundingMode.HALF_UP) : new BigDecimal("0.00");
    }

    /**
     * Credita um valor positivo no saldo disponível do usuário.
     */
    public void creditarSaldo(BigDecimal valor) {
        if (valor == null || valor.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("O valor a creditar deve ser maior que zero.");
        }
        this.saldo = getSaldo().add(valor).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Retém do saldo disponível o valor de uma aposta, movendo-o para saldoRetido.
     */
    public void reterSaldoParaAposta(BigDecimal valor) {
        if (valor == null || valor.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("O valor da aposta deve ser maior que zero.");
        }
        if (getSaldo().compareTo(valor) < 0) {
            throw new IllegalStateException("Saldo insuficiente na conta para cobrir o valor da aposta.");
        }
        this.saldo = getSaldo().subtract(valor).setScale(2, RoundingMode.HALF_UP);
        this.saldoRetido = getSaldoRetido().add(valor).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Estorna um valor que estava retido de volta para o saldo disponível (em cancelamento, recusa ou expiração).
     */
    public void estornarSaldoRetido(BigDecimal valor) {
        if (valor == null || valor.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        BigDecimal retidoAtual = getSaldoRetido();
        BigDecimal estorno = retidoAtual.compareTo(valor) >= 0 ? valor : retidoAtual;
        this.saldoRetido = retidoAtual.subtract(estorno).setScale(2, RoundingMode.HALF_UP);
        this.saldo = getSaldo().add(valor).setScale(2, RoundingMode.HALF_UP);
    }

    /**
     * Consome definitivamente o saldo que estava retido quando a partida termina e a aposta é liquidada.
     */
    public void consumirSaldoRetido(BigDecimal valor) {
        if (valor == null || valor.compareTo(BigDecimal.ZERO) <= 0) {
            return;
        }
        BigDecimal retidoAtual = getSaldoRetido();
        BigDecimal abatimento = retidoAtual.compareTo(valor) >= 0 ? valor : retidoAtual;
        this.saldoRetido = retidoAtual.subtract(abatimento).setScale(2, RoundingMode.HALF_UP);
    }
}
