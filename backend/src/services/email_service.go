// backend/src/services/email_service.go
package services

import (
	"bytes"
	"crypto/rand"
	"fmt"
	htmltemplate "html/template" // Corrected alias syntax
	"log/slog"
	"math/big"
	"net/smtp"
	"strings"
	texttemplate "text/template" // Corrected alias syntax

	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/logger"
)

// EmailData holds the dynamic data for an email template.
type EmailData struct {
	Username string
	Link     string
	Expiry   string
}

// EmailTemplate defines the structure for an email template.
type EmailTemplate struct {
	Subject  string
	TextBody string
	HTMLBody string
}

// Email templates are now centralized.
var emailTemplates = map[string]EmailTemplate{
	"verification": {
		Subject:  "Confirme o seu endereço de e-mail para o VisorFinanceiro",
		TextBody: `Olá {{.Username}}, Bem-vindo ao VisorFinanceiro! Por favor, confirme o seu endereço de e-mail clicando no link abaixo: {{.Link}} Se não criou uma conta com este endereço de e-mail, por favor ignore esta mensagem. Obrigado, A equipa do VisorFinanceiro`,
		HTMLBody: `<html><body style="font-family: Arial, sans-serif; line-height: 1.6;"><p>Olá {{.Username}},</p><p>Bem-vindo ao VisorFinanceiro! Por favor, confirme o seu endereço de e-mail clicando no link abaixo:</p><p><a href="{{.Link}}" target="_blank" style="color: #1a73e8; text-decoration: none; font-weight: bold; padding: 10px 15px; border: 1px solid #1a73e8; border-radius: 4px; background-color: #e8f0fe;">Confirmar endereço de e-mail</a></p><p>Se o botão acima não funcionar, pode copiar e colar o seguinte URL na barra de endereços do seu navegador.</p><p><a href="{{.Link}}" target="_blank" style="color: #1a73e8;">{{.Link}}</a></p><p>Se não criou uma conta com este endereço de e-mail, por favor ignore este e-mail.</p><p>Obrigado,<br>A equipa do VisorFinanceiro</p></body></html>`,
	},
	"passwordReset": {
		Subject:  "Pedido de redefinição da palavra-passe para o VisorFinanceiro",
		TextBody: `Olá {{.Username}}, Recebemos um pedido para repor a palavra-passe da sua conta VisorFinanceiro. Por favor, clique no seguinte link para repor a sua palavra-passe: {{.Link}} Se não pediu a reposição da palavra-passe, por favor ignore este e-mail. Este link expira em {{.Expiry}}. Obrigado, A equipa do VisorFinanceiro`,
		HTMLBody: `<html><body style="font-family: Arial, sans-serif; line-height: 1.6;"><p>Olá {{.Username}},</p><p>Recebemos um pedido para repor a palavra-passe da sua conta VisorFinanceiro. Por favor, clique no seguinte link para repor a sua palavra-passe:</p><p><a href="{{.Link}}" target="_blank" style="color: #1a73e8; text-decoration: none; font-weight: bold; padding: 10px 15px; border: 1px solid #1a73e8; border-radius: 4px; background-color: #e8f0fe;">Redefinir palavra-passe</a></p><p>Se o botão acima não funcionar, copie e cole este link no seu navegador:</p><p><a href="{{.Link}}" target="_blank" style="color: #1a73e8;">{{.Link}}</a></p><p>Se não solicitou esta reposição, por favor ignore este e-mail. Este link irá expirar dentro de {{.Expiry}}.</p><p>Obrigado,<br>A equipa do VisorFinanceiro</p></body></html>`,
	},
}

// EmailService defines the interface for sending emails.
type EmailService interface {
	SendVerificationEmail(toEmail, username, token string) error
	SendPasswordResetEmail(toEmail, username, token string) error
}

// NewEmailService initializes the email service based on the configuration.
func NewEmailService() EmailService {
	if config.Cfg == nil {
		slog.Error("Configuration (config.Cfg) is nil. Email service will default to mock.")
		return &MockEmailService{}
	}

	provider := strings.ToLower(config.Cfg.EmailServiceProvider)
	logger.L.Info("Initializing email service", "provider", provider)

	switch provider {
	case "smtp":
		if config.Cfg.SMTPServer == "" || config.Cfg.SMTPUser == "" || config.Cfg.SMTPPassword == "" || config.Cfg.SenderEmail == "" {
			logger.L.Warn("SMTP configuration incomplete. Falling back to MockEmailService.")
			return &MockEmailService{}
		}
		return &SMTPEmailService{
			SMTPServer:               config.Cfg.SMTPServer,
			SMTPPort:                 config.Cfg.SMTPPort,
			SMTPUser:                 config.Cfg.SMTPUser,
			SMTPPassword:             config.Cfg.SMTPPassword,
			SenderEmail:              config.Cfg.SenderEmail,
			VerificationEmailBaseURL: config.Cfg.VerificationEmailBaseURL,
			PasswordResetBaseURL:     config.Cfg.PasswordResetBaseURL,
		}
	default:
		logger.L.Info("Defaulting to MockEmailService.")
		return &MockEmailService{}
	}
}

// SMTPEmailService sends emails using SMTP.
type SMTPEmailService struct {
	SMTPServer               string
	SMTPPort                 int
	SMTPUser                 string
	SMTPPassword             string
	SenderEmail              string
	VerificationEmailBaseURL string
	PasswordResetBaseURL     string
}

// send method for SMTP now handles multipart (HTML + Text) emails.
func (s *SMTPEmailService) send(toEmail, subject, textBody, htmlBody string) error {
	from := s.SenderEmail
	to := []string{toEmail}

	// Generate a unique boundary
	n, _ := rand.Int(rand.Reader, big.NewInt(1000000000))
	boundary := "visorfinanceiro-boundary-" + n.String()

	// Construct the headers
	header := make(map[string]string)
	header["From"] = from
	header["To"] = toEmail
	header["Subject"] = subject
	header["MIME-Version"] = "1.0"
	header["Content-Type"] = fmt.Sprintf("multipart/alternative; boundary=%s", boundary)

	var msg bytes.Buffer
	for k, v := range header {
		msg.WriteString(fmt.Sprintf("%s: %s\r\n", k, v))
	}
	msg.WriteString("\r\n")

	// Plain text part
	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/plain; charset=\"UTF-8\"\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(textBody)
	msg.WriteString("\r\n")

	// HTML part
	msg.WriteString(fmt.Sprintf("--%s\r\n", boundary))
	msg.WriteString("Content-Type: text/html; charset=\"UTF-8\"\r\n")
	msg.WriteString("\r\n")
	msg.WriteString(htmlBody)
	msg.WriteString("\r\n")

	// Closing boundary
	msg.WriteString(fmt.Sprintf("--%s--\r\n", boundary))

	// Send the email
	auth := smtp.PlainAuth("", s.SMTPUser, s.SMTPPassword, s.SMTPServer)
	addr := fmt.Sprintf("%s:%d", s.SMTPServer, s.SMTPPort)
	err := smtp.SendMail(addr, auth, from, to, msg.Bytes())

	if err != nil {
		logger.L.Error("Failed to send email via SMTP", "error", err, "to", toEmail)
		return fmt.Errorf("failed to send email via SMTP: %w", err)
	}
	return nil
}

func (s *SMTPEmailService) SendVerificationEmail(toEmail, username, token string) error {
	template := emailTemplates["verification"]
	verificationLink := fmt.Sprintf("%s?token=%s", s.VerificationEmailBaseURL, token)
	data := EmailData{Username: username, Link: verificationLink}

	textBody, htmlBody, err := parseTemplates(template, data)
	if err != nil {
		return err
	}

	if err := s.send(toEmail, template.Subject, textBody, htmlBody); err != nil {
		return err
	}

	logger.L.Info("Verification email sent successfully via SMTP", "to", toEmail)
	return nil
}

func (s *SMTPEmailService) SendPasswordResetEmail(toEmail, username, token string) error {
	template := emailTemplates["passwordReset"]
	resetLink := fmt.Sprintf("%s?token=%s", s.PasswordResetBaseURL, token)
	data := EmailData{
		Username: username,
		Link:     resetLink,
		Expiry:   config.Cfg.PasswordResetTokenExpiry.String(),
	}

	textBody, htmlBody, err := parseTemplates(template, data)
	if err != nil {
		return err
	}

	if err := s.send(toEmail, template.Subject, textBody, htmlBody); err != nil {
		return err
	}
	logger.L.Info("Password reset email sent successfully via SMTP", "to", toEmail)
	return nil
}

// parseTemplates is a helper function to parse both text and HTML templates
func parseTemplates(template EmailTemplate, data EmailData) (string, string, error) {
	var textBody, htmlBody bytes.Buffer

	// Parse text template
	textTmpl, err := texttemplate.New("text").Parse(template.TextBody)
	if err != nil {
		return "", "", fmt.Errorf("failed to parse text template: %w", err)
	}
	if err := textTmpl.Execute(&textBody, data); err != nil {
		return "", "", fmt.Errorf("failed to execute text template: %w", err)
	}

	// Parse HTML template
	htmlTmpl, err := htmltemplate.New("html").Parse(template.HTMLBody)
	if err != nil {
		return "", "", fmt.Errorf("failed to parse html template: %w", err)
	}
	if err := htmlTmpl.Execute(&htmlBody, data); err != nil {
		return "", "", fmt.Errorf("failed to execute html template: %w", err)
	}

	return textBody.String(), htmlBody.String(), nil
}

// MockEmailService is a mock implementation of EmailService for testing.
type MockEmailService struct{}

func (m *MockEmailService) SendVerificationEmail(toEmail, username, token string) error {
	verificationLink := fmt.Sprintf("%s?token=%s", config.Cfg.VerificationEmailBaseURL, token)
	logMsg := "MockEmailService: Would send verification email."
	logger.L.Info(logMsg, "to", toEmail, "username", username, "verificationLink", verificationLink)
	return nil
}

func (m *MockEmailService) SendPasswordResetEmail(toEmail, username, token string) error {
	resetLink := fmt.Sprintf("%s?token=%s", config.Cfg.PasswordResetBaseURL, token)
	expiry := config.Cfg.PasswordResetTokenExpiry.String()
	logMsg := "MockEmailService: Would send password reset email."
	logger.L.Info(logMsg, "to", toEmail, "username", username, "resetLink", resetLink, "expiresIn", expiry)
	return nil
}
