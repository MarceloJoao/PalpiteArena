package br.edu.arenapro.grpc;

import br.edu.arenapro.domain.NotificadorPalpite;
import br.edu.arenapro.domain.Palpite;
import br.edu.arenapro.domain.Partida;
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

    private Duration prazo = Duration.ofSeconds(3);

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
