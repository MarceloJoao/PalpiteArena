package br.edu.arenapro.resources;

import br.edu.arenapro.domain.CarteiraCasa;
import br.edu.arenapro.domain.DesafioX1;
import br.edu.arenapro.domain.NotificadorPalpite;
import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.repository.CarteiraCasaRepository;
import br.edu.arenapro.repository.DesafioRepository;
import br.edu.arenapro.repository.PartidaRepository;
import br.edu.arenapro.repository.UsuarioRepository;
import br.edu.arenapro.resources.dto.DesafioAceitarRequest;
import br.edu.arenapro.resources.dto.DesafioAcaoUsuarioRequest;
import br.edu.arenapro.resources.dto.DesafioCriarRequest;
import br.edu.arenapro.resources.erro.RecursoNaoEncontradoException;
import br.edu.arenapro.resources.erro.RegraNegocioException;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
import jakarta.ws.rs.DefaultValue;
import jakarta.ws.rs.GET;
import jakarta.ws.rs.POST;
import jakarta.ws.rs.Path;
import jakarta.ws.rs.PathParam;
import jakarta.ws.rs.Produces;
import jakarta.ws.rs.QueryParam;
import jakarta.ws.rs.core.Context;
import jakarta.ws.rs.core.MediaType;
import jakarta.ws.rs.core.Response;
import jakarta.ws.rs.core.UriInfo;
import java.net.URI;
import java.util.List;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType;
import org.eclipse.microprofile.openapi.annotations.headers.Header;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/desafios")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Desafios X1", description = "Apostas diretas entre dois usuários (Desafio X1) com retenção de saldo e comissão de 5% para a Carteira Casa")
public class DesafioResource {

    @Inject
    DesafioRepository desafioRepository;

    @Inject
    UsuarioRepository usuarioRepository;

    @Inject
    PartidaRepository partidaRepository;

    @Inject
    CarteiraCasaRepository carteiraCasaRepository;

    @Inject
    NotificadorPalpite notificador;

    @GET
    @Transactional
    @Operation(summary = "Lista desafios X1 com paginação e filtro opcional por usuário (desafiante ou desafiado)")
    @APIResponse(responseCode = "200", description = "Lista de desafios X1",
            content = @Content(schema = @Schema(type = SchemaType.ARRAY, implementation = DesafioX1.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public List<DesafioX1> listar(
            @Parameter(description = "Número da página, começando em 0")
            @QueryParam("pagina") @DefaultValue("0") @Min(0) int pagina,
            @Parameter(description = "Itens por página (1 a 100)")
            @QueryParam("tamanho") @DefaultValue("50") @Min(1) @Max(100) int tamanho,
            @Parameter(description = "Filtra pelos desafios em que o usuário é desafiante ou desafiado")
            @QueryParam("usuarioId") Long usuarioId) {
        List<DesafioX1> lista = (usuarioId != null)
                ? desafioRepository.listarPorUsuario(usuarioId, pagina, tamanho)
                : desafioRepository.listarTodos(pagina, tamanho);

        // Verifica expiração automática caso alguma partida pendente já tenha tido gol ou encerrado
        for (DesafioX1 d : lista) {
            d.verificarExpiracaoPorGolOuFim();
        }
        return lista;
    }

    @GET
    @Path("/carteira-casa")
    @Transactional
    @Operation(summary = "Retorna o saldo acumulado de comissões da Carteira Casa (exclusivo do Painel Admin)")
    @APIResponse(responseCode = "200", description = "Dados da Carteira Casa",
            content = @Content(schema = @Schema(implementation = CarteiraCasa.class)))
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public CarteiraCasa obterCarteiraCasa() {
        return carteiraCasaRepository.obterOuCriar();
    }

    @GET
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Busca um desafio X1 pelo id")
    @APIResponse(responseCode = "200", description = "Desafio encontrado",
            content = @Content(schema = @Schema(implementation = DesafioX1.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response buscarPorId(@Parameter(description = "Id do desafio") @PathParam("id") Long id) {
        DesafioX1 desafio = desafioRepository.findById(id);
        if (desafio == null) {
            throw new RecursoNaoEncontradoException("Desafio", id);
        }
        desafio.verificarExpiracaoPorGolOuFim();
        return Response.ok(desafio).build();
    }

    @POST
    @Transactional
    @Operation(summary = "Cria um novo convite de Desafio X1, retém o saldo do desafiante e envia aviso por e-mail via Go/gRPC")
    @APIResponse(responseCode = "201", description = "Desafio criado e convite enviado",
            headers = @Header(name = "Location", description = "URI do desafio criado"),
            content = @Content(schema = @Schema(implementation = DesafioX1.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response criar(@Valid @NotNull DesafioCriarRequest corpo, @Context UriInfo uriInfo) {
        Usuario desafiante = usuarioRepository.findById(corpo.desafianteId());
        if (desafiante == null) {
            throw new RegraNegocioException("O usuário desafiante (id " + corpo.desafianteId() + ") não existe.");
        }
        Partida partida = partidaRepository.findById(corpo.partidaId());
        if (partida == null) {
            throw new RegraNegocioException("A partida (id " + corpo.partidaId() + ") não existe.");
        }
        String emailDesafiado = corpo.emailDesafiado().trim();
        Usuario desafiado = usuarioRepository.findByEmail(emailDesafiado)
                .orElseThrow(() -> new RegraNegocioException(
                        "Não existe nenhum usuário cadastrado com o e-mail '" + emailDesafiado + "'."));

        DesafioX1 desafio;
        try {
            desafio = DesafioX1.criarConvite(
                    partida,
                    desafiante,
                    desafiado,
                    corpo.opcaoDesafiante(),
                    corpo.valor());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }

        desafioRepository.persist(desafio);
        notificador.notificarConviteDesafio(desafio);

        URI uri = uriInfo != null
                ? uriInfo.getAbsolutePathBuilder().path(desafio.getId().toString()).build()
                : URI.create("/desafios/" + (desafio.getId() != null ? desafio.getId() : 1L));
        return Response.created(uri).entity(desafio).build();
    }

    @POST
    @Path("/{id}/aceitar")
    @Transactional
    @Operation(summary = "Aceita um convite de Desafio X1 pelo usuário desafiado, escolhendo um resultado diferente e retendo seu saldo")
    @APIResponse(responseCode = "200", description = "Desafio aceito com sucesso",
            content = @Content(schema = @Schema(implementation = DesafioX1.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response aceitar(
            @Parameter(description = "Id do desafio") @PathParam("id") Long id,
            @Valid @NotNull DesafioAceitarRequest corpo) {
        DesafioX1 desafio = desafioRepository.findById(id);
        if (desafio == null) {
            throw new RecursoNaoEncontradoException("Desafio", id);
        }
        try {
            desafio.aceitarPeloDesafiado(corpo.usuarioId(), corpo.opcaoDesafiado());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(desafio).build();
    }

    @POST
    @Path("/{id}/recusar")
    @Transactional
    @Operation(summary = "Recusa um convite de Desafio X1 pelo usuário desafiado e devolve o saldo retido ao desafiante")
    @APIResponse(responseCode = "200", description = "Desafio recusado e saldo estornado",
            content = @Content(schema = @Schema(implementation = DesafioX1.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response recusar(
            @Parameter(description = "Id da aposta/desafio") @PathParam("id") Long id,
            @Valid @NotNull DesafioAcaoUsuarioRequest corpo) {
        DesafioX1 desafio = desafioRepository.findById(id);
        if (desafio == null) {
            throw new RecursoNaoEncontradoException("Desafio", id);
        }
        try {
            desafio.recusarPeloDesafiado(corpo.usuarioId());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(desafio).build();
    }

    @POST
    @Path("/{id}/cancelar")
    @Transactional
    @Operation(summary = "Cancela um convite de Desafio X1 pelo próprio desafiante (somente antes do aceite do adversário)")
    @APIResponse(responseCode = "200", description = "Desafio cancelado e saldo estornado ao desafiante",
            content = @Content(schema = @Schema(implementation = DesafioX1.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    @APIResponse(responseCode = "500", ref = "ErroInterno")
    public Response cancelar(
            @Parameter(description = "Id do desafio") @PathParam("id") Long id,
            @Valid @NotNull DesafioAcaoUsuarioRequest corpo) {
        DesafioX1 desafio = desafioRepository.findById(id);
        if (desafio == null) {
            throw new RecursoNaoEncontradoException("Desafio", id);
        }
        try {
            desafio.cancelarPeloDesafiante(corpo.usuarioId());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(desafio).build();
    }
}
