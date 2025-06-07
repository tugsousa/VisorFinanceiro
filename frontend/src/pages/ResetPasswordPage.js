 // frontend/src/pages/ResetPasswordPage.js
    import React, { useState, useEffect, useContext } from 'react';
    import { useLocation, useNavigate, Link as RouterLink } from 'react-router-dom';
    import { AuthContext } from '../context/AuthContext';
    import { apiResetPassword } from '../api/apiService';
    import {
      Container, Paper, Box, Typography, TextField, Button, Alert, CircularProgress, Grid, Link
    } from '@mui/material';

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


      useEffect(() => {
        const queryParams = new URLSearchParams(location.search);
        const tokenFromQuery = queryParams.get('token');
        if (tokenFromQuery) {
          setToken(tokenFromQuery);
        } else {
          setError('Invalid password reset link: No token provided.');
        }
      }, [location.search]);

      const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');
        setIsLoading(true);

        if (!token) {
          setError('Password reset token is missing. Please use the link from your email.');
          setIsLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError('Passwords do not match.');
          setIsLoading(false);
          return;
        }
        if (password.length < 6) {
          setError('Password must be at least 6 characters long.');
          setIsLoading(false);
          return;
        }

        try {
          await fetchCsrfToken(true); // Ensure CSRF
          const response = await apiResetPassword(token, password, confirmPassword);
          setMessage(response.data.message || 'Password has been reset successfully. You can now log in.');
          setTimeout(() => navigate('/signin'), 3000);
        } catch (err) {
          setError(err.response?.data?.error || err.message || 'Failed to reset password. The link may be invalid or expired.');
        } finally {
          setIsLoading(false);
        }
      };

      return (
        <Container component="main" maxWidth="xs" sx={{ mt: 4, mb: 4 }}>
          <Paper elevation={3} sx={{ marginTop: 8, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 3 }}>
            <Typography component="h1" variant="h5">
              Reset Password
            </Typography>
            
            {error && <Alert severity="error" sx={{ width: '100%', mt: 2 }}>{error}</Alert>}
            {message && <Alert severity="success" sx={{ width: '100%', mt: 2 }}>{message}</Alert>}
            
            {!token && !error && ( // Show only if token is missing and no other error displayed yet
                 <Alert severity="warning" sx={{ width: '100%', mt: 2 }}>
                    Waiting for password reset token from URL... If you clicked a link from your email, it should appear.
                 </Alert>
            )}

            {token && !message && ( // Only show form if token exists and no success message yet
              <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="password"
                  label="New Password"
                  type="password"
                  id="password"
                  autoComplete="new-password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  disabled={isLoading}
                />
                <TextField
                  margin="normal"
                  required
                  fullWidth
                  name="confirmPassword"
                  label="Confirm New Password"
                  type="password"
                  id="confirmPassword"
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  disabled={isLoading}
                />
                <Button
                  type="submit"
                  fullWidth
                  variant="contained"
                  sx={{ mt: 3, mb: 2 }}
                  disabled={isLoading}
                >
                  {isLoading ? <CircularProgress size={24} color="inherit" /> : 'Reset Password'}
                </Button>
              </Box>
            )}
             <Grid container justifyContent="flex-end" sx={{ mt: message || error ? 2 : 0 }}>
                <Grid item>
                  <Link component={RouterLink} to="/signin" variant="body2">
                    Back to Sign In
                  </Link>
                </Grid>
              </Grid>
          </Paper>
        </Container>
      );
    }

    export default ResetPasswordPage;