import { Box, AppBar, Toolbar, Typography, Drawer, IconButton, Tooltip } from '@mui/material';
import { Link } from 'react-router-dom';
import {
  Upload as UploadIcon,
  Dashboard as DashboardIcon,
  Assessment as HoldingsIcon,
  AttachMoney as DividendsIcon,
  ReceiptLong as TaxIcon, // Changed from CashIcon
  ShowChart as OptionsIcon, // Added icon for Options
  Analytics as StockIcon // Added icon for Stocks
} from '@mui/icons-material';

export default function Layout({ children }) {
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
          <Tooltip title="Upload" placement="right" arrow>
            <IconButton 
              component={Link} 
              to="/" 
              color="inherit"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  color: 'primary.main'
                }
              }}
            >
              <UploadIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Dashboard" placement="right" arrow>
            <IconButton 
              component={Link} 
              to="/dashboard" 
              color="inherit"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  color: 'primary.main'
                }
              }}
            >
              <DashboardIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Holdings" placement="right" arrow>
            <IconButton 
              component={Link} 
              to="/holdings" 
              color="inherit"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  color: 'primary.main'
                }
              }}
            >
              <HoldingsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Stock Sales" placement="right" arrow> {/* Added Stock Sales link */}
            <IconButton
              component={Link}
              to="/stocks"
              color="inherit"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  color: 'primary.main'
                }
              }}
            >
              <StockIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Options" placement="right" arrow> {/* Added Options link */}
            <IconButton
              component={Link}
              to="/options"
              color="inherit"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  color: 'primary.main'
                }
              }}
            >
              <OptionsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Dividends" placement="right" arrow>
            <IconButton
              component={Link}
              to="/dividends" 
              color="inherit"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  color: 'primary.main'
                }
              }}
            >
              <DividendsIcon />
            </IconButton>
          </Tooltip>
          <Tooltip title="Tax" placement="right" arrow> {/* Changed title */}
            <IconButton 
              component={Link} 
              to="/tax"
              color="inherit"
              sx={{
                color: 'text.secondary',
                '&:hover': {
                  backgroundColor: 'rgba(25, 118, 210, 0.08)',
                  color: 'primary.main'
                }
              }}
            >
              <TaxIcon /> {/* Changed icon */}
            </IconButton>
          </Tooltip>
        </Box>
      </Drawer>

      {/* Main content */}
      <Box component="main" sx={{ flexGrow: 1 }}>
        <AppBar 
          position="fixed" 
          sx={{ 
            zIndex: (theme) => theme.zIndex.drawer + 1,
            backgroundColor: 'primary.main', // Changed back to blue
            color: 'white', // Changed text color to white
          }}
        >
          <Toolbar>
            <Typography variant="h6" component="div" sx={{ flexGrow: 1 }}>
              TAXFOLIO
            </Typography>
            {/* Removed the Upload and Dashboard buttons */}
          </Toolbar>
        </AppBar>
        <Box sx={{ p: 3, mt: 8 }}> {/* Added margin top to account for AppBar */}
          {children}
        </Box>
      </Box>
    </Box>
  );
}
