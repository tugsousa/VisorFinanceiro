// frontend/src/pages/SignInPage.js
import React, { useState, useContext, useEffect } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Container, Paper, Box, Typography, TextField, Button, Alert, CircularProgress, Grid, Link
} from '@mui/material';

function SignInPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [localError, setLocalError] = useState('');
  const [localSuccess, setLocalSuccess] = useState(false);
  const { login, loading: authLoading, authError: contextAuthError } = useContext(AuthContext); // Get contextAuthError

  // useEffect to sync contextAuthError to localError if it changes
  // This is a failsafe if AuthContext itself sets an error relevant to login
  useEffect(() => {
    if (contextAuthError) {
        console.log('[SignInPage] Syncing contextAuthError to localError:', contextAuthError);
        setLocalError(contextAuthError);
    }
  }, [contextAuthError]);


  // DEBUG: Log localError state changes
  useEffect(() => {
    console.log('[SignInPage] localError state changed to:', localError);
  }, [localError]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('[SignInPage] handleSubmit started.');
    
    // Clear previous states ONLY if not already loading
    // This prevents clearing the error from a previous failed attempt if the user clicks submit again while it's already processing
    if (!authLoading) {
        console.log('[SignInPage] Clearing localError and localSuccess.');
        setLocalError('');
        setLocalSuccess(false);
    }

    try {
      console.log('[SignInPage] Attempting login for username:', username);
      await login(username, password); // This login is from AuthContext
      console.log('[SignInPage] Login call to AuthContext successful. Setting localSuccess true.');
      setLocalSuccess(true);
      // No need to clear localError here if login is successful because it was cleared at the start
      // Navigation will be handled by PublicRoute due to user state change in AuthContext
    } catch (err) {
      // This 'err' is the one re-thrown by AuthContext's login method
      const errorMessage = err.message || 'An unexpected error occurred during login.';
      console.log(`[SignInPage] Login call to AuthContext failed. Error message caught: "${errorMessage}"`);
      setLocalError(errorMessage); // Set the local error state for display
      setLocalSuccess(false); // Ensure success is false if login failed
      console.error('[SignInPage] Detailed error object caught in handleSubmit:', err);
    }
    console.log('[SignInPage] handleSubmit finished.');
  };

  console.log('[SignInPage] Rendering - authLoading:', authLoading, 'localError:', localError, 'localSuccess:', localSuccess);

  return (
    <Container component="main" maxWidth="xs" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: { xs: 2, sm: 3 } }}>
        <Typography component="h1" variant="h5">
          Sign In
        </Typography>
        
        {localError && (
          <Alert severity="error" sx={{ width: '100%', mt: 2, mb: 1 }}>
            {localError}
          </Alert>
        )}
        
        {localSuccess && !localError && (
          <Alert severity="success" sx={{ width: '100%', mt: 2, mb: 1 }}>
            Login successful! Redirecting...
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
            disabled={authLoading || (localSuccess && !localError)}
          />
          <TextField
            margin="normal"
            required
            fullWidth
            name="password"
            label="Password"
            type="password"
            id="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            disabled={authLoading || (localSuccess && !localError)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={authLoading || (localSuccess && !localError)}
          >
            {authLoading ? <CircularProgress size={24} color="inherit" /> : 'Sign In'}
          </Button>
          <Grid container justifyContent="flex-end">
            <Grid item>
              <Link component={RouterLink} to="/signup" variant="body2">
                Don't have an account? Sign Up
              </Link>
            </Grid>
          </Grid>
        </Box>
      </Paper>
    </Container>
  );
}

export default SignInPage;