package grpc

import (
	"context"
	"errors"

	"github.com/arenapro/notificacao/internal/dominio"
	notificacaov1 "github.com/arenapro/notificacao/internal/pb/palpitearena/notificacao/v1"
	"google.golang.org/grpc/codes"
	"google.golang.org/grpc/status"
)

// ServidorNotificacao e o adaptador gRPC que traduz entre o contrato Protobuf e o dominio.
type ServidorNotificacao struct {
	notificacaov1.UnimplementedNotificacaoServiceServer
	servico *dominio.ServicoNotificacao
}

// NovoServidorNotificacao cria uma nova instancia do adaptador gRPC sobre o servico de dominio.
func NovoServidorNotificacao(servico *dominio.ServicoNotificacao) *ServidorNotificacao {
	return &ServidorNotificacao{
		servico: servico,
	}
}

// NotificarResultadoPalpite recebe a requisicao gRPC, delega ao dominio e traduz erros em codigos gRPC.
func (s *ServidorNotificacao) NotificarResultadoPalpite(
	ctx context.Context,
	req *notificacaov1.NotificarResultadoPalpiteRequest,
) (*notificacaov1.NotificarResultadoPalpiteResponse, error) {
	if req == nil {
		return nil, status.Error(codes.InvalidArgument, "requisicao nao pode ser nula")
	}

	notif, err := s.servico.NotificarResultadoPalpite(
		ctx,
		req.GetDestinatario(),
		int(req.GetPontos()),
		req.GetPartidaDescricao(),
		req.GetPlacar(),
	)
	if err != nil {
		return nil, traduzirErro(err)
	}

	return &notificacaov1.NotificarResultadoPalpiteResponse{
		NotificacaoId: notif.ID,
		Sucesso:       true,
		Mensagem:      "Notificacao processada e enviada com sucesso",
	}, nil
}

// traduzirErro converte erros do dominio em codigos de status gRPC padronizados.
func traduzirErro(err error) error {
	switch {
	case errors.Is(err, dominio.ErrDestinatarioInvalido),
		errors.Is(err, dominio.ErrAssuntoVazio),
		errors.Is(err, dominio.ErrMensagemVazia):
		return status.Error(codes.InvalidArgument, err.Error())

	case errors.Is(err, context.DeadlineExceeded),
		errors.Is(err, dominio.ErrPrazoExcedido):
		return status.Error(codes.DeadlineExceeded, err.Error())

	case errors.Is(err, context.Canceled):
		return status.Error(codes.Canceled, err.Error())

	default:
		return status.Error(codes.Internal, "erro interno ao processar notificacao")
	}
}
