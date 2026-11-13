package br.edu.arenapro.resources.config;

import io.quarkus.runtime.Quarkus;
import io.quarkus.runtime.StartupEvent;
import jakarta.enterprise.context.ApplicationScoped;
import jakarta.enterprise.event.Observes;
import org.flywaydb.core.Flyway;
import org.jboss.logging.Logger;

/**
 * Permite aplicar as migrações Flyway por comando/task dedicado (-Dpalpitearena.migrar.apenas=true
 * ou variável de ambiente MIGRAR_APENAS=true) e encerrar o processo com código 0 logo após a migração,
 * além do comportamento padrão de migrar na subida (quarkus.flyway.migrate-at-start=true).
 */
@ApplicationScoped
public class MigracaoStartup {

    private static final Logger LOG = Logger.getLogger(MigracaoStartup.class);

    void aoIniciar(@Observes StartupEvent evento, Flyway flyway) {
        if (deveApenasMigrar()) {
            var resultado = flyway.migrate();
            LOG.infof(
                    "Modo migrar concluído com sucesso: %d migração(ões) aplicada(s) (versão atual: %s).",
                    resultado.migrationsExecuted,
                    resultado.targetSchemaVersion != null ? resultado.targetSchemaVersion : "atualizada");
            Quarkus.asyncExit(0);
        }
    }

    static boolean deveApenasMigrar() {
        return Boolean.getBoolean("palpitearena.migrar.apenas")
                || "true".equalsIgnoreCase(System.getenv("MIGRAR_APENAS"));
    }
}
