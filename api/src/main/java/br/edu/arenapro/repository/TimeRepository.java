package br.edu.arenapro.repository;

import br.edu.arenapro.domain.Time;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import jakarta.enterprise.context.ApplicationScoped;

@ApplicationScoped
public class TimeRepository implements PanacheRepository<Time> {

    public Time findByNome(String nome) {
        return find("nome", nome).firstResult();
    }
}
