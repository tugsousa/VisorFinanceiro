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
import VerifyEmailPage from './pages/VerifyEmailPage'; // Import the new page
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
    if (hasInitialData === null) {
        return (
          <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
            <CircularProgress />
            <span style={{marginLeft: 8}}>Checking user data...</span>
          </Box>
        );
    }
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
            <Route path="/verify-email" element={<VerifyEmailPage />} /> {/* New Route */}
            {/* Or if using path param: <Route path="/verify-email/:token" element={<VerifyEmailPage />} /> */}
            
            <Route path="/realizedgains" element={<ProtectedRoute><RealizedGainsPage /></ProtectedRoute>} />
            <Route path="/" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
            <Route path="/tax" element={<ProtectedRoute><TaxPage /></ProtectedRoute>} />
            <Route path="/transactions" element={<ProtectedRoute><ProcessedTransactionsPage /></ProtectedRoute>} />
            
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

export default App;