// frontend/src/pages/VerifyEmailPage.js
import React, { useEffect, useState, useCallback } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios'; // Using global axios instance for this simple GET
import { API_ENDPOINTS } from '../constants';
import { Typography, Box, CircularProgress, Button, Alert } from '@mui/material';

const VerifyEmailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const [verificationStatus, setVerificationStatus] = useState('pending'); // pending, verifying, success, error
  const [message, setMessage] = useState('Waiting for verification token...');
  const [extractedToken, setExtractedToken] = useState(null);

  // Effect 1: Extract token from URL query parameters
  useEffect(() => {
    const queryParams = new URLSearchParams(location.search);
    const tokenFromQuery = queryParams.get('token');
    console.log('[VerifyEmailPage] Token from query:', tokenFromQuery);
    setExtractedToken(tokenFromQuery);
  }, [location.search]);

  // Callback to perform the actual verification
  const performVerification = useCallback(async (tokenToVerify) => {
    if (!tokenToVerify) {
      setMessage('Invalid verification link: No token provided.');
      setVerificationStatus('error');
      console.error('[VerifyEmailPage] No token to verify.');
      return;
    }

    setVerificationStatus('verifying');
    setMessage('Verifying your email...');

    console.log('[VerifyEmailPage] Value of API_ENDPOINTS:', API_ENDPOINTS);
    console.log('[VerifyEmailPage] Value of API_ENDPOINTS.AUTH_VERIFY_EMAIL:', API_ENDPOINTS?.AUTH_VERIFY_EMAIL);

    if (!API_ENDPOINTS?.AUTH_VERIFY_EMAIL) {
        setMessage('Configuration error: Verification endpoint is not defined. Please contact support.');
        setVerificationStatus('error');
        console.error('[VerifyEmailPage] API_ENDPOINTS.AUTH_VERIFY_EMAIL is undefined or null.');
        return;
    }

    const verificationUrl = `${API_ENDPOINTS.AUTH_VERIFY_EMAIL}?token=${tokenToVerify}`;
    console.log('[VerifyEmailPage] Constructed verificationUrl:', verificationUrl);

    try {
      // Using global axios here. Ensure backend /api/auth/verify-email doesn't strictly require CSRF or auth headers for this GET.
      // The backend route `apiRouter.HandleFunc("GET /api/auth/verify-email", userHandler.VerifyEmailHandler)`
      // is outside the CSRF-protected group, so this should be fine.
      const response = await axios.get(verificationUrl);

      setMessage(response.data.message || 'Email verified successfully! You can now log in.');
      setVerificationStatus('success');
      setTimeout(() => navigate('/signin?verified=true'), 3000);
    } catch (err) {
      console.error('[VerifyEmailPage] Verification API call error:', err);
      console.error('[VerifyEmailPage] Error details:', {
          message: err.message,
          response: err.response ? { data: err.response.data, status: err.response.status } : 'No response object',
          requestUrl: verificationUrl,
      });
      setMessage(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to verify email. The link may be invalid or expired.');
      setVerificationStatus('error');
    }
  }, [navigate]); // navigate is stable

  // Effect 2: Trigger verification when extractedToken is available
  useEffect(() => {
    // Only proceed if extractedToken has been set (is not null)
    // This check ensures we don't run with the initial null value.
    if (extractedToken !== null) {
      performVerification(extractedToken);
    }
    // This effect depends on `extractedToken` changing from its initial `null` state.
    // `performVerification` is memoized by useCallback.
  }, [extractedToken, performVerification]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, mt: 4, textAlign: 'center' }}>
      <Typography variant="h5" gutterBottom>
        Email Verification
      </Typography>

      {verificationStatus === 'pending' && (
        <>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {message}
          </Typography>
          <CircularProgress sx={{ my: 2 }} />
        </>
      )}

      {verificationStatus === 'verifying' && (
        <>
          <Typography variant="body1" sx={{ mb: 2 }}>
            {message}
          </Typography>
          <CircularProgress sx={{ my: 2 }} />
        </>
      )}

      {verificationStatus === 'success' && (
        <Alert severity="success" sx={{ my: 2, width: '100%', maxWidth: '500px' }}>{message}</Alert>
      )}

      {verificationStatus === 'error' && (
        <Alert severity="error" sx={{ my: 2, width: '100%', maxWidth: '500px' }}>{message}</Alert>
      )}

      <Button component={Link} to="/signin" variant="contained" sx={{ mt: 2 }}>
        Go to Sign In
      </Button>
    </Box>
  );
};

export default VerifyEmailPage;