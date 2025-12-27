import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import { setAuthRefresher, fetchAndSetCsrfToken, getApiServiceCsrfToken } from '../../lib/api'; // Ajustei o caminho relativo baseado na estrutura
import { apiLogin, apiRegister, apiLogout, apiCheckUserHasData, apiRefreshToken } from './api/authApi';
import logger from '../../lib/utils/logger'; // Ajustei o caminho relativo

export const AuthContext = createContext();

export const useAuth = () => {
    const context = useContext(AuthContext);
    if (!context) {
        throw new Error('useAuth must be used within an AuthProvider');
    }
    return context;
};

export const AuthProvider = ({ children }) => {
    const [user, setUser] = useState(null);
    const [token, setToken] = useState(() => localStorage.getItem('auth_token'));
    const [refreshTokenState, setRefreshTokenState] = useState(() => localStorage.getItem('refresh_token'));
    const [isInitialAuthLoading, setIsInitialAuthLoading] = useState(true);
    const [isAuthActionLoading, setIsAuthActionLoading] = useState(false);
    const [authError, setAuthError] = useState(null);
    const [hasInitialData, setHasInitialData] = useState(null);
    const [checkingData, setCheckingData] = useState(false);
    const updateUserLocal = (updates) => {
        setUser(prev => {
            const newUser = { ...prev, ...updates };
            localStorage.setItem('user', JSON.stringify(newUser));
            return newUser;
        });
    };
    const fetchCsrfTokenAndUpdateService = useCallback(async (isSilent = false) => {
        try {
            const newCsrfToken = await fetchAndSetCsrfToken();
            if (!newCsrfToken && !isSilent) {
                setAuthError(prev => prev ? `${prev}; CSRF fetch failed` : 'CSRF fetch failed');
            }
            return newCsrfToken;
        } catch (err) {
            if (!isSilent) {
                logger.error('AuthContext: Error in fetchCsrfTokenAndUpdateService:', err);
                setAuthError(prev => prev ? `${prev}; CSRF fetch error` : 'CSRF fetch error');
            }
            return null;
        }
    }, []);

    const checkUserData = useCallback(async () => {
        if (!localStorage.getItem('auth_token')) {
            setHasInitialData(false);
            return false;
        }
        setCheckingData(true);
        try {
            const response = await apiCheckUserHasData();
            const userHasData = response.data.hasData;
            setHasInitialData(userHasData);
            localStorage.setItem('has_initial_data', JSON.stringify(userHasData));
            return userHasData;
        } catch (err) {
            logger.error('AuthContext: Error checking user data:', err);
            if (err.response && err.response.status === 401) {
                window.dispatchEvent(new CustomEvent('auth-error-logout', { detail: 'User data check unauthorized' }));
            }
            setHasInitialData(false);
            localStorage.setItem('has_initial_data', 'false');
            return false;
        } finally {
            setCheckingData(false);
        }
    }, []);

    const impersonate = useCallback(async (userId, mfaCode = null) => {
        setIsAuthActionLoading(true);
        setAuthError(null);
        try {
            console.log("🔄 A iniciar impersonation para o ID:", userId);
            
            const { apiImpersonateUser } = require('../admin/api/adminApi');
            
            // Passamos o mfaCode para a API
            const response = await apiImpersonateUser(userId, mfaCode);
            console.log("Resposta do backend:", response.data);

            const { access_token, user: userData } = response.data;

            if (!access_token) {
                throw new Error("Erro Crítico: O backend não enviou o access_token.");
            }

            // 1. Atualizar Estado React
            setUser(userData);
            setToken(access_token);
            setRefreshTokenState(null);
            
            localStorage.setItem('auth_token', access_token);
            localStorage.setItem('user', JSON.stringify(userData));
            localStorage.removeItem('refresh_token');

            await fetchCsrfTokenAndUpdateService(true);
            const checkResult = await checkUserData();
            
            return true;
        } catch (err) {
            // Tratamento de erros mantém-se, mas agora pode apanhar erros de MFA inválido
            const errMsg = err.response?.data?.error || err.message || 'Falha ao impersonar utilizador.';
            console.error("Erro no impersonate:", errMsg, err);
            setAuthError(errMsg);
            throw err; // Re-throw para o componente lidar com UI (ex: mostrar erro no modal)
        } finally {
            setIsAuthActionLoading(false);
        }
    }, [checkUserData, fetchCsrfTokenAndUpdateService]);

    const performLogout = useCallback(async (apiCall = true, reason = "User initiated logout") => {
        logger.log(`AuthContext: Performing logout. API call: ${apiCall}. Reason: ${reason}`);
        const oldToken = localStorage.getItem('auth_token');
        localStorage.removeItem('auth_token');
        localStorage.removeItem('refresh_token');
        localStorage.removeItem('user');
        localStorage.removeItem('has_initial_data');
        setUser(null);
        setToken(null);
        setRefreshTokenState(null);
        setHasInitialData(null);
        setAuthError(null);
        setIsAuthActionLoading(false);

        if (apiCall && oldToken) {
            try {
                await apiLogout();
            } catch (err) {
                logger.error('API Logout error during performLogout:', err);
            }
        }
        await fetchCsrfTokenAndUpdateService(true);
    }, [fetchCsrfTokenAndUpdateService]);

    const refreshToken = useCallback(async () => {
        const currentRefreshToken = localStorage.getItem('refresh_token');
        if (!currentRefreshToken) {
            logger.log("AuthContext: No refresh token available, logging out.");
            await performLogout(false, "No refresh token for refresh attempt");
            return Promise.reject(new Error("No refresh token"));
        }

        try {
            logger.log("AuthContext: Attempting to refresh token...");
            const response = await apiRefreshToken(currentRefreshToken);
            const { access_token, refresh_token } = response.data;

            setToken(access_token);
            setRefreshTokenState(refresh_token);
            localStorage.setItem('auth_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            logger.log("AuthContext: Token refreshed successfully.");
            return access_token;
        } catch (error) {
            logger.error("AuthContext: Failed to refresh token, logging out.", error);
            await performLogout(false, "Refresh token failed or expired");
            return Promise.reject(error);
        }
    }, [performLogout]);

    useEffect(() => {
        setAuthRefresher(refreshToken);
    }, [refreshToken]);

    useEffect(() => {
        const initializeAuth = async () => {
            setIsInitialAuthLoading(true);
            await fetchCsrfTokenAndUpdateService(true);
            const storedToken = localStorage.getItem('auth_token');
            const storedUser = localStorage.getItem('user');

            if (storedToken && storedUser) {
                setToken(storedToken);
                try {
                    const parsedUser = JSON.parse(storedUser);
                    setUser(parsedUser);
                    await checkUserData();
                } catch (e) {
                    logger.error("Failed to parse stored user during init", e);
                    performLogout(false, "Corrupted user data in localStorage on init");
                }
            } else {
                performLogout(false, "No tokens or user data in localStorage on init");
            }
            setIsInitialAuthLoading(false);
        };

        initializeAuth();
    }, [performLogout, checkUserData, fetchCsrfTokenAndUpdateService]);

    useEffect(() => {
        const handleLogoutEvent = (event) => {
            logger.warn(`AuthContext: Received auth-error-logout event. Detail: ${event.detail}. Logging out.`);
            performLogout(false, `Auth error: ${event.detail}`);
        };
        window.addEventListener('auth-error-logout', handleLogoutEvent);
        return () => {
            window.removeEventListener('auth-error-logout', handleLogoutEvent);
        };
    }, [performLogout]);

    const register = async (username, email, password, onSuccess, onError) => {
        setAuthError(null);
        setIsAuthActionLoading(true);
        try {
            if (!getApiServiceCsrfToken()) await fetchCsrfTokenAndUpdateService();
            const response = await apiRegister(username, email, password);
            if (onSuccess) onSuccess(response.data);
        } catch (err) {
            const errMsg = err.response?.data?.error || err.message || 'Registration failed.';
            setAuthError(errMsg);
            if (onError) onError(new Error(errMsg));
        } finally {
            setIsAuthActionLoading(false);
        }
    };

    const login = async (email, password) => {
        setIsAuthActionLoading(true);
        setCheckingData(true);
        setAuthError(null);
        try {
            if (!getApiServiceCsrfToken()) await fetchCsrfTokenAndUpdateService();
            const response = await apiLogin(email, password);
            const { access_token, refresh_token, user: userData } = response.data;

            setUser(userData);
            setToken(access_token);
            setRefreshTokenState(refresh_token);
            localStorage.setItem('auth_token', access_token);
            localStorage.setItem('refresh_token', refresh_token);
            localStorage.setItem('user', JSON.stringify(userData));

            await fetchCsrfTokenAndUpdateService(true);
            await checkUserData();
            return response.data;
        } catch (err) {
            const errMsg = err.response?.data?.error || err.message || 'Login failed.';
            performLogout(false, `Login failed: ${errMsg}`);
            setAuthError(errMsg);
            throw new Error(errMsg);
        } finally {
            setIsAuthActionLoading(false);
            setCheckingData(false);
        }
    };

    const loginWithGoogleToken = useCallback(async (appToken, userDataFromBackend) => {
        setIsAuthActionLoading(true);
        setCheckingData(true);
        setAuthError(null);
        setUser(userDataFromBackend);
        setToken(appToken);
        setRefreshTokenState(null);
        localStorage.setItem('auth_token', appToken);
        localStorage.setItem('user', JSON.stringify(userDataFromBackend));
        localStorage.removeItem('refresh_token');

        await checkUserData();
        setIsAuthActionLoading(false);
        setCheckingData(false);
    }, [checkUserData]);

    const logout = async () => {
        setIsAuthActionLoading(true);
        await performLogout(true, "User initiated logout");
        setIsAuthActionLoading(false);
    };

    return (
        <AuthContext.Provider
            value={{
                user,
                token,
                isInitialAuthLoading,
                isAuthActionLoading,
                loading: isInitialAuthLoading || isAuthActionLoading || checkingData,
                authError,
                hasInitialData,
                checkingData,
                register,
                login,
                logout,
                loginWithGoogleToken,
                fetchCsrfToken: fetchCsrfTokenAndUpdateService,
                refreshUserDataCheck: checkUserData,
                performLogout,
                impersonate,
                updateUserLocal,
            }}
        >
            {children}
        </AuthContext.Provider>
    );
};