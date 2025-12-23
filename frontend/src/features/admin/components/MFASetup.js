// src/components/admin/MFASetup.js
import React, { useState } from 'react';
import api from '../../services/api'; // Ajusta o caminho conforme o teu projeto

const MFASetup = () => {
  const [step, setStep] = useState(1); // 1: Inicial, 2: Mostrar QR, 3: Ativado
  const [qrCodeUrl, setQrCodeUrl] = useState('');
  const [secret, setSecret] = useState('');
  const [mfaCode, setMfaCode] = useState('');
  const [error, setError] = useState('');

  const handleStartSetup = async () => {
    try {
      const response = await api.get('/admin/mfa/setup');
      setQrCodeUrl(response.data.qr_code_url);
      setSecret(response.data.secret);
      setStep(2);
    } catch (err) {
      setError('Erro ao iniciar configuração de MFA');
    }
  };

  const handleVerifyAndEnable = async () => {
    try {
      await api.post('/admin/mfa/enable', {
        secret: secret,
        code: mfaCode
      });
      setStep(3);
    } catch (err) {
      setError('Código inválido. Tente novamente.');
    }
  };

  return (
    <div className="mfa-setup-container" style={{ padding: '20px', border: '1px solid #ddd' }}>
      <h3>Segurança: Autenticação de Dois Fatores (MFA)</h3>
      
      {step === 1 && (
        <div>
          <p>Para proteger a funcionalidade de "Impersonation", deve configurar o Google Authenticator.</p>
          <button onClick={handleStartSetup}>Configurar MFA Agora</button>
        </div>
      )}

      {step === 2 && (
        <div>
          <p>1. Abra o Google Authenticator no seu telemóvel.</p>
          <p>2. Digitalize o código QR abaixo:</p>
          <img src={qrCodeUrl} alt="QR Code MFA" style={{ margin: '20px 0' }} />
          <p>3. Introduza o código de 6 dígitos gerado pela App:</p>
          <input 
            type="text" 
            value={mfaCode} 
            onChange={(e) => setMfaCode(e.target.value)} 
            placeholder="000000"
            maxLength="6"
          />
          <button onClick={handleVerifyAndEnable}>Verificar e Ativar</button>
          {error && <p style={{ color: 'red' }}>{error}</p>}
        </div>
      )}

      {step === 3 && (
        <div style={{ color: 'green' }}>
          <p>MFA Ativado com sucesso! Agora já pode realizar ações administrativas críticas.</p>
        </div>
      )}
    </div>
  );
};

export default MFASetup;