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

  // Fetch CSRF token from the server
  const fetchCsrfToken = async () => {
    try {
      console.log('Fetching fresh CSRF token...');
      
      // Log cookies before fetch
      console.log('Cookies before CSRF fetch:', document.cookie);
      
      const csrfResponse = await fetch('http://localhost:8080/api/auth/csrf', {
        method: 'GET',
        credentials: 'include',
        cache: 'no-cache', // Prevent caching
        headers: {
          'Accept': 'application/json'
        }
      });
      
      if (!csrfResponse.ok) {
        throw new Error(`Failed to get CSRF token: ${csrfResponse.status}`);
      }
      
      // Get CSRF token from header first (more reliable)
      const headerToken = csrfResponse.headers.get('X-CSRF-Token');
      console.log('CSRF token from header:', headerToken);
      
      // Log all response headers
      console.log('CSRF response headers:', 
        Array.from(csrfResponse.headers.entries())
          .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {})
      );
      
      const data = await csrfResponse.json();
      const bodyToken = data.csrfToken;
      console.log('CSRF token from response body:', bodyToken);
      
      // Use header token if available, otherwise fall back to body token
      const csrfToken = headerToken || bodyToken;
      
      // Log cookies after fetch
      console.log('Cookies after CSRF fetch:', document.cookie);
      
      setCsrfToken(csrfToken);
      return csrfToken;
    } catch (err) {
      console.error('Error fetching CSRF token:', err);
      throw err;
    }
  };

  // Fetch CSRF token on initial load
  useEffect(() => {
    fetchCsrfToken().catch(err => {
      console.error('Initial CSRF token fetch failed:', err);
    });
  }, []);

  const register = async (username, password) => {
    try {
      setLoading(true);
      console.log('Starting registration process for user:', username);
      
      // Get a fresh CSRF token
      const token = await fetchCsrfToken();
      console.log('Fresh CSRF token received for registration:', token);
      
      // Check if we have cookies
      console.log('Cookies before registration request:', document.cookie);
      
      const response = await fetch('http://localhost:8080/api/auth/register', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
          'Accept': 'application/json'
        },
        credentials: 'include',
        body: JSON.stringify({ username, password }),
      });
      
      console.log('Registration response status:', response.status);
      console.log('Registration response headers:', 
        Array.from(response.headers.entries())
          .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {})
      );
      console.log('Cookies after registration response:', document.cookie);
      
      if (!response.ok) {
        const errorText = await response.text();
        console.error('Registration failed with status:', response.status, 'Response:', errorText);
        try {
          const errorData = JSON.parse(errorText);
          console.error('Parsed error data:', errorData);
          throw new Error(errorData.message || 'Registration failed');
        } catch {
          console.error('Raw error response:', errorText);
          throw new Error(errorText || 'Registration failed');
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

const login = async (username, password) => {
    try {
        setLoading(true);
        console.log('Starting login process for user:', username);
        
        // First get a fresh CSRF token
        const token = await fetchCsrfToken();
        console.log('Fresh CSRF token received for login:', token);
        
        // Check if we have cookies
        console.log('Cookies before login request:', document.cookie);
        
        // Then make login request with the fresh token
        console.log('Making login request with CSRF token...');
        const response = await fetch('http://localhost:8080/api/auth/login', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-CSRF-Token': token,
                'Accept': 'application/json'
            },
            credentials: 'include',
            body: JSON.stringify({ username, password }),
        });
        console.log('Login response status:', response.status);
        console.log('Login response headers:', 
            Array.from(response.headers.entries())
                .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {})
        );
        console.log('Cookies after login response:', document.cookie);
      
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
      console.log('Starting logout process');
      
      // Get a fresh CSRF token
      const token = await fetchCsrfToken();
      console.log('Fresh CSRF token received for logout:', token);
      
      // Check if we have cookies
      console.log('Cookies before logout request:', document.cookie);
      
      const response = await fetch('http://localhost:8080/api/auth/logout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-CSRF-Token': token,
          'Accept': 'application/json'
        },
        credentials: 'include'
      });
      
      console.log('Logout response status:', response.status);
      console.log('Logout response headers:', 
        Array.from(response.headers.entries())
          .reduce((obj, [key, val]) => ({ ...obj, [key]: val }), {})
      );
      console.log('Cookies after logout response:', document.cookie);
      
      setUser(null);
      setToken(null);
    } catch (err) {
      console.error('Logout error:', err);
      setError(err.message);
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
        csrfToken,
        fetchCsrfToken,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};
