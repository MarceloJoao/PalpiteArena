package br.edu.arenapro;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static io.restassured.RestAssured.given;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasKey;
import static org.hamcrest.Matchers.notNullValue;

/**
 * Verifica validacao, erros em problem details (RFC 9457) e OpenAPI.
 * Todos os cenarios sao rejeitados antes de tocar no banco, entao o teste roda sem PostgreSQL
 * (o perfil abaixo apenas desliga a migracao do Flyway e a checagem de versao do banco na subida).
 */
@QuarkusTest
@TestProfile(ValidacaoErrosOpenApiTest.SemBanco.class)
class ValidacaoErrosOpenApiTest {

    public static class SemBanco implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            return Map.of(
                    "quarkus.flyway.migrate-at-start", "false",
                    "quarkus.hibernate-orm.database.version-check.enabled", "false");
        }
    }

    private static final String PROBLEM_JSON = "application/problem+json";

    @Test
    void corpoVazioRetorna400ComTodosOsCamposInvalidos() {
        given().contentType(ContentType.JSON).body("{}")
                .when().post("/usuarios")
                .then()
                .statusCode(400)
                .contentType(PROBLEM_JSON)
                .body("status", org.hamcrest.Matchers.is(400))
                .body("title", notNullValue())
                .body("instance", org.hamcrest.Matchers.is("/usuarios"))
                .body("errors.campo", containsInAnyOrder("nome", "email", "senha"));
    }

    @Test
    void emailInvalidoRetorna400() {
        given().contentType(ContentType.JSON)
                .body("{\"nome\":\"Maria\",\"email\":\"nao-e-email\",\"senha\":\"segredo123\"}")
                .when().post("/usuarios")
                .then()
                .statusCode(400)
                .contentType(PROBLEM_JSON)
                .body("errors.campo", containsInAnyOrder("email"));
    }

    @Test
    void semCorpoRetorna400() {
        given().contentType(ContentType.JSON)
                .when().post("/times")
                .then()
                .statusCode(400)
                .contentType(PROBLEM_JSON);
    }

    @Test
    void jsonMalformadoRetorna400() {
        given().contentType(ContentType.JSON).body("{\"nome\":")
                .when().post("/times")
                .then()
                .statusCode(400)
                .contentType(PROBLEM_JSON)
                .body("type", org.hamcrest.Matchers.is("/problems/malformed-request"));
    }

    @Test
    void enumDesconhecidoNoCorpoRetorna400() {
        given().contentType(ContentType.JSON)
                .body("{\"timeCasaId\":1,\"timeForaId\":2,\"data\":\"2026-11-01T16:00:00\",\"status\":\"XYZ\"}")
                .when().post("/partidas")
                .then()
                .statusCode(400)
                .contentType(PROBLEM_JSON)
                .body("detail", containsString("status"));
    }

    @Test
    void placarForaDoFormatoRetorna400() {
        given().contentType(ContentType.JSON)
                .body("{\"usuarioId\":1,\"partidaId\":1,\"placarprevisto\":\"abc\"}")
                .when().post("/palpites")
                .then()
                .statusCode(400)
                .contentType(PROBLEM_JSON)
                .body("errors.campo", containsInAnyOrder("placarprevisto"));
    }

    @Test
    void paginacaoInvalidaRetorna400() {
        given().queryParam("pagina", -1).queryParam("tamanho", 0)
                .when().get("/usuarios")
                .then()
                .statusCode(400)
                .contentType(PROBLEM_JSON)
                .body("errors.campo", containsInAnyOrder("pagina", "tamanho"));
    }

    @Test
    void parametroDeConsultaComTipoErradoNuncaRetorna500() {
        given().queryParam("tamanho", "abc")
                .when().get("/times")
                .then()
                .statusCode(org.hamcrest.Matchers.lessThan(500))
                .contentType(PROBLEM_JSON);
    }

    @Test
    void idNaoNumericoNuncaRetorna500() {
        given()
                .when().get("/usuarios/abc")
                .then()
                .statusCode(org.hamcrest.Matchers.lessThan(500))
                .contentType(PROBLEM_JSON);
    }

    @Test
    void mediaTypeNaoSuportadoRetornaProblemDetails() {
        given().contentType(ContentType.TEXT).body("oi")
                .when().post("/times")
                .then()
                .statusCode(415)
                .contentType(PROBLEM_JSON);
    }

    @Test
    void openApiEstaAcessivelEDocumentaOsErros() {
        given().queryParam("format", "json")
                .when().get("/q/openapi")
                .then()
                .statusCode(200)
                .body("paths", hasKey("/usuarios"))
                .body("paths", hasKey("/times/{id}"))
                .body("paths", hasKey("/partidas"))
                .body("paths", hasKey("/palpites"))
                .body("paths.'/usuarios'.post.responses", hasKey("201"))
                .body("paths.'/usuarios'.post.responses", hasKey("400"))
                .body("paths.'/usuarios'.post.responses", hasKey("409"))
                .body("paths.'/usuarios'.post.responses", hasKey("500"))
                .body("paths.'/partidas'.post.responses", hasKey("422"))
                .body("paths.'/usuarios/{id}'.get.responses", hasKey("404"))
                .body("paths.'/usuarios/{id}'.get.responses.'404'.'$ref'",
                        containsString("#/components/responses/NaoEncontrado"))
                .body("components.responses.NaoEncontrado.content", hasKey(PROBLEM_JSON))
                .body("components.schemas", hasKey("ProblemDetails"))
                .body("components.schemas", hasKey("UsuarioRequest"));
    }

    @Test
    void swaggerUiEstaAcessivel() {
        given().redirects().follow(true)
                .when().get("/q/swagger-ui/")
                .then()
                .statusCode(200)
                .body(containsString("swagger"));
    }
}
