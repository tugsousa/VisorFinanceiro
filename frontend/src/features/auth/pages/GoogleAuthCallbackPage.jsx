// frontend/src/features/auth/pages/GoogleAuthCallbackPage.js
import React, { useEffect, useContext, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Box, CircularProgress, Typography } from '@mui/material';
import logger from '../../../lib/utils/logger';
import { apiRefreshToken } from '../api/authApi';
import { fetchAndSetCsrfToken, setApiServiceCsrfToken } from '../../../lib/api';

const GoogleAuthCallbackPage = () => {
    const navigate = useNavigate();
    
    // Importamos o isInitialAuthLoading para garantir sincronia
    const { loginWithGoogleToken, performLogout, isInitialAuthLoading } = useContext(AuthContext);
    
    // Ref para garantir que o código só corre uma vez (React 18 Strict Mode)
    const hasRan = useRef(false);

    useEffect(() => {
        // 1. Se o AuthContext ainda está a carregar, esperamos.
        if (isInitialAuthLoading) return;

        // 2. Se já corremos, abortamos para evitar duplicados.
        if (hasRan.current) return;
        hasRan.current = true;

        const finalizeLogin = async () => {
            try {
                logger.log("GoogleAuthCallback: AuthContext settled. Starting finalization...");

                // 3. Limpar token antigo e pedir novo (Critico para resolver o erro 403 Forbidden)
                setApiServiceCsrfToken(null);
                await fetchAndSetCsrfToken();

                // 4. Fazer o pedido de refresh
                const response = await apiRefreshToken();

                // 5. Ler os dados (Isto vai funcionar assim que o Backend enviar o objeto 'user')
                const { access_token, user } = response.data;

                if (access_token && user) {
                    await loginWithGoogleToken(access_token, user);
                    navigate('/dashboard');
                } else {
                    throw new Error("Missing data in refresh response");
                }
            } catch (error) {
                logger.error("Google Auth Finalization Failed:", error);
                
                // Em caso de erro, fazemos logout limpo e enviamos para o login
                performLogout(false, "Google Auth Failed");
                navigate('/signin?error=auth_failed');
            }
        };

        finalizeLogin();
    }, [navigate, loginWithGoogleToken, performLogout, isInitialAuthLoading]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>A finalizar a autenticação segura...</Typography>
        </Box>
    );
};

export default GoogleAuthCallbackPage;