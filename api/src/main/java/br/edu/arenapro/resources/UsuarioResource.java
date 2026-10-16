package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.repository.UsuarioRepository;
import br.edu.arenapro.resources.dto.UsuarioRequest;
import br.edu.arenapro.resources.erro.ConflitoException;
import br.edu.arenapro.resources.erro.RecursoNaoEncontradoException;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType;
import org.eclipse.microprofile.openapi.annotations.headers.Header;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

import java.net.URI;
import java.util.List;

@Path("/usuarios")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Usuários", description = "Cadastro de usuários da plataforma")
public class UsuarioResource {

    @Inject
    UsuarioRepository usuarioRepository;

    // GET /usuarios?pagina=0&tamanho=10
    @GET
    @Operation(summary = "Lista usuários com paginação")
    @APIResponse(responseCode = "200", description = "Página de usuários",
            content = @Content(schema = @Schema(type = SchemaType.ARRAY, implementation = Usuario.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public List<Usuario> listar(
            @Parameter(description = "Número da página, começando em 0")
            @QueryParam("pagina") @DefaultValue("0") @Min(0) int pagina,
            @Parameter(description = "Itens por página (1 a 100)")
            @QueryParam("tamanho") @DefaultValue("10") @Min(1) @Max(100) int tamanho) {
        return usuarioRepository.listarTodos(pagina, tamanho);
    }

    // GET /usuarios/{id}
    @GET
    @Path("/{id}")
    @Operation(summary = "Busca um usuário pelo id")
    @APIResponse(responseCode = "200", description = "Usuário encontrado",
            content = @Content(schema = @Schema(implementation = Usuario.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response buscarPorId(@Parameter(description = "Id do usuário") @PathParam("id") Long id) {
        Usuario usuario = usuarioRepository.findById(id);
        if (usuario == null) {
            throw new RecursoNaoEncontradoException("Usuário", id); // 404
        }
        return Response.ok(usuario).build(); // 200
    }

    // POST /usuarios → 201 com Location
    @POST
    @Transactional
    @Operation(summary = "Cadastra um usuário")
    @APIResponse(responseCode = "201", description = "Usuário criado",
            headers = @Header(name = "Location", description = "URI do usuário criado"),
            content = @Content(schema = @Schema(implementation = Usuario.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "409", ref = "Conflito")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response criar(@Valid @NotNull UsuarioRequest corpo, @Context UriInfo uriInfo) {
        String email = corpo.email().trim();
        if (usuarioRepository.findByEmail(email).isPresent()) {
            throw new ConflitoException("Já existe um usuário com o e-mail '" + email + "'.");
        }
        Usuario usuario = new Usuario();
        usuario.setNome(corpo.nome().trim());
        usuario.setEmail(email);
        usuario.setSenha(corpo.senha());
        usuarioRepository.persist(usuario);
        URI uri = uriInfo.getAbsolutePathBuilder()
                .path(usuario.getId().toString())
                .build();
        return Response.created(uri).entity(usuario).build(); // 201
    }

    // PUT /usuarios/{id}
    @PUT
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Atualiza um usuário")
    @APIResponse(responseCode = "200", description = "Usuário atualizado",
            content = @Content(schema = @Schema(implementation = Usuario.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "409", ref = "Conflito")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response atualizar(@Parameter(description = "Id do usuário") @PathParam("id") Long id,
                              @Valid @NotNull UsuarioRequest corpo) {
        Usuario existente = usuarioRepository.findById(id);
        if (existente == null) {
            throw new RecursoNaoEncontradoException("Usuário", id); // 404
        }
        String email = corpo.email().trim();
        usuarioRepository.findByEmail(email)
                .filter(outro -> !outro.getId().equals(id))
                .ifPresent(outro -> {
                    throw new ConflitoException("Já existe um usuário com o e-mail '" + email + "'.");
                });
        existente.setNome(corpo.nome().trim());
        existente.setEmail(email);
        existente.setSenha(corpo.senha());
        usuarioRepository.flush();
        return Response.ok(existente).build(); // 200
    }

    // DELETE /usuarios/{id} → 204
    @DELETE
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Remove um usuário")
    @APIResponse(responseCode = "204", description = "Usuário removido")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "409", ref = "Conflito")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response remover(@Parameter(description = "Id do usuário") @PathParam("id") Long id) {
        boolean deletado = usuarioRepository.deleteById(id);
        if (!deletado) {
            throw new RecursoNaoEncontradoException("Usuário", id); // 404
        }
        usuarioRepository.flush();
        return Response.noContent().build(); // 204
    }
}