package main

import (
	"context"
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/arenapro/notificacao/internal/dominio"
	grpcadapter "github.com/arenapro/notificacao/internal/grpc"
	"github.com/arenapro/notificacao/internal/infra"
	notificacaov1 "github.com/arenapro/notificacao/internal/pb/palpitearena/notificacao/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/credentials/insecure"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

func main() {
	porta := os.Getenv("PORT")
	if porta == "" {
		porta = "8081"
	}

	// Subcomando usado pelo healthcheck do Docker Compose ("/notificacao saude")
	if len(os.Args) > 1 && os.Args[1] == "saude" {
		os.Exit(verificarSaude(porta))
	}

	ouvinte, err := net.Listen("tcp", fmt.Sprintf(":%s", porta))
	if err != nil {
		log.Fatalf("erro ao abrir porta %s: %v", porta, err)
	}

	servidorGRPC := grpc.NewServer()

	// 1. Injecao de dependencias: Infra (Console + API Externa TheSportsDB) -> Dominio -> Adaptador gRPC
	enviador := infra.NovoEnviadorConsole()
	buscador := infra.NovoBuscadorTheSportsDB(os.Getenv("SPORTSDB_API_URL"))
	servicoDominio := dominio.NovoServicoCompleto(enviador, buscador)
	adaptador := grpcadapter.NovoServidorNotificacao(servicoDominio)
	notificacaov1.RegisterNotificacaoServiceServer(servidorGRPC, adaptador)

	// 2. Registro de Health Check padrao gRPC (retorna SERVING)
	healthSrv := health.NewServer()
	healthSrv.SetServingStatus("", healthpb.HealthCheckResponse_SERVING)
	healthSrv.SetServingStatus(notificacaov1.NotificacaoService_ServiceDesc.ServiceName, healthpb.HealthCheckResponse_SERVING)
	healthpb.RegisterHealthServer(servidorGRPC, healthSrv)

	// 3. Registro de Reflection para permitir inspecao com grpcurl
	reflection.Register(servidorGRPC)

	// 4. Encerramento gracioso (GracefulStop) ao receber SIGINT ou SIGTERM
	sinais := make(chan os.Signal, 1)
	signal.Notify(sinais, os.Interrupt, syscall.SIGTERM)

	go func() {
		sig := <-sinais
		log.Printf("sinal recebido (%v), encerrando servidor gRPC com GracefulStop...", sig)
		healthSrv.Shutdown()
		servidorGRPC.GracefulStop()
	}()

	log.Printf("Servico de notificacoes e resultados gRPC escutando em :%s", porta)
	if err := servidorGRPC.Serve(ouvinte); err != nil {
		log.Fatalf("erro no servidor gRPC: %v", err)
	}
}

func verificarSaude(porta string) int {
	ctx, cancelar := context.WithTimeout(context.Background(), 2*time.Second)
	defer cancelar()

	conn, err := grpc.NewClient("localhost:"+porta, grpc.WithTransportCredentials(insecure.NewCredentials()))
	if err != nil {
		return 1
	}
	defer conn.Close()

	resp, err := healthpb.NewHealthClient(conn).Check(ctx, &healthpb.HealthCheckRequest{})
	if err != nil || resp.GetStatus() != healthpb.HealthCheckResponse_SERVING {
		return 1
	}
	return 0
}
