// frontend/src/pages/SignUpPage.js
import React, { useState, useContext, useEffect, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Container, Paper, Box, Typography, TextField, Button, Alert, CircularProgress, Grid, Link
} from '@mui/material';

function SignUpPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  
  const [pageError, setPageError] = useState('');
  const [pageSuccessMessage, _setPageSuccessMessage] = useState('');
  const pageSuccessMessageRef = useRef(pageSuccessMessage);

  const setPageSuccessMessage = (value) => {
    console.log(`[SignUpPage setPageSuccessMessage INTENTION] New value to set: "${value}"`, 'Current ref before this call:', `"${pageSuccessMessageRef.current}"`);
    pageSuccessMessageRef.current = value;
    _setPageSuccessMessage(value);
  };

  // Use the specific loading state for auth actions from the context
  const { register, isAuthActionLoading, authError: contextAuthError } = useContext(AuthContext);

  useEffect(() => {
    console.log('[SignUpPage] Component MOUNTED. Initial pageSuccessMessage (ref):', `"${pageSuccessMessageRef.current}"`, '(state):', `"${pageSuccessMessage}"`);
    return () => {
      console.log('[SignUpPage] Component WILL UNMOUNT. Current pageSuccessMessage (ref):', `"${pageSuccessMessageRef.current}"`, '(state):', `"${pageSuccessMessage}"`);
    };
  }, []);

  useEffect(() => {
    if (contextAuthError && !pageSuccessMessageRef.current) {
      console.log('[SignUpPage_useEffect_ContextError] Syncing contextAuthError to pageError:', `"${contextAuthError}"`);
      setPageError(contextAuthError);
    } else if (!contextAuthError && !pageSuccessMessageRef.current) {
        if (pageError) {
            console.log('[SignUpPage_useEffect_ContextError] Clearing pageError as contextAuthError is null and no success message.');
            setPageError('');
        }
    }
  }, [contextAuthError, pageError]); // Added pageError to dependencies

  useEffect(() => {
    console.log('[SignUpPage useEffect pageSuccessMessage WATCHER] Actual state value is now:', `"${pageSuccessMessage}"`, 'Ref value is:', `"${pageSuccessMessageRef.current}"`);
  }, [pageSuccessMessage]);


  const handleSubmit = async (e) => {
    e.preventDefault();
    console.log('[SignUpPage_handleSubmit] Triggered.');

    setPageSuccessMessage('');
    setPageError('');

    let clientValidationError = '';
    if (!username.trim()) clientValidationError = 'Username is required.';
    else if (!email.trim()) clientValidationError = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) clientValidationError = 'Please enter a valid email address.';
    else if (!password) clientValidationError = 'Password is required.';
    else if (password.length < 6) clientValidationError = 'Password must be at least 6 characters long.';
    else if (password !== confirmPassword) clientValidationError = 'Passwords do not match.';

    if (clientValidationError) {
      console.warn('[SignUpPage_handleSubmit] Client validation FAILED:', clientValidationError);
      setPageError(clientValidationError);
      return;
    }
    console.log('[SignUpPage_handleSubmit] Client validation PASSED.');

    const handleRegistrationSuccess = (result) => {
      const successMsg = result.message || 'Registration successful! Please check your email to verify your account.';
      console.log('[SignUpPage_handleRegistrationSuccess] CALLED from AuthContext.register.');
      setPageSuccessMessage(successMsg);
      setPageError('');
    };

    const handleRegistrationError = (err) => {
      const errorMessage = err.message || 'Registration failed. Please try again.';
      console.error('[SignUpPage_handleRegistrationError] CALLED from AuthContext.register.');
      setPageError(errorMessage);
      setPageSuccessMessage('');
    };

    console.log('[SignUpPage_handleSubmit] Calling AuthContext.register with callbacks for:', { username, email });
    await register(username, email, password, handleRegistrationSuccess, handleRegistrationError);
  };

  // Use isAuthActionLoading for the button's loading state and form disabling
  const formDisabled = isAuthActionLoading || !!pageSuccessMessageRef.current;

  console.log(
    '[SignUpPage_render] INFO - isAuthActionLoading:', isAuthActionLoading, 
    'pageSuccessMessage (state):', `"${pageSuccessMessage}"`,
    'pageSuccessMessage (ref):', `"${pageSuccessMessageRef.current}"`,
    'pageError:', `"${pageError}"`,          
    'formDisabled:', formDisabled
  );

  return (
    <Container component="main" maxWidth="xs" sx={{ mt: 4, mb: 4 }}>
      <Paper elevation={3} sx={{ marginTop: 4, display: 'flex', flexDirection: 'column', alignItems: 'center', padding: { xs: 2, sm: 3 } }}>
        <Typography component="h1" variant="h5">
          Sign Up
        </Typography>

        {pageSuccessMessage && (
          <Alert severity="success" sx={{ width: '100%', mt: 2, mb: 1 }}>
            {pageSuccessMessage}
          </Alert>
        )}

        {pageError && !pageSuccessMessage && (
          <Alert severity="error" sx={{ width: '100%', mt: 2, mb: 1 }}>
            {pageError}
          </Alert>
        )}

        <Box component="form" onSubmit={handleSubmit} noValidate sx={{ mt: 1, width: '100%' }}>
          <TextField margin="normal" required fullWidth id="username" label="Username" name="username" autoComplete="username" autoFocus value={username} onChange={(e) => setUsername(e.target.value)} disabled={formDisabled}/>
          <TextField margin="normal" required fullWidth id="email" label="Email Address" name="email" autoComplete="email" value={email} onChange={(e) => setEmail(e.target.value)} disabled={formDisabled}/>
          <TextField margin="normal" required fullWidth name="password" label="Password (min. 6 characters)" type="password" id="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} disabled={formDisabled}/>
          <TextField margin="normal" required fullWidth name="confirmPassword" label="Confirm Password" type="password" id="confirmPassword" autoComplete="new-password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} disabled={formDisabled}/>
          
          <Button type="submit" fullWidth variant="contained" sx={{ mt: 3, mb: 2 }} disabled={formDisabled}>
            {isAuthActionLoading ? <CircularProgress size={24} color="inherit" /> : 'Sign Up'}
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