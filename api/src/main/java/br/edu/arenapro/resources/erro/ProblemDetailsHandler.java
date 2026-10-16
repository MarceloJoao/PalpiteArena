package br.edu.arenapro.resources.erro;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.JsonMappingException;
import com.fasterxml.jackson.databind.exc.MismatchedInputException;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.ConstraintViolationException;
import jakarta.validation.ElementKind;
import jakarta.validation.Path;
import jakarta.ws.rs.WebApplicationException;
import jakarta.ws.rs.core.UriInfo;
import org.jboss.logging.Logger;
import org.jboss.resteasy.reactive.RestResponse;
import org.jboss.resteasy.reactive.RestResponse.ResponseBuilder;
import org.jboss.resteasy.reactive.server.ServerExceptionMapper;

import java.sql.SQLException;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.stream.Collectors;

/**
 * Unico lugar onde excecoes viram resposta HTTP. Toda resposta de erro sai como
 * application/problem+json (RFC 9457); nenhuma excecao chega ao cliente como 500
 * com stack trace.
 */
public class ProblemDetailsHandler {

    private static final Logger LOG = Logger.getLogger(ProblemDetailsHandler.class);

    private static final String TIPO_VALIDACAO = "/problems/validation-error";
    private static final String TIPO_MALFORMADA = "/problems/malformed-request";
    private static final String TIPO_NAO_ENCONTRADO = "/problems/not-found";
    private static final String TIPO_CONFLITO = "/problems/conflict";
    private static final String TIPO_REGRA_NEGOCIO = "/problems/business-rule";
    private static final String TIPO_ERRO_INTERNO = "/problems/internal-error";

    /** Falha de Bean Validation (@NotBlank, @Valid, @Min...): 400 com a lista de campos. */
    @ServerExceptionMapper
    public RestResponse<ProblemDetails> violacaoDeValidacao(ConstraintViolationException e, UriInfo uriInfo) {
        List<ProblemDetails.CampoInvalido> erros = e.getConstraintViolations().stream()
                .map(v -> new ProblemDetails.CampoInvalido(nomeDoCampo(v), v.getMessage()))
                .sorted(Comparator.comparing(ProblemDetails.CampoInvalido::campo)
                        .thenComparing(ProblemDetails.CampoInvalido::mensagem))
                .toList();
        return resposta(400, TIPO_VALIDACAO, "Dados de entrada inválidos",
                "Um ou mais campos são inválidos. Veja 'errors' para os detalhes.", uriInfo, erros);
    }

    /** JSON quebrado, tipo errado ou valor de enum desconhecido: 400. */
    @ServerExceptionMapper
    public RestResponse<ProblemDetails> jsonInvalido(JsonProcessingException e, UriInfo uriInfo) {
        String detalhe = "O corpo da requisição não é um JSON válido.";
        if (e instanceof JsonMappingException mapping && !mapping.getPath().isEmpty()) {
            String campo = mapping.getPath().stream()
                    .map(ref -> ref.getFieldName() != null ? ref.getFieldName() : "[" + ref.getIndex() + "]")
                    .collect(Collectors.joining("."));
            detalhe = "Valor inválido ou de tipo incorreto para o campo '" + campo + "'.";
        }
        return resposta(400, TIPO_MALFORMADA, "Requisição malformada", detalhe, uriInfo, null);
    }

    /** Tipo errado ou valor de enum desconhecido (o Quarkus tem um mapper proprio, mais especifico, que este substitui). */
    @ServerExceptionMapper
    public RestResponse<ProblemDetails> tipoInvalido(MismatchedInputException e, UriInfo uriInfo) {
        return jsonInvalido(e, uriInfo);
    }

    /** Id inexistente: 404. */
    @ServerExceptionMapper
    public RestResponse<ProblemDetails> naoEncontrado(RecursoNaoEncontradoException e, UriInfo uriInfo) {
        return resposta(404, TIPO_NAO_ENCONTRADO, "Recurso não encontrado", e.getMessage(), uriInfo, null);
    }

    /** Dado duplicado: 409. */
    @ServerExceptionMapper
    public RestResponse<ProblemDetails> conflito(ConflitoException e, UriInfo uriInfo) {
        return resposta(409, TIPO_CONFLITO, "Conflito de dados", e.getMessage(), uriInfo, null);
    }

    /** Regra de negocio violada ou referencia inexistente no corpo: 422. */
    @ServerExceptionMapper
    public RestResponse<ProblemDetails> regraDeNegocio(RegraNegocioException e, UriInfo uriInfo) {
        return resposta(422, TIPO_REGRA_NEGOCIO, "Regra de negócio violada", e.getMessage(), uriInfo, null);
    }

    /** Erros do proprio JAX-RS (rota inexistente, metodo nao permitido, media type, corpo ilegivel...). */
    @ServerExceptionMapper
    public RestResponse<ProblemDetails> erroHttp(WebApplicationException e, UriInfo uriInfo) {
        JsonProcessingException json = causa(e, JsonProcessingException.class);
        if (json != null) {
            return jsonInvalido(json, uriInfo);
        }
        int status = e.getResponse().getStatus();
        if (status >= 500) {
            return erroInterno(e, uriInfo);
        }
        if (status == 404) {
            return resposta(404, TIPO_NAO_ENCONTRADO, "Recurso não encontrado",
                    "O recurso solicitado não existe ou um parâmetro de caminho é inválido.", uriInfo, null);
        }
        String frase = e.getResponse().getStatusInfo().getReasonPhrase();
        return resposta(status, "about:blank", frase, e.getMessage(), uriInfo, null);
    }

    /**
     * Rede de seguranca: traduz violacoes de integridade do banco (SQLSTATE classe 23)
     * e transforma qualquer outra falha inesperada em 500 sem vazar detalhes internos.
     */
    @ServerExceptionMapper
    public RestResponse<ProblemDetails> inesperado(Throwable e, UriInfo uriInfo) {
        SQLException sql = causa(e, SQLException.class);
        String estado = sql != null ? sql.getSQLState() : null;
        if (estado != null) {
            switch (estado) {
                case "23505":
                    return resposta(409, TIPO_CONFLITO, "Conflito de dados",
                            "Já existe um registro com o mesmo valor em um campo único.", uriInfo, null);
                case "23503":
                    return resposta(409, TIPO_CONFLITO, "Conflito de dados",
                            "A operação viola um relacionamento: o registro está em uso por outros dados "
                                    + "ou referencia algo que não existe.", uriInfo, null);
                case "23502":
                case "22001":
                    return resposta(400, TIPO_VALIDACAO, "Dados de entrada inválidos",
                            "Um valor obrigatório está ausente ou excede o tamanho permitido.", uriInfo, null);
                default:
                    break;
            }
        }
        return erroInterno(e, uriInfo);
    }

    private RestResponse<ProblemDetails> erroInterno(Throwable e, UriInfo uriInfo) {
        LOG.errorf(e, "Erro inesperado em %s", uriInfo.getRequestUri().getPath());
        return resposta(500, TIPO_ERRO_INTERNO, "Erro interno do servidor",
                "Ocorreu um erro inesperado. Tente novamente mais tarde.", uriInfo, null);
    }

    private static RestResponse<ProblemDetails> resposta(int status, String tipo, String titulo, String detalhe,
                                                         UriInfo uriInfo, List<ProblemDetails.CampoInvalido> erros) {
        ProblemDetails corpo = new ProblemDetails(tipo, titulo, status, detalhe,
                uriInfo.getRequestUri().getPath(), erros);
        return ResponseBuilder.<ProblemDetails>create(status).entity(corpo).type(ProblemDetails.MEDIA_TYPE).build();
    }

    /**
     * Nome do campo para o cliente: para propriedades do corpo ("criar.corpo.email") devolve "email";
     * para parametros simples ("listar.tamanho") devolve "tamanho".
     */
    private static String nomeDoCampo(ConstraintViolation<?> violacao) {
        List<String> propriedades = new ArrayList<>();
        String parametro = null;
        for (Path.Node no : violacao.getPropertyPath()) {
            if (no.getKind() == ElementKind.PARAMETER) {
                parametro = no.getName();
                propriedades.clear();
            } else if (parametro != null && no.getKind() == ElementKind.PROPERTY) {
                propriedades.add(no.getName());
            }
        }
        if (!propriedades.isEmpty()) {
            return String.join(".", propriedades);
        }
        return parametro != null ? parametro : violacao.getPropertyPath().toString();
    }

    private static <T extends Throwable> T causa(Throwable erro, Class<T> tipo) {
        Throwable atual = erro;
        for (int i = 0; atual != null && i < 10; i++) {
            if (tipo.isInstance(atual)) {
                return tipo.cast(atual);
            }
            atual = atual.getCause();
        }
        return null;
    }
}
