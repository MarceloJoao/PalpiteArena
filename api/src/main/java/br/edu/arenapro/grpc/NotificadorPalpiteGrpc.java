package br.edu.arenapro.grpc;

import br.edu.arenapro.domain.Bolao;
import br.edu.arenapro.domain.BolaoParticipante;
import br.edu.arenapro.domain.DesafioX1;
import br.edu.arenapro.domain.NotificadorPalpite;
import br.edu.arenapro.domain.Palpite;
import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.StatusBolao;
import br.edu.arenapro.domain.StatusDesafio;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.notificacao.v1.ConsultarResultadoPartidaRequest;
import br.edu.arenapro.notificacao.v1.ConsultarResultadoPartidaResponse;
import br.edu.arenapro.notificacao.v1.NotificacaoServiceGrpc;
import br.edu.arenapro.notificacao.v1.NotificacaoServiceGrpc.NotificacaoServiceBlockingStub;
import br.edu.arenapro.notificacao.v1.NotificarResultadoPalpiteRequest;
import br.edu.arenapro.notificacao.v1.NotificarResultadoPalpiteResponse;
import io.grpc.Channel;
import io.grpc.StatusRuntimeException;
import io.quarkus.grpc.GrpcClient;
import jakarta.enterprise.context.ApplicationScoped;
import java.time.Duration;
import java.util.Optional;
import java.util.concurrent.TimeUnit;
import org.jboss.logging.Logger;

/**
 * Adaptador da porta NotificadorPalpite: chama o microsserviço Go por gRPC sempre com prazo.
 * Se o serviço Go falhar, estiver fora do ar (UNAVAILABLE) ou exceder o prazo (DEADLINE_EXCEEDED),
 * registra no log e devolve false / Optional.empty() para que a API continue respondendo normalmente.
 */
@ApplicationScoped
public class NotificadorPalpiteGrpc implements NotificadorPalpite {

    private static final Logger LOG = Logger.getLogger(NotificadorPalpiteGrpc.class);

    @GrpcClient("notificacao")
    NotificacaoServiceBlockingStub stub;

    private Duration prazo = Duration.ofSeconds(8);

    public NotificadorPalpiteGrpc() {
    }

    public NotificadorPalpiteGrpc(Channel canal, Duration prazo) {
        this.stub = NotificacaoServiceGrpc.newBlockingStub(canal);
        this.prazo = prazo;
    }

    @Override
    public boolean notificarResultado(Palpite palpite) {
        if (palpite == null || palpite.getUsuario() == null || palpite.getPartida() == null) {
            return false;
        }
        Usuario usuario = palpite.getUsuario();
        Partida partida = palpite.getPartida();
        String destinatario = usuario.getEmail() != null ? usuario.getEmail() : "";
        int pontos = palpite.getPontosObtidos() != null ? palpite.getPontosObtidos() : 0;
        String descricaoPartida = partida.getDescricao();
        String placar = partida.getPlacar() != null ? partida.getPlacar() : "";

        try {
            NotificarResultadoPalpiteResponse resposta = stub
                    .withDeadlineAfter(prazo.toMillis(), TimeUnit.MILLISECONDS)
                    .notificarResultadoPalpite(NotificarResultadoPalpiteRequest.newBuilder()
                            .setDestinatario(destinatario)
                            .setPontos(pontos)
                            .setPartidaDescricao(descricaoPartida)
                            .setPlacar(placar)
                            .build());
            LOG.infof("notificação do palpite %s enviada (id=%s, sucesso=%s)",
                    palpite.getId(), resposta.getNotificacaoId(), resposta.getSucesso());
            return resposta.getSucesso();
        } catch (StatusRuntimeException e) {
            LOG.warnf("notificação do palpite %s não enviada: %s",
                    palpite.getId(), e.getStatus().getCode());
            return false;
        }
    }

    @Override
    public boolean notificarConviteDesafio(DesafioX1 desafio) {
        if (desafio == null || desafio.getDesafiado() == null || desafio.getDesafiante() == null) {
            return false;
        }
        String destinatario = desafio.getDesafiado().getEmail() != null ? desafio.getDesafiado().getEmail() : "";
        String nomeDesafiante = desafio.getDesafiante().getNome() != null ? desafio.getDesafiante().getNome() : "Um usuário";
        String descricaoPartida = desafio.getPartida() != null ? desafio.getPartida().getDescricao() : "Partida";
        String mensagemConvite = String.format(
                "CONVITE DESAFIO X1: O usuário %s está lhe desafiando para uma aposta de R$ %s em %s, entre na plataforma e veja o convite.",
                nomeDesafiante, desafio.getValor(), descricaoPartida);

        try {
            NotificarResultadoPalpiteResponse resposta = stub
                    .withDeadlineAfter(prazo.toMillis(), TimeUnit.MILLISECONDS)
                    .notificarResultadoPalpite(NotificarResultadoPalpiteRequest.newBuilder()
                            .setDestinatario(destinatario)
                            .setPontos(0)
                            .setPartidaDescricao(mensagemConvite)
                            .setPlacar(desafio.getOpcaoDesafiante() != null ? desafio.getOpcaoDesafiante().name() : "X1")
                            .build());
            LOG.infof("convite do desafio %s enviado por e-mail via Go/gRPC para %s (id=%s)",
                    desafio.getId(), destinatario, resposta.getNotificacaoId());
            return resposta.getSucesso();
        } catch (StatusRuntimeException e) {
            LOG.warnf("convite do desafio %s não enviado via gRPC: %s",
                    desafio.getId(), e.getStatus().getCode());
            return false;
        }
    }

    @Override
    public boolean notificarCadastroUsuario(Usuario usuario) {
        if (usuario == null || usuario.getEmail() == null || usuario.getEmail().isBlank()) {
            return false;
        }
        String nome = usuario.getNome() != null ? usuario.getNome() : "Torcedor";
        String mensagem = String.format(
                "CADASTRO: Olá, %s! Sua conta (%s) foi criada com sucesso na PalpiteArena com perfil %s. Acesse a plataforma para participar dos Desafios X1, Bolões e Palpites!",
                nome, usuario.getEmail(), usuario.obterPapel());
        return dispararMensagemGrpc(usuario.getEmail(), 0, mensagem, "CADASTRO");
    }

    @Override
    public boolean notificarResultadoDesafio(DesafioX1 desafio) {
        if (desafio == null || desafio.getStatus() != StatusDesafio.FINALIZADO) {
            return false;
        }
        String descricaoPartida = desafio.getPartida() != null ? desafio.getPartida().getDescricao() : "Partida";
        String placar = desafio.getPartida() != null && desafio.getPartida().getPlacar() != null
                ? desafio.getPartida().getPlacar()
                : "FINAL";
        String nomeVencedor = desafio.getVencedor() != null
                ? desafio.getVencedor().getNome()
                : "Nenhum (Reembolso com taxa de 2,5%)";

        String msg = String.format(
                "RESULTADO DESAFIO X1: A partida %s terminou (%s). Valor apostado: R$ %s. Vencedor do Desafio X1: %s (Prêmio líquido: R$ %s).",
                descricaoPartida, placar, desafio.getValor(), nomeVencedor, desafio.getPremioVencedor());

        boolean okA = false;
        boolean okB = false;
        if (desafio.getDesafiante() != null && desafio.getDesafiante().getEmail() != null) {
            okA = dispararMensagemGrpc(desafio.getDesafiante().getEmail(), 0, msg, placar);
        }
        if (desafio.getDesafiado() != null && desafio.getDesafiado().getEmail() != null) {
            okB = dispararMensagemGrpc(desafio.getDesafiado().getEmail(), 0, msg, placar);
        }
        return okA || okB;
    }

    @Override
    public boolean notificarConviteBolao(Bolao bolao, Usuario convidado) {
        if (bolao == null || convidado == null || convidado.getEmail() == null || convidado.getEmail().isBlank()) {
            return false;
        }
        String nomeCriador = bolao.getCriador() != null && bolao.getCriador().getNome() != null
                ? bolao.getCriador().getNome()
                : "Um usuário";
        int qtdPartidas = bolao.getPartidas() != null ? bolao.getPartidas().size() : 0;
        String msg = String.format(
                "CONVITE BOLAO: Olá, %s! O usuário %s convidou você para o Bolão #%s (%d partida(s), valor da cota: R$ %s). Acesse a aba 'Meus Bolões' na PalpiteArena para aceitar e registrar seus placares!",
                convidado.getNome(), nomeCriador, bolao.getId(), qtdPartidas, bolao.getValorCota());
        return dispararMensagemGrpc(convidado.getEmail(), qtdPartidas, msg, "BOLAO");
    }

    @Override
    public boolean notificarResultadoBolao(Bolao bolao) {
        if (bolao == null || bolao.getStatus() != StatusBolao.FINALIZADO || bolao.getParticipantes() == null) {
            return false;
        }
        String nomeVencedor = bolao.getVencedor() != null && bolao.getVencedor().getNome() != null
                ? bolao.getVencedor().getNome()
                : "Empate / Dividido entre os primeiros colocados";
        boolean algumEnviado = false;
        for (BolaoParticipante part : bolao.getParticipantes()) {
            Usuario u = part.getUsuario();
            if (u == null || u.getEmail() == null || u.getEmail().isBlank()) {
                continue;
            }
            int pts = part.getPontosTotais() != null ? part.getPontosTotais() : 0;
            String msg = String.format(
                    "RESULTADO BOLAO: O Bolão #%s foi encerrado! Você somou %d ponto(s). Vencedor(a): %s | Prêmio líquido (90%% do pote): R$ %s.",
                    bolao.getId(), pts, nomeVencedor, bolao.getPremioVencedor());
            if (dispararMensagemGrpc(u.getEmail(), pts, msg, "BOLAO")) {
                algumEnviado = true;
            }
        }
        return algumEnviado;
    }

    private boolean dispararMensagemGrpc(String destinatario, int pontos, String descricao, String placar) {
        try {
            NotificarResultadoPalpiteResponse resposta = stub
                    .withDeadlineAfter(prazo.toMillis(), TimeUnit.MILLISECONDS)
                    .notificarResultadoPalpite(NotificarResultadoPalpiteRequest.newBuilder()
                            .setDestinatario(destinatario)
                            .setPontos(pontos)
                            .setPartidaDescricao(descricao)
                            .setPlacar(placar != null ? placar : "")
                            .build());
            LOG.infof("e-mail enviado via Go/gRPC para %s (id=%s, sucesso=%s)",
                    destinatario, resposta.getNotificacaoId(), resposta.getSucesso());
            return resposta.getSucesso();
        } catch (StatusRuntimeException e) {
            LOG.warnf("e-mail para %s não enviado via gRPC: %s",
                    destinatario, e.getStatus().getCode());
            return false;
        }
    }

    @Override
    public Optional<String> consultarPlacarExterno(Partida partida) {
        if (partida == null || partida.getTimeCasa() == null || partida.getTimeFora() == null) {
            return Optional.empty();
        }
        String timeCasa = partida.getTimeCasa().getNome() != null ? partida.getTimeCasa().getNome() : "";
        String timeFora = partida.getTimeFora().getNome() != null ? partida.getTimeFora().getNome() : "";

        try {
            ConsultarResultadoPartidaResponse resposta = stub
                    .withDeadlineAfter(prazo.toMillis(), TimeUnit.MILLISECONDS)
                    .consultarResultadoPartida(ConsultarResultadoPartidaRequest.newBuilder()
                            .setTimeCasa(timeCasa)
                            .setTimeFora(timeFora)
                            .build());
            if (resposta.getEncontrada() && resposta.getFinalizada() && !resposta.getPlacar().isBlank()) {
                LOG.infof("placar externo obtido para %s x %s: %s (%s)",
                        timeCasa, timeFora, resposta.getPlacar(), resposta.getFonteEvento());
                return Optional.of(resposta.getPlacar());
            }
            return Optional.empty();
        } catch (StatusRuntimeException e) {
            LOG.warnf("consulta externa de placar para %s x %s falhou: %s",
                    timeCasa, timeFora, e.getStatus().getCode());
            return Optional.empty();
        }
    }
}
