package br.edu.arenapro.resources.erro;

/**
 * Lançada quando as credenciais de login são inválidas ou quando um token JWT
 * está ausente, inválido ou expirado (traduzida em HTTP 401 pelo ProblemDetailsHandler).
 */
public class NaoAutorizadoException extends RuntimeException {

    public NaoAutorizadoException(String mensagem) {
        super(mensagem);
    }
}
