package br.edu.arenapro;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.QuarkusTestProfile;
import io.quarkus.test.junit.TestProfile;
import io.restassured.http.ContentType;
import java.net.InetSocketAddress;
import java.net.Socket;
import java.net.URI;
import java.util.Map;
import java.util.UUID;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;

import static io.restassured.RestAssured.given;
import static org.hamcrest.MatcherAssert.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.equalTo;
import static org.hamcrest.Matchers.greaterThanOrEqualTo;
import static org.hamcrest.Matchers.hasItem;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Testes de integração com PostgreSQL real (@QuarkusTest + Flyway), cobrindo:
 * - CRUD completo das entidades Time, Usuario, Partida e Palpite;
 * - Relacionamentos (Partida -> Times; Palpite -> Usuario e Partida);
 * - Paginação (?pagina=0&tamanho=1) e filtros (?status=, ?usuarioId=, ?partidaId=);
 * - Semântica HTTP (201 com Location, 200, 204, 404, 409, 422 em problem details);
 * - Apuração de pontos ao finalizar uma partida.
 */
@QuarkusTest
@TestProfile(CrudIntegracaoTest.PerfilBancoReal.class)
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class CrudIntegracaoTest {

    public static class PerfilBancoReal implements QuarkusTestProfile {
        @Override
        public Map<String, String> getConfigOverrides() {
            if (postgresAcessivel()) {
                return Map.of("quarkus.flyway.migrate-at-start", "true");
            }
            return Map.of(
                    "quarkus.flyway.migrate-at-start", "false",
                    "quarkus.hibernate-orm.database.version-check.enabled", "false"
            );
        }
    }

    private static final String SUFIXO = UUID.randomUUID().toString().substring(0, 8);
    private static Long timeCasaId;
    private static Long timeForaId;
    private static Long usuarioId;
    private static Long partidaId;
    private static Long palpiteId;

    static boolean postgresAcessivel() {
        String jdbcUrl = System.getenv().getOrDefault(
                "DATABASE_URL", "jdbc:postgresql://localhost:5432/palpitearena");
        String host = "localhost";
        int porta = 5432;
        try {
            if (jdbcUrl.startsWith("jdbc:")) {
                URI uri = URI.create(jdbcUrl.substring(5));
                if (uri.getHost() != null) {
                    host = uri.getHost();
                }
                if (uri.getPort() > 0) {
                    porta = uri.getPort();
                }
            }
            try (Socket socket = new Socket()) {
                socket.connect(new InetSocketAddress(host, porta), 500);
                return true;
            }
        } catch (Exception e) {
            return false;
        }
    }

    @BeforeAll
    static void verificarBancoDisponivel() {
        boolean disponivel = postgresAcessivel();
        if ("true".equalsIgnoreCase(System.getenv("CI"))) {
            assertTrue(disponivel, "O PostgreSQL deve estar acessível obrigatoriamente no CI");
        } else {
            Assumptions.assumeTrue(disponivel,
                    "PostgreSQL local não está rodando em localhost:5432 (inicie com 'docker compose up -d db')");
        }
    }

    @Test
    @Order(1)
    void criaAtualizaEListaTimesComPaginacao() {
        String nomeCasa = "Flamengo-" + SUFIXO;
        String nomeFora = "Vasco-" + SUFIXO;

        var respCasa = given().contentType(ContentType.JSON)
                .body("{\"nome\":\"" + nomeCasa + "\",\"escudoUrl\":\"https://exemplo.com/fla.png\"}")
                .when().post("/times")
                .then().statusCode(201)
                .body("nome", equalTo(nomeCasa))
                .extract();
        timeCasaId = respCasa.jsonPath().getLong("id");
        assertThat(respCasa.header("Location"), endsWith("/times/" + timeCasaId));

        // Time duplicado deve retornar 409 em problem details
        given().contentType(ContentType.JSON)
                .body("{\"nome\":\"" + nomeCasa + "\"}")
                .when().post("/times")
                .then().statusCode(409)
                .contentType("application/problem+json");

        var respFora = given().contentType(ContentType.JSON)
                .body("{\"nome\":\"" + nomeFora + "\"}")
                .when().post("/times")
                .then().statusCode(201)
                .extract();
        timeForaId = respFora.jsonPath().getLong("id");

        // Busca por ID e paginação
        given().when().get("/times/" + timeCasaId)
                .then().statusCode(200)
                .body("nome", equalTo(nomeCasa));

        given().queryParam("pagina", 0).queryParam("tamanho", 1)
                .when().get("/times")
                .then().statusCode(200)
                .body("size()", equalTo(1));

        // Atualiza o time da casa
        String nomeCasaAtualizado = nomeCasa + "-RJ";
        given().contentType(ContentType.JSON)
                .body("{\"nome\":\"" + nomeCasaAtualizado + "\",\"escudoUrl\":\"https://exemplo.com/fla2.png\"}")
                .when().put("/times/" + timeCasaId)
                .then().statusCode(200)
                .body("nome", equalTo(nomeCasaAtualizado));
    }

    @Test
    @Order(2)
    void criaAtualizaEListaUsuariosComPaginacao() {
        String email = "torcedor-" + SUFIXO + "@ufrn.br";

        var resp = given().contentType(ContentType.JSON)
                .body("{\"nome\":\"Torcedor Teste\",\"email\":\"" + email + "\",\"senha\":\"segredo123\"}")
                .when().post("/usuarios")
                .then().statusCode(201)
                .body("email", equalTo(email))
                .body("pontuacaoTotal", equalTo(0))
                .extract();
        usuarioId = resp.jsonPath().getLong("id");
        assertThat(resp.header("Location"), endsWith("/usuarios/" + usuarioId));

        // E-mail duplicado deve retornar 409
        given().contentType(ContentType.JSON)
                .body("{\"nome\":\"Outro\",\"email\":\"" + email + "\",\"senha\":\"segredo123\"}")
                .when().post("/usuarios")
                .then().statusCode(409)
                .contentType("application/problem+json");

        // Busca por ID e atualização
        given().when().get("/usuarios/" + usuarioId)
                .then().statusCode(200)
                .body("nome", equalTo("Torcedor Teste"));

        given().contentType(ContentType.JSON)
                .body("{\"nome\":\"Torcedor Atualizado\",\"email\":\"" + email + "\",\"senha\":\"novasenha123\"}")
                .when().put("/usuarios/" + usuarioId)
                .then().statusCode(200)
                .body("nome", equalTo("Torcedor Atualizado"));

        given().queryParam("pagina", 0).queryParam("tamanho", 1)
                .when().get("/usuarios")
                .then().statusCode(200)
                .body("size()", equalTo(1));
    }

    @Test
    @Order(3)
    void criaEFiltraPartidasComRelacionamentoDeTimes() {
        // Times iguais devem retornar 422
        given().contentType(ContentType.JSON)
                .body("{\"timeCasaId\":" + timeCasaId + ",\"timeForaId\":" + timeCasaId + ",\"data\":\"2026-11-20T16:00:00\"}")
                .when().post("/partidas")
                .then().statusCode(422)
                .contentType("application/problem+json");

        var resp = given().contentType(ContentType.JSON)
                .body("{\"timeCasaId\":" + timeCasaId + ",\"timeForaId\":" + timeForaId + ",\"data\":\"2026-11-20T16:00:00\"}")
                .when().post("/partidas")
                .then().statusCode(201)
                .body("status", equalTo("AGENDADA"))
                .body("timeCasa.id", equalTo(timeCasaId.intValue()))
                .body("timeFora.id", equalTo(timeForaId.intValue()))
                .extract();
        partidaId = resp.jsonPath().getLong("id");
        assertThat(resp.header("Location"), endsWith("/partidas/" + partidaId));

        // Filtro por status AGENDADA
        given().queryParam("status", "AGENDADA").queryParam("pagina", 0).queryParam("tamanho", 50)
                .when().get("/partidas")
                .then().statusCode(200)
                .body("id", hasItem(partidaId.intValue()));
    }

    @Test
    @Order(4)
    void criaFiltraEApuraPalpiteAoFinalizarPartida() {
        var resp = given().contentType(ContentType.JSON)
                .body("{\"usuarioId\":" + usuarioId + ",\"partidaId\":" + partidaId + ",\"placarprevisto\":\"2x1\"}")
                .when().post("/palpites")
                .then().statusCode(201)
                .body("placarprevisto", equalTo("2x1"))
                .body("pontosObtidos", equalTo(0))
                .extract();
        palpiteId = resp.jsonPath().getLong("id");
        assertThat(resp.header("Location"), endsWith("/palpites/" + palpiteId));

        // Filtro por usuarioId e por partidaId
        given().queryParam("usuarioId", usuarioId)
                .when().get("/palpites")
                .then().statusCode(200)
                .body("id", hasItem(palpiteId.intValue()));

        given().queryParam("partidaId", partidaId)
                .when().get("/palpites")
                .then().statusCode(200)
                .body("id", hasItem(palpiteId.intValue()));

        // Finaliza a partida com placar 2x1: deve pontuar o palpite (3 pts) e atualizar o usuário
        given().contentType(ContentType.JSON)
                .body("{\"timeCasaId\":" + timeCasaId
                        + ",\"timeForaId\":" + timeForaId
                        + ",\"data\":\"2026-11-20T16:00:00\""
                        + ",\"placar\":\"2x1\""
                        + ",\"status\":\"FINALIZADA\"}")
                .when().put("/partidas/" + partidaId)
                .then().statusCode(200)
                .body("status", equalTo("FINALIZADA"))
                .body("placar", equalTo("2x1"));

        given().when().get("/palpites/" + palpiteId)
                .then().statusCode(200)
                .body("pontosObtidos", equalTo(3));

        given().when().get("/usuarios/" + usuarioId)
                .then().statusCode(200)
                .body("pontuacaoTotal", greaterThanOrEqualTo(3));
    }

    @Test
    @Order(5)
    void removeEntidadesEDevolve404ParaIdInexistente() {
        given().when().delete("/palpites/" + palpiteId).then().statusCode(204);
        given().when().get("/palpites/" + palpiteId)
                .then().statusCode(404)
                .contentType("application/problem+json");

        given().when().delete("/partidas/" + partidaId).then().statusCode(204);
        given().when().get("/partidas/" + partidaId).then().statusCode(404);

        given().when().delete("/usuarios/" + usuarioId).then().statusCode(204);
        given().when().get("/usuarios/" + usuarioId).then().statusCode(404);

        given().when().delete("/times/" + timeCasaId).then().statusCode(204);
        given().when().delete("/times/" + timeForaId).then().statusCode(204);
        given().when().get("/times/" + timeCasaId).then().statusCode(404);
    }
}
