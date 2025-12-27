// frontend/src/features/auth/pages/GoogleAuthCallbackPage.js
import React, { useEffect, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../AuthContext';
import { Box, CircularProgress, Typography } from '@mui/material';
import logger from '../../../lib/utils/logger';

const GoogleAuthCallbackPage = () => {
    const navigate = useNavigate();
    const { loginWithGoogleToken } = useContext(AuthContext);

    useEffect(() => {
        const processLogin = () => {
            // 1. Helper to retrieve the cookie value
            const getCookie = (name) => {
                const value = `; ${document.cookie}`;
                const parts = value.split(`; ${name}=`);
                if (parts.length === 2) return parts.pop().split(';').shift();
                return null;
            };

            // 2. Helper to delete the cookie immediately for security
            const deleteCookie = (name) => {
                document.cookie = name + '=; Path=/; Expires=Thu, 01 Jan 1970 00:00:01 GMT;';
            };

            try {
                // 3. Attempt to read the 'auth_transfer' cookie
                const cookieData = getCookie('auth_transfer');

                if (cookieData) {
                    // 4. Decode the Base64 value (decodeURIComponent handles potential encoding artifacts)
                    const decodedString = atob(decodeURIComponent(cookieData));
                    const jsonData = JSON.parse(decodedString);

                    // Extract token, user, AND refresh_token
                    const { token, user, refresh_token } = jsonData;

                    // 5. The user object might be a serialized JSON string inside the JSON
                    const userObj = typeof user === 'string' ? JSON.parse(user) : user;

                    if (token && userObj) {
                        // 6. Perform the login action in AuthContext, passing the refresh token
                        loginWithGoogleToken(token, userObj, refresh_token);

                        // 7. SECURITY CRITICAL: Delete the cookie immediately
                        deleteCookie('auth_transfer');

                        // 8. Redirect to dashboard
                        navigate('/dashboard');
                        return;
                    }
                }

                // Fallback: Cookie missing or invalid data
                logger.error("Google Auth: 'auth_transfer' cookie missing or invalid.");
                navigate('/signin?error=auth_failed');

            } catch (error) {
                logger.error("Failed to process Google login from cookie:", error);
                // Ensure cookie is cleaned up even on error to avoid stale data
                deleteCookie('auth_transfer');
                navigate('/signin?error=processing_error');
            }
        };

        processLogin();
    }, [navigate, loginWithGoogleToken]);

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '80vh' }}>
            <CircularProgress />
            <Typography sx={{ mt: 2 }}>A finalizar a autenticação segura...</Typography>
        </Box>
    );
};

export default GoogleAuthCallbackPage;