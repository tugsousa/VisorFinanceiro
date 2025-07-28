// frontend/src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import {
  apiLogin, apiRegister, apiLogout,
  fetchAndSetCsrfToken as apiServiceFetchCsrf,
  apiCheckUserHasData,
  getApiServiceCsrfToken
} from '../api/apiService';

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

  const fetchCsrfTokenAndUpdateService = useCallback(async (isSilent = false) => {
    try {
      const newCsrfToken = await apiServiceFetchCsrf();
      if (!newCsrfToken && !isSilent) {
        setAuthError(prev => prev ? `${prev}; CSRF fetch failed` : 'CSRF fetch failed');
      }
      return newCsrfToken;
    } catch (err) {
      if (!isSilent) {
        console.error('AuthContext: Error in fetchCsrfTokenAndUpdateService:', err);
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
      console.error('AuthContext: Error checking user data:', err);
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

  const performLogout = useCallback(async (apiCall = true, reason = "User initiated logout") => {
    console.log(`AuthContext: Performing logout. API call: ${apiCall}. Reason: ${reason}`);
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
            console.error('API Logout error during performLogout:', err);
        }
    }
    await fetchCsrfTokenAndUpdateService(true);
  }, [fetchCsrfTokenAndUpdateService]);

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
          console.error("Failed to parse stored user during init", e);
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
      console.warn(`AuthContext: Received auth-error-logout event. Detail: ${event.detail}. Logging out.`);
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
  
  // --- NOVA FUNÇÃO PARA O CALLBACK DO GOOGLE ---
  const loginWithGoogleToken = useCallback(async (appToken, googleUserData) => {
    setIsAuthActionLoading(true);
    setCheckingData(true);
    setAuthError(null);

    // O backend já validou, agora apenas guardamos o estado no frontend
    const appUser = {
        id: googleUserData.id, // O backend deve garantir que temos um ID
        username: googleUserData.name,
        email: googleUserData.email
    };

    setUser(appUser);
    setToken(appToken);
    setRefreshTokenState(null); // O Google Auth não usa o nosso sistema de refresh token

    localStorage.setItem('auth_token', appToken);
    localStorage.setItem('user', JSON.stringify(appUser));
    localStorage.removeItem('refresh_token'); // Limpar refresh token antigo se houver

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
        loginWithGoogleToken, // Expor a nova função
        fetchCsrfToken: fetchCsrfTokenAndUpdateService,
        refreshUserDataCheck: checkUserData,
        performLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};