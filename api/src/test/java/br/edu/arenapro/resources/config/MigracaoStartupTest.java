package br.edu.arenapro.resources.config;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

class MigracaoStartupTest {

    @AfterEach
    void limparPropriedade() {
        System.clearProperty("palpitearena.migrar.apenas");
    }

    @Test
    void porPadraoNaoAtivaModoApenasMigrar() {
        System.clearProperty("palpitearena.migrar.apenas");
        assertFalse(MigracaoStartup.deveApenasMigrar());
    }

    @Test
    void ativaModoApenasMigrarQuandoPropriedadeDeSistemaTrue() {
        System.setProperty("palpitearena.migrar.apenas", "true");
        assertTrue(MigracaoStartup.deveApenasMigrar());
    }
}
