import React from 'react';
import { Navigate } from 'react-router-dom';
import { Box, CircularProgress } from '@mui/material';
import { useAuth } from '../AuthContext';
import LandingPage from '../../../pages/LandingPage';

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
    if (isInitialAuthLoading) return <PageLoader />;
    if (user) return <Navigate to="/dashboard" replace />;
    return children;
};

export const AdminRoute = ({ children }) => {
    const { user, isInitialAuthLoading } = useAuth();
    if (isInitialAuthLoading) return <PageLoader />;
    if (!user) return <Navigate to="/signin" replace />;
    if (!user.is_admin) return <Navigate to="/dashboard" replace />;
    return children;
};