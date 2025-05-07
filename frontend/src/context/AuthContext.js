import React, { createContext, useState, useEffect, useContext } from 'react';

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
  const [token, setToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [csrfToken, setCsrfToken] = useState('');

  // Get CSRF token from cookie
  const getCsrfTokenFromCookie = () => {
    const cookieValue = document.cookie
      .split('; ')
      .reverse()
      .find(row => row.startsWith('_gorilla_csrf='))
      ?.split('=')[1];
    return cookieValue || '';
  };

  // Set CSRF token from cookie on initial load
  useEffect(() => {
    const token = getCsrfTokenFromCookie();
    if (token) {
      setCsrfToken(token);
    }
  }, []);

  const register = async (username, password) => {
    try {
      setLoading(true);
      const response = await fetch('http://localhost:8080/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      const data = await response.json();
      setUser(data.user);
      setToken(data.token);
      setLoading(false);
      return data;
    } catch (err) {
      setError(err);
      setLoading(false);
      throw err;
    }
  };

const login = async (username, password) => {
    try {
        setLoading(true);
        console.log('Starting login process for user:', username);
        
        // First get CSRF token
        console.log('Fetching CSRF token...');
        const csrfResponse = await fetch('http://localhost:8080/api/auth/csrf', {
            credentials: 'include'
        });
        if (!csrfResponse.ok) {
            const errorText = await csrfResponse.text();
            console.error('CSRF token fetch failed:', csrfResponse.status, errorText);
            throw new Error('Failed to get CSRF token');
        }
        const { csrfToken } = await csrfResponse.json();
        console.log('Received CSRF token:', csrfToken);
        
        // Then make login request
        console.log('Making login request with CSRF token...');
        const response = await fetch('http://localhost:8080/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            credentials: 'include',
            body: JSON.stringify({ username, password }),
        });
        console.log('Login response status:', response.status);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Login failed with status:', response.status, 'Response:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          console.error('Parsed error data:', errorData);
          throw new Error(errorData.message || 'Login failed');
        } catch {
          console.error('Raw error response:', errorText);
          throw new Error(errorText || 'Login failed');
        }
      }

      const data = await response.json();
      setUser(data.user);
      setToken(data.token);
      setLoading(false);
      return data;
    } catch (err) {
      setError(err.message);
      setLoading(false);
      throw err;
    }
  };

  const logout = async () => {
    try {
      await fetch('http://localhost:8080/api/auth/logout', {
        method: 'POST',
        headers: {
          'X-CSRF-Token': csrfToken,
        },
        credentials: 'include'
      });
      setUser(null);
      setToken(null);
    } catch (err) {
      setError(err);
      throw err;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        loading,
        error,
        register,
        login,
        logout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
