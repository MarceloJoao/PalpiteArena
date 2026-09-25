package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Time;
import br.edu.arenapro.repository.TimeRepository;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.ws.rs.*;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;

import java.net.URI;
import java.util.List;

@Path("/times")
@Produces("application/json")
@Consumes("application/json")
public class TimeResource {

    @Inject
    TimeRepository timeRepository;


    @GET
    public List<Time> listar(
            @QueryParam("pagina") @DefaultValue("0") int pagina,
            @QueryParam("tamanho") @DefaultValue("10") int tamanho) {
        return timeRepository.listarTodos(pagina, tamanho);
    }


    @GET
    @Path("/{id}")
    public Response buscarPorId(@PathParam("id") Long id) {
        Time time = timeRepository.findById(id);
        if (time == null) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        return Response.ok(time).build(); // 200
    }


    @POST
    @Transactional
    public Response criar(Time time, @Context UriInfo uriInfo) {
        timeRepository.persist(time);
        URI uri = uriInfo.getAbsolutePathBuilder()
                .path(time.getId().toString())
                .build();
        return Response.created(uri).entity(time).build(); // 201
    }


    @PUT
    @Path("/{id}")
    @Transactional
    public Response atualizar(@PathParam("id") Long id, Time dados) {
        Time existente = timeRepository.findById(id);
        if (existente == null) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        existente.setNome(dados.getNome());
        return Response.ok(existente).build(); // 200
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    public Response remover(@PathParam("id") Long id) {
        boolean deletado = timeRepository.deleteById(id);
        if (!deletado) {
            return Response.status(Response.Status.NOT_FOUND).build(); // 404
        }
        return Response.noContent().build(); // 204
    }
}