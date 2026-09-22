package br.edu.arenapro.repository;

import br.edu.arenapro.domain.Usuario;
import io.quarkus.hibernate.orm.panache.PanacheRepository;
import io.quarkus.panache.common.Page;
import jakarta.enterprise.context.ApplicationScoped;
import java.util.List;
import java.util.Optional;

import io.quarkus.panache.common.Sort;

@ApplicationScoped
public class UsuarioRepository implements PanacheRepository<Usuario> {

    //filtrar por email
    public Optional<Usuario> findByEmail(String email) {
        return find("email", email).firstResultOptional();
    }

    //listar todos os usuarios
    public List<Usuario> listarTodos(int pagina, int tamanho) {
        return findAll().page(Page.of(pagina, tamanho)).list();
    }

    //listar usuarios ordenados por pontuacao
    public List<Usuario> listarRanking(int pagina, int tamanho) {
        return findAll(Sort.by("pontuacaoTotal").descending())
                .page(Page.of(pagina, tamanho))
                .list();
    }

}
