package br.edu.arenapro.domain;

import java.time.LocalDateTime;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;

/**
 * Testes unitários puros das entidades e regras de negócio do domínio (sem banco e sem Quarkus).
 */
class DominioPalpitePartidaTest {

    @Test
    void placarExatoConcedeTresPontos() {
        Palpite palpite = new Palpite();
        palpite.setPlacarprevisto("2x1");

        int pontos = palpite.calcularPontos("2x1");

        assertEquals(3, pontos);
        assertEquals(3, palpite.getPontosObtidos());
    }

    @Test
    void acertarVencedorMandanteComPlacarDiferenteConcedeUmPonto() {
        Palpite palpite = new Palpite();
        palpite.setPlacarprevisto("1x0");

        int pontos = palpite.calcularPontos("3x1");

        assertEquals(1, pontos);
        assertEquals(1, palpite.getPontosObtidos());
    }

    @Test
    void acertarVencedorVisitanteComPlacarDiferenteConcedeUmPonto() {
        Palpite palpite = new Palpite();
        palpite.setPlacarprevisto("0x2");

        int pontos = palpite.calcularPontos("1x4");

        assertEquals(1, pontos);
        assertEquals(1, palpite.getPontosObtidos());
    }

    @Test
    void acertarEmpateComPlacarDiferenteConcedeUmPonto() {
        Palpite palpite = new Palpite();
        palpite.setPlacarprevisto("0x0");

        int pontos = palpite.calcularPontos("2x2");

        assertEquals(1, pontos);
        assertEquals(1, palpite.getPontosObtidos());
    }

    @Test
    void errarResultadoConcedeZeroPontos() {
        Palpite palpite = new Palpite();
        palpite.setPlacarprevisto("2x0");

        assertEquals(0, palpite.calcularPontos("1x1"));
        assertEquals(0, palpite.getPontosObtidos());

        assertEquals(0, palpite.calcularPontos("0x1"));
        assertEquals(0, palpite.getPontosObtidos());
    }

    @Test
    void placarComEspacosOuLetraMaiusculaEhNormalizado() {
        Palpite palpite = new Palpite();
        palpite.setPlacarprevisto(" 2X1 ");

        assertEquals(3, palpite.calcularPontos("2x1"));
    }

    @Test
    void placarNuloOuMalformadoDevolveZeroPontosSemExcecao() {
        Palpite palpite = new Palpite();
        palpite.setPlacarprevisto("2x1");

        assertEquals(0, palpite.calcularPontos(null));
        assertEquals(0, palpite.calcularPontos("invalido"));

        palpite.setPlacarprevisto(null);
        assertEquals(0, palpite.calcularPontos("2x1"));
    }

    @Test
    void descricaoDaPartidaFormataTimesCorretamente() {
        Time casa = new Time();
        casa.setNome("Flamengo");
        casa.setEscudoUrl("https://exemplo.com/fla.png");

        Time fora = new Time();
        fora.setNome("Vasco");

        Partida partida = new Partida();
        partida.setTimeCasa(casa);
        partida.setTimeFora(fora);
        partida.setData(LocalDateTime.of(2026, 11, 10, 16, 0));

        assertEquals("Flamengo x Vasco", partida.getDescricao());
        assertEquals(StatusPartida.AGENDADA, partida.getStatus());
        assertEquals("https://exemplo.com/fla.png", partida.getTimeCasa().getEscudoUrl());
    }

    @Test
    void descricaoDaPartidaSemTimesUsaValoresPadrao() {
        Partida partida = new Partida();
        assertEquals("Time Casa x Time Fora", partida.getDescricao());
    }

    @Test
    void valoresIniciaisDeUsuarioEPalpiteComecamZerados() {
        Usuario usuario = new Usuario();
        usuario.setNome("João");
        usuario.setEmail("joao@email.com");
        usuario.setSenha("123456");

        Palpite palpite = new Palpite();

        assertEquals(0, usuario.getPontuacaoTotal());
        assertEquals(0, palpite.getPontosObtidos());
        assertNotNull(palpite.getCriadoEm());
    }
}
