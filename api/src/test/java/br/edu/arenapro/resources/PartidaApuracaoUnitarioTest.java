package br.edu.arenapro.resources;

import br.edu.arenapro.domain.NotificadorPalpite;
import br.edu.arenapro.domain.Palpite;
import br.edu.arenapro.domain.Partida;
import br.edu.arenapro.domain.StatusPartida;
import br.edu.arenapro.domain.Time;
import br.edu.arenapro.domain.Usuario;
import br.edu.arenapro.repository.PalpiteRepository;
import br.edu.arenapro.repository.PartidaRepository;
import br.edu.arenapro.repository.TimeRepository;
import br.edu.arenapro.resources.dto.PartidaRequest;
import br.edu.arenapro.resources.erro.RecursoNaoEncontradoException;
import br.edu.arenapro.resources.erro.RegraNegocioException;
import jakarta.ws.rs.core.Response;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

/**
 * Testes unitários dos casos de uso de PartidaResource em memória (sem banco e sem Quarkus),
 * usando dublês em memória para repositórios e para a porta NotificadorPalpite.
 */
class PartidaApuracaoUnitarioTest {

    private PartidaResource resource;
    private Map<Long, Time> timesEmMemoria;
    private Map<Long, Partida> partidasEmMemoria;
    private List<Palpite> palpitesEmMemoria;
    private List<Palpite> notificacoesDisparadas;
    private Optional<String> placarExternoSimulado;
    private boolean notificadorDeveFuncionar;

    @BeforeEach
    void configurar() {
        timesEmMemoria = new HashMap<>();
        partidasEmMemoria = new HashMap<>();
        palpitesEmMemoria = new ArrayList<>();
        notificacoesDisparadas = new ArrayList<>();
        placarExternoSimulado = Optional.of("2x1");
        notificadorDeveFuncionar = true;

        Time flamengo = new Time();
        flamengo.setId(1L);
        flamengo.setNome("Flamengo");
        timesEmMemoria.put(1L, flamengo);

        Time vasco = new Time();
        vasco.setId(2L);
        vasco.setNome("Vasco");
        timesEmMemoria.put(2L, vasco);

        Partida partida = new Partida();
        partida.setId(10L);
        partida.setTimeCasa(flamengo);
        partida.setTimeFora(vasco);
        partida.setData(LocalDateTime.of(2026, 11, 15, 16, 0));
        partida.setStatus(StatusPartida.AGENDADA);
        partidasEmMemoria.put(10L, partida);

        resource = new PartidaResource();
        resource.timeRepository = new TimeRepository() {
            @Override
            public Time findById(Long id) {
                return timesEmMemoria.get(id);
            }
        };
        resource.partidaRepository = new PartidaRepository() {
            @Override
            public Partida findById(Long id) {
                return partidasEmMemoria.get(id);
            }
        };
        resource.palpiteRepository = new PalpiteRepository() {
            @Override
            public List<Palpite> listarTodosPorPartida(Long partidaId) {
                return palpitesEmMemoria.stream()
                        .filter(p -> p.getPartida() != null && partidaId.equals(p.getPartida().getId()))
                        .toList();
            }
        };
        resource.notificador = new NotificadorPalpite() {
            @Override
            public boolean notificarResultado(Palpite palpite) {
                if (notificadorDeveFuncionar) {
                    notificacoesDisparadas.add(palpite);
                    return true;
                }
                return false;
            }

            @Override
            public Optional<String> consultarPlacarExterno(Partida p) {
                return placarExternoSimulado;
            }
        };
    }

    private Palpite registrarPalpiteEmMemoria(Long id, String nomeUsuario, String email, String placarPrevisto) {
        Usuario u = new Usuario();
        u.setId(id);
        u.setNome(nomeUsuario);
        u.setEmail(email);
        u.setPontuacaoTotal(0);

        Palpite p = new Palpite();
        p.setId(id);
        p.setUsuario(u);
        p.setPartida(partidasEmMemoria.get(10L));
        p.setPlacarprevisto(placarPrevisto);
        palpitesEmMemoria.add(p);
        return p;
    }

    @Test
    void finalizarPartidaCalculaPontosAtualizaUsuariosEDisparaNotificacoes() {
        Palpite pCravado = registrarPalpiteEmMemoria(1L, "Maria", "maria@ufrn.br", "2x1");
        Palpite pVencedor = registrarPalpiteEmMemoria(2L, "João", "joao@ufrn.br", "1x0");
        Palpite pErrado = registrarPalpiteEmMemoria(3L, "Pedro", "pedro@ufrn.br", "0x2");

        PartidaRequest req = new PartidaRequest(
                1L, 2L, LocalDateTime.of(2026, 11, 15, 16, 0), "2x1", StatusPartida.FINALIZADA);

        Response resp = resource.atualizar(10L, req);

        assertEquals(200, resp.getStatus());
        assertEquals(3, pCravado.getPontosObtidos());
        assertEquals(3, pCravado.getUsuario().getPontuacaoTotal());
        assertEquals(1, pVencedor.getPontosObtidos());
        assertEquals(1, pVencedor.getUsuario().getPontuacaoTotal());
        assertEquals(0, pErrado.getPontosObtidos());
        assertEquals(0, pErrado.getUsuario().getPontuacaoTotal());
        assertEquals(3, notificacoesDisparadas.size());
    }

    @Test
    void falhaNoNotificadorNaoImpedeFinalizacaoEApuracaoDaPartida() {
        notificadorDeveFuncionar = false;
        Palpite pCravado = registrarPalpiteEmMemoria(1L, "Maria", "maria@ufrn.br", "2x1");

        PartidaRequest req = new PartidaRequest(
                1L, 2L, LocalDateTime.of(2026, 11, 15, 16, 0), "2x1", StatusPartida.FINALIZADA);

        Response resp = resource.atualizar(10L, req);

        assertEquals(200, resp.getStatus());
        assertEquals(3, pCravado.getPontosObtidos());
        assertEquals(3, pCravado.getUsuario().getPontuacaoTotal());
        assertEquals(0, notificacoesDisparadas.size());
    }

    @Test
    void apurarResultadoExternoFinalizaPartidaEPontuaPalpites() {
        placarExternoSimulado = Optional.of("1x0");
        Palpite pCravado = registrarPalpiteEmMemoria(1L, "Maria", "maria@ufrn.br", "1x0");

        Response resp = resource.apurarResultadoExterno(10L);

        assertEquals(200, resp.getStatus());
        Partida atualizada = (Partida) resp.getEntity();
        assertEquals(StatusPartida.FINALIZADA, atualizada.getStatus());
        assertEquals("1x0", atualizada.getPlacar());
        assertEquals(3, pCravado.getPontosObtidos());
        assertEquals(1, notificacoesDisparadas.size());
    }

    @Test
    void apurarResultadoExternoSemPlacarNaApiExternaLancaRegraNegocioException() {
        placarExternoSimulado = Optional.empty();

        assertThrows(RegraNegocioException.class, () -> resource.apurarResultadoExterno(10L));
    }

    @Test
    void timesIguaisNaPartidaLancamRegraNegocioException() {
        PartidaRequest req = new PartidaRequest(
                1L, 1L, LocalDateTime.of(2026, 11, 15, 16, 0), null, StatusPartida.AGENDADA);

        assertThrows(RegraNegocioException.class, () -> resource.atualizar(10L, req));
    }

    @Test
    void buscarPartidaInexistenteLancaRecursoNaoEncontradoException() {
        assertThrows(RecursoNaoEncontradoException.class, () -> resource.buscarporId(9999L));
    }
}
