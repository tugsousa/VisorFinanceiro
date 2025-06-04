// frontend/src/pages/VerifyEmailPage.js
import React, { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import axios from 'axios'; // Using axios directly for simplicity here, or use apiClient
import { API_ENDPOINTS } from '../constants';
import { Typography, Box, CircularProgress, Button, Alert } from '@mui/material';

const VerifyEmailPage = () => {
  const { token } = useParams(); // If your route is /verify-email/:token
  const navigate = useNavigate();
  const [verificationStatus, setVerificationStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('Verifying your email...');

  useEffect(() => {
    if (!token) {
      setMessage('Invalid verification link: No token provided.');
      setVerificationStatus('error');
      return;
    }

    const verify = async () => {
      try {
        // Construct the full URL for the API call
        const verificationUrl = `${window.location.origin}${API_ENDPOINTS.AUTH_VERIFY_EMAIL}?token=${token}`;
        // Note: Using window.location.origin assumes frontend and backend are on the same origin
        // or proxy is correctly set up. If not, use the full backend URL.
        // For development with proxy, `/api/auth/verify-email?token=${token}` might work directly with apiClient

        // Using axios directly to avoid potential CSRF issues on this public GET link
        // OR ensure your apiClient's GET requests for this specific URL bypass CSRF.
        const response = await axios.get(verificationUrl);

        setMessage(response.data.message || 'Email verified successfully! You can now log in.');
        setVerificationStatus('success');
        setTimeout(() => navigate('/signin?verified=true'), 3000); // Redirect after a delay
      } catch (err) {
        setMessage(err.response?.data?.error || err.response?.data || err.message || 'Failed to verify email. The link may be invalid or expired.');
        setVerificationStatus('error');
      }
    };

    verify();
  }, [token, navigate]);

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, mt: 4 }}>
      <Typography variant="h5" gutterBottom>{message}</Typography>
      {verificationStatus === 'verifying' && <CircularProgress sx={{ my: 2 }} />}
      {verificationStatus === 'error' && (
        <Alert severity="error" sx={{my: 2}}>{message}</Alert>
      )}
       {verificationStatus === 'success' && (
        <Alert severity="success" sx={{my: 2}}>{message}</Alert>
      )}
      <Button component={Link} to="/signin" variant="contained" sx={{ mt: 2 }}>
        Go to Sign In
      </Button>
    </Box>
  );
};

export default VerifyEmailPage;