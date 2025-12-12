// frontend/src/layouts/Layout.js
import React, { useState } from 'react';
import { 
    Box, AppBar, Toolbar, Typography, IconButton, Tooltip, Avatar, 
    Menu, MenuItem, Divider, Button, Container, Link as MuiLink 
} from '@mui/material';
import { Link as RouterLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../features/auth/AuthContext';
import CookieConsent from "react-cookie-consent";
import PortfolioSelector from '../features/portfolio/components/PortfolioSelector';

// Icons
import {
    Person as PersonIcon, 
    Settings as SettingsIcon, 
    Logout as LogoutIcon,
    AutoGraph as AutoGraphIcon, 
    AdminPanelSettings as AdminPanelSettingsIcon,
    KeyboardArrowDown as ArrowDownIcon, 
    CloudUpload as CloudUploadIcon,
    Dashboard as DashboardIcon,
    PieChart as PieChartIcon,
    ReceiptLong as TaxIcon,
    TableChart as DataIcon,
    TrendingUp as TrendingUpIcon
} from '@mui/icons-material';

import logger from '../lib/utils/logger';

export default function Layout({ children }) {
    const { user, logout } = useAuth();
    const navigate = useNavigate();
    const location = useLocation();
    
    // User Menu State
    const [anchorElUser, setAnchorElUser] = useState(null);
    
    // Analytics Menu State
    const [anchorElAnalytics, setAnchorElAnalytics] = useState(null);

    // -- Handlers --
    const handleUserMenuOpen = (event) => setAnchorElUser(event.currentTarget);
    const handleUserMenuClose = () => setAnchorElUser(null);

    const handleAnalyticsMenuOpen = (event) => setAnchorElAnalytics(event.currentTarget);
    const handleAnalyticsMenuClose = () => setAnchorElAnalytics(null);

    const handleLogout = async () => {
        handleUserMenuClose();
        await logout();
        navigate('/');
    };

    // Helper to check if a route is active for styling
    const isActive = (path) => location.pathname === path;
    const isAnalyticsActive = location.pathname.startsWith('/analytics');

    return (
        <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
            <AppBar 
                position="fixed" 
                sx={{ 
                    backgroundColor: 'background.paper', 
                    color: 'text.primary', 
                    boxShadow: '0px 1px 10px rgba(0,0,0,0.05)', 
                    borderBottom: (theme) => `1px solid ${theme.palette.divider}` 
                }}
            >
                <Container maxWidth="xl">
                    <Toolbar disableGutters sx={{ height: 70 }}>
                        
                        {/* 1. LOGO */}
                        <Box 
                            component={RouterLink} 
                            to={user ? "/dashboard" : "/"} 
                            sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none', flexGrow: 0, mr: 4 }}
                        >
                            <AutoGraphIcon sx={{ mr: 1, color: '#178bba', fontSize: 32 }} />
                            <Typography 
                                variant="h6" 
                                sx={{ 
                                    fontWeight: 700, 
                                    color: '#2c3e50', 
                                    letterSpacing: '-0.5px' 
                                }}
                            >
                                VisorFinanceiro
                            </Typography>
                        </Box>

                        {user ? (
                            <>
                                {/* 2. MAIN NAVIGATION (Center Left) */}
                                <Box sx={{ flexGrow: 1, display: { xs: 'none', md: 'flex' }, alignItems: 'center', gap: 1 }}>
                                    
                                    <Button 
                                        component={RouterLink} 
                                        to="/dashboard" 
                                        startIcon={<DashboardIcon />}
                                        sx={{ 
                                            color: isActive('/dashboard') ? 'primary.main' : 'text.secondary', 
                                            backgroundColor: isActive('/dashboard') ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                                            textTransform: 'none',
                                            fontWeight: isActive('/dashboard') ? 600 : 500
                                        }}
                                    >
                                        Dashboard
                                    </Button>

                                    <Button 
                                        component={RouterLink} 
                                        to="/portfolio" 
                                        startIcon={<PieChartIcon />}
                                        sx={{ 
                                            color: isActive('/portfolio') ? 'primary.main' : 'text.secondary',
                                            backgroundColor: isActive('/portfolio') ? 'rgba(25, 118, 210, 0.08)' : 'transparent', 
                                            textTransform: 'none',
                                            fontWeight: isActive('/portfolio') ? 600 : 500
                                        }}
                                    >
                                        Portfólio
                                    </Button>
                                    
                                    {/* ANALYTICS DROPDOWN */}
                                    <Box>
                                        <Button 
                                            onClick={handleAnalyticsMenuOpen}
                                            endIcon={<ArrowDownIcon />}
                                            startIcon={<TrendingUpIcon />}
                                            sx={{ 
                                                color: isAnalyticsActive ? 'primary.main' : 'text.secondary',
                                                backgroundColor: isAnalyticsActive ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                                                textTransform: 'none',
                                                fontWeight: isAnalyticsActive ? 600 : 500
                                            }}
                                        >
                                            Performance
                                        </Button>
                                        <Menu
                                            anchorEl={anchorElAnalytics}
                                            open={Boolean(anchorElAnalytics)}
                                            onClose={handleAnalyticsMenuClose}
                                            slotProps={{ paper: { elevation: 2, sx: { mt: 1, minWidth: 180 } } }}
                                        >
                                            <MenuItem component={RouterLink} to="/analytics/performance" onClick={handleAnalyticsMenuClose}>Performance Global</MenuItem>
                                            <Divider />
                                            <MenuItem component={RouterLink} to="/analytics/stocks" onClick={handleAnalyticsMenuClose}>Vendas de Ações</MenuItem>
                                            <MenuItem component={RouterLink} to="/analytics/options" onClick={handleAnalyticsMenuClose}>Vendas de Opções</MenuItem>
                                            <MenuItem component={RouterLink} to="/analytics/dividends" onClick={handleAnalyticsMenuClose}>Dividendos</MenuItem>
                                            <MenuItem component={RouterLink} to="/analytics/fees" onClick={handleAnalyticsMenuClose}>Taxas e Comissões</MenuItem>
                                        </Menu>
                                    </Box>

                                    <Button 
                                        component={RouterLink} 
                                        to="/tax" 
                                        startIcon={<TaxIcon />}
                                        sx={{ 
                                            color: isActive('/tax') ? 'primary.main' : 'text.secondary',
                                            backgroundColor: isActive('/tax') ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                                            textTransform: 'none',
                                            fontWeight: isActive('/tax') ? 600 : 500
                                        }}
                                    >
                                        IRS
                                    </Button>

                                    <Button 
                                        component={RouterLink} 
                                        to="/transactions" 
                                        startIcon={<DataIcon />}
                                        sx={{ 
                                            color: isActive('/transactions') ? 'primary.main' : 'text.secondary', 
                                            backgroundColor: isActive('/transactions') ? 'rgba(25, 118, 210, 0.08)' : 'transparent',
                                            textTransform: 'none',
                                            fontWeight: isActive('/transactions') ? 600 : 500
                                        }}
                                    >
                                        Dados
                                    </Button>
                                </Box>

                                {/* 3. RIGHT SIDE ACTIONS */}
                                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                                    
                                    {/* Portfolio Selector Component */}
                                    <PortfolioSelector />
                                    
                                    {/* High Visibility Upload Button */}
                                    <Button 
                                        variant="contained" 
                                        color="primary"
                                        startIcon={<CloudUploadIcon />}
                                        component={RouterLink} 
                                        to="/upload"
                                        size="small"
                                        sx={{ 
                                            textTransform: 'none', 
                                            borderRadius: 2, 
                                            fontWeight: 600,
                                            boxShadow: 'none',
                                            display: { xs: 'none', sm: 'flex' } 
                                        }}
                                    >
                                        Carregar
                                    </Button>

                                    {/* User Avatar Menu */}
                                    <Tooltip title={user.username}>
                                        <IconButton onClick={handleUserMenuOpen} size="small" sx={{ ml: 1 }}>
                                            <Avatar sx={{ width: 36, height: 36, bgcolor: 'secondary.main', fontSize: '1rem' }}>
                                                {user.username ? user.username.charAt(0).toUpperCase() : <PersonIcon />}
                                            </Avatar>
                                        </IconButton>
                                    </Tooltip>
                                    <Menu
                                        anchorEl={anchorElUser}
                                        open={Boolean(anchorElUser)}
                                        onClose={handleUserMenuClose}
                                        transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                                        anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                                        slotProps={{ paper: { elevation: 3, sx: { mt: 1.5, minWidth: 200 } } }}
                                    >
                                        <Box sx={{ px: 2, py: 1 }}>
                                            <Typography variant="subtitle2" noWrap>{user.username}</Typography>
                                            <Typography variant="caption" color="text.secondary" noWrap>{user.email}</Typography>
                                        </Box>
                                        <Divider />
                                        {user.is_admin && (
                                            <MenuItem component={RouterLink} to="/admin" onClick={handleUserMenuClose}>
                                                <AdminPanelSettingsIcon sx={{ mr: 1.5, color: 'text.secondary' }} fontSize="small" /> 
                                                Admin Dashboard
                                            </MenuItem>
                                        )}
                                        <MenuItem component={RouterLink} to="/settings" onClick={handleUserMenuClose}>
                                            <SettingsIcon sx={{ mr: 1.5, color: 'text.secondary' }} fontSize="small" /> 
                                            Configurações
                                        </MenuItem>
                                        <Divider />
                                        <MenuItem onClick={handleLogout} sx={{ color: 'error.main' }}>
                                            <LogoutIcon sx={{ mr: 1.5 }} fontSize="small" /> 
                                            Sair
                                        </MenuItem>
                                    </Menu>
                                </Box>
                            </>
                        ) : (
                            // Public View (Not Logged In)
                            <Box sx={{ flexGrow: 1, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
                                <Button component={RouterLink} to="/signin" sx={{ color: 'text.primary', fontWeight: 600 }}>Entrar</Button>
                                <Button component={RouterLink} to="/signup" variant="contained" sx={{ boxShadow: 'none' }}>Criar Conta</Button>
                            </Box>
                        )}
                    </Toolbar>
                </Container>
            </AppBar>

            {/* Main Content Area */}
            <Container 
                component="main" 
                maxWidth="xl" 
                sx={{ 
                    flexGrow: 1, 
                    pt: 12, // Increased padding to account for fixed AppBar
                    pb: 4,
                    minHeight: '80vh'
                }}
            >
                {children}
            </Container>

            {/* Footer */}
            <Box component="footer" sx={{ p: 3, mt: 'auto', backgroundColor: 'background.default', borderTop: (theme) => `1px solid ${theme.palette.divider}`, textAlign: 'center' }}>
                <Typography variant="body2" color="text.secondary">© {new Date().getFullYear()} VisorFinanceiro</Typography>
                <Box sx={{ mt: 1, display: 'flex', justifyContent: 'center', gap: 2 }}>
                    <MuiLink component={RouterLink} to="/policies/privacy-policy" variant="caption" color="text.secondary" underline="hover">Privacidade</MuiLink>
                    <MuiLink component={RouterLink} to="/policies/terms-of-service" variant="caption" color="text.secondary" underline="hover">Termos</MuiLink>
                    <MuiLink component={RouterLink} to="/policies/contact-information" variant="caption" color="text.secondary" underline="hover">Contactos</MuiLink>
                </Box>
            </Box>

            <CookieConsent 
                location="bottom" 
                buttonText="Aceitar" 
                declineButtonText="Rejeitar" 
                enableDeclineButton 
                cookieName="visorfinanceiro-cookie-consent"
                style={{ background: "#222", alignItems: 'center' }}
                buttonStyle={{ color: "#000", fontSize: "14px", background: "#fff", borderRadius: "4px", fontWeight: 'bold' }}
                declineButtonStyle={{ background: "transparent", border: '1px solid #666', color: "#ccc", fontSize: "14px", borderRadius: "4px" }}
            >
                Este site utiliza armazenamento local estritamente necessário para o seu funcionamento.
            </CookieConsent>
        </Box>
    );
}