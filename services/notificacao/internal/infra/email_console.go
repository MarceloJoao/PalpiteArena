package infra

import (
	"context"
	"fmt"
	"log"
	"net/smtp"
	"os"
	"strings"
)

// EnviadorConsole implementa a porta dominio.EnviadorDeEmail registrando o envio no log
// e, quando SMTP_USER e SMTP_PASS estao configurados no ambiente (.env), dispara o e-mail real via SMTP.
type EnviadorConsole struct {
	smtpHost string
	smtpPort string
	smtpUser string
	smtpPass string
}

// NovoEnviadorConsole cria uma nova instancia do adaptador de envio de e-mail (Console + SMTP opcional).
func NovoEnviadorConsole() *EnviadorConsole {
	host := strings.TrimSpace(os.Getenv("SMTP_HOST"))
	if host == "" {
		host = "smtp.gmail.com"
	}
	port := strings.TrimSpace(os.Getenv("SMTP_PORT"))
	if port == "" {
		port = "587"
	}
	return &EnviadorConsole{
		smtpHost: host,
		smtpPort: port,
		smtpUser: strings.TrimSpace(os.Getenv("SMTP_USER")),
		smtpPass: strings.ReplaceAll(strings.TrimSpace(os.Getenv("SMTP_PASS")), " ", ""),
	}
}

// Enviar verifica se o contexto ainda e valido, registra o disparo no log e envia por SMTP se configurado.
func (e *EnviadorConsole) Enviar(ctx context.Context, para, assunto, corpo string) error {
	if err := ctx.Err(); err != nil {
		return err
	}

	log.Printf("[EMAIL ENVIADO] Para: %s | Assunto: %s | Mensagem: %s", para, assunto, corpo)

	if e.smtpUser != "" && e.smtpPass != "" {
		go e.enviarSmtpReal(para, assunto, corpo)
	}

	return nil
}

func (e *EnviadorConsole) enviarSmtpReal(para, assunto, corpo string) {
	endereco := fmt.Sprintf("%s:%s", e.smtpHost, e.smtpPort)
	auth := smtp.PlainAuth("", e.smtpUser, e.smtpPass, e.smtpHost)

	mensagemMime := fmt.Sprintf(
		"From: PalpiteArena <%s>\r\n"+
			"To: %s\r\n"+
			"Subject: %s\r\n"+
			"MIME-Version: 1.0\r\n"+
			"Content-Type: text/plain; charset=\"UTF-8\"\r\n"+
			"\r\n"+
			"%s\r\n",
		e.smtpUser,
		para,
		assunto,
		corpo,
	)

	if err := smtp.SendMail(endereco, auth, e.smtpUser, []string{para}, []byte(mensagemMime)); err != nil {
		log.Printf("[SMTP AVISO] Falha ao entregar e-mail real para %s via %s: %v", para, endereco, err)
		return
	}
	log.Printf("[SMTP SUCESSO] E-mail real entregue na caixa de entrada de %s!", para)
}
