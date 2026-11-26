package br.edu.arenapro.repository;

import br.edu.arenapro.domain.Bolao;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Sort;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;

@ApplicationScoped
public class BolaoRepository implements PanacheRepository<Bolao> {

    public List<Bolao> listarTodos() {
        return listAll(Sort.by("id").descending());
    }

    public List<Bolao> listarPorUsuario(Long usuarioId) {
        return find("select distinct b from Bolao b left join b.participantes p where b.criador.id = ?1 or p.usuario.id = ?1 order by b.id desc",
                usuarioId).list();
    }

    public List<Bolao> listarPorPartida(Long partidaId) {
        return find("select distinct b from Bolao b join b.partidas bp where bp.partida.id = ?1",
                partidaId).list();
    }
}
