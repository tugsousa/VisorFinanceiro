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

  // Fetch CSRF token on initial load
  useEffect(() => {
    const fetchCsrfToken = async () => {
      try {
      const response = await fetch('http://localhost:8080/api/auth/csrf', {
        credentials: 'include'
      });
      if (response.ok) {
        const { csrfToken } = await response.json();
        setCsrfToken(csrfToken);
        // Cookie is automatically set by backend with correct name (_gorilla_csrf)
      }
      } catch (err) {
        console.error('Failed to fetch CSRF token:', err);
      }
    };
    fetchCsrfToken();
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
        // First get CSRF token
        const csrfResponse = await fetch('http://localhost:8080/api/auth/csrf', {
            credentials: 'include'
        });
        if (!csrfResponse.ok) {
            throw new Error('Failed to get CSRF token');
        }
        const { csrfToken } = await csrfResponse.json();
        
        // Then make login request
        const response = await fetch('http://localhost:8080/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': csrfToken,
            },
            credentials: 'include',
            body: JSON.stringify({ username, password }),
        });
      
      if (!response.ok) {
        const errorText = await response.text();
        try {
          const errorData = JSON.parse(errorText);
          throw new Error(errorData.message || 'Login failed');
        } catch {
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
