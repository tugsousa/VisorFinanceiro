// frontend/src/pages/VerifyEmailPage.js
import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
// REMOVE THE DIRECT AXIOS IMPORT
// import axios from 'axios'; 
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '../constants';
// IMPORT THE NEW SERVICE FUNCTION
import { apiVerifyEmail } from '../api/apiService'; 
import { Typography, Box, CircularProgress, Alert } from '@mui/material';

// THIS ENTIRE FUNCTION IS NOW OBSOLETE AND SHOULD BE DELETED
/*
const verifyEmailToken = async (token) => {
  if (!token) {
    throw new Error('Invalid verification link: No token provided.');
  }
  const verificationUrl = `${API_ENDPOINTS.AUTH_VERIFY_EMAIL}?token=${token}`;
  try {
    const { data } = await axios.get(verificationUrl); // <-- THIS IS THE PROBLEM LINE
    return data;
  } catch (err) {
    const errorMessage = err.response?.data?.error || err.response?.data?.message || err.message || 'Failed to verify email.';
    throw new Error(errorMessage);
  }
};
*/

const VerifyEmailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

  const token = useMemo(() => {
    const queryParams = new URLSearchParams(location.search);
    return queryParams.get('token');
  }, [location.search]);

  // UPDATE THE useQuery HOOK
  const { data, error, isLoading, isSuccess, isError } = useQuery({
    queryKey: ['emailVerification', token],
    // REPLACE THE OLD FUNCTION WITH THE NEW API SERVICE CALL
    queryFn: async () => {
        const response = await apiVerifyEmail(token);
        return response.data; // Ensure we pass the data part to the component
    },
    enabled: !!token,
    retry: false, 
    refetchOnWindowFocus: false,
  });
  
  React.useEffect(() => {
      if (isSuccess) {
          setTimeout(() => navigate('/signin?verified=true'), 3000);
      }
  }, [isSuccess, navigate]);


  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', p: 3, mt: 4, textAlign: 'center' }}>
      <Typography variant="h5" gutterBottom>
        Verificação de email
      </Typography>

      {isLoading && (
        <>
          <Typography variant="body1" sx={{ mb: 2 }}>
            A verificar o seu email...
          </Typography>
          <CircularProgress sx={{ my: 2 }} />
        </>
      )}

      {isSuccess && (
        <Alert severity="success" sx={{ my: 2, width: '100%', maxWidth: '500px' }}>
          {data?.message || 'Email verificado com sucesso! Redirecionando...'}
        </Alert>
      )}

      {isError && (
        <Alert severity="error" sx={{ my: 2, width: '100%', maxWidth: '500px' }}>
          {error.message || 'An unknown error occurred.'}
        </Alert>
      )}

      {!token && !isLoading && (
         <Alert severity="warning" sx={{ my: 2, width: '100%', maxWidth: '500px' }}>
          Link de verificação inválido. Nenhum token fornecido.
        </Alert>
      )}
    </Box>
  );
};

export default VerifyEmailPage;