# Fresh Database Fix Documentation

## Problem Description

When users delete their database in development and try to do a fresh start, the application page doesn't load properly. This happens because:

1. **Stale Authentication Cookies**: The browser still has old `refresh_token` cookies from the previous session
2. **Database Session Lookup Fails**: When the refresh endpoint is called, it tries to find the session in the database using the old refresh token, but since the database was deleted, no session exists
3. **Authentication Chain Breaks**: This causes a 401 error, which then prevents the dashboard from loading properly

## Root Cause Analysis

From the logs, the issue was clear:
```
{"level":"WARN","msg":"Refresh token lookup failed or token invalid/expired","error":"refresh session not found, expired, or blocked"}
{"level":"WARN","msg":"Sending JSON error to client","message":"Invalid or expired refresh token","statusCode":401}
```

The refresh token cookie exists, but the corresponding user/session doesn't exist in the database (because it was deleted).

## Solution Overview

The fix implements a comprehensive cleanup strategy that handles both backend and frontend to ensure a clean state after database deletion:

### Backend Changes

1. **Enhanced Refresh Token Validation**: Modified the refresh token handler to detect when a refresh token exists but the corresponding user/session doesn't exist in the database
2. **Automatic Cookie Cleanup**: When detecting a fresh database scenario, automatically clear the refresh token cookie
3. **Specific Error Code**: Return a 410 Gone status code to distinguish between "token expired" and "database reset" scenarios

### Frontend Changes

1. **Enhanced Token Refresh Logic**: Updated the axios interceptor to handle the new 410 Gone error code
2. **Complete State Cleanup**: Clear all authentication-related local storage when a database reset is detected
3. **Cookie Cleanup**: Make a request to clear the refresh token cookie
4. **Graceful Recovery**: Dispatch an event to notify the AuthContext to perform a complete logout

## Implementation Details

### Backend Implementation

**File**: `backend/src/handlers/auth_handler.go`

#### Key Changes:

1. **Added `sendJSONErrorWithCode` function**:
```go
func sendJSONErrorWithCode(w http.ResponseWriter, message string, statusCode int) {
    w.Header().Set("Content-Type", "application/json")
    w.WriteHeader(statusCode)
    logger.L.Warn("Sending JSON error to client", "message", message, "statusCode", statusCode)
    json.NewEncoder(w).Encode(map[string]string{"error": message})
}
```

2. **Enhanced `RefreshTokenHandler`**:
```go
// Check if user still exists in database (handles fresh database scenario)
user, err := model.GetUserByID(database.DB, oldSession.UserID)
if err != nil {
    if errors.Is(err, sql.ErrNoRows) {
        logger.L.Warn("User not found during refresh - likely fresh database scenario", "userID", oldSession.UserID)
        // Clear the refresh token cookie since the user no longer exists
        http.SetCookie(w, &http.Cookie{Name: "refresh_token", Value: "", Path: "/api/auth/refresh", MaxAge: -1})
        // Return a specific error code for database reset scenario
        sendJSONErrorWithCode(w, "Database has been reset. Please log in again.", http.StatusGone)
        return
    }
    // ... handle other errors
}
```

### Frontend Implementation

**File**: `frontend/src/lib/api.js`

#### Key Changes:

1. **Added 410 Gone Handler in Axios Interceptor**:
```javascript
// Handle database reset scenario (410 Gone)
if (error.response?.status === 410) {
    logger.error('Database reset detected, clearing authentication state');
    // Clear all authentication state
    localStorage.removeItem('auth_token');
    localStorage.removeItem('user');
    localStorage.removeItem('has_initial_data');
    
    // Clear refresh token cookie by making a request to clear it
    try {
        await fetch('/api/auth/refresh', {
            method: 'POST',
            credentials: 'include'
        });
    } catch (cookieError) {
        console.warn('Failed to clear refresh token cookie:', cookieError);
    }

    // Dispatch custom event to notify AuthContext
    window.dispatchEvent(new CustomEvent('auth-database-reset', { 
        detail: 'Database has been reset. Please log in again.' 
    }));
    
    return Promise.reject(error);
}
```

**File**: `frontend/src/features/auth/AuthContext.jsx`

#### Key Changes:

1. **Added Database Reset Event Listener**:
```javascript
const handleDatabaseResetEvent = (event) => {
    performLogout(false, `Database reset: ${event.detail}`);
};

window.addEventListener('auth-database-reset', handleDatabaseResetEvent);
```

## How It Works

### Normal Flow (No Database Reset)
1. User logs in → gets access token and refresh token cookie
2. Access token expires → frontend calls refresh endpoint
3. Backend validates refresh token and user exists → returns new tokens
4. User continues normally

### Fresh Database Flow (Database Deleted)
1. User has old refresh token cookie from previous session
2. Access token expires → frontend calls refresh endpoint
3. Backend finds refresh token but user doesn't exist → detects fresh database
4. Backend clears refresh token cookie and returns 410 Gone
5. Frontend intercepts 410 error → clears all auth state and cookies
6. Frontend dispatches database reset event → AuthContext performs logout
7. User is redirected to login page → can create new account or log in

## Testing

### Manual Testing Steps

1. **Setup**: Run the application and create an account with some data
2. **Delete Database**: Stop the backend and delete the database files
3. **Restart**: Start the backend with fresh database
4. **Access App**: Try to access the dashboard in the browser
5. **Expected Result**: Should be automatically redirected to login page instead of seeing broken dashboard

### Automated Testing

A test script is provided: `test_fresh_database_fix.js`

```bash
# Run the test (requires Node.js and axios)
node test_fresh_database_fix.js
```

The test simulates:
1. User login and token acquisition
2. Database deletion simulation
3. Token refresh attempt
4. Verification that 410 Gone is returned correctly

## Benefits

1. **Improved User Experience**: Users no longer see broken dashboards after database deletion
2. **Automatic Recovery**: System automatically detects and handles the scenario
3. **Clean State**: All authentication state is properly cleaned up
4. **Clear Error Messages**: Users get clear feedback about what happened
5. **No Manual Intervention**: No need for users to manually clear cookies or cache

## Files Modified

### Backend
- `backend/src/handlers/auth_handler.go` - Enhanced refresh token validation

### Frontend
- `frontend/src/lib/api.js` - Added 410 Gone handler in axios interceptor
- `frontend/src/features/auth/AuthContext.jsx` - Added database reset event listener

### Test Files
- `test_fresh_database_fix.js` - Test script to verify the fix

## Future Considerations

1. **Production Deployment**: This fix is particularly useful in development but also helps in production scenarios where database resets might occur
2. **Additional Cleanup**: Could extend to clear other cached data that might be stale after database reset
3. **User Feedback**: Could show a toast notification explaining what happened to the user

## Conclusion

This fix ensures that users have a smooth experience even when they delete their database and start fresh. The application now gracefully handles this scenario by automatically logging out the user and redirecting them to the login page, preventing the broken dashboard issue that was occurring before.