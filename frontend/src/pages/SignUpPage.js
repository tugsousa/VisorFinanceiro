import React, { useState, useContext } from 'react';
import { useNavigate, Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Container, Paper, Box, Typography, TextField, Button, Alert, CircularProgress, Grid, Link
} from '@mui/material';
// No longer need to import '../App.css' for these specific styles

function SignUpPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { register, loading: authLoading } = useContext(AuthContext);
  // const navigate = useNavigate(); // Not strictly needed now

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!email.trim()) {
        setError('Email is required.');
        return;
    }
    if (!/\S+@\S+\.\S+/.test(email)) {
        setError('Please enter a valid email address.');
        return;
    }
    if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
    }

    try {
      const result = await register(username, email, password);
      setSuccessMessage(result.message || 'Registration submitted. Please check your email to verify your account.');
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    }
  };

  const formDisabled = authLoading || !!successMessage;

  return (
    <Container component="main" maxWidth="xs" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: { xs: 2, sm: 3 } }}>
        <Typography component="h1" variant="h5">
          Sign Up
        </Typography>
        {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
        {successMessage && <Alert severity="success" sx={{ width: '100%', mt: 2 }}>{successMessage}</Alert>}
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
            error={!!error && error.includes("Password")}
            helperText={error && error.includes("Password") ? error : ""}
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
            error={!!error && error.includes("Passwords do not match")}
            helperText={error && error.includes("Passwords do not match") ? "Passwords do not match" : ""}
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