// frontend/src/App.js
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import Layout from './layouts/Layout';

// --- Feature: Authentication ---
import { AuthProvider } from './features/auth/AuthContext';
import SignInPage from './features/auth/pages/SignInPage';
import SignUpPage from './features/auth/pages/SignUpPage';
import RequestPasswordResetPage from './features/auth/pages/RequestPasswordResetPage';
import ResetPasswordPage from './features/auth/pages/ResetPasswordPage';
import { HomePage, ProtectedRoute, PublicRoute, AdminRoute } from './features/auth/components/RouteGuards';
import GoogleAuthCallbackPage from './features/auth/pages/GoogleAuthCallbackPage'; 
import VerifyEmailPage from './features/auth/pages/VerifyEmailPage'; 

// --- Feature: Portfolio & Dashboard (NEW) ---
import { PortfolioProvider } from './features/portfolio/PortfolioContext';
import DashboardPage from './features/dashboard/pages/DashboardPage';
import PortfolioPage from './features/portfolio/pages/PortfolioPage';
import TransactionsList from './features/portfolio/pages/TransactionsList';

// --- Feature: Analytics (NEW SUB-PAGES) ---
import PerformancePage from './features/analytics/pages/PerformancePage';
import StockSalesPage from './features/analytics/pages/StockSalesPage';
import OptionSalesPage from './features/analytics/pages/OptionSalesPage';
import DividendsPage from './features/analytics/pages/DividendsPage';
import FeesPage from './features/analytics/pages/FeesPage';

// --- Feature: Tools & Admin ---
import TaxPage from './features/tax/TaxPage';
import UploadPage from './features/upload/pages/UploadPage';
import SettingsPage from './features/settings/pages/SettingsPage'; 
import AdminDashboardPage from './features/admin/pages/AdminDashboardPage';
import UserDetailPage from './features/admin/pages/UserDetailPage';
import NotFoundPage from './features/common/pages/NotFoundPage';

// --- Policies ---
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
                            {/* --- PUBLIC ROUTES --- */}
                            <Route path="/" element={<HomePage />} />
                            <Route path="/signin" element={<PublicRoute><SignInPage /></PublicRoute>} />
                            <Route path="/signup" element={<PublicRoute><SignUpPage /></PublicRoute>} />
                            <Route path="/request-password-reset" element={<PublicRoute><RequestPasswordResetPage /></PublicRoute>} />
                            <Route path="/reset-password" element={<PublicRoute><ResetPasswordPage /></PublicRoute>} />
                            <Route path="/auth/google/callback" element={<GoogleAuthCallbackPage />} />
                            <Route path="/verify-email" element={<VerifyEmailPage />} />

                            {/* --- PROTECTED ROUTES --- */}
                            
                            {/* 1. Dashboard (The new Landing) */}
                            <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
                            
                            {/* 2. Portfolio (Current Holdings) */}
                            <Route path="/portfolio" element={<ProtectedRoute><PortfolioPage /></ProtectedRoute>} />
                            
                            {/* 3. Analytics (Dropdown Items) */}
                            <Route path="/analytics/performance" element={<ProtectedRoute><PerformancePage /></ProtectedRoute>} />
                            <Route path="/analytics/stocks" element={<ProtectedRoute><StockSalesPage /></ProtectedRoute>} />
                            <Route path="/analytics/options" element={<ProtectedRoute><OptionSalesPage /></ProtectedRoute>} />
                            <Route path="/analytics/dividends" element={<ProtectedRoute><DividendsPage /></ProtectedRoute>} />
                            <Route path="/analytics/fees" element={<ProtectedRoute><FeesPage /></ProtectedRoute>} />
                            
                            {/* 4. Tools & Data */}
                            <Route path="/tax" element={<ProtectedRoute><TaxPage /></ProtectedRoute>} />
                            <Route path="/upload" element={<ProtectedRoute><UploadPage /></ProtectedRoute>} />
                            <Route path="/transactions" element={<ProtectedRoute><TransactionsList /></ProtectedRoute>} />
                            <Route path="/settings" element={<ProtectedRoute><SettingsPage /></ProtectedRoute>} />
                            
                            {/* 5. Admin */}
                            <Route path="/admin" element={<AdminRoute><AdminDashboardPage /></AdminRoute>} />
                            <Route path="/admin/users/:userId" element={<AdminRoute><UserDetailPage /></AdminRoute>} />

                            {/* --- LEGAL & FALLBACK --- */}
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