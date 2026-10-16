package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Palpite;
import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.repository.PalpiteRepository;
import br.edu.arenapro.repository.PartidaRepository;
import br.edu.arenapro.repository.UsuarioRepository;
import br.edu.arenapro.resources.dto.PalpiteAtualizarRequest;
import br.edu.arenapro.resources.dto.PalpiteCriarRequest;
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

@Path("/palpites")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Palpites", description = "Palpites dos usuários nas partidas")
public class PalpiteResource {

    @Inject
    PalpiteRepository palpiteRepository;

    @Inject
    UsuarioRepository usuarioRepository;

    @Inject
    PartidaRepository partidaRepository;

    // GET /palpites?pagina=0&tamanho=10
    // GET /palpites?usuarioId=1
    // GET /palpites?partidaId=1
    @GET
    @Operation(summary = "Lista palpites com paginação e filtros opcionais por usuário ou partida")
    @APIResponse(responseCode = "200", description = "Página de palpites",
            content = @Content(schema = @Schema(type = SchemaType.ARRAY, implementation = Palpite.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public List<Palpite> listar(
            @Parameter(description = "Número da página, começando em 0")
            @QueryParam("pagina") @DefaultValue("0") @Min(0) int pagina,
            @Parameter(description = "Itens por página (1 a 100)")
            @QueryParam("tamanho") @DefaultValue("10") @Min(1) @Max(100) int tamanho,
            @Parameter(description = "Filtra pelos palpites de um usuário")
            @QueryParam("usuarioId") Long usuarioId,
            @Parameter(description = "Filtra pelos palpites de uma partida")
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
    @Operation(summary = "Busca um palpite pelo id")
    @APIResponse(responseCode = "200", description = "Palpite encontrado",
            content = @Content(schema = @Schema(implementation = Palpite.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response buscarPorId(@Parameter(description = "Id do palpite") @PathParam("id") Long id) {
        Palpite palpite = palpiteRepository.findById(id);
        if (palpite == null) {
            throw new RecursoNaoEncontradoException("Palpite", id); // 404
        }
        return Response.ok(palpite).build(); // 200
    }

    // POST /palpites → 201 com Location
    @POST
    @Transactional
    @Operation(summary = "Registra um palpite")
    @APIResponse(responseCode = "201", description = "Palpite criado",
            headers = @Header(name = "Location", description = "URI do palpite criado"),
            content = @Content(schema = @Schema(implementation = Palpite.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response criar(@Valid @NotNull PalpiteCriarRequest corpo, @Context UriInfo uriInfo) {
        Usuario usuario = usuarioRepository.findById(corpo.usuarioId());
        if (usuario == null) {
            throw new RegraNegocioException("O usuário (id " + corpo.usuarioId() + ") não existe.");
        }
        Partida partida = partidaRepository.findById(corpo.partidaId());
        if (partida == null) {
            throw new RegraNegocioException("A partida (id " + corpo.partidaId() + ") não existe.");
        }
        Palpite palpite = new Palpite();
        palpite.setUsuario(usuario);
        palpite.setPartida(partida);
        palpite.setPlacarprevisto(corpo.placarprevisto());
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
    @Operation(summary = "Atualiza um palpite")
    @APIResponse(responseCode = "200", description = "Palpite atualizado",
            content = @Content(schema = @Schema(implementation = Palpite.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response atualizar(@Parameter(description = "Id do palpite") @PathParam("id") Long id,
                              @Valid @NotNull PalpiteAtualizarRequest corpo) {
        Palpite existente = palpiteRepository.findById(id);
        if (existente == null) {
            throw new RecursoNaoEncontradoException("Palpite", id); // 404
        }
        existente.setPlacarprevisto(corpo.placarprevisto());
        if (corpo.pontosObtidos() != null) {
            existente.setPontosObtidos(corpo.pontosObtidos());
        }
        return Response.ok(existente).build(); // 200
    }

    // DELETE /palpites/{id} → 204
    @DELETE
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Remove um palpite")
    @APIResponse(responseCode = "204", description = "Palpite removido")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response remover(@Parameter(description = "Id do palpite") @PathParam("id") Long id) {
        boolean deletado = palpiteRepository.deleteById(id);
        if (!deletado) {
            throw new RecursoNaoEncontradoException("Palpite", id); // 404
        }
        return Response.noContent().build(); // 204
    }
}