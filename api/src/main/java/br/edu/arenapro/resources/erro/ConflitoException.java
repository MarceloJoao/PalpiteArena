package br.edu.arenapro.resources.erro;

/** Lancada quando a operacao conflita com dados existentes (ex.: e-mail duplicado). Vira 409. */
public class ConflitoException extends RuntimeException {

    public ConflitoException(String mensagem) {
        super(mensagem);
    }
}
