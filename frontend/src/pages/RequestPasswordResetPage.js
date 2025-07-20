// frontend/src/pages/RequestPasswordResetPage.js
import React, { useState, useContext } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { apiRequestPasswordReset } from '../api/apiService';
import {
  Box, Typography, TextField, Button, Alert, CircularProgress, Link, Grid
} from '@mui/material';
import AuthModal from '../components/auth/AuthModal'; // Import the AuthModal

function RequestPasswordResetPage() {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const { fetchCsrfToken } = useContext(AuthContext);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    if (!email.trim()) {
        setError('Please enter your email address.');
        setIsLoading(false);
        return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        setError('Please enter a valid email address.');
        setIsLoading(false);
        return;
    }
    
    try {
      await fetchCsrfToken(true); // silent fetch

      const response = await apiRequestPasswordReset(email);
      setMessage(response.data.message || 'If an account with that email exists, a password reset link has been sent.');
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'Failed to request password reset. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <AuthModal>
      <Box sx={{ width: '100%' }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold' }}>
          Esqueceu a sua senha?
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Insira o seu email para redefinir a senha
        </Typography>
        
        {error && <Alert severity="error" sx={{ width: '100%', mb: 2 }}>{error}</Alert>}
        {message && <Alert severity="success" sx={{ width: '100%', mb: 2 }}>{message}</Alert>}
        
        <Box component="form" onSubmit={handleSubmit} noValidate>
          <Typography variant="subtitle2" sx={{ fontWeight: 500 }}>Email</Typography>
          <TextField
            margin="dense"
            required
            fullWidth
            id="email"
            name="email"
            autoComplete="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={isLoading || !!message}
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
        backgroundColor: '#1e88e5', // Blue similar to One Finance
        '&:hover': {
          backgroundColor: '#1565c0',
        },
      }}
      disabled={isLoading || !!message}
    >
      {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Enviar'}
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
        '&:hover': {
          borderColor: '#1565c0',
          color: '#1565c0',
        },
      }}
    >
      Cancelar
    </Button>
  </Grid>
</Grid>
        </Box>
      </Box>
    </AuthModal>
  );
}

export default RequestPasswordResetPage;