import React, { createContext, useState, useEffect, useContext } from 'react';
import { API_ENDPOINTS } from '../constants'; // Import constants

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
  const [token, setToken] = useState(() => {
    const savedToken = localStorage.getItem('auth_token');
    console.log('Initializing auth token from localStorage:', savedToken ? 'Token found' : 'No token found');
    return savedToken || null;
  });
  const [loading, setLoading] = useState(true); // Start true to handle initial CSRF fetch
  const [error, setError] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');

  const fetchCsrfToken = async () => {
    try {
      // console.log('Fetching fresh CSRF token...');
      const csrfResponse = await fetch(API_ENDPOINTS.AUTH_CSRF, { // Use constant
        method: 'GET',
        credentials: 'include',
        cache: 'no-cache',
        headers: { 'Accept': 'application/json' }
      });
      
      if (!csrfResponse.ok) {
        throw new Error(`Failed to get CSRF token: ${csrfResponse.status}`);
      }
      
      const headerToken = csrfResponse.headers.get('X-CSRF-Token');
      const data = await csrfResponse.json();
      const bodyToken = data.csrfToken;
      const receivedCsrfToken = headerToken || bodyToken;
      
      // console.log('Fetched CSRF token:', receivedCsrfToken);
      setCsrfToken(receivedCsrfToken);
      return receivedCsrfToken;
    } catch (err) {
      console.error('Error fetching CSRF token:', err);
      // Don't throw here to allow app to load, but log the error
      setError(prev => prev ? `${prev}; CSRF fetch failed` : 'CSRF fetch failed');
      return ''; // Return empty or handle error appropriately
    }
  };

  useEffect(() => {
    fetchCsrfToken().finally(() => setLoading(false)); // Set loading to false after initial fetch
    // If there's a token in localStorage, you might want to validate it here
    // or fetch user profile to confirm validity. For now, just loading.
    if (token) {
        // Potentially add a call here to validate token or fetch user data
        // For simplicity, we assume the stored token is valid if present.
        // A better approach would be to verify it against a /me endpoint.
        // For now, if a token exists, we might try to fetch user data or set a placeholder user
        // This part depends on how you want to handle session persistence on refresh.
        // For now, AuthWrapper will handle navigation if token is invalid on protected routes.
    } else {
        setLoading(false); // If no token, no need to validate, just finish loading
    }
  }, []); // Removed 'token' from dependency array to avoid re-fetching CSRF on token change by login/logout


  const register = async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const currentCsrf = csrfToken || await fetchCsrfToken();
      if (!currentCsrf) throw new Error("CSRF token not available for registration.");

      const response = await fetch(API_ENDPOINTS.AUTH_REGISTER, { // Use constant
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': currentCsrf,
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Registration failed: Non-JSON response' }));
        throw new Error(errorData.error || errorData.message || 'Registration failed');
      }
      
      // Registration successful, but typically doesn't log the user in automatically
      // Depending on backend: it might return user data and tokens if it also logs in
      // For now, assume registration is separate from login.
      setLoading(false);
      return { success: true, message: "Registration successful. Please sign in." }; // Adjust based on backend response
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const login = async (username, password) => {
    setLoading(true);
    setError(null);
    try {
      const currentCsrf = csrfToken || await fetchCsrfToken();
      if (!currentCsrf) throw new Error("CSRF token not available for login.");
        
      const response = await fetch(API_ENDPOINTS.AUTH_LOGIN, { // Use constant
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': currentCsrf,
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      
      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ message: 'Login failed: Non-JSON response' }));
        throw new Error(errorData.error || errorData.message || 'Login failed');
      }

      const data = await response.json();
      const accessToken = data.access_token;
      if (!accessToken) {
        throw new Error('Login successful but no access token received');
      }
      
      setUser(data.user);
      setToken(accessToken);
      localStorage.setItem('auth_token', accessToken);
      
      setLoading(false);
      return data; // contains user and tokens
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    setLoading(true); // Indicate activity
    setError(null);
    try {
      const currentCsrf = csrfToken || await fetchCsrfToken();
      // Even if CSRF fails, proceed with local logout
      
      // Optimistically clear local state first
      localStorage.removeItem('auth_token');
      setUser(null);
      setToken(null);

      if (currentCsrf) { // Only attempt server logout if we have a CSRF token
        await fetch(API_ENDPOINTS.AUTH_LOGOUT, { // Use constant
          method: 'POST',
          headers: {
            'Content-Type': 'application/json', // Though body is empty, good practice
            'X-CSRF-Token': currentCsrf,
            'Authorization': `Bearer ${token}`, // Send existing auth token for server to invalidate session
            'Accept': 'application/json'
          },
          credentials: 'include'
        });
        // We don't strictly need to wait for the response or check its status for client-side logout to proceed.
        // console.log('Server logout response status:', logoutResponse.status);
      } else {
        console.warn("CSRF token not available for server logout, proceeding with local logout only.");
      }

    } catch (err) {
      console.error('Logout error (server call might have failed):', err);
      // Error during server call, but local logout has already happened.
      // setError(err.message); // Optionally set an error for display
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user, token, loading, error, csrfToken,
        register, login, logout, fetchCsrfToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};