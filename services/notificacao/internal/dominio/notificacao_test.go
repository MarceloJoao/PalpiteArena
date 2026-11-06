package dominio_test

import (
	"context"
	"errors"
	"testing"
	"time"

	"github.com/arenapro/notificacao/internal/dominio"
)

// MockEnviadorDeEmail simula o envio de email em memoria para os testes
type MockEnviadorDeEmail struct {
	chamado       bool
	ultimoPara    string
	ultimoAssunto string
	ultimoCorpo   string
	retornarErro  error
	tempoDeEspera time.Duration
}

func (m *MockEnviadorDeEmail) Enviar(ctx context.Context, para, assunto, corpo string) error {
	m.chamado = true
	m.ultimoPara = para
	m.ultimoAssunto = assunto
	m.ultimoCorpo = corpo

	if m.tempoDeEspera > 0 {
		select {
		case <-time.After(m.tempoDeEspera):
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	return m.retornarErro
}

// MockBuscadorResultado simula a consulta na API externa de futebol
type MockBuscadorResultado struct {
	resultado     *dominio.ResultadoPartidaExterno
	retornarErro  error
	tempoDeEspera time.Duration
}

func (m *MockBuscadorResultado) BuscarResultado(ctx context.Context, timeCasa, timeFora string) (*dominio.ResultadoPartidaExterno, error) {
	if m.tempoDeEspera > 0 {
		select {
		case <-time.After(m.tempoDeEspera):
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	if m.retornarErro != nil {
		return nil, m.retornarErro
	}
	return m.resultado, nil
}

// Teste 1: Envio bem sucedido de notificacao de resultado
func TestNotificarResultadoPalpite_Sucesso(t *testing.T) {
	mock := &MockEnviadorDeEmail{}
	servico := dominio.NovoServicoNotificacao(mock)

	ctx := context.Background()
	notif, err := servico.NotificarResultadoPalpite(
		ctx,
		"joao@email.com",
		10,
		"Flamengo x Vasco",
		"2x1",
	)

	if err != nil {
		t.Fatalf("esperava sucesso, mas obteve erro: %v", err)
	}

	if notif == nil {
		t.Fatal("esperava objeto Notificacao instanciado, veio nil")
	}

	if !mock.chamado {
		t.Fatal("esperava que o EnviadorDeEmail tivesse sido chamado")
	}

	if mock.ultimoPara != "joao@email.com" {
		t.Errorf("destinatario incorreto: obteve %s, esperava joao@email.com", mock.ultimoPara)
	}

	if notif.Tipo != dominio.TipoResultadoPalpite {
		t.Errorf("tipo incorreto: obteve %s, esperava %s", notif.Tipo, dominio.TipoResultadoPalpite)
	}
}

// Teste 2: Rejeicao com email invalido ou vazio
func TestNotificarResultadoPalpite_EmailInvalido(t *testing.T) {
	mock := &MockEnviadorDeEmail{}
	servico := dominio.NovoServicoNotificacao(mock)

	casosInvalidos := []string{"", "   ", "email-sem-arroba", "joao.com"}

	for _, email := range casosInvalidos {
		t.Run("Email_"+email, func(t *testing.T) {
			_, err := servico.NotificarResultadoPalpite(
				context.Background(),
				email,
				10,
				"Flamengo x Vasco",
				"2x1",
			)

			if err == nil {
				t.Fatalf("esperava erro para email '%s', mas passou", email)
			}

			if !errors.Is(err, dominio.ErrDestinatarioInvalido) {
				t.Errorf("esperava erro ErrDestinatarioInvalido, obteve: %v", err)
			}

			if mock.chamado {
				t.Error("nao deveria tentar enviar email para destinatario invalido")
			}
		})
	}
}

// Teste 3: Verifica que o prazo e respeitado com context no envio de email
func TestNotificarResultadoPalpite_RespeitaPrazoContexto(t *testing.T) {
	mock := &MockEnviadorDeEmail{
		tempoDeEspera: 200 * time.Millisecond,
	}
	servico := dominio.NovoServicoNotificacao(mock)

	ctx, cancel := context.WithTimeout(context.Background(), 30*time.Millisecond)
	defer cancel()

	_, err := servico.NotificarResultadoPalpite(
		ctx,
		"joao@email.com",
		5,
		"Flamengo x Vasco",
		"1x0",
	)

	if err == nil {
		t.Fatal("esperava que a operacao falhasse por timeout, mas passou")
	}

	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, dominio.ErrEnvioFalhou) && !errors.Is(err, dominio.ErrPrazoExcedido) {
		t.Errorf("esperava erro relacionado a prazo excedido, obteve: %v", err)
	}
}

// Teste 4: Consulta de resultado na API externa com sucesso
func TestConsultarResultadoPartida_Sucesso(t *testing.T) {
	mockBuscador := &MockBuscadorResultado{
		resultado: &dominio.ResultadoPartidaExterno{
			Encontrada:  true,
			Finalizada:  true,
			Placar:      "1x0",
			FonteEvento: "Flamengo vs Vasco da Gama (2026-01-22)",
		},
	}
	servico := dominio.NovoServicoCompleto(&MockEnviadorDeEmail{}, mockBuscador)

	res, err := servico.ConsultarResultadoPartida(context.Background(), "Flamengo", "Vasco")
	if err != nil {
		t.Fatalf("esperava sucesso na consulta externa, obteve erro: %v", err)
	}

	if !res.Encontrada || !res.Finalizada || res.Placar != "1x0" {
		t.Errorf("resultado inesperado: %+v", res)
	}
}

// Teste 5: Consulta de resultado com nome de time vazio retorna ErrTimesInvalidos
func TestConsultarResultadoPartida_TimesInvalidos(t *testing.T) {
	servico := dominio.NovoServicoCompleto(&MockEnviadorDeEmail{}, &MockBuscadorResultado{})

	_, err := servico.ConsultarResultadoPartida(context.Background(), "Flamengo", "   ")
	if !errors.Is(err, dominio.ErrTimesInvalidos) {
		t.Errorf("esperava ErrTimesInvalidos, obteve: %v", err)
	}
}
