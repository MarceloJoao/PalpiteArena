package br.edu.arenapro.grpc;

import br.edu.arenapro.domain.Palpite;
import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.StatusPartida;
import br.edu.arenapro.domain.Time;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.notificacao.v1.NotificacaoServiceGrpc.NotificacaoServiceImplBase;
import br.edu.arenapro.notificacao.v1.NotificarResultadoPalpiteRequest;
import br.edu.arenapro.notificacao.v1.NotificarResultadoPalpiteResponse;
import io.grpc.ManagedChannel;
import io.grpc.Server;
import io.grpc.Status;
import io.grpc.inprocess.InProcessChannelBuilder;
import io.grpc.inprocess.InProcessServerBuilder;
import io.grpc.stub.StreamObserver;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

/**
 * Testa o adaptador gRPC (NotificadorPalpiteGrpc) contra servidores gRPC em memória:
 * caso de sucesso, serviço lento (estouro de prazo / DEADLINE_EXCEEDED), erro de validação
 * (INVALID_ARGUMENT) e serviço Go fora do ar (UNAVAILABLE).
 */
class NotificadorPalpiteGrpcTest {

    private final List<Server> servidores = new ArrayList<>();
    private final List<ManagedChannel> canais = new ArrayList<>();

    private NotificadorPalpiteGrpc criarClienteParaServidor(String nome, NotificacaoServiceImplBase servico)
            throws IOException {
        Server servidor = InProcessServerBuilder.forName(nome)
                .addService(servico)
                .build()
                .start();
        servidores.add(servidor);
        ManagedChannel canal = InProcessChannelBuilder.forName(nome).build();
        canais.add(canal);
        return new NotificadorPalpiteGrpc(canal, Duration.ofMillis(300));
    }

    private static Palpite criarPalpiteDeExemplo() {
        Time casa = new Time();
        casa.setId(1L);
        casa.setNome("Flamengo");

        Time fora = new Time();
        fora.setId(2L);
        fora.setNome("Vasco");

        Partida partida = new Partida();
        partida.setId(10L);
        partida.setTimeCasa(casa);
        partida.setTimeFora(fora);
        partida.setPlacar("2x1");
        partida.setStatus(StatusPartida.FINALIZADA);

        Usuario usuario = new Usuario();
        usuario.setId(5L);
        usuario.setNome("Maria");
        usuario.setEmail("maria@email.com");

        Palpite palpite = new Palpite();
        palpite.setId(99L);
        palpite.setUsuario(usuario);
        palpite.setPartida(partida);
        palpite.setPlacarprevisto("2x1");
        palpite.calcularPontos("2x1");
        return palpite;
    }

    @AfterEach
    void encerrarRecursos() {
        for (ManagedChannel canal : canais) {
            canal.shutdownNow();
        }
        for (Server servidor : servidores) {
            servidor.shutdownNow();
        }
    }

    @Test
    void notificacaoEntregueDevolveTrueEEnviaDadosCorretos() throws IOException {
        AtomicReference<NotificarResultadoPalpiteRequest> recebido = new AtomicReference<>();
        NotificadorPalpiteGrpc cliente = criarClienteParaServidor("notificacao-ok", new NotificacaoServiceImplBase() {
            @Override
            public void notificarResultadoPalpite(
                    NotificarResultadoPalpiteRequest request,
                    StreamObserver<NotificarResultadoPalpiteResponse> responseObserver) {
                recebido.set(request);
                responseObserver.onNext(NotificarResultadoPalpiteResponse.newBuilder()
                        .setNotificacaoId("notif-123")
                        .setSucesso(true)
                        .setMensagem("Notificacao enviada")
                        .build());
                responseObserver.onCompleted();
            }
        });

        boolean enviado = cliente.notificarResultado(criarPalpiteDeExemplo());

        assertTrue(enviado);
        assertNotNull(recebido.get());
        assertEquals("maria@email.com", recebido.get().getDestinatario());
        assertEquals(3, recebido.get().getPontos());
        assertEquals("Flamengo x Vasco", recebido.get().getPartidaDescricao());
        assertEquals("2x1", recebido.get().getPlacar());
    }

    @Test
    void servicoLentoEstouraPrazoEDevolveFalseSemTravar() throws IOException {
        NotificadorPalpiteGrpc cliente = criarClienteParaServidor("notificacao-lenta", new NotificacaoServiceImplBase() {
            @Override
            public void notificarResultadoPalpite(
                    NotificarResultadoPalpiteRequest request,
                    StreamObserver<NotificarResultadoPalpiteResponse> responseObserver) {
                try {
                    Thread.sleep(5_000);
                } catch (InterruptedException ignored) {
                    Thread.currentThread().interrupt();
                }
            }
        });

        long inicio = System.nanoTime();
        boolean enviado = cliente.notificarResultado(criarPalpiteDeExemplo());
        long duracaoMs = Duration.ofNanos(System.nanoTime() - inicio).toMillis();

        assertFalse(enviado);
        assertTrue(duracaoMs < 2_000, "Levou " + duracaoMs + " ms: o prazo de 300 ms não foi respeitado");
    }

    @Test
    void erroDeArgumentoInvalidoDevolveFalseSemExcecao() throws IOException {
        NotificadorPalpiteGrpc cliente = criarClienteParaServidor("notificacao-invalida", new NotificacaoServiceImplBase() {
            @Override
            public void notificarResultadoPalpite(
                    NotificarResultadoPalpiteRequest request,
                    StreamObserver<NotificarResultadoPalpiteResponse> responseObserver) {
                responseObserver.onError(Status.INVALID_ARGUMENT
                        .withDescription("destinatario invalido")
                        .asRuntimeException());
            }
        });

        assertFalse(cliente.notificarResultado(criarPalpiteDeExemplo()));
    }

    @Test
    void servicoForaDoArDevolveFalseSemDerrubarRequisicao() {
        ManagedChannel canalSemServidor = InProcessChannelBuilder.forName("servidor-inexistente").build();
        canais.add(canalSemServidor);
        NotificadorPalpiteGrpc cliente = new NotificadorPalpiteGrpc(canalSemServidor, Duration.ofMillis(300));

        assertFalse(cliente.notificarResultado(criarPalpiteDeExemplo()));
    }
}
