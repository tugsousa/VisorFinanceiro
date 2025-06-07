// backend/src/services/email_service.go
package services

import (
	"context"
	"fmt"
	"log/slog"
	"net/smtp"
	"strings"
	"time"

	"github.com/mailgun/mailgun-go/v4"
	"github.com/username/taxfolio/backend/src/config"
	"github.com/username/taxfolio/backend/src/logger"
)

type EmailService interface {
	SendVerificationEmail(toEmail, username, token string) error
	SendPasswordResetEmail(toEmail, username, token string) error
}

func NewEmailService() EmailService {
	if config.Cfg == nil {
		slog.Error("Configuration (config.Cfg) is nil. Email service will default to mock.")
		return &MockEmailService{}
	}

	provider := strings.ToLower(config.Cfg.EmailServiceProvider)
	logger.L.Info("Initializing email service", "provider", provider)

	switch provider {
	case "mailgun":
		if config.Cfg.MailgunDomain == "" || config.Cfg.MailgunPrivateAPIKey == "" || config.Cfg.SenderEmail == "" {
			logger.L.Warn("Mailgun configuration incomplete (Domain, API Key, or SenderEmail missing). Falling back to MockEmailService.")
			return &MockEmailService{
				VerificationEmailBaseURL: config.Cfg.VerificationEmailBaseURL, // Pass config even to mock
				PasswordResetBaseURL:     config.Cfg.PasswordResetBaseURL,
			}
		}
		mg := mailgun.NewMailgun(config.Cfg.MailgunDomain, config.Cfg.MailgunPrivateAPIKey)
		logger.L.Info("Mailgun client initialized", "domain", config.Cfg.MailgunDomain)
		return &MailgunEmailService{
			mg:                       mg,
			senderEmail:              config.Cfg.SenderEmail,
			senderName:               config.Cfg.SenderName,
			verificationEmailBaseURL: config.Cfg.VerificationEmailBaseURL,
			PasswordResetBaseURL:     config.Cfg.PasswordResetBaseURL, // Corrected field name
		}
	case "smtp":
		if config.Cfg.SMTPServer == "" || config.Cfg.SMTPUser == "" || config.Cfg.SMTPPassword == "" || config.Cfg.SenderEmail == "" {
			logger.L.Warn("SMTP configuration incomplete. Falling back to MockEmailService.")
			return &MockEmailService{
				VerificationEmailBaseURL: config.Cfg.VerificationEmailBaseURL,
				PasswordResetBaseURL:     config.Cfg.PasswordResetBaseURL,
			}
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
		return &MockEmailService{
			VerificationEmailBaseURL: config.Cfg.VerificationEmailBaseURL,
			PasswordResetBaseURL:     config.Cfg.PasswordResetBaseURL,
		}
	}
}

type SMTPEmailService struct {
	SMTPServer               string
	SMTPPort                 int
	SMTPUser                 string
	SMTPPassword             string
	SenderEmail              string
	VerificationEmailBaseURL string
	PasswordResetBaseURL     string
}

func (s *SMTPEmailService) SendVerificationEmail(toEmail, username, token string) error {
	from := s.SenderEmail
	to := []string{toEmail}
	subject := "Verify Your Email Address for Taxfolio (SMTP)"
	verificationLink := fmt.Sprintf("%s?token=%s", s.VerificationEmailBaseURL, token)
	body := fmt.Sprintf(`Hi %s, Please verify your email by clicking this link: %s Thanks, The Taxfolio Team (via SMTP)`, username, verificationLink)

	header := make(map[string]string)
	header["From"] = from
	header["To"] = toEmail
	header["Subject"] = subject
	header["MIME-version"] = "1.0"
	header["Content-Type"] = "text/plain; charset=\"UTF-8\""
	message := ""
	for k, v := range header {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + body
	auth := smtp.PlainAuth("", s.SMTPUser, s.SMTPPassword, s.SMTPServer)
	addr := fmt.Sprintf("%s:%d", s.SMTPServer, s.SMTPPort)
	err := smtp.SendMail(addr, auth, from, to, []byte(message))
	if err != nil {
		logger.L.Error("Failed to send verification email via SMTP", "error", err, "to", toEmail)
		return fmt.Errorf("failed to send verification email via SMTP: %w", err)
	}
	logger.L.Info("Verification email sent successfully via SMTP", "to", toEmail)
	return nil
}

func (s *SMTPEmailService) SendPasswordResetEmail(toEmail, username, token string) error {
	from := s.SenderEmail
	to := []string{toEmail}
	subject := "Password Reset Request for Taxfolio (SMTP)"
	resetLink := fmt.Sprintf("%s?token=%s", s.PasswordResetBaseURL, token)
	body := fmt.Sprintf(`Hi %s,

    You requested a password reset for your Taxfolio account.
    Please click the following link to reset your password:
    %s

    If you did not request a password reset, please ignore this email. This link will expire in %s.

    Thanks,
    The Taxfolio Team (via SMTP)`, username, resetLink, config.Cfg.PasswordResetTokenExpiry.String())

	header := make(map[string]string)
	header["From"] = from
	header["To"] = toEmail
	header["Subject"] = subject
	header["MIME-version"] = "1.0"
	header["Content-Type"] = "text/plain; charset=\"UTF-8\""
	message := ""
	for k, v := range header {
		message += fmt.Sprintf("%s: %s\r\n", k, v)
	}
	message += "\r\n" + body
	auth := smtp.PlainAuth("", s.SMTPUser, s.SMTPPassword, s.SMTPServer)
	addr := fmt.Sprintf("%s:%d", s.SMTPServer, s.SMTPPort)
	err := smtp.SendMail(addr, auth, from, to, []byte(message))
	if err != nil {
		logger.L.Error("Failed to send password reset email via SMTP", "error", err, "to", toEmail)
		return fmt.Errorf("failed to send password reset email via SMTP: %w", err)
	}
	logger.L.Info("Password reset email sent successfully via SMTP", "to", toEmail)
	return nil
}

type MailgunEmailService struct {
	mg                       mailgun.Mailgun
	senderEmail              string
	senderName               string
	verificationEmailBaseURL string
	PasswordResetBaseURL     string // Corrected: Uppercase P
}

func (s *MailgunEmailService) SendVerificationEmail(toEmail, username, token string) error {
	from := fmt.Sprintf("%s <%s>", s.senderName, s.senderEmail)
	subject := "Verify Your Email Address for Taxfolio"
	recipient := toEmail

	verificationLink := fmt.Sprintf("%s?token=%s", s.verificationEmailBaseURL, token)

	plainTextBody := fmt.Sprintf(`Hi %s,

Welcome to Taxfolio! Please verify your email address by clicking the link below:
%s

If you did not create an account using this email address, please ignore this email.

Thanks,
The Taxfolio Team`, username, verificationLink)

	htmlBody := fmt.Sprintf(`
	<html>
		<body style="font-family: Arial, sans-serif; line-height: 1.6;">
			<p>Hi %s,</p>
			<p>Welcome to Taxfolio! Please verify your email address by clicking the link below:</p>
			<p><a href="%s" target="_blank" style="color: #1a73e8; text-decoration: none; font-weight: bold; padding: 10px 15px; border: 1px solid #1a73e8; border-radius: 4px; background-color: #e8f0fe;">Verify Email Address</a></p>
			<p>If the button above doesn't work, you can copy and paste the following URL into your browser's address bar:</p>
			<p><a href="%s" target="_blank" style="color: #1a73e8;">%s</a></p>
			<p>If you did not create an account using this email address, please ignore this email.</p>
			<p>Thanks,<br>The Taxfolio Team</p>
		</body>
	</html>`, username, verificationLink, verificationLink, verificationLink)

	message := s.mg.NewMessage(from, subject, plainTextBody, recipient)
	message.SetHtml(htmlBody)
	ctx, cancel := context.WithTimeout(context.Background(), time.Second*20)
	defer cancel()
	resp, id, err := s.mg.Send(ctx, message)
	if err != nil {
		logger.L.Error("Failed to send verification email via Mailgun", "error", err, "to", toEmail, "mailgunResp", resp, "mailgunId", id)
		return fmt.Errorf("mailgun send failed: %w. Response: %s", err, resp)
	}
	logger.L.Info("Verification email sent successfully via Mailgun", "to", toEmail, "id", id, "mailgunResp", resp)
	return nil
}

func (s *MailgunEmailService) SendPasswordResetEmail(toEmail, username, token string) error {
	from := fmt.Sprintf("%s <%s>", s.senderName, s.senderEmail)
	subject := "Password Reset Request for Taxfolio"
	recipient := toEmail

	resetLink := fmt.Sprintf("%s?token=%s", s.PasswordResetBaseURL, token) // Access with uppercase P

	plainTextBody := fmt.Sprintf(`Hi %s,

    You requested a password reset for your Taxfolio account.
    Please click the following link to reset your password:
    %s

    If you did not request a password reset, please ignore this email. This link will expire in %s.

    Thanks,
    The Taxfolio Team`, username, resetLink, config.Cfg.PasswordResetTokenExpiry.String())

	htmlBody := fmt.Sprintf(`
	<html>
		<body style="font-family: Arial, sans-serif; line-height: 1.6;">
			<p>Hi %s,</p>
			<p>You requested a password reset for your Taxfolio account. Please click the button below to reset your password:</p>
			<p><a href="%s" target="_blank" style="color: #1a73e8; text-decoration: none; font-weight: bold; padding: 10px 15px; border: 1px solid #1a73e8; border-radius: 4px; background-color: #e8f0fe;">Reset Password</a></p>
			<p>If the button above doesn't work, copy and paste this link into your browser:</p>
			<p><a href="%s" target="_blank" style="color: #1a73e8;">%s</a></p>
			<p>If you did not request this reset, please ignore this email. This link will expire in %s.</p>
			<p>Thanks,<br>The Taxfolio Team</p>
		</body>
	</html>`, username, resetLink, resetLink, resetLink, config.Cfg.PasswordResetTokenExpiry.String())

	message := s.mg.NewMessage(from, subject, plainTextBody, recipient)
	message.SetHtml(htmlBody)
	message.AddTag("password-reset")

	ctx, cancel := context.WithTimeout(context.Background(), time.Second*20)
	defer cancel()

	resp, id, err := s.mg.Send(ctx, message)
	if err != nil {
		logger.L.Error("Failed to send password reset email via Mailgun", "error", err, "to", toEmail, "mailgunResp", resp, "mailgunId", id)
		return fmt.Errorf("mailgun send failed for password reset: %w. Response: %s", err, resp)
	}

	logger.L.Info("Password reset email sent successfully via Mailgun", "to", toEmail, "id", id, "mailgunResp", resp)
	return nil
}

type MockEmailService struct {
	VerificationEmailBaseURL string
	PasswordResetBaseURL     string
}

func (m *MockEmailService) SendVerificationEmail(toEmail, username, token string) error {
	verificationLink := "MOCK_VERIFICATION_LINK_NOT_CONFIGURED_IN_MOCK_STRUCT"
	if m.VerificationEmailBaseURL != "" {
		verificationLink = fmt.Sprintf("%s?token=%s", m.VerificationEmailBaseURL, token)
	} else if config.Cfg != nil && config.Cfg.VerificationEmailBaseURL != "" {
		verificationLink = fmt.Sprintf("%s?token=%s", config.Cfg.VerificationEmailBaseURL, token)
	}
	logMsg := "MockEmailService: Would send verification email."
	logger.L.Info(logMsg, "to", toEmail, "username", username, "verificationLink", verificationLink)
	return nil
}

func (m *MockEmailService) SendPasswordResetEmail(toEmail, username, token string) error {
	resetLink := "MOCK_PASSWORD_RESET_LINK_NOT_CONFIGURED_IN_MOCK_STRUCT"
	expiry := "an hour (default)"
	if m.PasswordResetBaseURL != "" {
		resetLink = fmt.Sprintf("%s?token=%s", m.PasswordResetBaseURL, token)
	} else if config.Cfg != nil && config.Cfg.PasswordResetBaseURL != "" {
		resetLink = fmt.Sprintf("%s?token=%s", config.Cfg.PasswordResetBaseURL, token)
	}
	if config.Cfg != nil {
		expiry = config.Cfg.PasswordResetTokenExpiry.String()
	}

	logMsg := "MockEmailService: Would send password reset email."
	logger.L.Info(logMsg, "to", toEmail, "username", username, "resetLink", resetLink, "expiresIn", expiry)
	return nil
}
