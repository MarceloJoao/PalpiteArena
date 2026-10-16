package br.edu.arenapro.resources.erro;

/** Lancada quando o recurso pedido pelo id nao existe. Vira 404 (problem details). */
public class RecursoNaoEncontradoException extends RuntimeException {

    public RecursoNaoEncontradoException(String recurso, Long id) {
        super(recurso + " com id " + id + " não encontrado.");
    }
}
