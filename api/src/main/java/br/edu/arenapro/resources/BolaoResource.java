package br.edu.arenapro.resources;

import br.edu.arenapro.domain.Bolao;
import br.edu.arenapro.domain.CarteiraCasa;
import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.repository.BolaoRepository;
import br.edu.arenapro.repository.CarteiraCasaRepository;
import br.edu.arenapro.repository.PartidaRepository;
import br.edu.arenapro.repository.UsuarioRepository;
import br.edu.arenapro.resources.dto.BolaoConfigurarRequest;
import br.edu.arenapro.resources.dto.BolaoConfirmarApostaRequest;
import br.edu.arenapro.resources.dto.BolaoCriarRequest;
import br.edu.arenapro.resources.dto.BolaoPalpiteItemDto;
import br.edu.arenapro.resources.dto.DesafioAcaoUsuarioRequest;
import br.edu.arenapro.resources.erro.RecursoNaoEncontradoException;
import br.edu.arenapro.resources.erro.RegraNegocioException;
import jakarta.inject.Inject;
import jakarta.transaction.Transactional;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.ws.rs.Consumes;
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
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import org.eclipse.microprofile.openapi.annotations.Operation;
import org.eclipse.microprofile.openapi.annotations.enums.SchemaType;
import org.eclipse.microprofile.openapi.annotations.headers.Header;
import org.eclipse.microprofile.openapi.annotations.media.Content;
import org.eclipse.microprofile.openapi.annotations.media.Schema;
import org.eclipse.microprofile.openapi.annotations.parameters.Parameter;
import org.eclipse.microprofile.openapi.annotations.responses.APIResponse;
import org.eclipse.microprofile.openapi.annotations.tags.Tag;

@Path("/boloes")
@Produces(MediaType.APPLICATION_JSON)
@Consumes(MediaType.APPLICATION_JSON)
@Tag(name = "Bolões", description = "Apostas coletivas em múltiplas partidas (Bolão) com ranking por pontos, multa de 20% na desistência e comissão de 10% para a Carteira Casa")
public class BolaoResource {

    @Inject
    BolaoRepository bolaoRepository;

    @Inject
    UsuarioRepository usuarioRepository;

    @Inject
    PartidaRepository partidaRepository;

    @Inject
    CarteiraCasaRepository carteiraCasaRepository;

    @GET
    @Transactional
    @Operation(summary = "Lista os bolões (filtrando opcionalmente pelos que o usuário criou ou foi convidado)")
    @APIResponse(responseCode = "200", description = "Lista de bolões",
            content = @Content(schema = @Schema(type = SchemaType.ARRAY, implementation = Bolao.class)))
    public List<Bolao> listar(
            @Parameter(description = "Id do usuário criador ou convidado")
            @QueryParam("usuarioId") Long usuarioId) {
        List<Bolao> lista = (usuarioId != null)
                ? bolaoRepository.listarPorUsuario(usuarioId)
                : bolaoRepository.listarTodos();

        CarteiraCasa carteiraCasa = carteiraCasaRepository.obterOuCriar();
        for (Bolao b : lista) {
            b.apurarPontosELiquidarSeFinalizado(carteiraCasa);
        }
        return lista;
    }

    @GET
    @Path("/{id}")
    @Transactional
    @Operation(summary = "Busca um bolão pelo id com suas partidas, participantes/ranking e palpites")
    @APIResponse(responseCode = "200", description = "Bolão encontrado",
            content = @Content(schema = @Schema(implementation = Bolao.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    public Response buscarPorId(@Parameter(description = "Id do bolão") @PathParam("id") Long id) {
        Bolao bolao = bolaoRepository.findById(id);
        if (bolao == null) {
            throw new RecursoNaoEncontradoException("Bolão", id);
        }
        bolao.apurarPontosELiquidarSeFinalizado(carteiraCasaRepository.obterOuCriar());
        return Response.ok(bolao).build();
    }

    @POST
    @Transactional
    @Operation(summary = "Cria um novo bolão com as partidas selecionadas no Mural e os placares do criador")
    @APIResponse(responseCode = "201", description = "Bolão criado e enviado para Meus Bolões",
            headers = @Header(name = "Location", description = "URI do bolão criado"),
            content = @Content(schema = @Schema(implementation = Bolao.class)))
    @APIResponse(responseCode = "400", ref = "RequisicaoInvalida")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    public Response criar(@Valid @NotNull BolaoCriarRequest corpo, @Context UriInfo uriInfo) {
        Usuario criador = usuarioRepository.findById(corpo.criadorId());
        if (criador == null) {
            throw new RegraNegocioException("O usuário criador (id " + corpo.criadorId() + ") não existe.");
        }

        List<Partida> partidasSelecionadas = new ArrayList<>();
        Map<Long, String> placaresDoCriador = new LinkedHashMap<>();

        for (BolaoPalpiteItemDto item : corpo.palpites()) {
            Partida partida = partidaRepository.findById(item.partidaId());
            if (partida == null) {
                throw new RegraNegocioException("A partida (id " + item.partidaId() + ") não existe.");
            }
            if (!placaresDoCriador.containsKey(partida.getId())) {
                partidasSelecionadas.add(partida);
            }
            placaresDoCriador.put(partida.getId(), item.placar());
        }

        Bolao bolao;
        try {
            bolao = Bolao.criarComSelecaoEPlacares(criador, partidasSelecionadas, placaresDoCriador);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }

        bolaoRepository.persist(bolao);
        URI uri = uriInfo != null
                ? uriInfo.getAbsolutePathBuilder().path(bolao.getId().toString()).build()
                : URI.create("/boloes/" + (bolao.getId() != null ? bolao.getId() : 1L));
        return Response.created(uri).entity(bolao).build();
    }

    @POST
    @Path("/{id}/configurar")
    @Transactional
    @Operation(summary = "Define o valor do bolão (retendo do criador) e convida múltiplos usuários por e-mail")
    @APIResponse(responseCode = "200", description = "Bolão configurado e convites enviados",
            content = @Content(schema = @Schema(implementation = Bolao.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    public Response configurar(
            @Parameter(description = "Id do bolão") @PathParam("id") Long id,
            @Valid @NotNull BolaoConfigurarRequest corpo) {
        Bolao bolao = bolaoRepository.findById(id);
        if (bolao == null) {
            throw new RecursoNaoEncontradoException("Bolão", id);
        }

        List<Usuario> convidados = new ArrayList<>();
        for (String emailBruto : corpo.emailsConvidados()) {
            if (emailBruto == null || emailBruto.isBlank()) {
                continue;
            }
            String email = emailBruto.trim();
            Usuario convidado = usuarioRepository.findByEmail(email)
                    .orElseThrow(() -> new RegraNegocioException(
                            "Não existe nenhum usuário cadastrado com o e-mail '" + email + "'."));
            convidados.add(convidado);
        }

        try {
            bolao.configurarValorEConvidados(corpo.usuarioId(), corpo.valorCota(), convidados);
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(bolao).build();
    }

    @POST
    @Path("/{id}/aceitar")
    @Transactional
    @Operation(summary = "Aceita o convite para participar do bolão e retém o valor da cota do convidado")
    @APIResponse(responseCode = "200", description = "Convite do bolão aceito",
            content = @Content(schema = @Schema(implementation = Bolao.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    public Response aceitar(
            @Parameter(description = "Id do bolão") @PathParam("id") Long id,
            @Valid @NotNull DesafioAcaoUsuarioRequest corpo) {
        Bolao bolao = bolaoRepository.findById(id);
        if (bolao == null) {
            throw new RecursoNaoEncontradoException("Bolão", id);
        }
        try {
            bolao.aceitarConvite(corpo.usuarioId());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(bolao).build();
    }

    @POST
    @Path("/{id}/recusar")
    @Transactional
    @Operation(summary = "Recusa o convite para participar do bolão")
    @APIResponse(responseCode = "200", description = "Convite recusado",
            content = @Content(schema = @Schema(implementation = Bolao.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    public Response recusar(
            @Parameter(description = "Id do bolão") @PathParam("id") Long id,
            @Valid @NotNull DesafioAcaoUsuarioRequest corpo) {
        Bolao bolao = bolaoRepository.findById(id);
        if (bolao == null) {
            throw new RecursoNaoEncontradoException("Bolão", id);
        }
        try {
            bolao.recusarConvite(corpo.usuarioId());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(bolao).build();
    }

    @POST
    @Path("/{id}/confirmar-aposta")
    @Transactional
    @Operation(summary = "Confirma os placares escolhidos pelo participante em todas as partidas do bolão")
    @APIResponse(responseCode = "200", description = "Aposta do bolão confirmada com sucesso",
            content = @Content(schema = @Schema(implementation = Bolao.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    public Response confirmarAposta(
            @Parameter(description = "Id do bolão") @PathParam("id") Long id,
            @Valid @NotNull BolaoConfirmarApostaRequest corpo) {
        Bolao bolao = bolaoRepository.findById(id);
        if (bolao == null) {
            throw new RecursoNaoEncontradoException("Bolão", id);
        }

        Map<Long, String> mapaPlacares = new LinkedHashMap<>();
        for (BolaoPalpiteItemDto item : corpo.palpites()) {
            mapaPlacares.put(item.partidaId(), item.placar());
        }

        try {
            bolao.confirmarPlacaresConvidado(corpo.usuarioId(), mapaPlacares);
            bolao.apurarPontosELiquidarSeFinalizado(carteiraCasaRepository.obterOuCriar());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(bolao).build();
    }

    @POST
    @Path("/{id}/desistir")
    @Transactional
    @Operation(summary = "Desiste do bolão após ter aceitado, com penalidade de 20% para a Carteira Casa e devolução de 80%")
    @APIResponse(responseCode = "200", description = "Desistência processada com retenção da multa de 20%",
            content = @Content(schema = @Schema(implementation = Bolao.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    public Response desistir(
            @Parameter(description = "Id do bolão") @PathParam("id") Long id,
            @Valid @NotNull DesafioAcaoUsuarioRequest corpo) {
        Bolao bolao = bolaoRepository.findById(id);
        if (bolao == null) {
            throw new RecursoNaoEncontradoException("Bolão", id);
        }
        try {
            bolao.desistirDoBolao(corpo.usuarioId(), carteiraCasaRepository.obterOuCriar());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(bolao).build();
    }

    @POST
    @Path("/{id}/cancelar")
    @Transactional
    @Operation(summary = "Cancela o bolão pelo criador (permitido apenas se ninguém aceitou ou se todos que aceitaram desistiram)")
    @APIResponse(responseCode = "200", description = "Bolão cancelado e saldo do criador estornado",
            content = @Content(schema = @Schema(implementation = Bolao.class)))
    @APIResponse(responseCode = "404", ref = "NaoEncontrado")
    @APIResponse(responseCode = "422", ref = "RegraNegocio")
    public Response cancelar(
            @Parameter(description = "Id do bolão") @PathParam("id") Long id,
            @Valid @NotNull DesafioAcaoUsuarioRequest corpo) {
        Bolao bolao = bolaoRepository.findById(id);
        if (bolao == null) {
            throw new RecursoNaoEncontradoException("Bolão", id);
        }
        try {
            bolao.cancelarPeloCriador(corpo.usuarioId());
        } catch (IllegalArgumentException | IllegalStateException e) {
            throw new RegraNegocioException(e.getMessage());
        }
        return Response.ok(bolao).build();
    }
}
