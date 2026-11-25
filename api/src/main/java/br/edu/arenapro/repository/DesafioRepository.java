package br.edu.arenapro.repository;

import br.edu.arenapro.domain.DesafioX1;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Page;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;

@ApplicationScoped
public class DesafioRepository implements PanacheRepository<DesafioX1> {

    public List<DesafioX1> listarTodos(int pagina, int tamanho) {
        return findAll(Sort.by("id").descending())
                .page(Page.of(pagina, tamanho))
                .list();
    }

    public List<DesafioX1> listarPorUsuario(Long usuarioId, int pagina, int tamanho) {
        return find("desafiante.id = ?1 or desafiado.id = ?1", Sort.by("id").descending(), usuarioId)
                .page(Page.of(pagina, tamanho))
                .list();
    }

    public List<DesafioX1> listarTodosPorPartida(Long partidaId) {
        return list("partida.id", partidaId);
    }
}
