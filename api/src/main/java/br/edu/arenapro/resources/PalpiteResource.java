package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Palpite;
import br.edu.arenapro.repository.PalpiteRepository;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

import java.net.URI;
import java.util.List;

@Path("/palpites")
@Produces("application/json")
@Consumes("application/json")
public class PalpiteResource {

    @Inject
    PalpiteRepository palpiteRepository;

    // GET /palpites?pagina=0&tamanho=10
    // GET /palpites?usuarioId=1
    // GET /palpites?partidaId=1
    @GET
    public List<Palpite> listar(
            @QueryParam("pagina") @DefaultValue("0") int pagina,
            @QueryParam("tamanho") @DefaultValue("10") int tamanho,
            @QueryParam("usuarioId") Long usuarioId,
            @QueryParam("partidaId") Long partidaId) {

        if (usuarioId != null) {
            return palpiteRepository.listarPorUsuario(usuarioId, pagina, tamanho);
        }
        if (partidaId != null) {
            return palpiteRepository.listarPorPartida(partidaId, pagina, tamanho);
        }
        return palpiteRepository.listarTodos(pagina, tamanho);
    }

    // GET /palpites/{id}
    @GET
    @Path("/{id}")
    public Response buscarPorId(@PathParam("id") Long id) {
        Palpite palpite = palpiteRepository.findById(id);
        if (palpite == null) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        return Response.ok(palpite).build(); // 200
    }

    // POST /palpites → 201 com Location
    @POST
    @Transactional
    public Response criar(Palpite palpite, @Context UriInfo uriInfo) {
        palpiteRepository.persist(palpite);
        URI uri = uriInfo.getAbsolutePathBuilder()
                .path(palpite.getId().toString())
                .build();
        return Response.created(uri).entity(palpite).build(); // 201
    }

    // PUT /palpites/{id}
    @PUT
    @Path("/{id}")
    @Transactional
    public Response atualizar(@PathParam("id") Long id, Palpite dados) {
        Palpite existente = palpiteRepository.findById(id);
        if (existente == null) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        existente.setPlacarprevisto(dados.getPlacarprevisto());
        existente.setPontosObtidos(dados.getPontosObtidos());
        return Response.ok(existente).build(); // 200
    }

    // DELETE /palpites/{id} → 204
    @DELETE
    @Path("/{id}")
    @Transactional
    public Response remover(@PathParam("id") Long id) {
        boolean deletado = palpiteRepository.deleteById(id);
        if (!deletado) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        return Response.noContent().build(); // 204
    }
}