import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';
import { AuthProvider } from './features/auth/AuthContext';
import SignInPage from './features/auth/pages/SignInPage';
import SignUpPage from './features/auth/pages/SignUpPage';
import RequestPasswordResetPage from './features/auth/pages/RequestPasswordResetPage';
import ResetPasswordPage from './features/auth/pages/ResetPasswordPage';
import { HomePage, ProtectedRoute, PublicRoute, AdminRoute } from './features/auth/components/RouteGuards';
import GoogleAuthCallbackPage from './features/auth/pages/GoogleAuthCallbackPage';
import VerifyEmailPage from './features/auth/pages/VerifyEmailPage';
import { PortfolioProvider } from './features/portfolio/PortfolioContext';
import DashboardPage from './features/dashboard/pages/DashboardPage';
import PortfolioPage from './features/portfolio/pages/PortfolioPage';
import TransactionsList from './features/portfolio/pages/TransactionsList';
import PerformancePage from './features/analytics/pages/PerformancePage';
import StockSalesPage from './features/analytics/pages/StockSalesPage';
import OptionSalesPage from './features/analytics/pages/OptionSalesPage';
import DividendsPage from './features/analytics/pages/DividendsPage';
import FeesPage from './features/analytics/pages/FeesPage';
import TaxPage from './features/tax/TaxPage';
import UploadPage from './features/upload/pages/UploadPage';
import SettingsPage from './features/settings/pages/SettingsPage';

// --- NOVOS IMPORTS DE ADMIN ---
import AdminLayout from './features/admin/layouts/AdminLayout'; 
import AdminOverviewPage from './features/admin/pages/AdminOverviewPage';
import AdminUsersPage from './features/admin/pages/AdminUsersPage';
import UserDetailPage from './features/admin/pages/UserDetailPage';
// ------------------------------

import NotFoundPage from './features/common/pages/NotFoundPage';
import PrivacyPolicyPage from './features/legal/pages/PrivacyPolicyPage';
import TermsOfServicePage from './features/legal/pages/TermsOfServicePage';
import ContactInformationPage from './features/legal/pages/ContactInformationPage';

function App() {
    return (
        <AuthProvider>
            <PortfolioProvider>
                <Router>
                    <Layout>
                        <Routes>
                            {/* Public Routes */}
                            <Route path="/" element={<HomePage />} />
                            <Route path="/signin" element={<PublicRoute><SignInPage /></PublicRoute>} />
                            <Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />
                            <Route path="/request-password-reset" element={<PublicRoute><RequestPasswordResetPage /></PublicRoute>} />
                            <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
                            <Route path="/auth/google/callback" element={<GoogleAuthCallbackPage />} />
                            <Route path="/verify-email" element={<VerifyEmailPage />} />

                            {/* Protected Routes */}
                            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                            <Route path="/portfolio" element={<ProtectedRoute><PortfolioPage /></ProtectedRoute>} />
                            
                            {/* Analytics Routes */}
                            <Route path="/analytics/performance" element={<ProtectedRoute><PerformancePage /></ProtectedRoute>} />
                            <Route path="/analytics/stocks" element={<ProtectedRoute><StockSalesPage /></ProtectedRoute>} />
                            <Route path="/analytics/options" element={<ProtectedRoute><OptionSalesPage /></ProtectedRoute>} />
                            <Route path="/analytics/dividends" element={<ProtectedRoute><DividendsPage /></ProtectedRoute>} />
                            <Route path="/analytics/fees" element={<ProtectedRoute><FeesPage /></ProtectedRoute>} />

                            {/* Other Features */}
                            <Route path="/tax" element={<ProtectedRoute><TaxPage /></ProtectedRoute>} />
                            <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
                            <Route path="/transactions" element={<ProtectedRoute><TransactionsList /></ProtectedRoute>} />
                            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />

                            {/* --- ADMIN ROUTES (NOVA ESTRUTURA) --- */}
                            <Route path="/admin" element={<AdminRoute><AdminLayout /></AdminRoute>}>
                                <Route index element={<Navigate to="overview" replace />} />
                                <Route path="overview" element={<AdminOverviewPage />} />
                                <Route path="users" element={<AdminUsersPage />} />
                                <Route path="users/:userId" element={<UserDetailPage />} />
                            </Route>
                            {/* ------------------------------------- */}

                            {/* Legal & 404 */}
                            <Route path="/policies/privacy-policy" element={<PrivacyPolicyPage />} />
                            <Route path="/policies/terms-of-service" element={<TermsOfServicePage />} />
                            <Route path="/policies/contact-information" element={<ContactInformationPage />} />
                            <Route path="*" element={<NotFoundPage />} />
                        </Routes>
                    </Layout>
                </Router>
            </PortfolioProvider>
        </AuthProvider>
    );
}

export default App;