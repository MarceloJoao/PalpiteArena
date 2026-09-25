package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.StatusPartida;
import br.edu.arenapro.repository.PartidaRepository;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;
import java.util.List;

@Path("/partidas")
@Produces("application/json")
@Consumes("application/json")
public class PartidaResource {

    @Inject
    PartidaRepository partidaRepository;

    @GET
    public List<Partida> listar(@QueryParam("pagina") @DefaultValue("0") int pagina, @QueryParam("tamanho") @DefaultValue("10") int tamanho, @QueryParam("status") StatusPartida status) {

        if(status != null) {
            return partidaRepository.filtrarporStatus(status, pagina, tamanho);
        }

        return partidaRepository.listarTodos(pagina, tamanho);
    }

    @GET
    @Path("/{id}")
    public Response buscarporId(@PathParam("id") Long id) {
        Partida partida = partidaRepository.findById(id);
        if (partida == null) {
            return Response.status(Response.Status.NOT_FOUND).build();
        }

        return Response.ok(partida).build();
    }

    @POST
    @Transactional
    public Response criar(Partida partida, @Context UriInfo uriInfo) {
        partidaRepository.persist(partida);

        URI uri = uriInfo.getAbsolutePathBuilder().path(partida.getId().toString()).build();

        return Response.created(uri).entity(partida).build();
    }

    @PUT
    @Path("/{id}")
    @Transactional
    public Response atualizar(@PathParam("id") Long id, Partida partida) {
        Partida existente = partidaRepository.findById(id);

        if(existente == null){
            return Response.status(Response.Status.NOT_FOUND).build();
        }

        existente.setTimeCasa(partida.getTimeCasa());
        existente.setTimeFora(partida.getTimeFora());
        existente.setData(partida.getData());
        existente.setPlacar(partida.getPlacar());
        existente.setStatus(partida.getStatus());

        return Response.ok(existente).build();
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    public Response remover(@PathParam("id") Long id) {
       boolean deletado = partidaRepository.deleteById(id);

       if(!deletado) {
           return Response.status(Response.Status.NOT_FOUND).build();
       }

       return Response.noContent().build();
    }

}
