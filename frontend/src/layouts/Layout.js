// frontend/src/layouts/Layout.js
import React, { useState } from 'react';
import { Box, AppBar, Toolbar, Typography, Drawer, IconButton, Tooltip, Avatar, Menu, MenuItem } from '@mui/material';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Upload as UploadIcon,
  Dashboard as DashboardIcon,
  ReceiptLong as TaxIcon, // Kept Tax as an example, remove if not needed
  Person as PersonIcon
} from '@mui/icons-material';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = Boolean(anchorEl);

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout();
    handleMenuClose();
    navigate('/signin');
  };

  const sidebarItems = [
    { title: "Dashboard", to: "/dashboard", icon: <DashboardIcon /> },
    { title: "Upload", to: "/", icon: <UploadIcon /> },
    { title: "Tax Report", to: "/tax", icon: <TaxIcon /> }, // Example: Keeping Tax separate
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      <Drawer
        variant="permanent"
        sx={{
          width: 64,
          flexShrink: 0,
          '& .MuiDrawer-paper': {
            width: 64,
            boxSizing: 'border-box',
            backgroundColor: 'white',
            borderRight: '1px solid rgba(0, 0, 0, 0.12)',
          },
        }}
      >
        <Toolbar />
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1, pt: 2 }}>
          {sidebarItems.map((item) => (
            <Tooltip title={item.title} placement="right" arrow key={item.title}>
              <IconButton
                component={Link}
                to={item.to}
                color="inherit"
                sx={{
                  color: 'text.secondary',
                  '&:hover': {
                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                    color: 'primary.main'
                  }
                }}
              >
                {item.icon}
              </IconButton>
            </Tooltip>
          ))}
        </Box>
      </Drawer>

      <Box component="main" sx={{ flexGrow: 1 }}>
        <AppBar
          position="fixed"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            backgroundColor: 'primary.main', // Or your theme's primary color
            color: 'white',
          }}
        >
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              TAXFOLIO
            </Typography>
            {user ? (
              <Box sx={{ display: 'flex', alignItems: 'center' }}>
                <Tooltip title={user.username || "User Account"} placement="bottom">
                  <IconButton
                    onClick={handleMenuClick}
                    size="small"
                    sx={{ ml: 2, p: 0 }}
                    aria-controls={openMenu ? 'account-menu' : undefined}
                    aria-haspopup="true"
                    aria-expanded={openMenu ? 'true' : undefined}
                  >
                    <Avatar sx={{ width: 32, height: 32, bgcolor: 'secondary.main' }}>
                      {user.username ? user.username.charAt(0).toUpperCase() : <PersonIcon fontSize="small" />}
                    </Avatar>
                  </IconButton>
                </Tooltip>
                <Menu
                  anchorEl={anchorEl}
                  id="account-menu"
                  open={openMenu}
                  onClose={handleMenuClose}
                  onClick={handleMenuClose}
                  PaperProps={{
                    elevation: 0,
                    sx: {
                      overflow: 'visible',
                      filter: 'drop-shadow(0px 2px 8px rgba(0,0,0,0.32))',
                      mt: 1.5,
                      '& .MuiAvatar-root': { width: 32, height: 32, ml: -0.5, mr: 1 },
                      '&::before': {
                        content: '""', display: 'block', position: 'absolute',
                        top: 0, right: 14, width: 10, height: 10,
                        bgcolor: 'background.paper', transform: 'translateY(-50%) rotate(45deg)',
                        zIndex: 0,
                      },
                    },
                  }}
                  transformOrigin={{ horizontal: 'right', vertical: 'top' }}
                  anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
                >
                  <MenuItem disabled sx={{ fontWeight: 'bold' }}>
                    {user.username}
                  </MenuItem>
                  <MenuItem onClick={handleLogout}>
                    Logout
                  </MenuItem>
                </Menu>
              </Box>
            ) : (
              <Typography
                variant="body1" component={Link} to="/signin"
                sx={{ color: 'white', textDecoration: 'none', '&:hover': { textDecoration: 'underline' }}}
              >
                Sign in
              </Typography>
            )}
          </Toolbar>
        </AppBar>
        <Box sx={{ p: { xs: 1, sm: 2, md: 3 }, mt: { xs: 7, sm: 8 } }}> {/* Responsive margin top and padding */}
          {children}
        </Box>
      </Box>
    </Box>
  );
}