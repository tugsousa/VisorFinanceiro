import React from 'react';
import { Box, List, ListItem, ListItemIcon, ListItemText, Paper, Typography } from '@mui/material';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import DashboardIcon from '@mui/icons-material/Dashboard';
import PeopleIcon from '@mui/icons-material/People';

const MENU_ITEMS = [
    { text: 'Visão Geral', icon: <DashboardIcon />, path: '/admin/overview' },
    { text: 'Utilizadores', icon: <PeopleIcon />, path: '/admin/users' },
];

const AdminLayout = () => {
    const navigate = useNavigate();
    const location = useLocation();

    return (
        <Box sx={{ display: 'flex', height: 'calc(100vh - 100px)', mt: 2 }}>
            {/* Sidebar Lateral */}
            <Paper elevation={0} sx={{ width: 240, borderRight: 1, borderColor: 'divider', mr: 3, height: '100%' }}>
                <Box sx={{ p: 2 }}>
                    <Typography variant="overline" color="text.secondary" fontWeight="bold">
                        Administração
                    </Typography>
                </Box>
                <List>
                    {MENU_ITEMS.map((item) => (
                        <ListItem 
                            button 
                            key={item.text} 
                            onClick={() => navigate(item.path)}
                            selected={location.pathname.startsWith(item.path)}
                            sx={{ 
                                borderRadius: 1, 
                                mb: 0.5, 
                                mx: 1,
                                width: 'auto',
                                '&.Mui-selected': { bgcolor: 'primary.light', color: 'primary.dark' },
                                '&:hover': { bgcolor: 'action.hover' }
                            }}
                        >
                            <ListItemIcon sx={{ color: location.pathname.startsWith(item.path) ? 'primary.dark' : 'inherit', minWidth: 40 }}>
                                {item.icon}
                            </ListItemIcon>
                            <ListItemText primary={item.text} />
                        </ListItem>
                    ))}
                </List>
            </Paper>

            {/* Área de Conteúdo Principal */}
            <Box sx={{ flexGrow: 1, overflow: 'auto', px: 2 }}>
                <Outlet />
            </Box>
        </Box>
    );
};

export default AdminLayout;