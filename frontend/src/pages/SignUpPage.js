// frontend/src/pages/SignUpPage.js
import React, { useState, useContext, useRef } from 'react';
import { Link as RouterLink } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import {
  Container, Paper, Box, Typography, TextField, Button, Alert, CircularProgress, Grid, Link
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
  
  const successShownRef = useRef(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setPageSuccessMessage('');
    setPageError('');
    successShownRef.current = false;

    let clientValidationError = '';
    if (!username.trim()) clientValidationError = 'Username is required.';
    else if (!email.trim()) clientValidationError = 'Email is required.';
    else if (!/\S+@\S+\.\S+/.test(email)) clientValidationError = 'Please enter a valid email address.';
    else if (!password) clientValidationError = 'Password is required.';
    else if (password.length < 6) clientValidationError = 'Password must be at least 6 characters long.';
    else if (password !== confirmPassword) clientValidationError = 'Passwords do not match.';

    if (clientValidationError) {
      setPageError(clientValidationError);
      return;
    }

    const handleRegistrationSuccess = (result) => {
      const successMsg = result.message || 'Registration successful! Please check your email to verify your account.';
      setPageSuccessMessage(successMsg);
      successShownRef.current = true;
      setPageError('');
    };

    const handleRegistrationError = (err) => {
      const errorMessage = err.message || 'Registration failed. Please try again.';
      setPageError(errorMessage);
      setPageSuccessMessage('');
    };

    await register(username, email, password, handleRegistrationSuccess, handleRegistrationError);
  };

  const formDisabled = isAuthActionLoading || !!pageSuccessMessage;

  return (
    <AuthModal>
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
    </AuthModal>
  );
}

export default SignUpPage;