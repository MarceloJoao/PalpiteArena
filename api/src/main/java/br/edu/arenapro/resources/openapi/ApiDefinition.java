package br.edu.arenapro.resources.openapi;

import br.edu.arenapro.resources.erro.ProblemDetails;
import jakarta.ws.rs.core.Application;
import org.eclipse.microprofile.openapi.annotations.Components;
import org.eclipse.microprofile.openapi.annotations.OpenAPIDefinition;
import org.eclipse.microprofile.openapi.annotations.info.Info;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;

/**
 * Metadados do OpenAPI e respostas de erro reutilizaveis (components/responses).
 * Os recursos as referenciam com @APIResponse(ref = "...").
 */
@OpenAPIDefinition(
        info = @Info(
                title = "PalpiteArena API",
                version = "1.0.0",
                description = "API de palpites esportivos. Erros seguem o formato problem details (RFC 9457)."),
        components = @Components(responses = {
                @APIResponse(name = "RequisicaoInvalida",
                        description = "Dados de entrada inválidos (validação) ou corpo malformado",
                        content = @Content(mediaType = ProblemDetails.MEDIA_TYPE,
                                schema = @Schema(implementation = ProblemDetails.class))),
                @APIResponse(name = "NaoEncontrado",
                        description = "Recurso com o id informado não existe",
                        content = @Content(mediaType = ProblemDetails.MEDIA_TYPE,
                                schema = @Schema(implementation = ProblemDetails.class))),
                @APIResponse(name = "Conflito",
                        description = "Conflito com dados existentes (valor duplicado ou registro em uso)",
                        content = @Content(mediaType = ProblemDetails.MEDIA_TYPE,
                                schema = @Schema(implementation = ProblemDetails.class))),
                @APIResponse(name = "RegraNegocio",
                        description = "Corpo válido, mas viola regra de negócio ou referencia registro inexistente",
                        content = @Content(mediaType = ProblemDetails.MEDIA_TYPE,
                                schema = @Schema(implementation = ProblemDetails.class))),
                @APIResponse(name = "ErroInterno",
                        description = "Erro inesperado no servidor",
                        content = @Content(mediaType = ProblemDetails.MEDIA_TYPE,
                                schema = @Schema(implementation = ProblemDetails.class)))
        }))
public class ApiDefinition extends Application {
}
