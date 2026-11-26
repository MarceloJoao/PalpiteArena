package br.edu.arenapro.domain;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Testes unitários puros das 14 regras de negócio da Função Bolão (sem banco e sem Quarkus).
 */
class BolaoDominioTest {

    private Partida jogo1;
    private Partida jogo2;
    private Usuario criador;
    private Usuario convidado1;
    private Usuario convidado2;
    private CarteiraCasa carteiraCasa;

    @BeforeEach
    void configurar() {
        Time flamengo = new Time();
        flamengo.setId(1L);
        flamengo.setNome("Flamengo");

        Time corinthians = new Time();
        corinthians.setId(2L);
        corinthians.setNome("Corinthians");

        Time saoPaulo = new Time();
        saoPaulo.setId(3L);
        saoPaulo.setNome("São Paulo");

        Time palmeiras = new Time();
        palmeiras.setId(4L);
        palmeiras.setNome("Palmeiras");

        jogo1 = new Partida();
        jogo1.setId(101L);
        jogo1.setTimeCasa(flamengo);
        jogo1.setTimeFora(corinthians);
        jogo1.setData(LocalDateTime.of(2026, 12, 1, 16, 0));
        jogo1.setStatus(StatusPartida.AGENDADA);

        jogo2 = new Partida();
        jogo2.setId(102L);
        jogo2.setTimeCasa(saoPaulo);
        jogo2.setTimeFora(palmeiras);
        jogo2.setData(LocalDateTime.of(2026, 12, 2, 16, 0));
        jogo2.setStatus(StatusPartida.AGENDADA);

        criador = new Usuario();
        criador.setId(1L);
        criador.setNome("Antonnione");
        criador.setEmail("antonionnecp7@gmail.com");
        criador.creditarSaldo(new BigDecimal("200.00"));

        convidado1 = new Usuario();
        convidado1.setId(2L);
        convidado1.setNome("Messi");
        convidado1.setEmail("messi@gmail.com");
        convidado1.creditarSaldo(new BigDecimal("200.00"));

        convidado2 = new Usuario();
        convidado2.setId(3L);
        convidado2.setNome("João");
        convidado2.setEmail("joao@ufrn.br");
        convidado2.creditarSaldo(new BigDecimal("200.00"));

        carteiraCasa = new CarteiraCasa();
    }

    private Bolao criarBolaoPadraoConfigurado(BigDecimal valorCota) {
        Map<Long, String> placaresCriador = new LinkedHashMap<>();
        placaresCriador.put(101L, "2x1");
        placaresCriador.put(102L, "1x0");

        Bolao bolao = Bolao.criarComSelecaoEPlacares(criador, List.of(jogo1, jogo2), placaresCriador);
        bolao.configurarValorEConvidados(1L, valorCota, List.of(convidado1, convidado2));
        return bolao;
    }

    @Test
    void criarEConfigurarBolaoRetemValorDoCriadorEAdicionaConvidadosPendentes() {
        Bolao bolao = criarBolaoPadraoConfigurado(new BigDecimal("50.00"));

        assertEquals(StatusBolao.ABERTO, bolao.getStatus());
        assertEquals(new BigDecimal("150.00"), criador.getSaldo());
        assertEquals(new BigDecimal("50.00"), criador.getSaldoRetido());
        assertEquals(3, bolao.getParticipantes().size());
    }

    @Test
    void convidadoAceitaENaoPodeRepetirCombinacaoDePlacarJaJogadaNaMesmaPartida() {
        Bolao bolao = criarBolaoPadraoConfigurado(new BigDecimal("50.00"));
        bolao.aceitarConvite(2L);

        assertEquals(new BigDecimal("150.00"), convidado1.getSaldo());
        assertEquals(new BigDecimal("50.00"), convidado1.getSaldoRetido());

        // Criador já jogou 2x1 no jogo 101 -> Convidado 1 não pode repetir 2x1 no jogo 101
        Map<Long, String> placaresRepetidos = Map.of(101L, "2x1", 102L, "0x0");
        assertThrows(IllegalStateException.class,
                () -> bolao.confirmarPlacaresConvidado(2L, placaresRepetidos));

        // Convidado 1 escolhe combinações disponíveis (1x2 e 0x0) -> sucesso!
        Map<Long, String> placaresLivres = Map.of(101L, "1x2", 102L, "0x0");
        bolao.confirmarPlacaresConvidado(2L, placaresLivres);
        assertEquals(StatusParticipanteBolao.CONFIRMADO, bolao.buscarParticipante(2L).getStatus());
    }

    @Test
    void regra11ECancelamentoEDesistenciaComPenalidadeDe20PorCento() {
        Bolao bolao = criarBolaoPadraoConfigurado(new BigDecimal("50.00"));
        bolao.aceitarConvite(2L);

        // Regra 11: Criador não pode cancelar se já houver convidado que aceitou
        assertThrows(IllegalStateException.class, () -> bolao.cancelarPeloCriador(1L));

        // Regra 13: Convidado 1 desiste -> penalizado em 20% (R$ 10,00 para Carteira Casa, R$ 40,00 devolvidos)
        bolao.desistirDoBolao(2L, carteiraCasa);

        assertEquals(StatusParticipanteBolao.DESISTIU, bolao.buscarParticipante(2L).getStatus());
        assertEquals(new BigDecimal("190.00"), convidado1.getSaldo());
        assertEquals(new BigDecimal("0.00"), convidado1.getSaldoRetido());
        assertEquals(new BigDecimal("10.00"), carteiraCasa.getSaldoTotal());

        // Regra 11: Agora que todos os que tinham aceitado desistiram, o criador pode cancelar o bolão!
        bolao.cancelarPeloCriador(1L);
        assertEquals(StatusBolao.CANCELADO, bolao.getStatus());
        assertEquals(new BigDecimal("200.00"), criador.getSaldo());
        assertEquals(new BigDecimal("0.00"), criador.getSaldoRetido());
    }

    @Test
    void regra12ConviteExpiraSePrimeiroJogoAcontecerAntesDoAceite() {
        Bolao bolao = criarBolaoPadraoConfigurado(new BigDecimal("50.00"));

        // Jogo 1 começou e saiu gol (1x0) antes do convidado aceitar
        jogo1.setPlacar("1x0");

        assertTrue(bolao.verificarExpiracaoConvitesPrimeiraPartida());
        assertEquals(StatusParticipanteBolao.EXPIRADO, bolao.buscarParticipante(2L).getStatus());
        assertThrows(IllegalStateException.class, () -> bolao.aceitarConvite(2L));
    }

    @Test
    void regra14LiquidacaoDoBolaoEnvia10PorCentoParaCarteiraCasaE90PorCentoParaVencedor() {
        // 3 participantes x R$ 100,00 = Pote Total R$ 300,00 -> Vencedor leva R$ 270,00 e Banca leva R$ 30,00 (10%)
        Bolao bolao = criarBolaoPadraoConfigurado(new BigDecimal("100.00"));

        bolao.aceitarConvite(2L);
        bolao.confirmarPlacaresConvidado(2L, Map.of(101L, "1x2", 102L, "2x2"));

        bolao.aceitarConvite(3L);
        bolao.confirmarPlacaresConvidado(3L, Map.of(101L, "0x0", 102L, "0x1"));

        // Finaliza as duas partidas: Criador crava 2x1 (3 pts) e 1x0 (3 pts) = 6 pts
        jogo1.setPlacar("2x1");
        jogo1.setStatus(StatusPartida.FINALIZADA);
        jogo2.setPlacar("1x0");
        jogo2.setStatus(StatusPartida.FINALIZADA);

        bolao.apurarPontosELiquidarSeFinalizado(carteiraCasa);

        assertEquals(StatusBolao.FINALIZADO, bolao.getStatus());
        assertEquals(criador, bolao.getVencedor());
        assertEquals(6, bolao.buscarParticipante(1L).getPontosTotais());
        // Convidado 2 apostou 0x0 e 0x1 -> não acertou nenhum placar exato (0 pontos, mesmo se acertasse vencedor)
        assertEquals(0, bolao.buscarParticipante(3L).getPontosTotais());
        assertEquals(new BigDecimal("30.00"), bolao.getComissaoCasa());
        assertEquals(new BigDecimal("270.00"), bolao.getPremioVencedor());
        assertEquals(new BigDecimal("30.00"), carteiraCasa.getSaldoTotal());
        // Criador tinha 100 livres + 270 do prêmio = 370,00
        assertEquals(new BigDecimal("370.00"), criador.getSaldo());
    }
}
