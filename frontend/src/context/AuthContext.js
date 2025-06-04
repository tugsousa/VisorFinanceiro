// frontend/src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import {
  apiLogin, apiRegister, apiLogout,
  fetchAndSetCsrfToken as apiServiceFetchCsrf,
  apiCheckUserHasData
} from '../api/apiService';
import { UI_TEXT } from '../constants';

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
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [csrfTokenState, setCsrfTokenState] = useState('');
  const [hasInitialData, setHasInitialData] = useState(null);
  const [checkingData, setCheckingData] = useState(false);

  const fetchCsrfTokenAndUpdateService = useCallback(async (isSilent = false) => {
    try {
      const newCsrfToken = await apiServiceFetchCsrf();
      if (newCsrfToken) {
        setCsrfTokenState(newCsrfToken);
        return newCsrfToken;
      } else {
        if (!isSilent) console.warn('AuthContext: Failed to fetch CSRF token via apiService.');
        if (!isSilent) setAuthError(prev => prev ? `${prev}; CSRF fetch failed` : 'CSRF fetch failed');
        return null;
      }
    } catch (err) {
      if (!isSilent) console.error('AuthContext: Error in fetchCsrfTokenAndUpdateService:', err);
      if (!isSilent) setAuthError(prev => prev ? `${prev}; CSRF fetch error` : 'CSRF fetch error');
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
      setHasInitialData(false);
      localStorage.setItem('has_initial_data', 'false');
      return false;
    } finally {
      setCheckingData(false);
    }
  }, []);

  const performLogout = useCallback(async (apiCall = true) => {
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
      setLoading(true);
      setCheckingData(true);
      await fetchCsrfTokenAndUpdateService(true);
      const storedToken = localStorage.getItem('auth_token');
      const storedRefreshToken = localStorage.getItem('refresh_token');

      if (storedToken && storedRefreshToken) {
        setToken(storedToken);
        setRefreshTokenState(storedRefreshToken);
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (e) {
            console.error("Failed to parse stored user", e);
            localStorage.removeItem('user');
          }
        }
        const storedHasData = localStorage.getItem('has_initial_data');
        if (storedHasData !== null) {
            setHasInitialData(JSON.parse(storedHasData));
            setCheckingData(false);
        } else {
            if (storedUser) { // Only check user data if user was potentially loaded
                 await checkUserData();
            } else {
                 setHasInitialData(false);
                 setCheckingData(false);
            }
        }
      } else {
        performLogout(false);
        setHasInitialData(false);
        setCheckingData(false);
      }
      setLoading(false);
    };
    initializeAuth();
  }, [fetchCsrfTokenAndUpdateService, checkUserData, performLogout]);

  useEffect(() => {
    const handleLogoutEvent = (event) => {
      console.warn(`AuthContext: Received auth-error-logout event. Detail: ${event.detail}. Logging out without API call.`);
      performLogout(false);
    };
    window.addEventListener('auth-error-logout', handleLogoutEvent);
    return () => {
      window.removeEventListener('auth-error-logout', handleLogoutEvent);
    };
  }, [performLogout]);

  const register = async (username, email, password) => { // Added email
    setLoading(true);
    setAuthError(null);
    try {
      if (!csrfTokenState) await fetchCsrfTokenAndUpdateService();
      const response = await apiRegister(username, email, password); // Pass email
      setLoading(false);
      return { success: true, message: response.data.message || "Registration successful. Please check your email." };
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || UI_TEXT.errorLoadingData;
      setAuthError(errMsg);
      setLoading(false);
      throw new Error(errMsg);
    }
  };

  const login = async (username, password) => {
    setLoading(true);
    setCheckingData(true);
    setAuthError(null);
    try {
      if (!csrfTokenState) await fetchCsrfTokenAndUpdateService();
      const response = await apiLogin(username, password);
      const data = response.data;

      if (!data.access_token || !data.refresh_token) throw new Error('Login successful but tokens missing');
      
      setUser(data.user);
      setToken(data.access_token);
      setRefreshTokenState(data.refresh_token);

      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      
      await fetchCsrfTokenAndUpdateService();
      await checkUserData(); // This will set checkingData to false
      
      setLoading(false);
      return data;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Login failed';
      // Special handling for "Email not verified" from backend
      if (err.response && err.response.status === 403 && errMsg.toLowerCase().includes("email not verified")) {
         // Do not clear tokens or user here, let the user see the message
      } else {
        performLogout(false); // For other login errors, clear session
      }
      setAuthError(errMsg);
      setLoading(false);
      setCheckingData(false);
      // setHasInitialData(false); // This might be too aggressive for email not verified case
      // localStorage.removeItem('has_initial_data');
      throw new Error(errMsg);
    }
  };

  const logout = async () => {
    setLoading(true);
    await performLogout(true);
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user, token, 
        refreshToken: refreshTokenState,
        loading: loading || checkingData,
        authError,
        csrfToken: csrfTokenState,
        hasInitialData,
        register,
        login, logout,
        fetchCsrfToken: fetchCsrfTokenAndUpdateService,
        refreshUserDataCheck: checkUserData,
        performLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};