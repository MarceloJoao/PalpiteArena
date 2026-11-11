package br.edu.arenapro.resources;

import br.edu.arenapro.domain.GeradorTokenJwt;
import br.edu.arenapro.domain.GeradorTokenJwt.DadosTokenJwt;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.repository.UsuarioRepository;
import br.edu.arenapro.resources.dto.LoginRequest;
import br.edu.arenapro.resources.dto.LoginResponse;
import br.edu.arenapro.resources.erro.NaoAutorizadoException;
import jakarta.inject.Inject;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.HeaderParam;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.core.HttpHeaders;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/auth")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Autenticação", description = "Login com geração de token JWT (HS256) e verificação de sessão")
public class AutenticacaoResource {

    @Inject
    UsuarioRepository usuarioRepository;

    GeradorTokenJwt geradorTokenJwt = new GeradorTokenJwt();

    @POST
    @Path("/login")
    @Operation(summary = "Autentica um usuário por e-mail e senha e retorna um token JWT")
    @APIResponse(responseCode = "200", description = "Autenticação realizada com sucesso",
            content = @Content(schema = @Schema(implementation = LoginResponse.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "401", ref = "NaoAutorizado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response login(@Valid @NotNull LoginRequest corpo) {
        String email = corpo.email().trim();
        Usuario usuario = usuarioRepository.findByEmail(email)
                .filter(u -> u.conferirSenha(corpo.senha()))
                .orElseThrow(() -> new NaoAutorizadoException("E-mail ou senha inválidos."));

        String token = geradorTokenJwt.gerarToken(usuario);
        LoginResponse resposta = new LoginResponse(
                token,
                "Bearer",
                geradorTokenJwt.getValidadeSegundos(),
                usuario.getId(),
                usuario.getNome(),
                usuario.getEmail(),
                usuario.obterPapel());

        return Response.ok(resposta).build();
    }

    @GET
    @Path("/eu")
    @Operation(summary = "Retorna os dados do usuário autenticado a partir do cabeçalho Authorization Bearer JWT")
    @APIResponse(responseCode = "200", description = "Token JWT válido",
            content = @Content(schema = @Schema(implementation = DadosTokenJwt.class)))
    @APIResponse(responseCode = "401", ref = "NaoAutorizado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response usuarioAutenticado(
            @Parameter(description = "Cabeçalho Authorization no formato 'Bearer <token>'")
            @HeaderParam(HttpHeaders.AUTHORIZATION) String cabecalhoAutorizacao) {
        DadosTokenJwt dados = geradorTokenJwt.validarToken(cabecalhoAutorizacao)
                .orElseThrow(() -> new NaoAutorizadoException("Token JWT ausente, inválido ou expirado."));
        return Response.ok(dados).build();
    }
}
