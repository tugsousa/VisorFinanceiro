// frontend/src/features/auth/pages/SignInPage.jsx
import React, { useState, useContext, useEffect, useRef } from 'react';
import { Link as RouterLink, useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, Link, Divider, SvgIcon, Collapse
} from '@mui/material';
import AuthModal from '../components/AuthModal';
import { API_ENDPOINTS } from '../../../constants';

// Colorful Google icon
const GoogleColorIcon = (props) => (
  <SvgIcon {...props} viewBox="0 0 48 48">
    <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z" />
    <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z" />
    <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z" />
    <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z" />
    <path fill="none" d="M0 0h48v48H0z" />
  </SvgIcon>
);

// Human-readable messages for each OAuth error code
const OAUTH_ERROR_MESSAGES = {
  email_already_exists_local:
    'Este e-mail já está registado. Por favor, inicie sessão com a sua palavra-passe.',
  invalid_state:
    'Estado de autenticação inválido. Por favor, tente novamente.',
  token_exchange_failed:
    'Não foi possível concluir o início de sessão com o Google. Por favor, tente novamente.',
  userinfo_failed:
    'Não foi possível obter os dados da sua conta Google. Por favor, tente novamente.',
  email_not_verified_by_google:
    'O e-mail da sua conta Google não está verificado. Por favor, verifique-o no Google e tente novamente.',
  user_creation_failed:
    'Falha ao criar a sua conta. Por favor, tente novamente ou contacte o suporte.',
  token_generation_failed:
    'Falha ao gerar os tokens de autenticação. Por favor, tente novamente.',
  session_creation_failed:
    'Não foi possível criar a sua sessão. Por favor, tente novamente.',
};

// Maps backend error codes and messages to user-friendly pt-PT strings.
// This ensures the user never sees raw API errors or axios internals.
const LOGIN_ERROR_MESSAGES = {
  // Backend codes
  CSRF_VALIDATION_FAILED: 'Ocorreu um erro de segurança. Por favor, recarregue a página e tente novamente.',
  EMAIL_NOT_VERIFIED: null, // handled separately below
  // Backend error strings → friendly messages
  'Invalid email or password': 'Email ou palavra-passe incorretos. Por favor, verifique os seus dados e tente novamente.',
  'Invalid request body': 'Pedido inválido. Por favor, tente novamente.',
  'Failed to create session': 'Não foi possível criar a sessão. Por favor, tente novamente.',
};

const getFriendlyLoginError = (err) => {
  const code = err.response?.data?.code;
  if (code && LOGIN_ERROR_MESSAGES[code] !== undefined) {
    return LOGIN_ERROR_MESSAGES[code] ?? err.response.data.error;
  }
  const backendMessage = err.response?.data?.error;
  if (backendMessage && LOGIN_ERROR_MESSAGES[backendMessage]) {
    return LOGIN_ERROR_MESSAGES[backendMessage];
  }
  // Network/axios errors (no response at all)
  if (!err.response) {
    return 'Não foi possível contactar o servidor. Verifique a sua ligação e tente novamente.';
  }
  // Fallback for any unmapped backend message — still better than the raw axios string
  return backendMessage || 'Ocorreu um erro inesperado. Por favor, tente novamente.';
};

function SignInPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [localSuccess, setLocalSuccess] = useState(false);
  const { login, isAuthActionLoading } = useContext(AuthContext);
  const location = useLocation();
  const navigate = useNavigate();

  // Ref ensures we only consume the URL error param once, even in React 18 Strict Mode.
  const urlErrorConsumed = useRef(false);

  useEffect(() => {
    if (urlErrorConsumed.current) return;

    const searchParams = new URLSearchParams(location.search);
    const errorParam = searchParams.get('error');

    if (errorParam) {
      urlErrorConsumed.current = true;

      const message =
        OAUTH_ERROR_MESSAGES[errorParam] ||
        'An error occurred during authentication. Please try again.';

      setLocalError(message);

      // Strip the query param from the URL immediately so a page refresh
      // doesn't re-show the error and so the URL stays clean.
      navigate(location.pathname, { replace: true });
    }
  }, [location, navigate]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLocalSuccess(false);

    try {
      await login(email, password);
      setLocalSuccess(true);
    } catch (err) {
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        setLocalError(
          err.response.data.error ||
          'O seu email ainda não foi verificado. Foi enviado um novo link de verificação.'
        );
      } else {
        setLocalError(getFriendlyLoginError(err));
      }
      setLocalSuccess(false);
    }
  };

  const handleGoogleSignIn = () => {
    const googleLoginUrl = `${process.env.REACT_APP_API_BASE_URL}${API_ENDPOINTS.AUTH_GOOGLE_LOGIN}`;
    window.location.href = googleLoginUrl;
  };

  const formDisabled = isAuthActionLoading || localSuccess;

  return (
    <AuthModal>
      <Box sx={{ width: '100%', textAlign: 'left' }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold' }}>
          Bem-vindo a VisorFinanceiro
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          Entre com a sua conta local ou através da sua conta Google.
        </Typography>
        <Link component={RouterLink} to="/signup" variant="body1" sx={{ mb: 3, display: 'block', textDecoration: 'none' }}>
          Criar uma conta
        </Link>

        {/* Error banner — uses Collapse for a smooth entrance */}
        <Collapse in={!!localError}>
          <Alert
            severity="error"
            onClose={() => setLocalError('')}
            sx={{ width: '100%', mt: 1, mb: 2 }}
          >
            {localError}
          </Alert>
        </Collapse>

        <Collapse in={localSuccess && !localError}>
          <Alert severity="success" sx={{ width: '100%', mt: 1, mb: 2 }}>
            Login com sucesso! A redirecionar...
          </Alert>
        </Collapse>

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 500, mb: 0.5 }}>Email</Typography>
          <TextField
            required
            fullWidth
            id="email"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={formDisabled}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>Senha</Typography>
            <Link component={RouterLink} to="/request-password-reset" variant="body2" sx={{ textDecoration: 'none' }}>
              Esqueceu a sua senha?
            </Link>
          </Box>
          <TextField
            sx={{ mt: 0.5 }}
            required
            fullWidth
            name="password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={formDisabled}
          />

          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{
              mt: 3,
              mb: 2,
              backgroundColor: '#3699FF',
              '&:hover': { backgroundColor: '#2680d6' },
              textTransform: 'none',
              py: 1.5,
            }}
            disabled={formDisabled}
          >
            {isAuthActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Entrar'}
          </Button>

          <Divider sx={{ my: 2 }} />

          <Button
            fullWidth
            variant="outlined"
            startIcon={<GoogleColorIcon />}
            onClick={handleGoogleSignIn}
            sx={{
              textTransform: 'none',
              color: 'text.secondary',
              borderColor: 'grey.400',
              py: 1.5,
              '&:hover': { borderColor: 'grey.600', backgroundColor: 'rgba(0,0,0,0.04)' },
            }}
          >
            Entrar com o Google
          </Button>
        </Box>
      </Box>
    </AuthModal>
  );
}

export default SignInPage;
