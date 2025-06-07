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
      const { login, loading: authLoading, authError: contextAuthError } = useContext(AuthContext); 

      useEffect(() => {
        if (contextAuthError) {
            setLocalError(contextAuthError);
        }
      }, [contextAuthError]);

      const handleSubmit = async (e) => {
        e.preventDefault();
        
        if (!authLoading) {
            setLocalError('');
            setLocalSuccess(false);
        }

        try {
          await login(username, password); 
          setLocalSuccess(true);
        } catch (err) {
          const errorMessage = err.message || 'An unexpected error occurred during login.';
          setLocalError(errorMessage); 
          setLocalSuccess(false); 
        }
      };

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
              <Grid container>
                <Grid item xs>
                  <Link component={RouterLink} to="/request-password-reset" variant="body2">
                    Forgot password?
                  </Link>
                </Grid>
                <Grid item>
                  <Link component={RouterLink} to="/signup" variant="body2">
                    {"Don't have an account? Sign Up"}
                  </Link>
                </Grid>
              </Grid>
            </Box>
          </Paper>
        </Container>
      );
    }

     export default SignInPage;