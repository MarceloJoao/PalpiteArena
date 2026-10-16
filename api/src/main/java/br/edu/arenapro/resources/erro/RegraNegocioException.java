package br.edu.arenapro.resources.erro;

/**
 * Lancada quando o corpo e valido, mas viola uma regra de negocio ou referencia
 * algo que nao existe (ex.: time inexistente). Vira 422 (problem details).
 */
public class RegraNegocioException extends RuntimeException {

    public RegraNegocioException(String mensagem) {
        super(mensagem);
    }
}
