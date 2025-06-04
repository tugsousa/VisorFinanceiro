import React, { useState, useContext } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Container, Paper, Box, Typography, TextField, Button, Alert, CircularProgress, Grid, Link
} from '@mui/material';
// No longer need to import '../App.css' for these specific styles

function SignInPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false); // Local success state for feedback
  const { login, loading: authLoading } = useContext(AuthContext);
  // const navigate = useNavigate(); // Not strictly needed here if PublicRoute handles redirect effectively

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    try {
      await login(username, password);
      setSuccess(true); // Indicate login attempt was successful from frontend perspective
      // Navigation is handled by PublicRoute due to user state change in AuthContext
    } catch (err) {
      if (err.message && err.message.toLowerCase().includes("email not verified")) {
        setError("Your email address has not been verified. Please check your inbox for the verification link. You may need to check your spam folder.");
      } else {
        setError(err.message || 'Invalid username or password');
      }
      console.error('Login error on SignInPage:', err);
    }
  };

  return (
    <Container component="main" maxWidth="xs" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: { xs: 2, sm: 3 } }}>
        <Typography component="h1" variant="h5">
          Sign In
        </Typography>
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
        {success && !error && <Alert severity="success" sx={{ width: '100%', mt: 2 }}>Login successful! Redirecting...</Alert>}
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
            disabled={authLoading || (success && !error)}
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
            disabled={authLoading || (success && !error)}
          />
          <Button
            type="submit"
            fullWidth
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={authLoading || (success && !error)}
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