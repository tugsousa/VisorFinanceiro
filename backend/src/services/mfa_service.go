package services

import (
	"bytes"
	"encoding/base64"
	"image/png"

	"github.com/pquerna/otp/totp"
)

type MFAService struct{}

func NewMFAService() *MFAService {
	return &MFAService{}
}

// GenerateMFASecret cria um novo segredo e retorna o URL do QR Code e o Segredo
func (s *MFAService) GenerateMFASecret(username string) (secret string, qrCodeBase64 string, err error) {
	key, err := totp.Generate(totp.GenerateOpts{
		Issuer:      "VisorFinanceiro",
		AccountName: username,
	})
	if err != nil {
		return "", "", err
	}

	// Converter imagem para PNG e depois Base64 para o frontend exibir
	var buf bytes.Buffer
	img, err := key.Image(200, 200)
	if err != nil {
		return "", "", err
	}

	err = png.Encode(&buf, img)
	if err != nil {
		return "", "", err
	}

	qrCodeBase64 = base64.StdEncoding.EncodeToString(buf.Bytes())
	return key.Secret(), qrCodeBase64, nil
}

func (s *MFAService) ValidateToken(secret string, token string) bool {
	// Valida o token. O allowSkew permite uma ligeira diferença de relógio.
	return totp.Validate(token, secret)
}
