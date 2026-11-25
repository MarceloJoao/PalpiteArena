package br.edu.arenapro.domain;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.Objects;

/**
 * Entidade de domínio para o Desafio X1 (aposta direta entre dois usuários A e B em uma partida).
 * Regras de negócio encapsuladas:
 * 1. Ao desafiar, o valor do Usuário A (desafiante) é imediatamente retido;
 * 2. O convite expira se a partida começar e já tiver gol marcado ou estiver finalizada antes do aceite,
 *    devolvendo integralmente o saldo retido ao Usuário A;
 * 3. O Usuário A pode cancelar o convite somente enquanto estiver PENDENTE (antes de B aceitar);
 * 4. Para aceitar, o Usuário B precisa ter saldo disponível igual ao valor da aposta e deve escolher
 *    uma opção diferente da escolhida pelo Usuário A (MANDANTE, EMPATE ou VISITANTE);
 * 5. Ao aceitar, o valor do Usuário B também fica retido até o fim da partida;
 * 6. Ao finalizar a partida:
 *    - Se A ou B acertou o resultado, o vencedor recebe 100% do seu próprio valor de volta + 95% do valor
 *      do perdedor, e os 5% restantes vão para a Carteira Casa;
 *    - Se nenhum dos dois acertou (ex.: A apostou Mandante, B apostou Visitante e o jogo deu Empate),
 *      ambos recebem seu dinheiro de volta descontado de 2,5% de comissão de cada um para a Carteira Casa.
 */
@Entity
@Table(name = "desafio_x1")
public class DesafioX1 {

    private static final BigDecimal TAXA_COMISSAO_VENCEDOR = new BigDecimal("0.05");
    private static final BigDecimal TAXA_COMISSAO_SEM_VENCEDOR = new BigDecimal("0.025");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "partida_id", nullable = false)
    private Partida partida;

    @ManyToOne
    @JoinColumn(name = "desafiante_id", nullable = false)
    private Usuario desafiante;

    @ManyToOne
    @JoinColumn(name = "desafiado_id", nullable = false)
    private Usuario desafiado;

    @Enumerated(EnumType.STRING)
    @Column(name = "opcao_desafiante", nullable = false)
    private OpcaoDesafio opcaoDesafiante;

    @Enumerated(EnumType.STRING)
    @Column(name = "opcao_desafiado")
    private OpcaoDesafio opcaoDesafiado;

    @Column(name = "valor", nullable = false, precision = 12, scale = 2)
    private BigDecimal valor;

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private StatusDesafio status = StatusDesafio.PENDENTE;

    @ManyToOne
    @JoinColumn(name = "vencedor_id")
    private Usuario vencedor;

    @Column(name = "comissao_casa", nullable = false, precision = 12, scale = 2)
    private BigDecimal comissaoCasa = new BigDecimal("0.00");

    @Column(name = "premio_vencedor", nullable = false, precision = 12, scale = 2)
    private BigDecimal premioVencedor = new BigDecimal("0.00");

    @Column(name = "criado_em", nullable = false)
    private LocalDateTime criadoEm = LocalDateTime.now();

    public static DesafioX1 criarConvite(
            Partida partida,
            Usuario desafiante,
            Usuario desafiado,
            OpcaoDesafio opcaoDesafiante,
            BigDecimal valor) {
        if (partida == null) {
            throw new IllegalArgumentException("A partida do desafio é obrigatória.");
        }
        if (desafiante == null || desafiado == null) {
            throw new IllegalArgumentException("Os usuários desafiante e desafiado são obrigatórios.");
        }
        if (Objects.equals(desafiante.getId(), desafiado.getId())
                || (desafiante.getEmail() != null && desafiante.getEmail().equalsIgnoreCase(desafiado.getEmail()))) {
            throw new IllegalArgumentException("Você não pode desafiar a si mesmo.");
        }
        if (opcaoDesafiante == null) {
            throw new IllegalArgumentException("Escolha uma opção de resultado (MANDANTE, EMPATE ou VISITANTE).");
        }
        if (valor == null || valor.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("O valor da aposta deve ser maior que zero.");
        }
        if (partida.getStatus() == StatusPartida.FINALIZADA) {
            throw new IllegalStateException("Não é possível criar um desafio em uma partida já finalizada.");
        }
        if (OpcaoDesafio.placarTemGol(partida.getPlacar())) {
            throw new IllegalStateException("Não é possível criar um desafio após sair gol na partida.");
        }

        BigDecimal valorNormalizado = valor.setScale(2, RoundingMode.HALF_UP);
        desafiante.reterSaldoParaAposta(valorNormalizado);

        DesafioX1 desafio = new DesafioX1();
        desafio.setPartida(partida);
        desafio.setDesafiante(desafiante);
        desafio.setDesafiado(desafiado);
        desafio.setOpcaoDesafiante(opcaoDesafiante);
        desafio.setValor(valorNormalizado);
        desafio.setStatus(StatusDesafio.PENDENTE);
        desafio.setCriadoEm(LocalDateTime.now());
        return desafio;
    }

    /**
     * Verifica se o convite PENDENTE expirou porque a partida já teve gol marcado ou foi encerrada.
     * Caso tenha expirado, devolve o saldo retido do desafiante (Usuário A) e muda o status para EXPIRADO.
     */
    public boolean verificarExpiracaoPorGolOuFim() {
        if (this.status != StatusDesafio.PENDENTE || this.partida == null) {
            return false;
        }
        boolean partidaEncerrada = this.partida.getStatus() == StatusPartida.FINALIZADA;
        boolean saiuGol = OpcaoDesafio.placarTemGol(this.partida.getPlacar());
        if (partidaEncerrada || saiuGol) {
            if (this.desafiante != null) {
                this.desafiante.estornarSaldoRetido(this.valor);
            }
            this.status = StatusDesafio.EXPIRADO;
            return true;
        }
        return false;
    }

    /**
     * Cancela o convite a pedido do Usuário A (desafiante), permitido apenas enquanto estiver PENDENTE.
     */
    public void cancelarPeloDesafiante(Long usuarioId) {
        if (this.status != StatusDesafio.PENDENTE) {
            throw new IllegalStateException("Só é possível cancelar o desafio antes de o adversário aceitar.");
        }
        if (this.desafiante == null || !Objects.equals(this.desafiante.getId(), usuarioId)) {
            throw new IllegalArgumentException("Apenas o usuário que criou o desafio pode cancelá-lo.");
        }
        this.desafiante.estornarSaldoRetido(this.valor);
        this.status = StatusDesafio.CANCELADO;
    }

    /**
     * Recusa o convite a pedido do Usuário B (desafiado), devolvendo o saldo retido ao Usuário A.
     */
    public void recusarPeloDesafiado(Long usuarioId) {
        if (this.status != StatusDesafio.PENDENTE) {
            throw new IllegalStateException("Este convite não está mais pendente.");
        }
        if (this.desafiado == null || !Objects.equals(this.desafiado.getId(), usuarioId)) {
            throw new IllegalArgumentException("Apenas o usuário desafiado pode recusar este convite.");
        }
        if (this.desafiante != null) {
            this.desafiante.estornarSaldoRetido(this.valor);
        }
        this.status = StatusDesafio.RECUSADO;
    }

    /**
     * Aceita o convite pelo Usuário B (desafiado), retendo o saldo de B e exigindo uma opção diferente da de A.
     */
    public void aceitarPeloDesafiado(Long usuarioId, OpcaoDesafio opcaoEscolhida) {
        if (verificarExpiracaoPorGolOuFim()) {
            throw new IllegalStateException("O convite expirou porque a partida já teve gol ou foi encerrada.");
        }
        if (this.status != StatusDesafio.PENDENTE) {
            throw new IllegalStateException("Este convite não está mais pendente para aceite.");
        }
        if (this.desafiado == null || !Objects.equals(this.desafiado.getId(), usuarioId)) {
            throw new IllegalArgumentException("Apenas o usuário desafiado pode aceitar este convite.");
        }
        if (opcaoEscolhida == null) {
            throw new IllegalArgumentException("Escolha em qual resultado você deseja apostar.");
        }
        if (opcaoEscolhida == this.opcaoDesafiante) {
            throw new IllegalArgumentException(
                    "Você não pode escolher o mesmo resultado do desafiante (" + this.opcaoDesafiante + ").");
        }

        this.desafiado.reterSaldoParaAposta(this.valor);
        this.opcaoDesafiado = opcaoEscolhida;
        this.status = StatusDesafio.ACEITO;
    }

    /**
     * Liquida a aposta ao término da partida com o placar oficial.
     */
    public void liquidarComPlacarFinal(String placarFinal, CarteiraCasa carteiraCasa) {
        if (this.status == StatusDesafio.PENDENTE) {
            verificarExpiracaoPorGolOuFim();
            return;
        }
        if (this.status != StatusDesafio.ACEITO) {
            return;
        }
        OpcaoDesafio resultadoReal = OpcaoDesafio.resultadoDoPlacar(placarFinal)
                .orElseThrow(() -> new IllegalArgumentException("Placar final inválido para liquidação: " + placarFinal));

        this.desafiante.consumirSaldoRetido(this.valor);
        this.desafiado.consumirSaldoRetido(this.valor);

        if (resultadoReal == this.opcaoDesafiante) {
            // Desafiante (Usuário A) venceu: recebe seu valor de volta + 95% do valor de B (5% para a Carteira Casa)
            BigDecimal comissao = this.valor.multiply(TAXA_COMISSAO_VENCEDOR).setScale(2, RoundingMode.HALF_UP);
            BigDecimal ganhoLiquidoDoAdversario = this.valor.subtract(comissao);
            BigDecimal totalRecebido = this.valor.add(ganhoLiquidoDoAdversario).setScale(2, RoundingMode.HALF_UP);

            this.desafiante.creditarSaldo(totalRecebido);
            this.vencedor = this.desafiante;
            this.comissaoCasa = comissao;
            this.premioVencedor = totalRecebido;
            if (carteiraCasa != null) {
                carteiraCasa.registrarComissao(comissao);
            }
        } else if (resultadoReal == this.opcaoDesafiado) {
            // Desafiado (Usuário B) venceu: recebe seu valor de volta + 95% do valor de A (5% para a Carteira Casa)
            BigDecimal comissao = this.valor.multiply(TAXA_COMISSAO_VENCEDOR).setScale(2, RoundingMode.HALF_UP);
            BigDecimal ganhoLiquidoDoAdversario = this.valor.subtract(comissao);
            BigDecimal totalRecebido = this.valor.add(ganhoLiquidoDoAdversario).setScale(2, RoundingMode.HALF_UP);

            this.desafiado.creditarSaldo(totalRecebido);
            this.vencedor = this.desafiado;
            this.comissaoCasa = comissao;
            this.premioVencedor = totalRecebido;
            if (carteiraCasa != null) {
                carteiraCasa.registrarComissao(comissao);
            }
        } else {
            // Nenhum dos dois acertou: devolve o dinheiro dos dois cobrando 2,5% de comissão de cada um
            BigDecimal comissaoIndividual = this.valor.multiply(TAXA_COMISSAO_SEM_VENCEDOR).setScale(2, RoundingMode.HALF_UP);
            BigDecimal devolucaoIndividual = this.valor.subtract(comissaoIndividual).setScale(2, RoundingMode.HALF_UP);
            BigDecimal comissaoTotal = comissaoIndividual.multiply(new BigDecimal("2")).setScale(2, RoundingMode.HALF_UP);

            if (devolucaoIndividual.compareTo(BigDecimal.ZERO) > 0) {
                this.desafiante.creditarSaldo(devolucaoIndividual);
                this.desafiado.creditarSaldo(devolucaoIndividual);
            }
            this.vencedor = null;
            this.comissaoCasa = comissaoTotal;
            this.premioVencedor = devolucaoIndividual;
            if (carteiraCasa != null) {
                carteiraCasa.registrarComissao(comissaoTotal);
            }
        }

        this.status = StatusDesafio.FINALIZADO;
    }

    // --- Getters e Setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Partida getPartida() {
        return partida;
    }

    public void setPartida(Partida partida) {
        this.partida = partida;
    }

    public Usuario getDesafiante() {
        return desafiante;
    }

    public void setDesafiante(Usuario desafiante) {
        this.desafiante = desafiante;
    }

    public Usuario getDesafiado() {
        return desafiado;
    }

    public void setDesafiado(Usuario desafiado) {
        this.desafiado = desafiado;
    }

    public OpcaoDesafio getOpcaoDesafiante() {
        return opcaoDesafiante;
    }

    public void setOpcaoDesafiante(OpcaoDesafio opcaoDesafiante) {
        this.opcaoDesafiante = opcaoDesafiante;
    }

    public OpcaoDesafio getOpcaoDesafiado() {
        return opcaoDesafiado;
    }

    public void setOpcaoDesafiado(OpcaoDesafio opcaoDesafiado) {
        this.opcaoDesafiado = opcaoDesafiado;
    }

    public BigDecimal getValor() {
        return valor;
    }

    public void setValor(BigDecimal valor) {
        this.valor = valor;
    }

    public StatusDesafio getStatus() {
        return status;
    }

    public void setStatus(StatusDesafio status) {
        this.status = status;
    }

    public Usuario getVencedor() {
        return vencedor;
    }

    public void setVencedor(Usuario vencedor) {
        this.vencedor = vencedor;
    }

    public BigDecimal getComissaoCasa() {
        return comissaoCasa != null ? comissaoCasa : new BigDecimal("0.00");
    }

    public void setComissaoCasa(BigDecimal comissaoCasa) {
        this.comissaoCasa = comissaoCasa;
    }

    public BigDecimal getPremioVencedor() {
        return premioVencedor != null ? premioVencedor : new BigDecimal("0.00");
    }

    public void setPremioVencedor(BigDecimal premioVencedor) {
        this.premioVencedor = premioVencedor;
    }

    public LocalDateTime getCriadoEm() {
        return criadoEm;
    }

    public void setCriadoEm(LocalDateTime criadoEm) {
        this.criadoEm = criadoEm;
    }
}
