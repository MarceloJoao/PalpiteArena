package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.repository.UsuarioRepository;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

import java.net.URI;
import java.util.List;

@Path("/usuarios")
@Produces("application/json")
@Consumes("application/json")
public class UsuarioResource {

    @Inject
    UsuarioRepository usuarioRepository;

    // GET /usuarios?pagina=0&tamanho=10
    @GET
    public List<Usuario> listar(
            @QueryParam("pagina") @DefaultValue("0") int pagina,
            @QueryParam("tamanho") @DefaultValue("10") int tamanho) {
        return usuarioRepository.listarTodos(pagina, tamanho);
    }

    // GET /usuarios/{id}
    @GET
    @Path("/{id}")
    public Response buscarPorId(@PathParam("id") Long id) {
        Usuario usuario = usuarioRepository.findById(id);
        if (usuario == null) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        return Response.ok(usuario).build(); // 200
    }

    // POST /usuarios → 201 com Location
    @POST
    @Transactional
    public Response criar(Usuario usuario, @Context UriInfo uriInfo) {
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
    public Response atualizar(@PathParam("id") Long id, Usuario dados) {
        Usuario existente = usuarioRepository.findById(id);
        if (existente == null) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        existente.setNome(dados.getNome());
        existente.setEmail(dados.getEmail());
        existente.setSenha(dados.getSenha());
        return Response.ok(existente).build(); // 200
    }

    // DELETE /usuarios/{id} → 204
    @DELETE
    @Path("/{id}")
    @Transactional
    public Response remover(@PathParam("id") Long id) {
        boolean deletado = usuarioRepository.deleteById(id);
        if (!deletado) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        return Response.noContent().build(); // 204
    }
}