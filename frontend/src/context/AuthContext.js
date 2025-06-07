import React, { createContext, useState, useEffect, useContext, useCallback } from 'react';
import {
  apiLogin, apiRegister, apiLogout,
  fetchAndSetCsrfToken as apiServiceFetchCsrf,
  apiCheckUserHasData,
  getApiServiceCsrfToken // Import to use the current CSRF token from apiService
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
  const [csrfTokenState, setCsrfTokenState] = useState(''); // Local CSRF state in AuthContext
  const [hasInitialData, setHasInitialData] = useState(null);
  const [checkingData, setCheckingData] = useState(false);

  const fetchCsrfTokenAndUpdateService = useCallback(async (isSilent = false) => {
    try {
      const newCsrfToken = await apiServiceFetchCsrf(); // This sets it in apiService
      if (newCsrfToken) {
        setCsrfTokenState(newCsrfToken); // Update local context state too
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
      // If checking data fails (e.g., 401, network error), assume no data or handle as auth issue
      if (err.response && err.response.status === 401) {
        // This might indicate an expired token that wasn't caught by apiService interceptor
        // (e.g., if checkUserData was called before interceptor ran or if it was a direct axios call).
        // Trigger a logout.
        window.dispatchEvent(new CustomEvent('auth-error-logout', { detail: 'User data check unauthorized' }));
      }
      setHasInitialData(false); // Default to false on error
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

    if (apiCall && oldToken) {
        try {
            await apiLogout(); // apiLogout now gets CSRF from apiService
        } catch (err) {
            console.error('API Logout error during performLogout:', err);
            // Don't re-throw or set authError here as it's part of logout flow
        }
    }
    // Ensure CSRF is refreshed/available after logout for potential next login
    await fetchCsrfTokenAndUpdateService(true); // isSilent = true
  }, [fetchCsrfTokenAndUpdateService]);


  useEffect(() => {
    const initializeAuth = async () => {
      setLoading(true);
      setCheckingData(true); // Assume we'll check data initially
      await fetchCsrfTokenAndUpdateService(true); // Fetch CSRF silently on init
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
        // Check user data only if user info is present (implies tokens were valid at some point)
        if (storedUser) {
          await checkUserData();
        } else {
          // If no storedUser, but tokens exist, this might be an incomplete/corrupted state.
          // Treat as logged out to be safe.
          performLogout(false, "Incomplete stored user state");
          setHasInitialData(false);
          setCheckingData(false);
        }
      } else {
        performLogout(false, "No tokens on init"); // Logout without API call if no tokens
        setHasInitialData(false); // If no tokens, definitely no data
        setCheckingData(false);
      }
      setLoading(false);
    };
    initializeAuth();
  }, [fetchCsrfTokenAndUpdateService, checkUserData, performLogout]); // performLogout added

  useEffect(() => {
    const handleLogoutEvent = (event) => {
      console.warn(`AuthContext: Received auth-error-logout event. Detail: ${event.detail}. Logging out.`);
      performLogout(false, `Auth error: ${event.detail}`); // Logout without API call, include reason
    };
    window.addEventListener('auth-error-logout', handleLogoutEvent);
    return () => {
      window.removeEventListener('auth-error-logout', handleLogoutEvent);
    };
  }, [performLogout]);


    const register = async (username, email, password, onSuccess, onError) => { // Added onSuccess, onError callbacks
    setAuthError(null);
    setLoading(true); // Set loading true at the very start
    console.log("[AuthContext.register] setLoading(true) called.");

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
          throw new Error(csrfErrorMsg); // This will be caught by the outer catch
        }
      }
      console.log("[AuthContext.register] Stage:", operationStage, "- CSRF token check PASSED/OBTAINED.");


      operationStage = "api_call";
      console.log("[AuthContext.register] Stage:", operationStage, "- Calling apiRegister with:", { username, email });
      const response = await apiRegister(username, email, password);
      console.log("[AuthContext.register] Stage:", operationStage, "- apiRegister call SUCCEEDED. Status:", response.status, "Data:", response.data);

      const successMsg = response?.data?.message || "Registration successful! Please check your email to verify your account.";
      console.log("[AuthContext.register] Stage: success_processing - Extracted success message:", successMsg);
      
      setLoading(false); // Set loading false *before* calling onSuccess
      console.log("[AuthContext.register] setLoading(false) called on SUCCESS path.");
      if (onSuccess) onSuccess({ message: successMsg, warning: response?.data?.warning }); // Call success callback
      return; // Explicitly return, no value needed if using callbacks for result

    } catch (err) {
      operationStage = "error_handling";
      console.error("[AuthContext.register] Stage:", operationStage, "- Error during registration. Raw error:", err);
      
      let specificMessage = "An unexpected error occurred during registration.";
      if (err.isAxiosError && err.response) {
        specificMessage = err.response.data?.error || err.response.data?.message || err.message || specificMessage;
      } else if (err.response) {
        specificMessage = err.response.data?.error || err.response.data?.message || err.message || specificMessage;
      } else if (err.message) {
        specificMessage = err.message;
      }
      
      console.error("[AuthContext.register] Stage:", operationStage, "- Determined specific error message:", specificMessage);
      setAuthError(specificMessage);
      setLoading(false); // Set loading false *before* calling onError
      console.log("[AuthContext.register] setLoading(false) called on ERROR path.");
      if (onError) onError(new Error(specificMessage)); // Call error callback
      // No need to re-throw if using callbacks to handle the outcome in the component
    }
    // `finally` block is no longer strictly necessary for setLoading as it's handled in try/catch
  };

  const login = async (username, password) => {
    setLoading(true);
    setCheckingData(true);
    setAuthError(null);
    try {
      // Ensure CSRF token is available; apiService request interceptor handles this.
      // For explicit pre-fetch if needed:
      if (!getApiServiceCsrfToken()) {
         await fetchCsrfTokenAndUpdateService();
         if (!getApiServiceCsrfToken()) throw new Error("CSRF token could not be obtained for login.");
      }

      const response = await apiLogin(username, password);
      const data = response.data;

      if (!data.access_token || !data.refresh_token || !data.user) {
          throw new Error(data.error || 'Login successful but critical data missing from response.');
      }
      
      setUser(data.user);
      setToken(data.access_token);
      setRefreshTokenState(data.refresh_token);

      localStorage.setItem('auth_token', data.access_token);
      localStorage.setItem('refresh_token', data.refresh_token);
      localStorage.setItem('user', JSON.stringify(data.user));
      
      // CSRF token might have been refreshed by the login process or might need refreshing
      // Let's ensure apiService has the latest one from the login response if available,
      // or fetch a new one. The login response currently doesn't send a new CSRF, so fetch is good.
      await fetchCsrfTokenAndUpdateService(true); // Silent fetch after login

      await checkUserData(); // This will set hasInitialData and update localStorage
      
      setLoading(false); // Set loading to false AFTER checkUserData
      return data; // Return the full data for any chained promises in SignInPage
    } catch (err) {
      const errMsg = err.response?.data?.error || err.message || 'Login failed. Please try again.';
      
      // Critical: Clear local state on any login attempt failure to avoid inconsistent states
      setUser(null);
      setToken(null);
      setRefreshTokenState(null);
      localStorage.removeItem('auth_token');
      localStorage.removeItem('refresh_token');
      localStorage.removeItem('user');
      localStorage.removeItem('has_initial_data'); // Also clear this
      setHasInitialData(null); // Reset local state for hasInitialData

      setAuthError(errMsg); // Set context-level error for potential display elsewhere
      setLoading(false);
      setCheckingData(false); // Also set this to false
      throw new Error(errMsg); // This error will be caught by SignInPage.js and displayed
    }
  };

  const logout = async () => {
    setLoading(true);
    await performLogout(true, "User initiated logout from logout function");
    setLoading(false);
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        token,
        refreshToken: refreshTokenState,
        loading: loading || checkingData, // Combine general loading and data checking flags
        authError,
        csrfToken: csrfTokenState, // Expose the context-level CSRF token
        hasInitialData,
        register,
        login,
        logout,
        fetchCsrfToken: fetchCsrfTokenAndUpdateService,
        refreshUserDataCheck: checkUserData,
        performLogout, // Expose performLogout if needed by other parts of app for forced logouts
      }}
    >
      {children}
    </AuthContext.Provider>
  );
};