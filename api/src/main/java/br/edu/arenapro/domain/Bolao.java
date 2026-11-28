package br.edu.arenapro.domain;

import jakarta.persistence.CascadeType;
import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.FetchType;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.JoinColumn;
import jakarta.persistence.ManyToOne;
import jakarta.persistence.OneToMany;
import jakarta.persistence.OrderBy;
import jakarta.persistence.Table;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Objects;

/**
 * Agregado de domínio da Função Bolão (aposta coletiva em múltiplas partidas selecionadas no Mural).
 * Encapsula as 14 regras de negócio do Bolão:
 * - Criação a partir da seleção de partidas no Mural com os placares do criador;
 * - Configuração do valor da cota e envio de convites a múltiplos usuários por e-mail;
 * - Expiração automática de convites pendentes quando o primeiro jogo acontece (tem gol ou encerra);
 * - Aceite com retenção do valor da cota e escolha de placares sem repetir combinações já jogadas na mesma partida;
 * - Desistência após aceite com multa de 20% para a Carteira Casa e devolução de 80% ao usuário;
 * - Cancelamento pelo criador permitido somente se ninguém aceitou ainda ou se todos que aceitaram desistiram;
 * - Apuração de ranking por pontos e liquidação final com 10% do pote total para a Carteira Casa e 90% para o vencedor.
 */
@Entity
@Table(name = "bolao")
public class Bolao {

    private static final BigDecimal TAXA_MULTA_DESISTENCIA = new BigDecimal("0.20");
    private static final BigDecimal TAXA_COMISSAO_CASA_BOLAO = new BigDecimal("0.10");
    private static final BigDecimal TAXA_SEM_VENCEDOR_CADA = new BigDecimal("0.025");

    @Id
    @GeneratedValue(strategy = GenerationType.IDENTITY)
    private Long id;

    @ManyToOne
    @JoinColumn(name = "criador_id", nullable = false)
    private Usuario criador;

    @Column(name = "valor_cota", nullable = false, precision = 12, scale = 2)
    private BigDecimal valorCota = new BigDecimal("0.00");

    @Enumerated(EnumType.STRING)
    @Column(name = "status", nullable = false)
    private StatusBolao status = StatusBolao.RASCUNHO;

    @ManyToOne
    @JoinColumn(name = "vencedor_id")
    private Usuario vencedor;

    @Column(name = "comissao_casa", nullable = false, precision = 12, scale = 2)
    private BigDecimal comissaoCasa = new BigDecimal("0.00");

    @Column(name = "premio_vencedor", nullable = false, precision = 12, scale = 2)
    private BigDecimal premioVencedor = new BigDecimal("0.00");

    @Column(name = "criado_em", nullable = false)
    private LocalDateTime criadoEm = LocalDateTime.now();

    @OneToMany(mappedBy = "bolao", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("ordem ASC, id ASC")
    private List<BolaoPartida> partidas = new ArrayList<>();

    @OneToMany(mappedBy = "bolao", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    @OrderBy("pontosTotais DESC, id ASC")
    private List<BolaoParticipante> participantes = new ArrayList<>();

    @OneToMany(mappedBy = "bolao", cascade = CascadeType.ALL, orphanRemoval = true, fetch = FetchType.EAGER)
    private List<BolaoPalpite> palpites = new ArrayList<>();

    public static String normalizarPlacar(String placar) {
        if (placar == null || placar.isBlank()) {
            throw new IllegalArgumentException("O placar não pode estar em branco.");
        }
        String limpo = placar.trim().toLowerCase().replace(" ", "").replace("-", "x");
        String[] partes = limpo.split("x");
        if (partes.length != 2) {
            throw new IllegalArgumentException("Placar inválido: '" + placar + "'. Use o formato GolsCasa x GolsFora (ex.: 2x1).");
        }
        try {
            int casa = Integer.parseInt(partes[0]);
            int fora = Integer.parseInt(partes[1]);
            if (casa < 0 || fora < 0) {
                throw new IllegalArgumentException("Os gols do placar não podem ser negativos.");
            }
            return casa + "x" + fora;
        } catch (NumberFormatException e) {
            throw new IllegalArgumentException("Placar inválido: '" + placar + "'.");
        }
    }

    /**
     * Cria o bolão a partir das partidas selecionadas no Mural e dos placares preenchidos pelo criador.
     */
    public static Bolao criarComSelecaoEPlacares(
            Usuario criador,
            List<Partida> partidasSelecionadas,
            Map<Long, String> placaresDoCriador) {
        if (criador == null) {
            throw new IllegalArgumentException("O usuário criador do bolão é obrigatório.");
        }
        if (partidasSelecionadas == null || partidasSelecionadas.isEmpty()) {
            throw new IllegalArgumentException("Selecione ao menos uma partida no Mural para criar o bolão.");
        }
        if (placaresDoCriador == null || placaresDoCriador.size() < partidasSelecionadas.size()) {
            throw new IllegalArgumentException("Preencha o placar de todas as partidas selecionadas.");
        }

        Bolao bolao = new Bolao();
        bolao.setCriador(criador);
        bolao.setStatus(StatusBolao.RASCUNHO);
        bolao.setCriadoEm(LocalDateTime.now());

        int ordem = 1;
        for (Partida partida : partidasSelecionadas) {
            if (partida.getStatus() == StatusPartida.FINALIZADA) {
                throw new IllegalStateException("A partida " + partida.getDescricao() + " já está finalizada.");
            }
            String placarBruto = placaresDoCriador.get(partida.getId());
            if (placarBruto == null || placarBruto.isBlank()) {
                throw new IllegalArgumentException("Você esqueceu de marcar o placar da partida " + partida.getDescricao() + ".");
            }
            String placarNorm = normalizarPlacar(placarBruto);

            BolaoPartida bp = new BolaoPartida();
            bp.setBolao(bolao);
            bp.setPartida(partida);
            bp.setOrdem(ordem++);
            bolao.getPartidas().add(bp);

            BolaoPalpite palpite = new BolaoPalpite();
            palpite.setBolao(bolao);
            palpite.setPartida(partida);
            palpite.setUsuario(criador);
            palpite.setPlacarPrevisto(placarNorm);
            palpite.setPontosObtidos(0);
            bolao.getPalpites().add(palpite);
        }

        BolaoParticipante partCriador = new BolaoParticipante();
        partCriador.setBolao(bolao);
        partCriador.setUsuario(criador);
        partCriador.setPapel("CRIADOR");
        partCriador.setStatus(StatusParticipanteBolao.CONFIRMADO);
        partCriador.setValorRetido(new BigDecimal("0.00"));
        partCriador.setPontosTotais(0);
        bolao.getParticipantes().add(partCriador);

        return bolao;
    }

    /**
     * Passo 6: Na aba Meus Bolões, o criador define o valor do bolão (retendo sua cota) e convida vários usuários por e-mail.
     */
    public void configurarValorEConvidados(Long usuarioId, BigDecimal novoValor, List<Usuario> convidados) {
        if (this.status == StatusBolao.CANCELADO || this.status == StatusBolao.FINALIZADO) {
            throw new IllegalStateException("Não é possível alterar um bolão já finalizado ou cancelado.");
        }
        if (this.criador == null || !Objects.equals(this.criador.getId(), usuarioId)) {
            throw new IllegalArgumentException("Apenas o criador do bolão pode definir o valor e convidar usuários.");
        }
        if (novoValor == null || novoValor.compareTo(BigDecimal.ZERO) <= 0) {
            throw new IllegalArgumentException("O valor do bolão deve ser maior que zero.");
        }
        if (convidados == null || convidados.isEmpty()) {
            throw new IllegalArgumentException("Informe ao menos um e-mail de usuário para convidar ao bolão.");
        }

        BigDecimal valorNormalizado = novoValor.setScale(2, RoundingMode.HALF_UP);
        BolaoParticipante partCriador = buscarParticipante(this.criador.getId());

        // Uma vez que o valor do bolão foi inicializado (status ABERTO e valorCota > 0), ele não pode mais ser alterado
        if (this.status == StatusBolao.ABERTO && this.valorCota.compareTo(BigDecimal.ZERO) > 0
                && this.valorCota.compareTo(valorNormalizado) != 0) {
            throw new IllegalStateException("Não é possível alterar o valor do bolão após ele já ter sido definido.");
        }

        // Ajusta a retenção de saldo do criador se o valor mudou ou se ainda era RASCUNHO (0.00)
        BigDecimal retidoAnterior = partCriador != null ? partCriador.getValorRetido() : BigDecimal.ZERO;
        if (retidoAnterior.compareTo(valorNormalizado) != 0) {
            if (retidoAnterior.compareTo(BigDecimal.ZERO) > 0) {
                this.criador.estornarSaldoRetido(retidoAnterior);
            }
            this.criador.reterSaldoParaAposta(valorNormalizado);
            if (partCriador != null) {
                partCriador.setValorRetido(valorNormalizado);
            }
        }

        this.valorCota = valorNormalizado;
        this.status = StatusBolao.ABERTO;

        for (Usuario convidado : convidados) {
            if (convidado == null || Objects.equals(convidado.getId(), this.criador.getId())) {
                continue;
            }
            BolaoParticipante existente = buscarParticipante(convidado.getId());
            if (existente == null) {
                BolaoParticipante novo = new BolaoParticipante();
                novo.setBolao(this);
                novo.setUsuario(convidado);
                novo.setPapel("CONVIDADO");
                novo.setStatus(StatusParticipanteBolao.PENDENTE);
                novo.setValorRetido(new BigDecimal("0.00"));
                novo.setPontosTotais(0);
                this.participantes.add(novo);
            }
        }
    }

    /**
     * Regra 12: O usuário que não entrar no bolão até o primeiro jogo acontecer tem o seu convite expirado.
     */
    public boolean verificarExpiracaoConvitesPrimeiraPartida() {
        if (this.status != StatusBolao.ABERTO && this.status != StatusBolao.RASCUNHO) {
            return false;
        }
        boolean primeiroJogoAconteceu = this.partidas.stream()
                .map(BolaoPartida::getPartida)
                .filter(Objects::nonNull)
                .anyMatch(p -> p.getStatus() == StatusPartida.FINALIZADA || OpcaoDesafio.placarTemGol(p.getPlacar()));

        if (!primeiroJogoAconteceu) {
            return false;
        }

        boolean expirouAlgum = false;
        for (BolaoParticipante p : this.participantes) {
            if (p.getStatus() == StatusParticipanteBolao.PENDENTE) {
                p.setStatus(StatusParticipanteBolao.EXPIRADO);
                expirouAlgum = true;
            }
        }
        return expirouAlgum;
    }

    /**
     * Passo 7: Usuário convidado aceita o bolão, retendo o valor da cota.
     */
    public void aceitarConvite(Long usuarioId) {
        verificarExpiracaoConvitesPrimeiraPartida();
        if (this.status != StatusBolao.ABERTO) {
            throw new IllegalStateException("Este bolão não está aberto para novos aceites.");
        }
        BolaoParticipante part = buscarParticipante(usuarioId);
        if (part == null) {
            throw new IllegalArgumentException("Você não está na lista de convidados deste bolão.");
        }
        if (part.getStatus() == StatusParticipanteBolao.EXPIRADO) {
            throw new IllegalStateException("Seu convite expirou porque o primeiro jogo do bolão já aconteceu.");
        }
        if (part.getStatus() != StatusParticipanteBolao.PENDENTE) {
            throw new IllegalStateException("Este convite já foi respondido (" + part.getStatus() + ").");
        }

        part.getUsuario().reterSaldoParaAposta(this.valorCota);
        part.setValorRetido(this.valorCota);
        part.setStatus(StatusParticipanteBolao.ACEITO);
    }

    /**
     * Passo 7: Usuário convidado recusa o convite do bolão.
     */
    public void recusarConvite(Long usuarioId) {
        BolaoParticipante part = buscarParticipante(usuarioId);
        if (part == null) {
            throw new IllegalArgumentException("Você não está na lista de convidados deste bolão.");
        }
        if (part.getStatus() != StatusParticipanteBolao.PENDENTE) {
            throw new IllegalStateException("Só é possível recusar um convite que ainda está pendente.");
        }
        part.setStatus(StatusParticipanteBolao.RECUSADO);
    }

    /**
     * Passos 8, 9 e 10: O convidado que aceitou o bolão registra seus placares em todas as partidas
     * (sem repetir combinações já jogadas naquela partida) e confirma sua aposta.
     */
    public void confirmarPlacaresConvidado(Long usuarioId, Map<Long, String> placaresPorPartida) {
        if (this.status != StatusBolao.ABERTO) {
            throw new IllegalStateException("Este bolão não está aberto para confirmação de apostas.");
        }
        BolaoParticipante part = buscarParticipante(usuarioId);
        if (part == null || !part.estaAtivoNoBolao()) {
            throw new IllegalStateException("Você precisa aceitar o convite do bolão antes de confirmar seus placares.");
        }
        if (placaresPorPartida == null) {
            throw new IllegalArgumentException("Informe os placares de todas as partidas do bolão.");
        }

        // Valida todas as partidas do bolão antes de gravar (repetição de placar entre participantes é permitida)
        for (BolaoPartida bp : this.partidas) {
            Partida partida = bp.getPartida();
            String placarBruto = placaresPorPartida.get(partida.getId());
            if (placarBruto == null || placarBruto.isBlank()) {
                throw new IllegalArgumentException("Você esqueceu de marcar o placar de: " + partida.getDescricao());
            }
            normalizarPlacar(placarBruto);
        }

        // Remove palpites anteriores deste usuário neste bolão (caso esteja atualizando) e grava os novos
        this.palpites.removeIf(p -> p.getUsuario() != null && Objects.equals(p.getUsuario().getId(), usuarioId));
        for (BolaoPartida bp : this.partidas) {
            Partida partida = bp.getPartida();
            String placarNorm = normalizarPlacar(placaresPorPartida.get(partida.getId()));
            BolaoPalpite novo = new BolaoPalpite();
            novo.setBolao(this);
            novo.setPartida(partida);
            novo.setUsuario(part.getUsuario());
            novo.setPlacarPrevisto(placarNorm);
            novo.setPontosObtidos(0);
            this.palpites.add(novo);
        }

        part.setStatus(StatusParticipanteBolao.CONFIRMADO);
    }

    /**
     * Regra 13: Tendo um usuário aceito o convite, se ele desistir, será penalizado em 20%
     * (80% devolvidos ao saldo do usuário e 20% enviados para a Carteira Casa).
     */
    public void desistirDoBolao(Long usuarioId, CarteiraCasa carteiraCasa) {
        if (this.status == StatusBolao.FINALIZADO || this.status == StatusBolao.CANCELADO) {
            throw new IllegalStateException("Não é possível desistir de um bolão já finalizado ou cancelado.");
        }
        BolaoParticipante part = buscarParticipante(usuarioId);
        if (part == null) {
            throw new IllegalArgumentException("Você não participa deste bolão.");
        }
        if ("CRIADOR".equals(part.getPapel())) {
            throw new IllegalStateException("O criador não pode desistir como convidado; use a opção de cancelar o bolão.");
        }
        if (!part.estaAtivoNoBolao()) {
            throw new IllegalStateException("Apenas participantes que já aceitaram o convite podem desistir.");
        }

        BigDecimal retido = part.getValorRetido();
        BigDecimal multa20 = retido.multiply(TAXA_MULTA_DESISTENCIA).setScale(2, RoundingMode.HALF_UP);
        BigDecimal devolucao80 = retido.subtract(multa20).setScale(2, RoundingMode.HALF_UP);

        Usuario u = part.getUsuario();
        u.consumirSaldoRetido(retido);
        if (devolucao80.compareTo(BigDecimal.ZERO) > 0) {
            u.creditarSaldo(devolucao80);
        }
        if (carteiraCasa != null && multa20.compareTo(BigDecimal.ZERO) > 0) {
            carteiraCasa.registrarComissao(multa20);
        }

        // Libera as combinações de placar daquele participante
        this.palpites.removeIf(p -> p.getUsuario() != null && Objects.equals(p.getUsuario().getId(), usuarioId));
        part.setValorRetido(new BigDecimal("0.00"));
        part.setMultaDesistencia(multa20);
        part.setPontosTotais(0);
        part.setStatus(StatusParticipanteBolao.DESISTIU);
    }

    /**
     * Regra 11: O criador só pode cancelar/apagar o bolão se ninguém tiver aceitado ainda
     * ou se todos os que aceitaram desistirem.
     */
    public void cancelarPeloCriador(Long usuarioId) {
        if (this.status == StatusBolao.FINALIZADO || this.status == StatusBolao.CANCELADO) {
            throw new IllegalStateException("Este bolão já está finalizado ou cancelado.");
        }
        if (this.criador == null || !Objects.equals(this.criador.getId(), usuarioId)) {
            throw new IllegalArgumentException("Apenas o usuário que criou o bolão pode cancelá-lo.");
        }

        boolean existeConvidadoAtivo = this.participantes.stream()
                .anyMatch(p -> !"CRIADOR".equals(p.getPapel()) && p.estaAtivoNoBolao());
        if (existeConvidadoAtivo) {
            throw new IllegalStateException(
                    "Não é possível cancelar o bolão porque já existem participantes que aceitaram o convite. "
                            + "O cancelamento só é permitido se ninguém tiver aceitado ou se todos que aceitaram desistirem.");
        }

        BolaoParticipante partCriador = buscarParticipante(this.criador.getId());
        if (partCriador != null && partCriador.getValorRetido().compareTo(BigDecimal.ZERO) > 0) {
            this.criador.estornarSaldoRetido(partCriador.getValorRetido());
            partCriador.setValorRetido(new BigDecimal("0.00"));
        }

        for (BolaoParticipante p : this.participantes) {
            if (p.getStatus() == StatusParticipanteBolao.PENDENTE) {
                p.setStatus(StatusParticipanteBolao.EXPIRADO);
            }
        }
        this.status = StatusBolao.CANCELADO;
    }

    /**
     * Passo 10 e Regra 14: Atualiza os pontos de cada participante conforme os placares das partidas.
     * Quando todas as partidas do bolão estiverem FINALIZADAS, liquida o bolão:
     * - 10% do pote total vão para a Carteira Casa;
     * - 90% do pote total vão para o vencedor (1º colocado do ranking do bolão).
     */
    public void apurarPontosELiquidarSeFinalizado(CarteiraCasa carteiraCasa) {
        verificarExpiracaoConvitesPrimeiraPartida();
        if (this.status == StatusBolao.CANCELADO || this.status == StatusBolao.FINALIZADO) {
            return;
        }

        // 1. Calcula pontos de cada palpite nas partidas que já têm placar final (cada acerto de placar exato = 3 pontos)
        for (BolaoPalpite palpite : this.palpites) {
            Partida partida = palpite.getPartida();
            int pontosAnteriores = palpite.getPontosObtidos() != null ? palpite.getPontosObtidos() : 0;
            int novosPontos = 0;
            if (partida != null
                    && partida.getStatus() == StatusPartida.FINALIZADA
                    && partida.getPlacar() != null
                    && !partida.getPlacar().isBlank()) {
                novosPontos = palpite.calcularPontos(partida.getPlacar());
            } else {
                palpite.setPontosObtidos(0);
            }
            int delta = novosPontos - pontosAnteriores;
            if (delta != 0 && palpite.getUsuario() != null) {
                Usuario u = palpite.getUsuario();
                int atual = u.getPontuacaoTotal() != null ? u.getPontuacaoTotal() : 0;
                u.setPontuacaoTotal(Math.max(0, atual + delta));
            }
        }

        // 2. Soma os pontos totais de cada participante ativo no bolão
        for (BolaoParticipante part : this.participantes) {
            if (part.estaAtivoNoBolao() && part.getUsuario() != null) {
                Long uid = part.getUsuario().getId();
                int soma = this.palpites.stream()
                        .filter(p -> p.getUsuario() != null && Objects.equals(p.getUsuario().getId(), uid))
                        .mapToInt(BolaoPalpite::getPontosObtidos)
                        .sum();
                part.setPontosTotais(soma);
            } else {
                part.setPontosTotais(0);
            }
        }

        // 3. Verifica se todas as partidas do bolão já foram finalizadas
        if (this.status != StatusBolao.ABERTO || this.partidas.isEmpty()) {
            return;
        }
        boolean todasFinalizadas = this.partidas.stream()
                .map(BolaoPartida::getPartida)
                .allMatch(p -> p != null
                        && p.getStatus() == StatusPartida.FINALIZADA
                        && p.getPlacar() != null
                        && !p.getPlacar().isBlank());

        if (!todasFinalizadas) {
            return;
        }

        List<BolaoParticipante> ativos = this.participantes.stream()
                .filter(BolaoParticipante::estaAtivoNoBolao)
                .sorted(Comparator.comparingInt(BolaoParticipante::getPontosTotais).reversed())
                .toList();

        if (ativos.isEmpty()) {
            this.status = StatusBolao.FINALIZADO;
            return;
        }

        int maiorPontuacao = ativos.stream()
                .mapToInt(BolaoParticipante::getPontosTotais)
                .max()
                .orElse(0);

        List<BolaoParticipante> primeirosColocados = ativos.stream()
                .filter(p -> p.getPontosTotais() == maiorPontuacao)
                .toList();

        boolean ninguemGanhou = maiorPontuacao <= 0 || primeirosColocados.size() == ativos.size();

        if (ninguemGanhou) {
            // Quando todos empatam em 0 pontos (ou todos terminam empatados sem perdedor):
            // ninguém ganha, a Casa cobra 2,5% de cada um e devolve 97,5% para cada participante
            BigDecimal comissaoTotalSemVencedor = BigDecimal.ZERO;
            for (BolaoParticipante part : ativos) {
                BigDecimal retido = part.getValorRetido();
                if (part.getUsuario() != null && retido.compareTo(BigDecimal.ZERO) > 0) {
                    part.getUsuario().consumirSaldoRetido(retido);
                    BigDecimal taxa25 = retido.multiply(TAXA_SEM_VENCEDOR_CADA).setScale(2, RoundingMode.HALF_UP);
                    BigDecimal devolucao975 = retido.subtract(taxa25).setScale(2, RoundingMode.HALF_UP);
                    part.getUsuario().creditarSaldo(devolucao975);
                    comissaoTotalSemVencedor = comissaoTotalSemVencedor.add(taxa25);
                }
            }
            if (carteiraCasa != null && comissaoTotalSemVencedor.compareTo(BigDecimal.ZERO) > 0) {
                carteiraCasa.registrarComissao(comissaoTotalSemVencedor);
            }
            this.vencedor = null;
            this.comissaoCasa = comissaoTotalSemVencedor;
            this.premioVencedor = new BigDecimal("0.00");
            this.status = StatusBolao.FINALIZADO;
            return;
        }

        BigDecimal poteTotal = BigDecimal.ZERO;
        for (BolaoParticipante part : ativos) {
            BigDecimal retido = part.getValorRetido();
            poteTotal = poteTotal.add(retido);
            if (part.getUsuario() != null && retido.compareTo(BigDecimal.ZERO) > 0) {
                part.getUsuario().consumirSaldoRetido(retido);
            }
        }

        // Regra 14 (Opção B): A Casa tira 10% do pote total do bolão e os 90% restantes são divididos igualmente entre os 1º colocados
        BigDecimal comissao10 = poteTotal.multiply(TAXA_COMISSAO_CASA_BOLAO).setScale(2, RoundingMode.HALF_UP);
        BigDecimal premio90 = poteTotal.subtract(comissao10).setScale(2, RoundingMode.HALF_UP);
        BigDecimal premioPorVencedor = premio90.divide(
                BigDecimal.valueOf(primeirosColocados.size()), 2, RoundingMode.DOWN);

        for (BolaoParticipante campeao : primeirosColocados) {
            if (campeao.getUsuario() != null && premioPorVencedor.compareTo(BigDecimal.ZERO) > 0) {
                campeao.getUsuario().creditarSaldo(premioPorVencedor);
            }
        }
        if (carteiraCasa != null && comissao10.compareTo(BigDecimal.ZERO) > 0) {
            carteiraCasa.registrarComissao(comissao10);
        }

        this.vencedor = primeirosColocados.get(0).getUsuario();
        this.comissaoCasa = comissao10;
        this.premioVencedor = premioPorVencedor;
        this.status = StatusBolao.FINALIZADO;
    }

    public BolaoParticipante buscarParticipante(Long usuarioId) {
        if (usuarioId == null) {
            return null;
        }
        return this.participantes.stream()
                .filter(p -> p.getUsuario() != null && Objects.equals(p.getUsuario().getId(), usuarioId))
                .findFirst()
                .orElse(null);
    }

    // --- Getters e Setters ---

    public Long getId() {
        return id;
    }

    public void setId(Long id) {
        this.id = id;
    }

    public Usuario getCriador() {
        return criador;
    }

    public void setCriador(Usuario criador) {
        this.criador = criador;
    }

    public BigDecimal getValorCota() {
        return valorCota != null ? valorCota : new BigDecimal("0.00");
    }

    public void setValorCota(BigDecimal valorCota) {
        this.valorCota = valorCota;
    }

    public StatusBolao getStatus() {
        return status;
    }

    public void setStatus(StatusBolao status) {
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

    public List<BolaoPartida> getPartidas() {
        return partidas;
    }

    public void setPartidas(List<BolaoPartida> partidas) {
        this.partidas = partidas;
    }

    public List<BolaoParticipante> getParticipantes() {
        return participantes;
    }

    public void setParticipantes(List<BolaoParticipante> participantes) {
        this.participantes = participantes;
    }

    public List<BolaoPalpite> getPalpites() {
        return palpites;
    }

    public void setPalpites(List<BolaoPalpite> palpites) {
        this.palpites = palpites;
    }
}
