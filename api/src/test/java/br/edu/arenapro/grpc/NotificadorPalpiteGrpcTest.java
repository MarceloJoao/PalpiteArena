package br.edu.arenapro.grpc;

import br.edu.arenapro.domain.Palpite;
import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.StatusPartida;
import br.edu.arenapro.domain.Time;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.notificacao.v1.ConsultarResultadoPartidaRequest;
import br.edu.arenapro.notificacao.v1.ConsultarResultadoPartidaResponse;
import br.edu.arenapro.notificacao.v1.NotificacaoServiceGrpc.NotificacaoServiceImplBase;
import br.edu.arenapro.notificacao.v1.NotificarResultadoPalpiteRequest;
import br.edu.arenapro.notificacao.v1.NotificarResultadoPalpiteResponse;
import io.grpc.ManagedChannel;
import io.grpc.ManagedChannelBuilder;
import io.grpc.Server;
import io.grpc.Status;
import io.grpc.inprocess.InProcessChannelBuilder;
import io.grpc.inprocess.InProcessServerBuilder;
import io.grpc.stub.StreamObserver;
import java.io.IOException;
import java.time.Duration;
import java.util.ArrayList;
import java.util.List;
import java.util.Optional;
import java.util.concurrent.atomic.AtomicReference;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

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

    @Test
    void consultarPlacarExternoDevolvePlacarQuandoPartidaFinalizada() throws IOException {
        AtomicReference<ConsultarResultadoPartidaRequest> recebido = new AtomicReference<>();
        NotificadorPalpiteGrpc cliente = criarClienteParaServidor("resultado-externo-ok", new NotificacaoServiceImplBase() {
            @Override
            public void consultarResultadoPartida(
                    ConsultarResultadoPartidaRequest request,
                    StreamObserver<ConsultarResultadoPartidaResponse> responseObserver) {
                recebido.set(request);
                responseObserver.onNext(ConsultarResultadoPartidaResponse.newBuilder()
                        .setEncontrada(true)
                        .setFinalizada(true)
                        .setPlacar("1x0")
                        .setFonteEvento("Flamengo vs Vasco da Gama (2026-01-22)")
                        .build());
                responseObserver.onCompleted();
            }
        });

        Optional<String> placar = cliente.consultarPlacarExterno(criarPalpiteDeExemplo().getPartida());

        assertTrue(placar.isPresent());
        assertEquals("1x0", placar.get());
        assertNotNull(recebido.get());
        assertEquals("Flamengo", recebido.get().getTimeCasa());
        assertEquals("Vasco", recebido.get().getTimeFora());
    }

    @Test
    @EnabledIfEnvironmentVariable(named = "E2E_LIVE", matches = "true")
    void fluxoPraticoRealComServidorGoEApiExternaTheSportsDB() {
        ManagedChannel canalReal = ManagedChannelBuilder.forAddress("localhost", 8081)
                .usePlaintext()
                .build();
        canais.add(canalReal);
        NotificadorPalpiteGrpc clienteReal = new NotificadorPalpiteGrpc(canalReal, Duration.ofSeconds(8));

        Time flamengo = new Time();
        flamengo.setId(1L);
        flamengo.setNome("Flamengo");

        Time vasco = new Time();
        vasco.setId(2L);
        vasco.setNome("Vasco");

        Partida partida = new Partida();
        partida.setId(100L);
        partida.setTimeCasa(flamengo);
        partida.setTimeFora(vasco);
        partida.setStatus(StatusPartida.AGENDADA);

        Usuario joao = new Usuario();
        joao.setId(1L);
        joao.setNome("Joao Marcelo");
        joao.setEmail("joao@ufrn.br");
        joao.setPontuacaoTotal(0);

        Usuario antonnione = new Usuario();
        antonnione.setId(2L);
        antonnione.setNome("Antonnione");
        antonnione.setEmail("antonnione@ufrn.br");
        antonnione.setPontuacaoTotal(0);

        Usuario pedro = new Usuario();
        pedro.setId(3L);
        pedro.setNome("Pedro");
        pedro.setEmail("pedro@ufrn.br");
        pedro.setPontuacaoTotal(0);

        Palpite palpiteExato = new Palpite();
        palpiteExato.setId(101L);
        palpiteExato.setUsuario(joao);
        palpiteExato.setPartida(partida);
        palpiteExato.setPlacarprevisto("1x0");

        Palpite palpiteVencedor = new Palpite();
        palpiteVencedor.setId(102L);
        palpiteVencedor.setUsuario(antonnione);
        palpiteVencedor.setPartida(partida);
        palpiteVencedor.setPlacarprevisto("2x0");

        Palpite palpiteErrado = new Palpite();
        palpiteErrado.setId(103L);
        palpiteErrado.setUsuario(pedro);
        palpiteErrado.setPartida(partida);
        palpiteErrado.setPlacarprevisto("0x2");

        List<Palpite> palpites = List.of(palpiteExato, palpiteVencedor, palpiteErrado);

        System.out.println("\n==================================================================");
        System.out.println("1. PARTIDA CRIADA (ANTES DA APURACAO): " + partida.getDescricao()
                + " | Status: " + partida.getStatus() + " | Placar: " + partida.getPlacar());
        for (Palpite p : palpites) {
            System.out.println("   -> Palpite #" + p.getId() + " de " + p.getUsuario().getNome()
                    + ": prevê " + p.getPlacarprevisto() + " (Pontos atuais: " + p.getPontosObtidos() + ")");
        }

        System.out.println("\n2. CONSULTANDO RESULTADO OFICIAL NA API EXTERNA (TheSportsDB) VIA gRPC (Go)...");
        Optional<String> placarExternoOpt = clienteReal.consultarPlacarExterno(partida);
        assertTrue(placarExternoOpt.isPresent(), "Deveria ter obtido o placar real da TheSportsDB via servico Go");

        String placarOficial = placarExternoOpt.get();
        partida.setPlacar(placarOficial);
        partida.setStatus(StatusPartida.FINALIZADA);
        System.out.println("   -> Placar oficial retornado pela TheSportsDB: " + placarOficial);
        System.out.println("   -> Partida atualizada: " + partida.getDescricao()
                + " | Status: " + partida.getStatus() + " | Placar Oficial: " + partida.getPlacar());

        System.out.println("\n3. APURANDO PONTOS DOS PALPITES E ENVIANDO NOTIFICACOES VIA gRPC (Go)...");
        for (Palpite p : palpites) {
            int pontos = p.calcularPontos(partida.getPlacar());
            p.getUsuario().setPontuacaoTotal(p.getUsuario().getPontuacaoTotal() + pontos);
            boolean notificado = clienteReal.notificarResultado(p);
            assertTrue(notificado, "Notificacao gRPC deveria ter sido confirmada pelo servico Go");
            System.out.println("   -> Usuario: " + p.getUsuario().getNome()
                    + " | Palpite: " + p.getPlacarprevisto()
                    + " | Placar Real: " + partida.getPlacar()
                    + " | Pontos Obtidos: " + p.getPontosObtidos()
                    + " | Pontuacao Total: " + p.getUsuario().getPontuacaoTotal()
                    + " | Notificado via gRPC: " + notificado);
        }
        System.out.println("==================================================================\n");

        assertEquals(3, palpiteExato.getPontosObtidos());
        assertEquals(1, palpiteVencedor.getPontosObtidos());
        assertEquals(0, palpiteErrado.getPontosObtidos());
    }
}
