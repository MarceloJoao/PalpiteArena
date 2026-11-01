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
	chamado        bool
	ultimoPara     string
	ultimoAssunto  string
	ultimoCorpo    string
	retornarErro   error
	tempoDeEspera  time.Duration
}

func (m *MockEnviadorDeEmail) Enviar(ctx context.Context, para, assunto, corpo string) error {
	m.chamado = true
	m.ultimoPara = para
	m.ultimoAssunto = assunto
	m.ultimoCorpo = corpo

	// Simula uma espera para testar se o contexto respeita timeout
	if m.tempoDeEspera > 0 {
		select {
		case <-time.After(m.tempoDeEspera):
		case <-ctx.Done():
			return ctx.Err()
		}
	}

	return m.retornarErro
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

			// errors.Is verifica se o erro encapsulado e ErrDestinatarioInvalido
			if !errors.Is(err, dominio.ErrDestinatarioInvalido) {
				t.Errorf("esperava erro ErrDestinatarioInvalido, obteve: %v", err)
			}

			if mock.chamado {
				t.Error("nao deveria tentar enviar email para destinatario invalido")
			}
		})
	}
}

// Teste 3: Exigencia expressa do professor (T3)
// "inclusive um teste que verifica que o prazo e respeitado com context"
func TestNotificarResultadoPalpite_RespeitaPrazoContexto(t *testing.T) {
	// Mock configurado para demorar 200 milissegundos
	mock := &MockEnviadorDeEmail{
		tempoDeEspera: 200 * time.Millisecond,
	}
	servico := dominio.NovoServicoNotificacao(mock)

	// Criamos um contexto com timeout muito curto: apenas 30 milissegundos
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

	// O erro retornado deve encapsular ErrEnvioFalhou e o context.DeadlineExceeded
	if !errors.Is(err, context.DeadlineExceeded) && !errors.Is(err, dominio.ErrEnvioFalhou) && !errors.Is(err, dominio.ErrPrazoExcedido) {
		t.Errorf("esperava erro relacionado a prazo excedido, obteve: %v", err)
	}
}
