// frontend/src/features/auth/pages/ResetPasswordPage.js
import React, { useState, useEffect, useContext } from 'react';
import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { apiResetPassword } from 'features/auth/api/authApi';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, Grid
} from '@mui/material';
import AuthModal from '../components/AuthModal';

function ResetPasswordPage() {
  const location = useLocation();
  const navigate = useNavigate();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [token, setToken] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { fetchCsrfToken } = useContext(AuthContext);

  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const tokenFromQuery = queryParams.get('token');
    if (tokenFromQuery) {
      setToken(tokenFromQuery);
    } else {
      setError('Link de redefinição inválido: nenhum token fornecido.');
    }
  }, [location.search]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    if (!token) {
      setError('Token de redefinição em falta. Por favor, use o link enviado por email.');
      setIsLoading(false);
      return;
    }
    if (password !== confirmPassword) {
      setError('As senhas não coincidem.');
      setIsLoading(false);
      return;
    }
    if (!passwordRegex.test(password)) {
      setError('A senha deve ter no mínimo 8 caracteres, incluindo maiúscula, minúscula, número e símbolo.');
      setIsLoading(false);
      return;
    }

    try {
      await fetchCsrfToken(true);
      const response = await apiResetPassword(token, password, confirmPassword);
      setMessage(response.data.message || 'Senha redefinida com sucesso. Pode iniciar sessão agora.');
      setTimeout(() => navigate('/signin'), 3000);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Falha ao redefinir a senha. O link pode ser inválido ou ter expirado.');
    } finally {
      setIsLoading(false);
    }
  };

  const formDisabled = isLoading || !!message;

  return (
    <AuthModal>
      <Box sx={{ width: '100%' }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold' }}>
          Redefinir senha
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Introduza a sua nova senha abaixo
        </Typography>

        {error && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>}
        {message && <Alert severity="success" sx={{ width: '100%', mb: 2 }}>{message}</Alert>}

        {!token && !error && (
          <Alert severity="warning" sx={{ width: '100%', mb: 2 }}>
            A aguardar o token do link de redefinição...
          </Alert>
        )}

        {token && !message && (
          <Box component="form" onSubmit={handleSubmit} noValidate>
            <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>Nova senha</Typography>
            <TextField
              margin="dense"
              required
              fullWidth
              name="password"
              type="password"
              id="password"
              autoComplete="new-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={formDisabled}
              helperText="Min. 8 chars, 1 maiúscula, 1 minúscula, 1 número, 1 símbolo"
            />

            <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Confirmar nova senha</Typography>
            <TextField
              margin="dense"
              required
              fullWidth
              name="confirmPassword"
              type="password"
              id="confirmPassword"
              autoComplete="new-password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              disabled={formDisabled}
            />

            <Grid container spacing={2} justifyContent="center" sx={{ mt: 3, mb: 2 }}>
              <Grid item xs={12} sm={6}>
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  sx={{
                    textTransform: 'none',
                    py: 1.5,
                    backgroundColor: '#1e88e5',
                    '&:hover': { backgroundColor: '#1565c0' },
                  }}
                  disabled={formDisabled}
                >
                  {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Confirmar'}
                </Button>
              </Grid>
              <Grid item xs={12} sm={6}>
                <Button
                  fullWidth
                  variant="outlined"
                  component={RouterLink}
                  to="/signin"
                  sx={{
                    textTransform: 'none',
                    py: 1.5,
                    borderColor: '#1e88e5',
                    color: '#1e88e5',
                    '&:hover': { borderColor: '#1565c0', color: '#1565c0' },
                  }}
                >
                  Cancelar
                </Button>
              </Grid>
            </Grid>
          </Box>
        )}

        {/* Show cancel button even when there's a token error */}
        {!token && error && (
          <Button
            fullWidth
            variant="outlined"
            component={RouterLink}
            to="/signin"
            sx={{
              mt: 2,
              textTransform: 'none',
              py: 1.5,
              borderColor: '#1e88e5',
              color: '#1e88e5',
              '&:hover': { borderColor: '#1565c0', color: '#1565c0' },
            }}
          >
            Voltar a iniciar sessão
          </Button>
        )}
      </Box>
    </AuthModal>
  );
}

export default ResetPasswordPage;
