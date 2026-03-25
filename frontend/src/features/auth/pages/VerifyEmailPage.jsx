// frontend/src/pages/VerifyEmailPage.js
import React, { useMemo, useContext, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { useAuth } from '../AuthContext';
import { API_ENDPOINTS } from '../../../constants';

import { apiVerifyEmail } from '../../../lib/api';
import { Typography, Box, CircularProgress, Alert } from '@mui/material';


const VerifyEmailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { loginWithGoogleToken } = useAuth();

  const token = useMemo(() => {
    const queryParams = new URLSearchParams(location.search);
    return queryParams.get('token');
  }, [location.search]);


  const { data, error, isLoading, isSuccess, isError } = useQuery({
    queryKey: ['emailVerification', token],
    queryFn: async () => {
        const response = await apiVerifyEmail(token);
        return response.data;
    },
    enabled: !!token,
    retry: false, 
    refetchOnWindowFocus: false,
  });
  
  useEffect(() => {
    if (isSuccess && data) {
      // Check if the response contains auto-login data
      if (data.access_token && data.user) {
        // Auto-login the user
        loginWithGoogleToken(data.access_token, data.user)
          .then(() => {
            navigate('/dashboard', { replace: true });
          })
          .catch((err) => {
            console.error('Auto-login failed:', err);
            // Fallback to signin page with verification success message
            navigate('/signin?verified=true');
          });
      } else {
        // Fallback to signin page with verification success message
        navigate('/signin?verified=true');
      }
    }
  }, [isSuccess, data, loginWithGoogleToken, navigate]);


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
          {error.message || 'Ocorreu um erro durante a verificação.'}
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
