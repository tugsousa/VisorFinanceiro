// frontend/src/pages/VerifyEmailPage.js
import React, { useMemo } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { API_ENDPOINTS } from '../constants';

import { apiVerifyEmail } from '../lib/api';
import { Typography, Box, CircularProgress, Alert } from '@mui/material';


const VerifyEmailPage = () => {
  const location = useLocation();
  const navigate = useNavigate();

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
  
  React.useEffect(() => {
      if (isSuccess) {
          // CORREÇÃO: Remover o setTimeout para navegação imediata
          navigate('/signin?verified=true');
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