import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../AuthContext';
import LandingPage from '../../landing/pages/LandingPage';

// Helper for loading state
const PageLoader = () => (
  <Box display="flex" justifyContent="center" alignItems="center" minHeight="80vh">
    <CircularProgress />
  </Box>
);

export const HomePage = () => {
    const { user, isInitialAuthLoading } = useAuth();
    if (isInitialAuthLoading) return <PageLoader />;
    return user ? <Navigate to="/dashboard" replace /> : <LandingPage />;
};

export const ProtectedRoute = ({ children }) => {
    const { user, isInitialAuthLoading } = useAuth();
    if (isInitialAuthLoading) return <PageLoader />;
    if (!user) return <Navigate to="/signin" replace />;
    return children;
};

export const PublicRoute = ({ children }) => {
    const { user, isInitialAuthLoading } = useAuth();
    const location = useLocation();

    if (isInitialAuthLoading) return <PageLoader />;

    // If the user is authenticated BUT there is an error/message query param present
    // (e.g. ?error=email_already_exists_local from an OAuth redirect), let the page
    // render so the error message is shown. The sign-in page will clear the param
    // itself after reading it.
    const searchParams = new URLSearchParams(location.search);
    const hasNotification = searchParams.has('error') || searchParams.has('message');

    if (user && !hasNotification) return <Navigate to="/dashboard" replace />;

    return children;
};

export const AdminRoute = ({ children }) => {
    const { user, isInitialAuthLoading } = useAuth();
    if (isInitialAuthLoading) return <PageLoader />;
    if (!user) return <Navigate to="/signin" replace />;
    if (!user.is_admin) return <Navigate to="/dashboard" replace />;
    return children;
};
