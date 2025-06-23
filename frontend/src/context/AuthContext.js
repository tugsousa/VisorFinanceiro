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
  
  const [isInitialAuthLoading, setIsInitialAuthLoading] = useState(true); // For initial app load check
  const [isAuthActionLoading, setIsAuthActionLoading] = useState(false); // For actions like login/register
  
  const [authError, setAuthError] = useState(null);
  const [csrfTokenState, setCsrfTokenState] = useState('');
  const [hasInitialData, setHasInitialData] = useState(null);
  const [checkingData, setCheckingData] = useState(false); // Specifically for checkUserData async operation

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
    setIsAuthActionLoading(false); // Ensure action loading is false on logout

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
      await fetchCsrfTokenAndUpdateService(true); // Fetch CSRF silently first
      const storedToken = localStorage.getItem('auth_token');
      const storedRefreshToken = localStorage.getItem('refresh_token');
      const storedUser = localStorage.getItem('user');

      if (storedToken && storedRefreshToken && storedUser) {
        setToken(storedToken);
        setRefreshTokenState(storedRefreshToken);
        try {
          const parsedUser = JSON.parse(storedUser);
          setUser(parsedUser); // Set user state based on localStorage
          // After user is set from localStorage, check their data status
          await checkUserData(); 
        } catch (e) {
          console.error("Failed to parse stored user during init", e);
          // If parsing fails, treat as no user and perform a silent logout
          performLogout(false, "Corrupted user data in localStorage on init");
          setHasInitialData(false); 
          setCheckingData(false); 
        }
      } else {
        // No valid session found in localStorage
        performLogout(false, "No tokens or user data in localStorage on init");
        setHasInitialData(false); 
        setCheckingData(false); 
      }
      setIsInitialAuthLoading(false);
    };
    initializeAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Empty dependency array ensures this runs only once on mount

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
    console.log("[AuthContext.register] setIsAuthActionLoading(true) called.");

    let operationStage = "init";
    console.log("[AuthContext.register] Stage:", operationStage, "- Process started.");

    try {
      operationStage = "csrf_check";
      console.log("[AuthContext.register] Stage:", operationStage, "- Checking CSRF token.");
      if (!getApiServiceCsrfToken()) {
        await fetchCsrfTokenAndUpdateService(true);
        if (!getApiServiceCsrfToken()) {
          const csrfErrorMsg = "A security token is missing. Please refresh and try again.";
          console.error("[AuthContext.register] Stage:", operationStage, "- CSRF token fetch FAILED:", csrfErrorMsg);
          throw new Error(csrfErrorMsg);
        }
      }
      console.log("[AuthContext.register] Stage:", operationStage, "- CSRF token check PASSED/OBTAINED.");

      operationStage = "api_call";
      console.log("[AuthContext.register] Stage:", operationStage, "- Calling apiRegister with:", { username, email });
      const response = await apiRegister(username, email, password);
      console.log("[AuthContext.register] Stage:", operationStage, "- apiRegister call SUCCEEDED. Status:", response.status, "Data:", response.data);

      const successMsg = response?.data?.message || "Registration successful! Please check your email to verify your account.";
      console.log("[AuthContext.register] Stage: success_processing - Extracted success message:", successMsg);
      
      if (onSuccess) {
        onSuccess({ message: successMsg, warning: response?.data?.warning });
      }
      // Set loading to false AFTER onSuccess
      setIsAuthActionLoading(false); 
      console.log("[AuthContext.register] setIsAuthActionLoading(false) called on SUCCESS path (after onSuccess).");
      return;

    } catch (err) {
      operationStage = "error_handling";
      console.error("[AuthContext.register] Stage:", operationStage, "- Error during registration. Raw error object:", err);
      
      let specificMessage = "An unexpected error occurred during registration.";
      if (err.isAxiosError && err.response) {
        specificMessage = err.response.data?.error || err.response.data?.message || err.message || specificMessage;
      } else if (err.response) {
        specificMessage = err.response.data?.error || err.response.data?.message || err.message || specificMessage;
      } else if (err.message) {
        specificMessage = err.message;
      }
      
      console.error("[AuthContext.register] Stage:", operationStage, "- Determined specific error message for UI:", specificMessage);
      
      if (onError) {
        onError(new Error(specificMessage));
      }
      // Set context error and loading AFTER onError
      setAuthError(specificMessage); 
      setIsAuthActionLoading(false);
      console.log("[AuthContext.register] setIsAuthActionLoading(false) called on ERROR path (after onError).");
    }
  };

  const login = async (username, password) => {
    setIsAuthActionLoading(true);
    setCheckingData(true); // Login will involve checking data
    setAuthError(null);
    try {
      if (!getApiServiceCsrfToken()) {
         await fetchCsrfTokenAndUpdateService();
         if (!getApiServiceCsrfToken()) throw new Error("CSRF token could not be obtained for login.");
      }

      const response = await apiLogin(username, password);
      const data = response.data;

      if (!data.access_token || !data.refresh_token || !data.user) {
          throw new Error(data.error || 'Login successful but critical data missing from response.');
      }
      
      setUser(data.user); // Set user immediately
      setToken(data.access_token);
      setRefreshTokenState(data.refresh_token);

      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      await fetchCsrfTokenAndUpdateService(true); // Silent CSRF refresh
      await checkUserData(); // This will set hasInitialData and also setCheckingData(false)
      
      setIsAuthActionLoading(false); // Login action complete
      return data;
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Login failed. Please try again.';
      
      // Clear all auth state on login failure
      setUser(null);
      setToken(null);
      setRefreshTokenState(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.removeItem('has_initial_data');
      setHasInitialData(null);

      setAuthError(errMsg);
      setIsAuthActionLoading(false);
      setCheckingData(false); // Ensure this is also reset on error
      throw new Error(errMsg);
    }
  };

  const logout = async () => {
    setIsAuthActionLoading(true); // Indicate an action is happening
    await performLogout(true, "User initiated logout from logout function");
    setIsAuthActionLoading(false); // Action finished
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        refreshToken: refreshTokenState,
        
        isInitialAuthLoading,    // Specific initial loading
        isAuthActionLoading,     // Specific action loading
        // General loading can be derived by consumers if needed, or use specific ones
        loading: isInitialAuthLoading || isAuthActionLoading || checkingData, 

        authError,
        csrfToken: csrfTokenState,
        hasInitialData,
        checkingData, // Let consumers know if checkUserData is in progress
        register,
        login,
        logout,
        fetchCsrfToken: fetchCsrfTokenAndUpdateService,
        refreshUserDataCheck: checkUserData,
        performLogout,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};