// frontend/src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';

// --- Feature: Authentication ---
import { AuthProvider, useAuth } from './features/auth/AuthContext';
import SignInPage from './features/auth/pages/SignInPage';
import SignUpPage from './features/auth/pages/SignUpPage';
import RequestPasswordResetPage from './features/auth/pages/RequestPasswordResetPage';
import ResetPasswordPage from './features/auth/pages/ResetPasswordPage';

// --- Feature: Portfolio ---
import { PortfolioProvider } from './features/portfolio/PortfolioContext';
import TransactionsList from './features/portfolio/pages/TransactionsList'; // Renamed from ProcessedTransactionsPage

// --- Feature: Analytics ---
import AnalyticsDashboard from './features/analytics/pages/AnalyticsDashboard'; // Renamed from RealizedGainsPage

// --- Feature: Tax ---
import TaxPage from './features/tax/TaxPage'; // Isolated in its own folder

// --- Shared / Generic Pages ---
import UploadPage from './pages/UploadPage'; // Kept generic
import GoogleAuthCallbackPage from './pages/GoogleAuthCallbackPage';
import NotFoundPage from './pages/NotFoundPage';
import VerifyEmailPage from './pages/VerifyEmailPage';
import SettingsPage from './pages/SettingsPage';
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
import UserDetailPage from './pages/UserDetailPage'; 

// --- Policies ---
import PrivacyPolicyPage from './pages/policies/PrivacyPolicyPage';
import TermsOfServicePage from './pages/policies/TermsOfServicePage';
import ContactInformationPage from './pages/policies/ContactInformationPage';

import { CircularProgress, Box } from '@mui/material';

// --- Route Guards ---

const HomePage = () => {
    const { user, isInitialAuthLoading } = useAuth();
    if (isInitialAuthLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }
    return user ? <Navigate to="/dashboard" replace /> : <LandingPage />;
};

const ProtectedRoute = ({ children }) => {
    const { user, isInitialAuthLoading } = useAuth();
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
    const { user, isInitialAuthLoading } = useAuth();
    if (isInitialAuthLoading) {
        return (
            <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
                <CircularProgress />
            </Box>
        );
    }
    if (user) {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
};

const AdminRoute = ({ children }) => {
    const { user, isInitialAuthLoading } = useAuth();
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
    if (!user.is_admin) {
        return <Navigate to="/dashboard" replace />;
    }
    return children;
};

function App() {
    return (
        <AuthProvider>
            <PortfolioProvider> 
                <Router>
                    <Layout>
                        <Routes>
                            <Route path="/" element={<HomePage />} />

                            {/* Authentication Feature Routes */}
                            <Route path="/signin" element={<PublicRoute><SignInPage /></PublicRoute>} />
                            <Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />
                            <Route path="/request-password-reset" element={<PublicRoute><RequestPasswordResetPage /></PublicRoute>} />
                            <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
                            <Route path="/auth/google/callback" element={<GoogleAuthCallbackPage />} />
                            <Route path="/verify-email" element={<VerifyEmailPage />} />

                            {/* Policy Pages */}
                            <Route path="/policies/privacy-policy" element={<PrivacyPolicyPage />} />
                            <Route path="/policies/terms-of-service" element={<TermsOfServicePage />} />
                            <Route path="/policies/contact-information" element={<ContactInformationPage />} />

                            {/* Core App Routes (Protected) */}
                            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                            <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
                            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                            
                            {/* Analytics Feature */}
                            <Route path="/realizedgains" element={<ProtectedRoute><AnalyticsDashboard /></ProtectedRoute>} />
                            
                            {/* Tax Feature */}
                            <Route path="/tax" element={<ProtectedRoute><TaxPage /></ProtectedRoute>} />
                            
                            {/* Portfolio Feature */}
                            <Route path="/transactions" element={<ProtectedRoute><TransactionsList /></ProtectedRoute>} />
                            
                            {/* Admin Feature */}
                            <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
                            <Route path="/admin/users/:userId" element={<AdminRoute><UserDetailPage /></AdminRoute>} />

                            {/* Fallback */}
                            <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                    </Layout>
                </Router>
            </PortfolioProvider>
        </AuthProvider>
    );
}

export default App;