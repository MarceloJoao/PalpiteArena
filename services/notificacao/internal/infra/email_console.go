package infra

import (
	"context"
	"log"
)

// EnviadorConsole implementa a porta dominio.EnviadorDeEmail registrando o envio no log.
// Em producao, pode ser substituido por um adaptador SMTP/Resend sem tocar no dominio.
type EnviadorConsole struct{}

// NovoEnviadorConsole cria uma nova instancia do adaptador de envio em console.
func NovoEnviadorConsole() *EnviadorConsole {
	return &EnviadorConsole{}
}

// Enviar verifica se o contexto ainda e valido e registra o disparo do e-mail.
func (e *EnviadorConsole) Enviar(ctx context.Context, para, assunto, corpo string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	log.Printf("[EMAIL ENVIADO] Para: %s | Assunto: %s | Mensagem: %s", para, assunto, corpo)
	return nil
}
