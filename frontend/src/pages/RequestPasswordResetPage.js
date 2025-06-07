  // frontend/src/pages/RequestPasswordResetPage.js
    import React, { useState, useContext } from 'react';
    import { Link as RouterLink } from 'react-router-dom';
    import { AuthContext } from '../context/AuthContext';
    import { apiRequestPasswordReset } from '../api/apiService';
    import {
      Container, Paper, Box, Typography, TextField, Button, Alert, CircularProgress, Link, Grid
    } from '@mui/material';

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
          // Ensure CSRF token is available (apiService interceptor should handle it,
          // but explicit fetch can be a fallback if needed)
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
        <Container component="main" maxWidth="xs" sx={{ mt: 4, mb: 4 }}>
          <Paper elevation={3} sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 3 }}>
            <Typography component="h1" variant="h5">
              Forgot Password
            </Typography>
            <Typography variant="body2" sx={{ mt: 1, mb: 2, textAlign: 'center' }}>
              Enter your email address and we'll send you a link to reset your password.
            </Typography>
            
            {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
            {message && <Alert severity="success" sx={{ width: '100%', mt: 2 }}>{message}</Alert>}
            
            <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
              <TextField
                margin="normal"
                required
                fullWidth
                id="email"
                label="Email Address"
                name="email"
                autoComplete="email"
                autoFocus
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={isLoading || !!message} // Disable if loading or success message shown
              />
              <Button
                type="submit"
                fullWidth
                variant="contained"
                sx={{ mt: 3, mb: 2 }}
                disabled={isLoading || !!message} // Disable if loading or success message shown
              >
                {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Send Reset Link'}
              </Button>
              <Grid container justifyContent="flex-end">
                <Grid item>
                  <Link component={RouterLink} to="/signin" variant="body2">
                    Back to Sign In
                  </Link>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Container>
      );
    }

    export default RequestPasswordResetPage;