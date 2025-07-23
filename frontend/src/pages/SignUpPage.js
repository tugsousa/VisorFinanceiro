// frontend/src/pages/SignUpPage.js
import React, { useState, useContext, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Box, Typography, TextField, Button, Alert, Link, Divider, CircularProgress
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

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPageSuccessMessage('');
    setPageError('');

    let clientValidationError = '';
    if (!username.trim()) clientValidationError = 'Username is required.';
    else if (!email.trim()) clientValidationError = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) clientValidationError = 'Please enter a valid email address.';
    else if (!password) clientValidationError = 'Password is required.';
    else if (password.length < 6) clientValidationError = 'Password must be at least 6 characters.';
    else if (password !== confirmPassword) clientValidationError = 'Passwords do not match.';

    if (clientValidationError) {
      setPageError(clientValidationError);
      return;
    }

    const onSuccess = (result) => {
      setPageSuccessMessage(result.message || 'Account created successfully! Please check your email.');
      setPageError('');
    };

    const onError = (err) => {
      setPageError(err.message || 'Failed to create account. Please try again.');
      setPageSuccessMessage('');
    };

    await register(username, email, password, onSuccess, onError);
  };

  const formDisabled = isAuthActionLoading || !!pageSuccessMessage;

  return (
    <AuthModal>
      <Box sx={{ width: '100%', maxWidth: 400 }}>
        <Typography component="h1" variant="h5" sx={{ fontWeight: 'bold' }}>
          Welcome to RumoClaro
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mt: 1, mb: 3 }}>
          Create an account to get started.
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

          {/* --- NEW USERNAME FIELD --- */}
          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Username</Typography>
          <TextField
            fullWidth
            margin="dense"
            id="username"
            name="username"
            type="text"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={formDisabled}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Email</Typography>
          <TextField
            fullWidth
            margin="dense"
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={formDisabled}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Password</Typography>
          <TextField
            fullWidth
            margin="dense"
            id="password"
            name="password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={formDisabled}
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Confirm Password</Typography>
          <TextField
            fullWidth
            margin="dense"
            id="confirmPassword"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={formDisabled}
          />

          <Button
            type="submit"
            fullWidth
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
            }}
            disabled={formDisabled}
          >
            {isAuthActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Create Account'}
          </Button>

          <Divider sx={{ my: 2 }} />

          <Typography variant="body2" align="center">
            Already have an account?{' '}
            <Link component={RouterLink} to="/signin" underline="hover">
              Sign In
            </Link>
          </Typography>
        </Box>
      </Box>
    </AuthModal>
  );
}

export default SignUpPage;