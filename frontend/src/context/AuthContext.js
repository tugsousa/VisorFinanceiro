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
  const [refreshTokenState, setRefreshTokenState] = useState(() => localStorage.getItem('refresh_token')); // Added for refresh token
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
      setHasInitialData(false); // Default to false on error
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
    setAuthError(null); // Clear any existing auth errors

    if (apiCall && oldToken) {
        try {
            await apiLogout(); // Call API logout
        } catch (err) {
            console.error('API Logout error during performLogout:', err);
        }
    }
    await fetchCsrfTokenAndUpdateService(true); // Always fetch a new CSRF token
  }, [fetchCsrfTokenAndUpdateService]);


  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      setCheckingData(true); // Start checking data flag
      await fetchCsrfTokenAndUpdateService(true); // Silent CSRF fetch on init
      const storedToken = localStorage.getItem('auth_token');
      const storedRefreshToken = localStorage.getItem('refresh_token');

      if (storedToken && storedRefreshToken) {
        setToken(storedToken);
        setRefreshTokenState(storedRefreshToken); // Set refresh token state
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (e) {
            console.error("Failed to parse stored user", e);
            localStorage.removeItem('user'); // Clear corrupted user
          }
        }
        const storedHasData = localStorage.getItem('has_initial_data');
        if (storedHasData !== null) {
            setHasInitialData(JSON.parse(storedHasData));
            setCheckingData(false); // Data status known
        } else {
            await checkUserData(); // This will set checkingData to false
        }
      } else {
        // If no tokens, clear everything to be sure
        performLogout(false); // Don't call API if no tokens
        setHasInitialData(false);
        setCheckingData(false);
      }
      setLoading(false);
    };
    initializeAuth();
  }, [fetchCsrfTokenAndUpdateService, checkUserData, performLogout]);

  useEffect(() => {
    const handleLogoutEvent = () => {
      console.warn("AuthContext: Received auth-error-logout event. Logging out without API call.");
      performLogout(false); // Logout without making an API call, as API likely failed
    };

    window.addEventListener('auth-error-logout', handleLogoutEvent);
    return () => {
      window.removeEventListener('auth-error-logout', handleLogoutEvent);
    };
  }, [performLogout]);


  const register = async (username, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      if (!csrfTokenState) await fetchCsrfTokenAndUpdateService();
      const response = await apiRegister(username, password);
      setLoading(false);
      return { success: true, message: response.data.message || "Registration successful. Please sign in." };
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || UI_TEXT.errorLoadingData;
      setAuthError(errMsg);
      setLoading(false);
      throw new Error(errMsg);
    }
  };

  const login = async (username, password) => {
    setLoading(true);
    setCheckingData(true); // Start checking data
    setAuthError(null);
    try {
      if (!csrfTokenState) await fetchCsrfTokenAndUpdateService();
      const response = await apiLogin(username, password);
      const data = response.data;

      if (!data.access_token || !data.refresh_token) throw new Error('Login successful but tokens missing');
      
      setUser(data.user);
      setToken(data.access_token);
      setRefreshTokenState(data.refresh_token); // Set refresh token state

      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token); // Store refresh token
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      
      await fetchCsrfTokenAndUpdateService(); // Get a fresh CSRF after login
      await checkUserData(); // Check data after login (this will set checkingData to false)
      
      setLoading(false);
      return data;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Login failed';
      setAuthError(errMsg);
      setLoading(false);
      setCheckingData(false); // Ensure checkingData is false on error
      setHasInitialData(false); // Reset hasInitialData on login failure
      localStorage.removeItem('has_initial_data');
      throw new Error(errMsg);
    }
  };

  // Use performLogout in the context's logout function
  const logout = async () => {
    setLoading(true);
    await performLogout(true); // Call with apiCall = true
    setLoading(false);
  };


  return (
    <AuthContext.Provider
      value={{
        user, token, 
        refreshToken: refreshTokenState, // Expose refresh token if needed by apiService directly
        loading: loading || checkingData, // Combined loading state
        authError,
        csrfToken: csrfTokenState,
        hasInitialData,
        register,
        login, logout,
        fetchCsrfToken: fetchCsrfTokenAndUpdateService,
        refreshUserDataCheck: checkUserData,
        performLogout, // Expose performLogout for apiService
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};