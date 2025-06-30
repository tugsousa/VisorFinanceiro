// frontend/src/pages/VerifyEmailPage.js
import React, { useMemo } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import axios from 'axios';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '../constants';
import { Typography, Box, CircularProgress, Button, Alert } from '@mui/material';

// The async function to be used by useQuery
const verifyEmailToken = async (token) => {
  if (!token) {
    throw new Error('Invalid verification link: No token provided.');
  }
  const verificationUrl = `${API_ENDPOINTS.AUTH_VERIFY_EMAIL}?token=${token}`;
  try {
    const { data } = await axios.get(verificationUrl);
    return data;
  } catch (err) {
    // Re-throw a more informative error for useQuery's error object
    const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to verify email.';
    throw new Error(errorMessage);
  }
};

const VerifyEmailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // Extract token from URL. useMemo ensures this is only calculated once per render.
  const token = useMemo(() => {
    const queryParams = new URLSearchParams(location.search);
    return queryParams.get('token');
  }, [location.search]);

  // useQuery to handle the API call, loading, and error states.
  const { data, error, isLoading, isSuccess, isError } = useQuery({
    queryKey: ['emailVerification', token],
    queryFn: () => verifyEmailToken(token),
    enabled: !!token, // The query will only run if the token exists.
    retry: false, // Don't retry on failure, as a bad token won't become good.
    refetchOnWindowFocus: false,
  });
  
  // Side-effect for redirection on successful verification.
  // This is a valid use of useEffect as it performs an action (navigation)
  // in response to a state change from the query.
  React.useEffect(() => {
      if (isSuccess) {
          setTimeout(() => navigate('/signin?verified=true'), 3000);
      }
  }, [isSuccess, navigate]);


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, mt: 4, textAlign: 'center' }}>
      <Typography variant="h5" gutterBottom>
        Email Verification
      </Typography>

      {isLoading && (
        <>
          <Typography variant="body1" sx={{ mb: 2 }}>
            Verifying your email...
          </Typography>
          <CircularProgress sx={{ my: 2 }} />
        </>
      )}

      {isSuccess && (
        <Alert severity="success" sx={{ my: 2, width: '100%', maxWidth: '500px' }}>
          {data?.message || 'Email verified successfully! Redirecting...'}
        </Alert>
      )}

      {isError && (
        <Alert severity="error" sx={{ my: 2, width: '100%', maxWidth: '500px' }}>
          {error.message || 'An unknown error occurred.'}
        </Alert>
      )}

      {!token && !isLoading && (
         <Alert severity="warning" sx={{ my: 2, width: '100%', maxWidth: '500px' }}>
          Invalid verification link: No token provided.
        </Alert>
      )}

      <Button component={Link} to="/signin" variant="contained" sx={{ mt: 2 }}>
        Go to Sign In
      </Button>
    </Box>
  );
};

export default VerifyEmailPage;