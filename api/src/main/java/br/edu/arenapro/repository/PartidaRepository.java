package br.edu.arenapro.repository;

import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.StatusPartida;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Page;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.LocalDateTime;
import java.util.List;

@ApplicationScoped
public class PartidaRepository implements PanacheRepository<Partida> {

    public List<Partida> filtrarporStatus(StatusPartida status, int pagina, int tamanho) {
        return find("status", status).page(Page.of(pagina, tamanho)).list();
    }

    public List<Partida> filtrarporData(LocalDateTime data, int pagina, int tamanho) {
        return find("data", data).page(Page.of(pagina, tamanho)).list();
    }

    public List<Partida> listarTodos(int pagina, int tamanho) {
        return findAll().page(Page.of(pagina, tamanho)).list();
    }
}
