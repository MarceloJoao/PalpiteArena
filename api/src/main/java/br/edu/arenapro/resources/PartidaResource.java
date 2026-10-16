package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.StatusPartida;
import br.edu.arenapro.domain.Time;
import br.edu.arenapro.repository.PartidaRepository;
import br.edu.arenapro.repository.TimeRepository;
import br.edu.arenapro.resources.dto.PartidaRequest;
import br.edu.arenapro.resources.erro.RecursoNaoEncontradoException;
import br.edu.arenapro.resources.erro.RegraNegocioException;
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

@Path("/partidas")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Partidas", description = "Cadastro de partidas entre dois times")
public class PartidaResource {

    @Inject
    PartidaRepository partidaRepository;

    @Inject
    TimeRepository timeRepository;

    @GET
    @Operation(summary = "Lista partidas com paginação e filtro opcional por status")
    @APIResponse(responseCode = "200", description = "Página de partidas",
            content = @Content(schema = @Schema(type = SchemaType.ARRAY, implementation = Partida.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public List<Partida> listar(
            @Parameter(description = "Número da página, começando em 0")
            @QueryParam("pagina") @DefaultValue("0") @Min(0) int pagina,
            @Parameter(description = "Itens por página (1 a 100)")
            @QueryParam("tamanho") @DefaultValue("10") @Min(1) @Max(100) int tamanho,
            @Parameter(description = "Filtra pelo status da partida")
            @QueryParam("status") StatusPartida status) {

        if(status != null) {
            return partidaRepository.filtrarporStatus(status, pagina, tamanho);
        }

        return partidaRepository.listarTodos(pagina, tamanho);
    }

    @GET
    @Path("/{id}")
    @Operation(summary = "Busca uma partida pelo id")
    @APIResponse(responseCode = "200", description = "Partida encontrada",
            content = @Content(schema = @Schema(implementation = Partida.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response buscarporId(@Parameter(description = "Id da partida") @PathParam("id") Long id) {
        Partida partida = partidaRepository.findById(id);
        if (partida == null) {
            throw new RecursoNaoEncontradoException("Partida", id);
        }

        return Response.ok(partida).build();
    }

    @POST
    @Transactional
    @Operation(summary = "Cadastra uma partida")
    @APIResponse(responseCode = "201", description = "Partida criada",
            headers = @Header(name = "Location", description = "URI da partida criada"),
            content = @Content(schema = @Schema(implementation = Partida.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response criar(@Valid @NotNull PartidaRequest corpo, @Context UriInfo uriInfo) {
        Partida partida = new Partida();
        aplicar(partida, corpo);
        partidaRepository.persist(partida);

        URI uri = uriInfo.getAbsolutePathBuilder().path(partida.getId().toString()).build();

        return Response.created(uri).entity(partida).build();
    }

    @PUT
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Atualiza uma partida")
    @APIResponse(responseCode = "200", description = "Partida atualizada",
            content = @Content(schema = @Schema(implementation = Partida.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response atualizar(@Parameter(description = "Id da partida") @PathParam("id") Long id,
                              @Valid @NotNull PartidaRequest corpo) {
        Partida existente = partidaRepository.findById(id);

        if(existente == null){
            throw new RecursoNaoEncontradoException("Partida", id);
        }

        aplicar(existente, corpo);

        return Response.ok(existente).build();
    }

    @DELETE
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Remove uma partida")
    @APIResponse(responseCode = "204", description = "Partida removida")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "409", ref = "Conflito")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response remover(@Parameter(description = "Id da partida") @PathParam("id") Long id) {
       boolean deletado = partidaRepository.deleteById(id);

       if(!deletado) {
           throw new RecursoNaoEncontradoException("Partida", id);
       }

       partidaRepository.flush();
       return Response.noContent().build();
    }

    // Copia o corpo validado para a entidade, resolvendo os ids dos times
    private void aplicar(Partida partida, PartidaRequest corpo) {
        if (corpo.timeCasaId().equals(corpo.timeForaId())) {
            throw new RegraNegocioException("Os times da casa e de fora devem ser diferentes.");
        }
        Time casa = timeRepository.findById(corpo.timeCasaId());
        if (casa == null) {
            throw new RegraNegocioException("O time da casa (id " + corpo.timeCasaId() + ") não existe.");
        }
        Time fora = timeRepository.findById(corpo.timeForaId());
        if (fora == null) {
            throw new RegraNegocioException("O time de fora (id " + corpo.timeForaId() + ") não existe.");
        }
        partida.setTimeCasa(casa);
        partida.setTimeFora(fora);
        partida.setData(corpo.data());
        partida.setPlacar(corpo.placar());
        if (corpo.status() != null) {
            partida.setStatus(corpo.status());
        }
    }

}
