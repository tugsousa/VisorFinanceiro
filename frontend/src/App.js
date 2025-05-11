// frontend/src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import UploadPage from './pages/UploadPage';
import TaxPage from './pages/TaxPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import DashboardPage from './pages/DashboardPage';
import ProcessedTransactionsPage from './pages/ProcessedTransactionsPage'; // Import the new page
import NotFoundPage from './pages/NotFoundPage'; 
import { AuthProvider, useAuth } from './context/AuthContext';
import { CircularProgress, Box } from '@mui/material';

// Wrapper for protected routes
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
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

// Wrapper for public routes (redirect if logged in)
const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
        <CircularProgress />
      </Box>
    );
  }

  if (user) {
    return <Navigate to="/dashboard" replace />; // Or "/" for UploadPage as default
  }
  return children;
};


function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout> 
          <Routes>
            {/* Public Routes */}
            <Route path="/signin" element={<PublicRoute><SignInPage /></PublicRoute>} />
            <Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />

            {/* Protected Routes */}
            <Route 
              path="/dashboard" 
              element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} 
            />
            <Route 
              path="/" 
              element={<ProtectedRoute><UploadPage /></ProtectedRoute>} 
            />
            <Route 
              path="/tax" 
              element={<ProtectedRoute><TaxPage /></ProtectedRoute>} 
            />
            <Route 
              path="/transactions" // Add new route for the transactions page
              element={<ProtectedRoute><ProcessedTransactionsPage /></ProtectedRoute>} 
            />
            
            {/* Not Found Route - must be last */}
            <Route path="*" element={<NotFoundPage />} />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

export default App;