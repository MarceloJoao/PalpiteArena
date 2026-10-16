package br.edu.arenapro.resources.erro;

import com.fasterxml.jackson.annotation.JsonInclude;
import org.eclipse.microprofile.openapi.annotations.media.Schema;

import java.util.List;

/**
 * Corpo de erro no formato "problem details" (RFC 9457), servido como
 * application/problem+json. Todas as respostas de erro da API usam este formato.
 */
@JsonInclude(JsonInclude.Include.NON_NULL)
@Schema(name = "ProblemDetails", description = "Erro no formato RFC 9457 (application/problem+json)")
public record ProblemDetails(
        @Schema(description = "URI que identifica o tipo do problema", example = "/problems/validation-error")
        String type,
        @Schema(description = "Resumo curto e estavel do tipo do problema", example = "Dados de entrada inválidos")
        String title,
        @Schema(description = "Status HTTP da resposta", example = "400")
        int status,
        @Schema(description = "Explicacao especifica desta ocorrencia")
        String detail,
        @Schema(description = "Caminho da requisicao que gerou o erro", example = "/usuarios")
        String instance,
        @Schema(description = "Campos invalidos (presente apenas em erros de validacao)")
        List<CampoInvalido> errors) {

    public static final String MEDIA_TYPE = "application/problem+json";

    @Schema(name = "CampoInvalido", description = "Um campo que nao passou na validacao")
    public record CampoInvalido(
            @Schema(example = "email") String campo,
            @Schema(example = "deve ser um endereço de e-mail bem formado") String mensagem) {
    }
}
