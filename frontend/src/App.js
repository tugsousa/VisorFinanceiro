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
    import SettingsPage from './pages/SettingsPage'; // Import the new SettingsPage
    import { AuthProvider, useAuth } from './context/AuthContext';
    import { CircularProgress, Box } from '@mui/material';

    const ProtectedRoute = ({ children }) => {
      const { user, loading: authLoading } = useAuth();

      if (authLoading) {
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
      const { user, loading: authLoading, hasInitialData } = useAuth();

      if (authLoading) {
        return (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
            <CircularProgress />
          </Box>
        );
      }

      if (user) {
        // If hasInitialData is still null, it means the check is ongoing (or hasn't run after login)
        // Show loading until hasInitialData is resolved to true or false
        if (hasInitialData === null) { 
            return (
              <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
                <span style={{marginLeft: 8}}>Checking user data...</span>
              </Box>
            );
        }
        // Once hasInitialData is resolved, redirect accordingly
        return <Navigate to={hasInitialData ? "/realizedgains" : "/"} replace />;
      }
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
                <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} /> {/* New Settings Route */}
                
                <Route path="*" element={<NotFoundPage />} />
              </Routes>
            </Layout>
          </Router>
        </AuthProvider>
      );
    }

    export default App;