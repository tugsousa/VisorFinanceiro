// frontend/src/pages/SignUpPage.js
import React, { useState, useContext, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Box, Typography, TextField, Button, Alert, Link, Divider
} from '@mui/material';
import AuthModal from '../components/auth/AuthModal';

function SignUpPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [pageError, setPageError] = useState('');
  const [pageSuccessMessage, setPageSuccessMessage] = useState('');
  const { register, isAuthActionLoading } = useContext(AuthContext);
  const successShownRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPageSuccessMessage('');
    setPageError('');
    successShownRef.current = false;

    let clientValidationError = '';
    if (!email.trim()) clientValidationError = 'Email é obrigatório.';
    else if (!/\S+@\S+\.\S+/.test(email)) clientValidationError = 'Email inválido.';
    else if (!password) clientValidationError = 'Senha é obrigatória.';
    else if (password.length < 6) clientValidationError = 'A senha deve ter pelo menos 6 caracteres.';
    else if (password !== confirmPassword) clientValidationError = 'As senhas não coincidem.';

    if (clientValidationError) {
      setPageError(clientValidationError);
      return;
    }

    const onSuccess = (result) => {
      setPageSuccessMessage(result.message || 'Conta criada com sucesso. Verifique o seu email.');
      successShownRef.current = true;
      setPageError('');
    };

    const onError = (err) => {
      setPageError(err.message || 'Erro ao criar conta. Tente novamente.');
      setPageSuccessMessage('');
    };

    await register(username, email, password, onSuccess, onError);
  };

  const formDisabled = isAuthActionLoading || !!pageSuccessMessage;

  return (
    <AuthModal>
      <Box sx={{ width: '100%', maxWidth: 400 }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold' }}>
          Bem-vindo a RumoClaro
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Crie uma conta para começar a usar a RumoClaro.
        </Typography>

        {pageSuccessMessage && (
          <Alert severity="success" sx={{ mb: 2 }}>
            {pageSuccessMessage}
          </Alert>
        )}
        {pageError && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {pageError}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate>

          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Email</Typography>
          <TextField
            fullWidth
            margin="dense"
            id="email"
            name="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={formDisabled}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Senha</Typography>
          <TextField
            fullWidth
            margin="dense"
            id="password"
            name="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={formDisabled}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Confirmar Senha</Typography>
          <TextField
            fullWidth
            margin="dense"
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={formDisabled}
          />

      <Button
        type="submit"
        variant="contained"
        sx={{
          mt: 3,
          mb: 2,
          textTransform: 'none',
          backgroundColor: '#3699FF',
          '&:hover': {
            backgroundColor: '#2680d6',
          },
          py: 1.5,
          px: 4
        }}
        disabled={formDisabled}
      >
        Criar conta
      </Button>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" align="center">
            Já tem uma conta?{' '}
            <Link component={RouterLink} to="/signin" underline="hover">
              Iniciar sessão
            </Link>
          </Typography>
        </Box>
      </Box>
    </AuthModal>
  );
}

export default SignUpPage;
