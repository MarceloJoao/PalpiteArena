package br.edu.arenapro.domain;

import java.time.LocalDateTime;
import java.util.Optional;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

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

    @Test
    void geradorTokenJwtEmiteEValidaTokenAssinadoComSucesso() {
        Usuario usuario = new Usuario();
        usuario.setId(42L);
        usuario.setNome("João Marcelo");
        usuario.setEmail("joao@ufrn.br");
        usuario.setSenha("segredo123");

        GeradorTokenJwt gerador = new GeradorTokenJwt("chave-teste-123", 3600);
        String token = gerador.gerarToken(usuario);

        Optional<GeradorTokenJwt.DadosTokenJwt> dadosOpt = gerador.validarToken("Bearer " + token);

        assertTrue(dadosOpt.isPresent());
        assertEquals(42L, dadosOpt.get().usuarioId());
        assertEquals("João Marcelo", dadosOpt.get().nome());
        assertEquals("joao@ufrn.br", dadosOpt.get().email());
        assertEquals("TORCEDOR", dadosOpt.get().papel());
    }

    @Test
    void geradorTokenJwtRejeitaAssinaturaAdulteradaEIdentificaAdmin() {
        Usuario admin = new Usuario();
        admin.setId(1L);
        admin.setNome("Administrador");
        admin.setEmail("admin@arenapro.com");
        admin.setSenha("admin123");

        GeradorTokenJwt gerador = new GeradorTokenJwt("chave-teste-123", 3600);
        String token = gerador.gerarToken(admin);

        assertEquals("ADMIN", admin.obterPapel());
        assertTrue(admin.conferirSenha("admin123"));
        assertFalse(admin.conferirSenha("errada"));

        // Adultera o último caractere da assinatura
        String tokenAdulterado = token.substring(0, token.length() - 1) + (token.endsWith("A") ? "B" : "A");
        assertTrue(gerador.validarToken(tokenAdulterado).isEmpty());
        assertTrue(gerador.validarToken("").isEmpty());
    }
}
