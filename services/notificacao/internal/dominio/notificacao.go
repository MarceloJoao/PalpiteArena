package dominio

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Erros de dominio nomeados (sentinel errors)
var (
	ErrDestinatarioInvalido  = errors.New("destinatario invalido ou vazio")
	ErrAssuntoVazio          = errors.New("assunto nao pode ser vazio")
	ErrMensagemVazia         = errors.New("mensagem nao pode ser vazia")
	ErrEnvioFalhou           = errors.New("falha ao despachar notificacao")
	ErrPrazoExcedido         = errors.New("tempo limite excedido para operacao")
	ErrTimesInvalidos        = errors.New("nomes dos times da casa e de fora sao obrigatorios")
	ErrConsultaExternaFalhou = errors.New("falha ao consultar resultado na API externa")
)

// TipoNotificacao define a categoria do evento disparado
type TipoNotificacao string

const (
	TipoResultadoPalpite TipoNotificacao = "RESULTADO_PALPITE"
	TipoInicioPartida    TipoNotificacao = "INICIO_PARTIDA"
)

// Notificacao representa a entidade central do servico de notificacoes
type Notificacao struct {
	ID           string
	Destinatario string
	Assunto      string
	Mensagem     string
	Tipo         TipoNotificacao
	EnviadaEm    time.Time
}

// ResultadoPartidaExterno representa o resultado oficial obtido de uma fonte externa de esportes
type ResultadoPartidaExterno struct {
	Encontrada  bool
	Finalizada  bool
	Placar      string
	FonteEvento string
}

// EnviadorDeEmail e a porta de saida para envio de e-mail
type EnviadorDeEmail interface {
	Enviar(ctx context.Context, para, assunto, corpo string) error
}

// BuscadorResultadoPartida e a porta de saida para consultar placares em API externa (ex: TheSportsDB)
type BuscadorResultadoPartida interface {
	BuscarResultado(ctx context.Context, timeCasa, timeFora string) (*ResultadoPartidaExterno, error)
}

// ServicoNotificacao orquestra as regras de negocio de notificacao e consulta externa
type ServicoNotificacao struct {
	enviador EnviadorDeEmail
	buscador BuscadorResultadoPartida
}

// NovoServicoNotificacao constroi o servico injetando o enviador de email
func NovoServicoNotificacao(enviador EnviadorDeEmail) *ServicoNotificacao {
	return &ServicoNotificacao{
		enviador: enviador,
	}
}

// NovoServicoCompleto constroi o servico injetando o enviador de email e o buscador externo de resultados
func NovoServicoCompleto(enviador EnviadorDeEmail, buscador BuscadorResultadoPartida) *ServicoNotificacao {
	return &ServicoNotificacao{
		enviador: enviador,
		buscador: buscador,
	}
}

// NotificarResultadoPalpite valida as regras e dispara o email para o usuario
func (s *ServicoNotificacao) NotificarResultadoPalpite(
	ctx context.Context,
	destinatario string,
	pontos int,
	partidaDescricao string,
	placar string,
) (*Notificacao, error) {

	destinatario = strings.TrimSpace(destinatario)
	if destinatario == "" || !strings.Contains(destinatario, "@") {
		return nil, fmt.Errorf("%w: '%s'", ErrDestinatarioInvalido, destinatario)
	}

	partidaDescricao = strings.TrimSpace(partidaDescricao)
	if partidaDescricao == "" {
		return nil, fmt.Errorf("%w: partida nao informada", ErrMensagemVazia)
	}

	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrPrazoExcedido, err)
	}

	assunto := fmt.Sprintf("ArenaPro — Resultado do seu palpite em %s", partidaDescricao)
	corpo := fmt.Sprintf(
		"Ola! A partida %s terminou com placar %s. Voce obteve %d ponto(s) com seu palpite!",
		partidaDescricao,
		placar,
		pontos,
	)

	if err := s.enviador.Enviar(ctx, destinatario, assunto, corpo); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrEnvioFalhou, err)
	}

	notificacao := &Notificacao{
		ID:           fmt.Sprintf("notif-%d", time.Now().UnixNano()),
		Destinatario: destinatario,
		Assunto:      assunto,
		Mensagem:     corpo,
		Tipo:         TipoResultadoPalpite,
		EnviadaEm:    time.Now().UTC(),
	}

	return notificacao, nil
}

// ConsultarResultadoPartida consulta a porta de saida da API externa de esportes respeitando o contexto
func (s *ServicoNotificacao) ConsultarResultadoPartida(
	ctx context.Context,
	timeCasa string,
	timeFora string,
) (*ResultadoPartidaExterno, error) {
	timeCasa = strings.TrimSpace(timeCasa)
	timeFora = strings.TrimSpace(timeFora)

	if timeCasa == "" || timeFora == "" {
		return nil, fmt.Errorf("%w: timeCasa='%s', timeFora='%s'", ErrTimesInvalidos, timeCasa, timeFora)
	}

	if err := ctx.Err(); err != nil {
		return nil, fmt.Errorf("%w: %w", ErrPrazoExcedido, err)
	}

	if s.buscador == nil {
		return nil, fmt.Errorf("%w: buscador externo nao configurado", ErrConsultaExternaFalhou)
	}

	resultado, err := s.buscador.BuscarResultado(ctx, timeCasa, timeFora)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) {
			return nil, fmt.Errorf("%w: %w", ErrPrazoExcedido, err)
		}
		return nil, fmt.Errorf("%w: %w", ErrConsultaExternaFalhou, err)
	}

	return resultado, nil
}
