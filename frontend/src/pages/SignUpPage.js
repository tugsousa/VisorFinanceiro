// frontend/src/pages/SignUpPage.js
import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Container, Paper, Box, Typography, TextField, Button, Alert, CircularProgress, Grid, Link
} from '@mui/material';

function SignUpPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [localSuccessMessage, setLocalSuccessMessage] = useState('');
  const { register, loading: authLoading, authError: contextAuthError } = useContext(AuthContext);

  // useEffect to sync contextAuthError to localError
  useEffect(() => {
    // Only sync if we aren't in a success state from *this* component's actions
    // and if contextAuthError is new and different from current localError
    if (contextAuthError && !localSuccessMessage && contextAuthError !== localError) {
        console.log('[SignUpPage] Syncing contextAuthError to localError:', contextAuthError);
        setLocalError(contextAuthError);
    }
  }, [contextAuthError, localSuccessMessage, localError]);

  // DEBUG: Log localError state changes
  useEffect(() => {
    console.log('[SignUpPage] useEffect: localError state changed to:', localError);
  }, [localError]);

  // DEBUG: Log localSuccessMessage state changes
  useEffect(() => {
    console.log('[SignUpPage] useEffect: localSuccessMessage state changed to:', localSuccessMessage);
  }, [localSuccessMessage]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('[SignUpPage] handleSubmit started.');

    // 1. Clear previous local success/error messages for this submission attempt.
    //    This ensures that a new submission starts with a clean slate for UI feedback from this component.
    setLocalSuccessMessage('');
    setLocalError('');

    // 2. Perform client-side validations.
    let clientValidationError = '';
    if (password !== confirmPassword) {
      clientValidationError = 'Passwords do not match';
    } else if (!email.trim()) {
      clientValidationError = 'Email is required.';
    } else if (!/\S+@\S+\.\S+/.test(email)) {
      clientValidationError = 'Please enter a valid email address.';
    } else if (password.length < 6) {
      clientValidationError = 'Password must be at least 6 characters long.';
    }

    // 3. If there's a client-side validation error, set it and stop.
    if (clientValidationError) {
      console.log('[SignUpPage] Client-side validation failed:', clientValidationError);
      setLocalError(clientValidationError);
      console.log('[SignUpPage] handleSubmit finished due to client-side validation error.');
      return;
    }

    // 4. If client-side validations pass, proceed with API call.
    console.log('[SignUpPage] Client-side validations passed. Proceeding with API call.');
    try {
      console.log('[SignUpPage] Attempting registration for:', { username, email });
      const result = await register(username, email, password); // register from AuthContext
      const successMsg = result.message || 'Registration submitted. Please check your email to verify your account.';
      console.log('[SignUpPage] Registration call to AuthContext successful. Message:', successMsg);
      setLocalSuccessMessage(successMsg);
      setLocalError(''); // Ensure error is cleared on success
    } catch (err) {
      // This 'err' is the one re-thrown by AuthContext's register method
      const errorMessage = err.message || 'Registration failed. Please try again.';
      console.log(`[SignUpPage] Registration call to AuthContext failed. Error message caught: "${errorMessage}"`);
      setLocalError(errorMessage);
      setLocalSuccessMessage(''); // Ensure success message is cleared on error
      console.error('[SignUpPage] Detailed error object caught in handleSubmit (API error):', err);
    }
    console.log('[SignUpPage] handleSubmit finished.');
  };

  const formDisabled = authLoading || !!localSuccessMessage;

  console.log('[SignUpPage] Rendering - authLoading:', authLoading, 'localError:', localError, 'localSuccessMessage:', localSuccessMessage);

  return (
    <Container component="main" maxWidth="xs" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: { xs: 2, sm: 3 } }}>
        <Typography component="h1" variant="h5">
          Sign Up
        </Typography>

        {localError && (
          <Alert severity="error" sx={{ width: '100%', mt: 2, mb: 1 }}>
            {localError}
          </Alert>
        )}

        {localSuccessMessage && (
          <Alert severity="success" sx={{ width: '100%', mt: 2, mb: 1 }}>
            {localSuccessMessage}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
          <TextField
            margin="normal"
            required
            fullWidth
            id="username"
            label="Username"
            name="username"
            autoComplete="username"
            autoFocus
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            disabled={formDisabled}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            id="email"
            label="Email Address"
            name="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={formDisabled}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password (min. 6 characters)"
            type="password"
            id="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={formDisabled}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="confirmPassword"
            label="Confirm Password"
            type="password"
            id="confirmPassword"
            autoComplete="new-password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            disabled={formDisabled}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={formDisabled}
          >
            {authLoading ? <CircularProgress size={24} color="inherit" /> : 'Sign Up'}
          </Button>
          <Grid container justifyContent="flex-end">
            <Grid item>
              <Link component={RouterLink} to="/signin" variant="body2">
                Already have an account? Sign In
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  );
}

export default SignUpPage;