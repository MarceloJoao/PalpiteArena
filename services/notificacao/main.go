package main

import (
	"fmt"
	"log"
	"net"
	"os"
	"os/signal"
	"syscall"

	"github.com/arenapro/notificacao/internal/dominio"
	grpcadapter "github.com/arenapro/notificacao/internal/grpc"
	"github.com/arenapro/notificacao/internal/infra"
	notificacaov1 "github.com/arenapro/notificacao/internal/pb/palpitearena/notificacao/v1"
	"google.golang.org/grpc"
	"google.golang.org/grpc/health"
	healthpb "google.golang.org/grpc/health/grpc_health_v1"
	"google.golang.org/grpc/reflection"
)

func main() {
	porta := os.Getenv("PORT")
	if porta == "" {
		porta = "8081"
	}

	ouvinte, err := net.Listen("tcp", fmt.Sprintf(":%s", porta))
	if err != nil {
		log.Fatalf("erro ao abrir porta %s: %v", porta, err)
	}

	servidorGRPC := grpc.NewServer()

	// 1. Injecao de dependencias: Infra -> Dominio -> Adaptador gRPC
	enviador := infra.NovoEnviadorConsole()
	servicoDominio := dominio.NovoServicoNotificacao(enviador)
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

	log.Printf("Servico de notificacoes gRPC escutando em :%s", porta)
	if err := servidorGRPC.Serve(ouvinte); err != nil {
		log.Fatalf("erro no servidor gRPC: %v", err)
	}
}
