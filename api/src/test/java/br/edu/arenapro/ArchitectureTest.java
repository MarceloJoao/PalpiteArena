package br.edu.arenapro;

import com.tngtech.archunit.core.domain.JavaClasses;
import com.tngtech.archunit.core.importer.ClassFileImporter;
import com.tngtech.archunit.core.importer.ImportOption;
import com.tngtech.archunit.lang.ArchRule;
import org.junit.jupiter.api.Test;

import static com.tngtech.archunit.lang.syntax.ArchRuleDefinition.noClasses;

public class ArchitectureTest {

    @Test
    void dominioNaoDeveDependerDeOutrasCamadasNemDeGrpc() {
        JavaClasses classes = new ClassFileImporter()
                .withImportOption(ImportOption.Predefined.DO_NOT_INCLUDE_TESTS)
                .importPackages("br.edu.arenapro");

        ArchRule regraDominio = noClasses()
                .that().resideInAPackage("..domain..")
                .should().dependOnClassesThat()
                .resideInAnyPackage(
                        "..repository..",
                        "..resources..",
                        "..grpc..",
                        "io.grpc..",
                        "com.google.protobuf..",
                        "br.edu.arenapro.notificacao.."
                )
                .because("o domínio não deve depender de repositórios, recursos HTTP nem gRPC/Protobuf");

        regraDominio.check(classes);
    }
}
