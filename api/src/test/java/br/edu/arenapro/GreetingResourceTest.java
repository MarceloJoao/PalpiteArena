package br.edu.arenapro;

import io.quarkus.test.junit.QuarkusTest;
import io.quarkus.test.junit.TestProfile;
import org.junit.jupiter.api.Test;

import static io.restassured.RestAssured.given;
import static org.hamcrest.CoreMatchers.is;

@QuarkusTest
@TestProfile(ValidacaoErrosOpenApiTest.SemBanco.class)
class GreetingResourceTest {
    @Test
    void testHelloEndpoint() {
        given()
          .when().get("/hello")
          .then()
             .statusCode(200)
             .body(is("Hello from Quarkus REST"));
    }

    @Test
    void testHealthLiveEndpoint() {
        given()
          .when().get("/q/health/live")
          .then()
             .statusCode(200)
             .body("status", is("UP"));
    }

}
