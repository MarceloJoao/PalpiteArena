package br.edu.arenapro;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;
import static org.junit.jupiter.api.Assertions.assertTrue;

public class ArchitectureTest {

    static final ArchRule REGRA_DO_DOMINIO = noClasses()
            .that().resideInAPackage("..domain..")
            .should().dependOnClassesThat()
            .resideInAnyPackage(
                    "..repository..",
                    "..resources..",
                    "..grpc..",
                    "io.quarkus..",
                    "org.hibernate..",
                    "java.sql..",
                    "jakarta.ws.rs..",
                    "io.grpc..",
                    "com.google.protobuf..",
                    "br.edu.arenapro.notificacao.."
            )
            .because("o domínio não deve depender de repositórios, recursos HTTP, runtime do Quarkus, JDBC nem gRPC/Protobuf");

    private final JavaClasses classes = new ClassFileImporter()
            .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
            .importPackages("br.edu.arenapro");

    @Test
    void dominioNaoDeveDependerDeOutrasCamadasNemDeGrpc() {
        REGRA_DO_DOMINIO.check(classes);
    }

    @Test
    void adaptadorGrpcNaoDeveDependerDeRecursosHttpNemRepositorios() {
        noClasses()
                .that().resideInAPackage("..grpc..")
                .should().dependOnClassesThat()
                .resideInAnyPackage("..resources..", "..repository..")
                .because("o adaptador gRPC implementa apenas a porta do domínio e não conhece HTTP nem banco")
                .check(classes);
    }

    @Test
    void regraDoDominioDetectaViolacaoDeProposito() {
        JavaClasses fixtureComViolacao = new ClassFileImporter()
                .importPackages("br.edu.arenapro.violacao");
        assertTrue(REGRA_DO_DOMINIO.evaluate(fixtureComViolacao).hasViolation());
    }
}
