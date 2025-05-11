// frontend/src/context/AuthContext.js
import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import {
  apiLogin, apiRegister, apiLogout, // Ensure apiRegister is imported
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

  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      setCheckingData(true);
      await fetchCsrfTokenAndUpdateService(true);
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
        const storedHasData = localStorage.getItem('has_initial_data');
        if (storedHasData !== null) {
          setHasInitialData(JSON.parse(storedHasData));
          setCheckingData(false);
        } else {
          await checkUserData();
        }
      } else {
        setHasInitialData(false);
        setCheckingData(false);
      }
      setLoading(false);
    };
    initializeAuth();
  }, [fetchCsrfTokenAndUpdateService, checkUserData]);

  // Define the register function
  const register = async (username, password) => {
    setLoading(true);
    setAuthError(null);
    try {
      if (!csrfTokenState) await fetchCsrfTokenAndUpdateService();
      
      const response = await apiRegister(username, password); // Use the imported apiRegister
      setLoading(false);
      // On successful registration, you might want to:
      // - Show a success message.
      // - Optionally log the user in automatically or redirect to login page.
      // For now, just returning success from API.
      return { success: true, message: response.data.message || "Registration successful. Please sign in." };
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || UI_TEXT.errorLoadingData;
      setAuthError(errMsg);
      setLoading(false);
      throw new Error(errMsg); // Re-throw for SignUpPage to catch
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

      if (!data.access_token) throw new Error('Login successful but no access token received');
      
      setUser(data.user);
      setToken(data.access_token);
      localStorage.setItem('auth_token', data.access_token);
      if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
      
      await fetchCsrfTokenAndUpdateService();
      await checkUserData();
      
      setLoading(false);
      return data;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Login failed';
      setAuthError(errMsg);
      setLoading(false);
      setCheckingData(false);
      setHasInitialData(false);
      localStorage.removeItem('has_initial_data');
      throw new Error(errMsg);
    }
  };

  const logout = async () => {
    setLoading(true);
    setAuthError(null);
    const oldToken = token; 

    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('has_initial_data');
    setUser(null);
    setToken(null);
    setHasInitialData(null);

    try {
      if (oldToken) await apiLogout(); 
      await fetchCsrfTokenAndUpdateService(); 
    } catch (err) {
      console.error('Logout error:', err);
      await fetchCsrfTokenAndUpdateService(); 
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user, token, 
        loading: loading || checkingData,
        authError,
        csrfToken: csrfTokenState,
        hasInitialData,
        register, // Make sure register is included in the context value
        login, logout,
        fetchCsrfToken: fetchCsrfTokenAndUpdateService,
        refreshUserDataCheck: checkUserData,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};