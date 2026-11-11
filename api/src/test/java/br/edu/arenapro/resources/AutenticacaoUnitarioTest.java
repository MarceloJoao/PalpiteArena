package br.edu.arenapro.resources;

import br.edu.arenapro.domain.GeradorTokenJwt.DadosTokenJwt;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.repository.UsuarioRepository;
import br.edu.arenapro.resources.dto.LoginRequest;
import br.edu.arenapro.resources.dto.LoginResponse;
import br.edu.arenapro.resources.dto.UsuarioRequest;
import br.edu.arenapro.resources.erro.NaoAutorizadoException;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriBuilder;
import jakarta.ws.rs.core.UriInfo;
import java.lang.reflect.Proxy;
import java.net.URI;
import java.util.HashMap;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicLong;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Testes unitários em memória do fluxo de cadastro (UsuarioResource) + autenticação JWT (AutenticacaoResource)
 * para ambos os perfis: TORCEDOR e ADMIN.
 */
class AutenticacaoUnitarioTest {

    private UsuarioResource usuarioResource;
    private AutenticacaoResource authResource;
    private Map<String, Usuario> usuariosPorEmail;
    private AtomicLong sequenciaId;
    private UriInfo uriInfoStub;

    @BeforeEach
    void configurar() {
        usuariosPorEmail = new HashMap<>();
        sequenciaId = new AtomicLong(1L);

        UsuarioRepository repoEmMemoria = new UsuarioRepository() {
            @Override
            public Optional<Usuario> findByEmail(String email) {
                return Optional.ofNullable(usuariosPorEmail.get(email));
            }

            @Override
            public void persist(Usuario u) {
                if (u.getId() == null) {
                    u.setId(sequenciaId.getAndIncrement());
                }
                usuariosPorEmail.put(u.getEmail(), u);
            }
        };

        usuarioResource = new UsuarioResource();
        usuarioResource.usuarioRepository = repoEmMemoria;

        authResource = new AutenticacaoResource();
        authResource.usuarioRepository = repoEmMemoria;

        uriInfoStub = (UriInfo) Proxy.newProxyInstance(
                UriInfo.class.getClassLoader(),
                new Class<?>[]{UriInfo.class},
                (proxy, method, args) -> {
                    if ("getAbsolutePathBuilder".equals(method.getName())) {
                        return UriBuilder.fromUri(URI.create("http://localhost:8080/usuarios"));
                    }
                    return null;
                });
    }

    @Test
    void cadastraEFazLoginDeTorcedorEAdminComTokenJwtValido() {
        // 1. Cadastra Usuário Comum (TORCEDOR) via UsuarioResource.criar
        Response respCadastroUser = usuarioResource.criar(
                new UsuarioRequest("João Marcelo", "joao@ufrn.br", "segredo123"), uriInfoStub);
        assertEquals(201, respCadastroUser.getStatus());

        // 2. Cadastra Administrador (ADMIN) via UsuarioResource.criar
        Response respCadastroAdmin = usuarioResource.criar(
                new UsuarioRequest("Admin ArenaPro", "admin@arenapro.com", "admin123"), uriInfoStub);
        assertEquals(201, respCadastroAdmin.getStatus());

        // 3. Login do Torcedor -> recebe JWT com papel TORCEDOR
        Response respLoginUser = authResource.login(new LoginRequest("joao@ufrn.br", "segredo123"));
        assertEquals(200, respLoginUser.getStatus());
        LoginResponse loginUser = (LoginResponse) respLoginUser.getEntity();
        assertNotNull(loginUser.token());
        assertEquals("Bearer", loginUser.tipo());
        assertEquals("João Marcelo", loginUser.nome());
        assertEquals("joao@ufrn.br", loginUser.email());
        assertEquals("TORCEDOR", loginUser.papel());

        // Valida token do Torcedor na rota protegida /auth/eu
        Response respEuUser = authResource.usuarioAutenticado("Bearer " + loginUser.token());
        assertEquals(200, respEuUser.getStatus());
        DadosTokenJwt dadosUser = (DadosTokenJwt) respEuUser.getEntity();
        assertEquals("TORCEDOR", dadosUser.papel());

        // 4. Login do Admin -> recebe JWT com papel ADMIN
        Response respLoginAdmin = authResource.login(new LoginRequest("admin@arenapro.com", "admin123"));
        assertEquals(200, respLoginAdmin.getStatus());
        LoginResponse loginAdmin = (LoginResponse) respLoginAdmin.getEntity();
        assertNotNull(loginAdmin.token());
        assertEquals("ADMIN", loginAdmin.papel());
        assertTrue(loginAdmin.token().split("\\.").length == 3);

        // Valida token do Admin na rota protegida /auth/eu
        Response respEuAdmin = authResource.usuarioAutenticado("Bearer " + loginAdmin.token());
        assertEquals(200, respEuAdmin.getStatus());
        DadosTokenJwt dadosAdmin = (DadosTokenJwt) respEuAdmin.getEntity();
        assertEquals("ADMIN", dadosAdmin.papel());

        System.out.println("\n=== TESTE DE CADASTRO + LOGIN JWT (TORCEDOR E ADMIN) ===");
        System.out.println("[TORCEDOR] Nome: " + loginUser.nome() + " | Email: " + loginUser.email()
                + " | Papel: " + loginUser.papel() + " | JWT: " + loginUser.token());
        System.out.println("[ADMIN]    Nome: " + loginAdmin.nome() + " | Email: " + loginAdmin.email()
                + " | Papel: " + loginAdmin.papel() + " | JWT: " + loginAdmin.token());
        System.out.println("========================================================\n");
    }

    @Test
    void loginComSenhaIncorretaOuEmailInexistenteLancaNaoAutorizadoException() {
        usuarioResource.criar(new UsuarioRequest("João Marcelo", "joao@ufrn.br", "segredo123"), uriInfoStub);

        assertThrows(NaoAutorizadoException.class,
                () -> authResource.login(new LoginRequest("joao@ufrn.br", "senha-errada")));

        assertThrows(NaoAutorizadoException.class,
                () -> authResource.login(new LoginRequest("inexistente@ufrn.br", "segredo123")));
    }

    @Test
    void rotaProtegidaSemTokenOuComTokenInvalidoLancaNaoAutorizadoException() {
        assertThrows(NaoAutorizadoException.class, () -> authResource.usuarioAutenticado(null));
        assertThrows(NaoAutorizadoException.class, () -> authResource.usuarioAutenticado("Bearer token.invalido.aqui"));
    }
}
