// frontend/src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import {
  apiLogin, apiRegister, apiLogout,
  fetchAndSetCsrfToken as apiServiceFetchCsrf // Use the correctly named import
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
  const [loading, setLoading] = useState(true);
  const [authError, setAuthError] = useState(null);
  const [csrfTokenState, setCsrfTokenState] = useState(''); // This state reflects the token AuthContext knows

  const fetchCsrfTokenAndUpdateService = useCallback(async (isSilent = false) => {
    // if (!isSilent) console.log('AuthContext: Fetching CSRF token...');
    try {
      const newCsrfToken = await apiServiceFetchCsrf();
      if (newCsrfToken) {
        setCsrfTokenState(newCsrfToken);
        // console.log('AuthContext: CSRF token fetched and set:', newCsrfToken.substring(0,10) + '...');
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

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      await fetchCsrfTokenAndUpdateService(true); // Initial fetch can be silent on error console
      const storedToken = localStorage.getItem('auth_token');
      if (storedToken) {
        setToken(storedToken);
        const storedUser = localStorage.getItem('user');
        if (storedUser) {
          try {
            setUser(JSON.parse(storedUser));
          } catch (e) {
            console.error("Failed to parse stored user", e);
            localStorage.removeItem('user');
          }
        }
      }
      setLoading(false);
    };
    initializeAuth();
  }, [fetchCsrfTokenAndUpdateService]);

  const register = async (username, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      // Ensure CSRF is available. Interceptor will also try, but good to have it ready.
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
    setAuthError(null);
    try {
      // Ensure CSRF is available. Interceptor will also try.
      if (!csrfTokenState) await fetchCsrfTokenAndUpdateService();

      const response = await apiLogin(username, password);
      const data = response.data;

      if (!data.access_token) {
        throw new Error('Login successful but no access token received');
      }
      
      setUser(data.user);
      setToken(data.access_token);
      localStorage.setItem('auth_token', data.access_token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      
      // Crucial: Re-fetch CSRF token after successful login
      // as the session has changed and backend might issue a new CSRF token.
      await fetchCsrfTokenAndUpdateService();
      
      setLoading(false);
      return data;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Login failed';
      setAuthError(errMsg);
      setLoading(false);
      throw new Error(errMsg);
    }
  };

  const logout = async () => {
    setLoading(true);
    setAuthError(null);
    const oldToken = token; 

    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    setUser(null);
    setToken(null);
    // setApiServiceCsrfToken(null); // apiService's currentCsrfToken will be refreshed by fetch below

    try {
      if (oldToken) {
         await apiLogout(); 
      }
      await fetchCsrfTokenAndUpdateService(); // Fetch a new CSRF for the unauthenticated state
    } catch (err) {
      console.error('Logout error (server call might have failed):', err);
      await fetchCsrfTokenAndUpdateService(); // Still try to get a fresh CSRF
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user, token, loading, authError,
        csrfToken: csrfTokenState,
        register, login, logout,
        fetchCsrfToken: fetchCsrfTokenAndUpdateService,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};