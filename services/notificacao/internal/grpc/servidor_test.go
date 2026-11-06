package grpc_test

import (
	"context"
	"net"
	"testing"
	"time"

	"github.com/arenapro/notificacao/internal/dominio"
	grpcadapter "github.com/arenapro/notificacao/internal/grpc"
	notificacaov1 "github.com/arenapro/notificacao/internal/pb/palpitearena/notificacao/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/status"
	"google.golang.org/grpc/test/bufconn"
)

const bufSize = 1024 * 1024

// enviadorTeste implementa dominio.EnviadorDeEmail para os testes do adaptador gRPC.
type enviadorTeste struct {
	atraso time.Duration
}

func (e *enviadorTeste) Enviar(ctx context.Context, para, assunto, corpo string) error {
	if e.atraso > 0 {
		select {
		case <-time.After(e.atraso):
		case <-ctx.Done():
			return ctx.Err()
		}
	}
	return nil
}

// buscadorTeste implementa dominio.BuscadorResultadoPartida para os testes do adaptador gRPC.
type buscadorTeste struct{}

func (b *buscadorTeste) BuscarResultado(ctx context.Context, timeCasa, timeFora string) (*dominio.ResultadoPartidaExterno, error) {
	return &dominio.ResultadoPartidaExterno{
		Encontrada:  true,
		Finalizada:  true,
		Placar:      "1x0",
		FonteEvento: timeCasa + " vs " + timeFora,
	}, nil
}

// iniciarServidorBufconn sobe um servidor gRPC real em memoria usando bufconn.
func iniciarServidorBufconn(t *testing.T, enviador dominio.EnviadorDeEmail) *grpc.ClientConn {
	t.Helper()

	lis := bufconn.Listen(bufSize)
	srv := grpc.NewServer()

	servicoDominio := dominio.NovoServicoCompleto(enviador, &buscadorTeste{})
	adaptador := grpcadapter.NovoServidorNotificacao(servicoDominio)
	notificacaov1.RegisterNotificacaoServiceServer(srv, adaptador)

	healthSrv := health.NewServer()
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus(notificacaov1.NotificacaoService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(srv, healthSrv)

	go func() {
		_ = srv.Serve(lis)
	}()

	t.Cleanup(func() {
		srv.GracefulStop()
		_ = lis.Close()
	})

	conn, err := grpc.NewClient(
		"passthrough:///bufnet",
		grpc.WithContextDialer(func(ctx context.Context, _ string) (net.Conn, error) {
			return lis.DialContext(ctx)
		}),
		grpc.WithTransportCredentials(insecure.NewCredentials()),
	)
	if err != nil {
		t.Fatalf("falha ao conectar no bufconn: %v", err)
	}

	t.Cleanup(func() {
		_ = conn.Close()
	})

	return conn
}

func TestServidorGRPC_NotificarComSucesso(t *testing.T) {
	conn := iniciarServidorBufconn(t, &enviadorTeste{})
	cliente := notificacaov1.NewNotificacaoServiceClient(conn)

	resp, err := cliente.NotificarResultadoPalpite(context.Background(), &notificacaov1.NotificarResultadoPalpiteRequest{
		Destinatario:     "joao@email.com",
		Pontos:           10,
		PartidaDescricao: "Flamengo x Vasco",
		Placar:           "2x1",
	})
	if err != nil {
		t.Fatalf("esperava sucesso na chamada gRPC, obteve erro: %v", err)
	}

	if !resp.GetSucesso() {
		t.Errorf("esperava Sucesso=true, obteve false")
	}

	if resp.GetNotificacaoId() == "" {
		t.Errorf("esperava NotificacaoId preenchido, veio vazio")
	}
}

func TestServidorGRPC_ArgumentoInvalidoRetornaInvalidArgument(t *testing.T) {
	conn := iniciarServidorBufconn(t, &enviadorTeste{})
	cliente := notificacaov1.NewNotificacaoServiceClient(conn)

	_, err := cliente.NotificarResultadoPalpite(context.Background(), &notificacaov1.NotificarResultadoPalpiteRequest{
		Destinatario:     "email-invalido",
		Pontos:           10,
		PartidaDescricao: "Flamengo x Vasco",
		Placar:           "2x1",
	})
	if err == nil {
		t.Fatal("esperava erro gRPC para destinatario invalido, mas passou")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("erro nao e um status gRPC: %v", err)
	}

	if st.Code() != codes.InvalidArgument {
		t.Errorf("esperava codigo INVALID_ARGUMENT, obteve: %v", st.Code())
	}
}

func TestServidorGRPC_PrazoExcedidoRetornaDeadlineExceeded(t *testing.T) {
	conn := iniciarServidorBufconn(t, &enviadorTeste{atraso: 200 * time.Millisecond})
	cliente := notificacaov1.NewNotificacaoServiceClient(conn)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()

	_, err := cliente.NotificarResultadoPalpite(ctx, &notificacaov1.NotificarResultadoPalpiteRequest{
		Destinatario:     "joao@email.com",
		Pontos:           5,
		PartidaDescricao: "Flamengo x Vasco",
		Placar:           "1x0",
	})
	if err == nil {
		t.Fatal("esperava erro por timeout, mas passou")
	}

	st, ok := status.FromError(err)
	if !ok {
		t.Fatalf("erro nao e um status gRPC: %v", err)
	}

	if st.Code() != codes.DeadlineExceeded {
		t.Errorf("esperava codigo DEADLINE_EXCEEDED, obteve: %v", st.Code())
	}
}

func TestServidorGRPC_ConsultarResultadoPartidaComSucesso(t *testing.T) {
	conn := iniciarServidorBufconn(t, &enviadorTeste{})
	cliente := notificacaov1.NewNotificacaoServiceClient(conn)

	resp, err := cliente.ConsultarResultadoPartida(context.Background(), &notificacaov1.ConsultarResultadoPartidaRequest{
		TimeCasa: "Flamengo",
		TimeFora: "Vasco",
	})
	if err != nil {
		t.Fatalf("esperava sucesso na consulta de resultado via gRPC, obteve erro: %v", err)
	}

	if !resp.GetEncontrada() || !resp.GetFinalizada() || resp.GetPlacar() != "1x0" {
		t.Errorf("resposta inesperada: %+v", resp)
	}
}

func TestServidorGRPC_HealthCheckServing(t *testing.T) {
	conn := iniciarServidorBufconn(t, &enviadorTeste{})
	healthCliente := healthpb.NewHealthClient(conn)

	resp, err := healthCliente.Check(context.Background(), &healthpb.HealthCheckRequest{})
	if err != nil {
		t.Fatalf("erro ao chamar health check: %v", err)
	}

	if resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
		t.Errorf("esperava status SERVING, obteve: %v", resp.GetStatus())
	}
}
