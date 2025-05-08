import React, { useState } from 'react'; // Import useState
import { Box, AppBar, Toolbar, Typography, Drawer, IconButton, Tooltip, Avatar, Menu, MenuItem } from '@mui/material'; // Added Menu, MenuItem
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Upload as UploadIcon,
  Assessment as HoldingsIcon,
  AttachMoney as DividendsIcon,
  ReceiptLong as TaxIcon,
  ShowChart as OptionsIcon,
  Analytics as StockIcon,
  Person as PersonIcon
} from '@mui/icons-material';

export default function Layout({ children }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  // State for the user menu
  const [anchorEl, setAnchorEl] = useState(null);
  const openMenu = Boolean(anchorEl);

  const handleMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = () => {
    logout(); // This comes from AuthContext, clears local state
    handleMenuClose(); // Close the menu
    navigate('/signin'); // Redirect to sign-in page
  };

  // Sidebar items definition for easier mapping
  const sidebarItems = [
    { title: "Upload", to: "/", icon: <UploadIcon /> },
    { title: "Holdings", to: "/holdings", icon: <HoldingsIcon /> },
    { title: "Stock Sales", to: "/stocks", icon: <StockIcon /> },
    { title: "Options", to: "/options", icon: <OptionsIcon /> },
    { title: "Dividends", to: "/dividends", icon: <DividendsIcon /> },
    { title: "Tax", to: "/tax", icon: <TaxIcon /> },
  ];

  return (
    <Box sx={{ display: 'flex' }}>
      {/* White Sidebar */}
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
        <Toolbar /> {/* This pushes the icons below the AppBar */}
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

      {/* Main content */}
      <Box component="main" sx={{ flexGrow: 1 }}>
        <AppBar
          position="fixed"
          sx={{
            zIndex: (theme) => theme.zIndex.drawer + 1,
            backgroundColor: 'primary.main',
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
                    sx={{ ml: 2, p: 0 }} // Added p:0 to make avatar fill IconButton better
                    aria-controls={openMenu ? 'account-menu' : undefined}
                    aria-haspopup="true"
                    aria-expanded={openMenu ? 'true' : undefined}
                  >
                    <Avatar
                      sx={{
                        width: 32,
                        height: 32,
                        bgcolor: 'secondary.main', // You can customize this
                      }}
                    >
                      {/* Display first letter of username or a generic icon */}
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
                      '& .MuiAvatar-root': { // Style for avatar if you add one in menu items
                        width: 32,
                        height: 32,
                        ml: -0.5,
                        mr: 1,
                      },
                      '&::before': { // Arrow pointing to the anchor
                        content: '""',
                        display: 'block',
                        position: 'absolute',
                        top: 0,
                        right: 14,
                        width: 10,
                        height: 10,
                        bgcolor: 'background.paper',
                        transform: 'translateY(-50%) rotate(45deg)',
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
                  {/* Add other menu items here if needed, e.g., Profile page */}
                  <MenuItem onClick={handleLogout}>
                    Logout
                  </MenuItem>
                </Menu>
              </Box>
            ) : (
              <Typography
                variant="body1"
                component={Link}
                to="/signin"
                sx={{
                  color: 'white',
                  textDecoration: 'none',
                  '&:hover': {
                    textDecoration: 'underline'
                  }
                }}
              >
                Sign in
              </Typography>
            )}
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 3, mt: 8 }}> {/* Added margin top to account for AppBar */}
          {children}
        </Box>
      </Box>
    </Box>
  );
}