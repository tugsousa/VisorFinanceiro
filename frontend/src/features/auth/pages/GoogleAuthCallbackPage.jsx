// frontend/src/features/auth/pages/GoogleAuthCallbackPage.js
import React, { useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Box, CircularProgress, Typography } from '@mui/material';
import logger from '../../../lib/utils/logger';
import { apiRefreshToken } from '../api/authApi';

const GoogleAuthCallbackPage = () => {
    const navigate = useNavigate();
    const { loginWithGoogleToken, performLogout } = useContext(AuthContext);

    useEffect(() => {
        const finalizeLogin = async () => {
            try {
                // Instead of reading a cookie manually, we attempt to refresh the token.
                // The backend should have set an HttpOnly cookie during the redirect here.
                const response = await apiRefreshToken();
                const { access_token, user } = response.data;

                if (access_token && user) {
                    await loginWithGoogleToken(access_token, user);
                    navigate('/dashboard');
                } else {
                    throw new Error("Missing data in refresh response");
                }
            } catch (error) {
                logger.error("Google Auth Finalization Failed:", error);
                // Clear any partial state and redirect to error
                performLogout(false, "Google Auth Failed");
                navigate('/signin?error=auth_failed');
            }
        };

        finalizeLogin();
    }, [navigate, loginWithGoogleToken, performLogout]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>A finalizar a autenticação segura...</Typography>
        </Box>
    );
};

export default GoogleAuthCallbackPage;