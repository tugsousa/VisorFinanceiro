// frontend/src/pages/SignInPage.js
import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, Grid, Link, Divider
} from '@mui/material';
import AuthModal from '../components/auth/AuthModal';
import GoogleIcon from '@mui/icons-material/Google';

function SignInPage() {
  const [email, setemail] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [localSuccess, setLocalSuccess] = useState(false);
  const { login, isAuthActionLoading, authError: contextAuthError } = useContext(AuthContext);

  useEffect(() => {
    if (contextAuthError) {
      setLocalError(contextAuthError);
    }
  }, [contextAuthError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLocalError('');
    setLocalSuccess(false);

    try {
      await login(email, password);
      setLocalSuccess(true);
 } catch (err) {
      // --- START MODIFICATION ---
      // Check for our specific error code from the backend
      if (err.response?.data?.code === 'EMAIL_NOT_VERIFIED') {
        // Use the detailed message from the server, which confirms a new email was sent.
        const errorMessage = err.response.data.error || 'O teu e-mail ainda não foi validado. Foi enviado um novo link.';
        setLocalError(errorMessage);
      } else {
        // Fallback for all other login errors
        const errorMessage = err.message || 'Ocorreu um erro inesperado durante o login.';
        setLocalError(errorMessage);
      }
      // --- END MODIFICATION ---
      setLocalSuccess(false);
    }
  };

  const handleGoogleSignIn = () => {
    // Google Sign-In functionality will be added later
    console.log("Google Sign-In clicked");
  };

  return (
    <AuthModal>
      <Box sx={{ width: '100%', textAlign: 'left' }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold' }}>
          Bem-vindo a RumoClaro
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 2 }}>
          Entre com a sua conta local ou através da sua conta Google.
        </Typography>
        <Link component={RouterLink} to="/signup" variant="body1" sx={{ mb: 3, display: 'block',textDecoration: 'none' }}>
          Criar uma conta
        </Link>

        {localError && (
          <Alert severity="error" sx={{ width: '100%', mt: 2, mb: 1 }}>
            {localError}
          </Alert>
        )}

        {localSuccess && !localError && (
          <Alert severity="success" sx={{ width: '100%', mt: 2, mb: 1 }}>
            Login com sucesso! A redirecionar...
          </Alert>
        )}

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
            onChange={(e) => setemail(e.target.value)}
            disabled={isAuthActionLoading || (localSuccess && !localError)}
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
            disabled={isAuthActionLoading || (localSuccess && !localError)}
          />
          
          <Button
            type="submit"
            variant="contained"
            sx={{ 
              mt: 3, 
              mb: 2, 
              backgroundColor: '#3699FF;',
              '&:hover': {
                backgroundColor: '#3699FF;'
              },
              textTransform: 'none',
              px: 4
            }}
            disabled={isAuthActionLoading || (localSuccess && !localError)}
          >
            {isAuthActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Entrar'}
          </Button>

          <Divider sx={{ my: 2 }} />

          <Button
              variant="outlined"
              startIcon={<GoogleIcon />}
              onClick={handleGoogleSignIn}
              sx={{ 
                textTransform: 'none', 
                color: 'text.secondary',
                borderColor: 'grey.400'
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