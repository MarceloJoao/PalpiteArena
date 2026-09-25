package br.edu.arenapro.repository;

import br.edu.arenapro.domain.Time;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Page;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class TimeRepository implements PanacheRepository<Time> {

    public Time findByNome(String nome) {
        return find("nome", nome).firstResult();
    }
    public List<Time> listarTodos(int pagina, int tamanho) {
        return findAll().page(Page.of(pagina, tamanho)).list();
    }
}
