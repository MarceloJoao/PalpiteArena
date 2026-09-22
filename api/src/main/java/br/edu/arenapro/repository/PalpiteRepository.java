package br.edu.arenapro.repository;

import br.edu.arenapro.domain.Palpite;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Page;
import jakarta.enterprise.context.ApplicationScoped;

import java.util.List;

@ApplicationScoped
public class PalpiteRepository implements PanacheRepository<Palpite> {

    // Busca palpites de um usuário específico com paginação
    public List<Palpite> listarPorUsuario(Long usuarioId, int pagina, int tamanho) {
        return find("usuario.id", usuarioId)
                .page(Page.of(pagina, tamanho))
                .list();
    }

    // Busca palpites de uma partida específica com paginação
    public List<Palpite> listarPorPartida(Long partidaId, int pagina, int tamanho) {
        return find("partida.id", partidaId)
                .page(Page.of(pagina, tamanho))
                .list();
    }

    // Busca todos os palpites com paginação
    public List<Palpite> listarTodos(int pagina, int tamanho) {
        return findAll()
                .page(Page.of(pagina, tamanho))
                .list();
    }
}