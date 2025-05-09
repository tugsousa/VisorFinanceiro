// frontend/src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import UploadPage from './pages/UploadPage';
import TaxPage from './pages/TaxPage';
import SignInPage from './pages/SignInPage';
import SignUpPage from './pages/SignUpPage';
import DashboardPage from './pages/DashboardPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CircularProgress } from '@mui/material'; // <--- ADD THIS IMPORT

// Wrapper for protected routes
const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();

  if (loading) {
    // Now CircularProgress is defined
    return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: '20%' }} />;
  }

  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  return children;
};

function App() {
  return (
    <AuthProvider>
      <Router>
        <Layout> {/* Layout now wraps all routes that should have the sidebar/appbar */}
          <Routes>
            {/* Public Routes */}
            <Route path="/signin" element={<SignInPage />} />
            <Route path="/signup" element={<SignUpPage />} />

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
            
            {/* Redirect to dashboard if logged in and trying an unknown authenticated path, or to signin if not */}
            {/* A more robust way might be to check auth status before deciding where to redirect '*' */}
            <Route 
              path="*" 
              element={
                <AuthCheckerForWildcard>
                  <Navigate to="/dashboard" replace />
                </AuthCheckerForWildcard>
              } 
            />
          </Routes>
        </Layout>
      </Router>
    </AuthProvider>
  );
}

// Helper component to check auth status for wildcard route
const AuthCheckerForWildcard = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) {
    return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: '20%' }} />;
  }
  if (!user) {
    return <Navigate to="/signin" replace />;
  }
  return children; // If user exists, render the children (which is Navigate to /dashboard)
};

export default App;