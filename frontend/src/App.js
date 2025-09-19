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
import LandingPage from './pages/LandingPage';
import DashboardPage from './pages/DashboardPage';
import PrivacyPolicyPage from './pages/policies/PrivacyPolicyPage';
import TermsOfServicePage from './pages/policies/TermsOfServicePage';
import ContactInformationPage from './pages/policies/ContactInformationPage';
import { AuthProvider, useAuth } from './context/AuthContext';
import { CircularProgress, Box } from '@mui/material';
import GoogleAuthCallbackPage from './pages/GoogleAuthCallbackPage';
import AdminDashboardPage from './pages/AdminDashboardPage';
// --- INÍCIO DA NOVA IMPORTAÇÃO ---
// NOTA: Terá de criar este ficheiro `UserDetailPage.js` na sua pasta `src/pages/`.
import UserDetailPage from './pages/UserDetailPage'; 
// --- FIM DA NOVA IMPORTAÇÃO ---


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
            <Router>
                <Layout>
                    <Routes>
                        <Route path="/" element={<HomePage />} />

                        <Route path="/signin" element={<PublicRoute><SignInPage /></PublicRoute>} />
                        <Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />
                        <Route path="/request-password-reset" element={<PublicRoute><RequestPasswordResetPage /></PublicRoute>} />
                        <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
                        <Route path="/auth/google/callback" element={<GoogleAuthCallbackPage />} />

                        <Route path="/verify-email" element={<VerifyEmailPage />} />
                        <Route path="/policies/privacy-policy" element={<PrivacyPolicyPage />} />
                        <Route path="/policies/terms-of-service" element={<TermsOfServicePage />} />
                        <Route path="/policies/contact-information" element={<ContactInformationPage />} />

                        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                        <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
                        <Route path="/realizedgains" element={<ProtectedRoute><RealizedGainsPage /></ProtectedRoute>} />
                        <Route path="/tax" element={<ProtectedRoute><TaxPage /></ProtectedRoute>} />
                        <Route path="/transactions" element={<ProtectedRoute><ProcessedTransactionsPage /></ProtectedRoute>} />
                        <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                        
                        {/* --- ROTAS DE ADMIN ATUALIZADAS --- */}
                        <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
                        <Route path="/admin/users/:userId" element={<AdminRoute><UserDetailPage /></AdminRoute>} />
                        {/* --- FIM DAS ROTAS DE ADMIN ATUALIZADAS --- */}

                        <Route path="*" element={<NotFoundPage />} />
                    </Routes>
                </Layout>
            </Router>
        </AuthProvider>
    );
}

export default App;