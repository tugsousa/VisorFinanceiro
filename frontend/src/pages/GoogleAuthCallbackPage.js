// frontend/src/pages/GoogleAuthCallbackPage.js
import React, { useEffect, useContext } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import { Box, CircularProgress, Typography } from '@mui/material';

const GoogleAuthCallbackPage = () => {
    const location = useLocation();
    const navigate = useNavigate();
    const { loginWithGoogleToken } = useContext(AuthContext); // Precisará de adicionar esta função ao context

    useEffect(() => {
        const params = new URLSearchParams(location.search);
        const token = params.get('token');
        const userStr = params.get('user');

        if (token && userStr) {
            try {
                const user = JSON.parse(decodeURIComponent(userStr));
                // Chame uma função no seu context para guardar o token e o utilizador
                loginWithGoogleToken(token, user);
                navigate('/dashboard');
            } catch (e) {
                 console.error("Failed to parse user data from Google callback", e);
                 navigate('/signin?error=callback_failed');
            }
        } else {
            navigate('/signin?error=missing_token');
        }
    }, [location, navigate, loginWithGoogleToken]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>A finalizar a autenticação...</Typography>
        </Box>
    );
};

export default GoogleAuthCallbackPage