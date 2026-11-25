package br.edu.arenapro.domain;

import java.math.BigDecimal;
import java.time.LocalDateTime;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Testes unitários puros das regras de negócio da Função Desafio X1 (sem banco e sem Quarkus).
 */
class DesafioX1DominioTest {

    private Partida partida;
    private Usuario usuarioA;
    private Usuario usuarioB;
    private CarteiraCasa carteiraCasa;

    @BeforeEach
    void configurar() {
        Time saoPaulo = new Time();
        saoPaulo.setId(1L);
        saoPaulo.setNome("São Paulo");

        Time corinthians = new Time();
        corinthians.setId(2L);
        corinthians.setNome("Corinthians");

        partida = new Partida();
        partida.setId(10L);
        partida.setTimeCasa(saoPaulo);
        partida.setTimeFora(corinthians);
        partida.setData(LocalDateTime.of(2026, 11, 30, 16, 0));
        partida.setStatus(StatusPartida.AGENDADA);

        usuarioA = new Usuario();
        usuarioA.setId(1L);
        usuarioA.setNome("Antonnione");
        usuarioA.setEmail("antonionnecp7@gmail.com");
        usuarioA.creditarSaldo(new BigDecimal("100.00"));

        usuarioB = new Usuario();
        usuarioB.setId(2L);
        usuarioB.setNome("João");
        usuarioB.setEmail("joao@ufrn.br");
        usuarioB.creditarSaldo(new BigDecimal("100.00"));

        carteiraCasa = new CarteiraCasa();
    }

    @Test
    void criarConviteRetemSaldoDoUsuarioA() {
        DesafioX1 desafio = DesafioX1.criarConvite(
                partida, usuarioA, usuarioB, OpcaoDesafio.MANDANTE, new BigDecimal("50.00"));

        assertEquals(StatusDesafio.PENDENTE, desafio.getStatus());
        assertEquals(new BigDecimal("50.00"), usuarioA.getSaldo());
        assertEquals(new BigDecimal("50.00"), usuarioA.getSaldoRetido());
    }

    @Test
    void aceitarImpedeMesmaOpcaoERetemSaldoDoUsuarioB() {
        DesafioX1 desafio = DesafioX1.criarConvite(
                partida, usuarioA, usuarioB, OpcaoDesafio.MANDANTE, new BigDecimal("50.00"));

        // Usuário B não pode escolher MANDANTE igual ao Usuário A
        assertThrows(IllegalArgumentException.class,
                () -> desafio.aceitarPeloDesafiado(2L, OpcaoDesafio.MANDANTE));

        // Usuário B escolhe VISITANTE: aceita e retém R$ 50,00 de B
        desafio.aceitarPeloDesafiado(2L, OpcaoDesafio.VISITANTE);

        assertEquals(StatusDesafio.ACEITO, desafio.getStatus());
        assertEquals(OpcaoDesafio.VISITANTE, desafio.getOpcaoDesafiado());
        assertEquals(new BigDecimal("50.00"), usuarioB.getSaldo());
        assertEquals(new BigDecimal("50.00"), usuarioB.getSaldoRetido());
    }

    @Test
    void usuarioAPodeCancelarSomenteAntesDeUsuarioBAceitar() {
        DesafioX1 desafio = DesafioX1.criarConvite(
                partida, usuarioA, usuarioB, OpcaoDesafio.MANDANTE, new BigDecimal("50.00"));

        desafio.cancelarPeloDesafiante(1L);
        assertEquals(StatusDesafio.CANCELADO, desafio.getStatus());
        assertEquals(new BigDecimal("100.00"), usuarioA.getSaldo());
        assertEquals(new BigDecimal("0.00"), usuarioA.getSaldoRetido());

        // Depois que B aceita, A não pode mais cancelar
        DesafioX1 desafioAceito = DesafioX1.criarConvite(
                partida, usuarioA, usuarioB, OpcaoDesafio.MANDANTE, new BigDecimal("50.00"));
        desafioAceito.aceitarPeloDesafiado(2L, OpcaoDesafio.EMPATE);

        assertThrows(IllegalStateException.class,
                () -> desafioAceito.cancelarPeloDesafiante(1L));
    }

    @Test
    void convitePendenteExpiraSeSairGolNaPartidaAntesDoAceite() {
        DesafioX1 desafio = DesafioX1.criarConvite(
                partida, usuarioA, usuarioB, OpcaoDesafio.MANDANTE, new BigDecimal("50.00"));

        // Saiu gol na partida antes de B aceitar
        partida.setPlacar("1x0");

        assertTrue(desafio.verificarExpiracaoPorGolOuFim());
        assertEquals(StatusDesafio.EXPIRADO, desafio.getStatus());
        assertEquals(new BigDecimal("100.00"), usuarioA.getSaldo());
        assertEquals(new BigDecimal("0.00"), usuarioA.getSaldoRetido());
    }

    @Test
    void liquidacaoComVencedorTransfereValorDoPerdedorMenos5PorCentoParaCarteiraCasa() {
        DesafioX1 desafio = DesafioX1.criarConvite(
                partida, usuarioA, usuarioB, OpcaoDesafio.MANDANTE, new BigDecimal("50.00"));
        desafio.aceitarPeloDesafiado(2L, OpcaoDesafio.VISITANTE);

        // São Paulo 2 x 1 Corinthians -> MANDANTE venceu (Usuário A)
        desafio.liquidarComPlacarFinal("2x1", carteiraCasa);

        assertEquals(StatusDesafio.FINALIZADO, desafio.getStatus());
        assertEquals(usuarioA, desafio.getVencedor());
        // Usuário A tinha 50 livres + recebe 50 de volta + 47,50 de B = 147,50
        assertEquals(new BigDecimal("147.50"), usuarioA.getSaldo());
        assertEquals(new BigDecimal("0.00"), usuarioA.getSaldoRetido());
        // Usuário B fica com os 50 livres que sobraram e 0 retido
        assertEquals(new BigDecimal("50.00"), usuarioB.getSaldo());
        assertEquals(new BigDecimal("0.00"), usuarioB.getSaldoRetido());
        // Carteira Casa recebe 5% de 50,00 = R$ 2,50
        assertEquals(new BigDecimal("2.50"), carteiraCasa.getSaldoTotal());
        assertEquals(new BigDecimal("97.50"), desafio.getPremioVencedor());
    }

    @Test
    void liquidacaoSemVencedorDevolveDinheiroDosDoisComComissaoDe2MeioPorCentoDeCada() {
        // A aposta 100 no MANDANTE, B aposta 100 no VISITANTE, e o jogo termina 1x1 (EMPATE)
        DesafioX1 desafio = DesafioX1.criarConvite(
                partida, usuarioA, usuarioB, OpcaoDesafio.MANDANTE, new BigDecimal("100.00"));
        desafio.aceitarPeloDesafiado(2L, OpcaoDesafio.VISITANTE);

        desafio.liquidarComPlacarFinal("1x1", carteiraCasa);

        assertEquals(StatusDesafio.FINALIZADO, desafio.getStatus());
        assertNull(desafio.getVencedor());
        // Cada um recebe R$ 97,50 de volta (desconto de 2,5% = R$ 2,50 de cada)
        assertEquals(new BigDecimal("97.50"), usuarioA.getSaldo());
        assertEquals(new BigDecimal("97.50"), usuarioB.getSaldo());
        assertEquals(new BigDecimal("0.00"), usuarioA.getSaldoRetido());
        assertEquals(new BigDecimal("0.00"), usuarioB.getSaldoRetido());
        // Carteira Casa recebe R$ 2,50 + R$ 2,50 = R$ 5,00
        assertEquals(new BigDecimal("5.00"), carteiraCasa.getSaldoTotal());
    }
}
