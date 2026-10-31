package dominio

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"
)

// Erros de domínio nomeados (sentinel errors)
// Em Go, definir erros com errors.New permite usar errors.Is(err, ErrDestinatarioInvalido)
var (
	ErrDestinatarioInvalido = errors.New("destinatario invalido ou vazio")
	ErrAssuntoVazio         = errors.New("assunto nao pode ser vazio")
	ErrMensagemVazia        = errors.New("mensagem nao pode ser vazia")
	ErrEnvioFalhou          = errors.New("falha ao despachar notificacao")
	ErrPrazoExcedido        = errors.New("tempo limite excedido para envio")
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

// EnviadorDeEmail e a porta de saida (interface pequena de acordo com Clean Architecture).
// O dominio nao sabe se o envio e por SMTP, Resend ou SendGrid. Ele so depende desta interface.
type EnviadorDeEmail interface {
	Enviar(ctx context.Context, para, assunto, corpo string) error
}

// ServicoNotificacao orquestra as regras de negocio de notificacao
type ServicoNotificacao struct {
	enviador EnviadorDeEmail
}

// NovoServicoNotificacao constroi o servico injetando o enviador de email
func NovoServicoNotificacao(enviador EnviadorDeEmail) *ServicoNotificacao {
	return &ServicoNotificacao{
		enviador: enviador,
	}
}

// NotificarResultadoPalpite valida as regras e dispara o email para o usuario
// O primeiro parametro e obrigatoriamente context.Context (exigencia do professor e boa pratica em Go)
func (s *ServicoNotificacao) NotificarResultadoPalpite(
	ctx context.Context,
	destinatario string,
	pontos int,
	partidaDescricao string,
	placar string,
) (*Notificacao, error) {

	// 1. Validacao de regras de entrada
	destinatario = strings.TrimSpace(destinatario)
	if destinatario == "" || !strings.Contains(destinatario, "@") {
		return nil, fmt.Errorf("%w: '%s'", ErrDestinatarioInvalido, destinatario)
	}

	partidaDescricao = strings.TrimSpace(partidaDescricao)
	if partidaDescricao == "" {
		return nil, fmt.Errorf("%w: partida nao informada", ErrMensagemVazia)
	}

	// 2. Verificar se o contexto ja foi cancelado ou expirou antes de comecar
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

	// 3. Chamar a porta de saida (enviador de email), passando o contexto
	if err := s.enviador.Enviar(ctx, destinatario, assunto, corpo); err != nil {
		// Encapsulando o erro com %w para permitir inspecao com errors.Is / errors.As
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
