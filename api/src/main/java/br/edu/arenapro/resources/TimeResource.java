package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Time;
import br.edu.arenapro.repository.TimeRepository;
import br.edu.arenapro.resources.dto.TimeRequest;
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

@Path("/times")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Times", description = "Cadastro de times de futebol")
public class TimeResource {

    @Inject
    TimeRepository timeRepository;


    @GET
    @Operation(summary = "Lista times com paginação")
    @APIResponse(responseCode = "200", description = "Página de times",
            content = @Content(schema = @Schema(type = SchemaType.ARRAY, implementation = Time.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public List<Time> listar(
            @Parameter(description = "Número da página, começando em 0")
            @QueryParam("pagina") @DefaultValue("0") @Min(0) int pagina,
            @Parameter(description = "Itens por página (1 a 100)")
            @QueryParam("tamanho") @DefaultValue("10") @Min(1) @Max(100) int tamanho) {
        return timeRepository.listarTodos(pagina, tamanho);
    }


    @GET
    @Path("/{id}")
    @Operation(summary = "Busca um time pelo id")
    @APIResponse(responseCode = "200", description = "Time encontrado",
            content = @Content(schema = @Schema(implementation = Time.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response buscarPorId(@Parameter(description = "Id do time") @PathParam("id") Long id) {
        Time time = timeRepository.findById(id);
        if (time == null) {
            throw new RecursoNaoEncontradoException("Time", id); // 404
        }
        return Response.ok(time).build(); // 200
    }


    @POST
    @Transactional
    @Operation(summary = "Cadastra um time")
    @APIResponse(responseCode = "201", description = "Time criado",
            headers = @Header(name = "Location", description = "URI do time criado"),
            content = @Content(schema = @Schema(implementation = Time.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "409", ref = "Conflito")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response criar(@Valid @NotNull TimeRequest corpo, @Context UriInfo uriInfo) {
        String nome = corpo.nome().trim();
        if (timeRepository.findByNome(nome) != null) {
            throw new ConflitoException("Já existe um time com o nome '" + nome + "'.");
        }
        Time time = new Time();
        time.setNome(nome);
        timeRepository.persist(time);
        URI uri = uriInfo.getAbsolutePathBuilder()
                .path(time.getId().toString())
                .build();
        return Response.created(uri).entity(time).build(); // 201
    }


    @PUT
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Atualiza um time")
    @APIResponse(responseCode = "200", description = "Time atualizado",
            content = @Content(schema = @Schema(implementation = Time.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "409", ref = "Conflito")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response atualizar(@Parameter(description = "Id do time") @PathParam("id") Long id,
                              @Valid @NotNull TimeRequest corpo) {
        Time existente = timeRepository.findById(id);
        if (existente == null) {
            throw new RecursoNaoEncontradoException("Time", id); // 404
        }
        String nome = corpo.nome().trim();
        Time outro = timeRepository.findByNome(nome);
        if (outro != null && !outro.getId().equals(id)) {
            throw new ConflitoException("Já existe um time com o nome '" + nome + "'.");
        }
        existente.setNome(nome);
        return Response.ok(existente).build(); // 200
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Remove um time",
            description = "Retorna 409 se o time ainda for usado por alguma partida.")
    @APIResponse(responseCode = "204", description = "Time removido")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "409", ref = "Conflito")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response remover(@Parameter(description = "Id do time") @PathParam("id") Long id) {
        boolean deletado = timeRepository.deleteById(id);
        if (!deletado) {
            throw new RecursoNaoEncontradoException("Time", id); // 404
        }
        timeRepository.flush(); // antecipa a violacao de chave estrangeira para virar 409
        return Response.noContent().build(); // 204
    }
}