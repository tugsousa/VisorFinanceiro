// frontend/src/pages/VerifyEmailPage.js
import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom'; // Import useLocation
import axios from 'axios';
import { API_ENDPOINTS } from '../constants';
import { Typography, Box, CircularProgress, Button, Alert } from '@mui/material';

const VerifyEmailPage = () => {
  // const { token } = useParams(); // REMOVE THIS LINE or keep commented out

  const location = useLocation(); // ADD THIS: Get location object
  const navigate = useNavigate();
  const [verificationStatus, setVerificationStatus] = useState('verifying'); // verifying, success, error
  const [message, setMessage] = useState('Verifying your email...');
  const [extractedToken, setExtractedToken] = useState(null); // State to hold the extracted token

  useEffect(() => {
    // Extract token from query parameters
    const queryParams = new URLSearchParams(location.search);
    const tokenFromQuery = queryParams.get('token');
    setExtractedToken(tokenFromQuery); // Set the extracted token to state
  }, [location.search]); // Re-run if the search part of the URL changes

  useEffect(() => {
    // This effect runs when extractedToken state is updated
    if (extractedToken === null && verificationStatus === 'verifying') {
        // Still waiting for token extraction, or location.search hasn't triggered the first effect yet
        return;
    }

    if (!extractedToken) {
      setMessage('Invalid verification link: No token provided.');
      setVerificationStatus('error');
      return;
    }

    const verify = async () => {
      setVerificationStatus('verifying'); // Ensure status is verifying
      setMessage('Verifying your email...'); // Reset message

      try {
        // Construct the full URL for the API call
        // Use extractedToken here
        const verificationUrl = `${API_ENDPOINTS.AUTH_VERIFY_EMAIL}?token=${extractedToken}`;

        const response = await axios.get(verificationUrl); // apiClient might also work if CSRF is handled for this GET

        setMessage(response.data.message || 'Email verified successfully! You can now log in.');
        setVerificationStatus('success');
        setTimeout(() => navigate('/signin?verified=true'), 3000);
      } catch (err) {
        setMessage(err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to verify email. The link may be invalid or expired.');
        setVerificationStatus('error');
      }
    };

    verify();
  }, [extractedToken, navigate, verificationStatus]); // Add verificationStatus to dependencies to re-trigger if needed, though primarily driven by extractedToken

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, mt: 4 }}>
      <Typography variant="h5" gutterBottom>
        {/* Display message based on current status, not just initial message */}
        {verificationStatus === 'verifying' && 'Verifying your email...'}
        {verificationStatus === 'success' && message}
        {verificationStatus === 'error' && message}
      </Typography>
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