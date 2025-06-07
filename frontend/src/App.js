// frontend/src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import UploadPage from './pages/UploadPage';
import TaxPage from './pages/TaxPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import RealizedGainsPage from './pages/RealizedGainsPage';
import ProcessedTransactionsPage from './pages/ProcessedTransactionsPage';
import NotFoundPage from './pages/NotFoundPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import RequestPasswordResetPage from './pages/RequestPasswordResetPage';
import ResetPasswordPage from './pages/ResetPasswordPage';
import SettingsPage from './pages/SettingsPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CircularProgress, Box } from '@mui/material';

const ProtectedRoute = ({ children }) => {
  const { user, isInitialAuthLoading } = useAuth(); // Use specific initial loading

  if (isInitialAuthLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  return children;
};

const PublicRoute = ({ children }) => {
  const { user, isInitialAuthLoading, hasInitialData, checkingData } = useAuth(); // Use specific initial loading and checkingData

  // Show global spinner ONLY during the app's very first auth check.
  if (isInitialAuthLoading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  // If user becomes defined (e.g., after successful login or if token was still valid)
  if (user) {
    // If user exists, but we're still checking their initial data (e.g., after login)
    // hasInitialData will be null initially, then true/false. checkingData covers the async.
    if (checkingData || hasInitialData === null) {
        return (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
            <CircularProgress />
            <span style={{marginLeft: 8}}>Verifying account status...</span>
          </Box>
        );
    }
    // Once user and hasInitialData are known, redirect authenticated users away from public routes.
    return <Navigate to={hasInitialData ? "/realizedgains" : "/"} replace />;
  }

  // If no user, and initial auth loading phase is complete, render the public page (children).
  // This ensures SignUpPage or SignInPage remains mounted even if AuthContext's `isAuthActionLoading`
  // becomes true due to an action within those pages (like submitting the form).
  return children;
};


function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout>
          <Routes>
            <Route path="/signin" element={<PublicRoute><SignInPage /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />
            <Route path="/verify-email" element={<VerifyEmailPage />} />
            <Route path="/request-password-reset" element={<PublicRoute><RequestPasswordResetPage /></PublicRoute>} />
            <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
            
            <Route path="/" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
            <Route path="/realizedgains" element={<ProtectedRoute><RealizedGainsPage /></ProtectedRoute>} />
            <Route path="/tax" element={<ProtectedRoute><TaxPage /></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><ProcessedTransactionsPage /></ProtectedRoute>} />
            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
            
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

export default App;