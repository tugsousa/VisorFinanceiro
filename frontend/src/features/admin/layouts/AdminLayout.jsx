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
        // FIX: Removed `height: 'calc(100vh - 100px)'` which was the root cause.
        // That fixed height forced the content area into a scrollable box of fixed size.
        // On pages with little content (AdminUsersPage), the content box ended early,
        // making the sidebar border appear shorter than on content-heavy pages.
        // Now both sidebar and content grow naturally to match the page height.
        <Box sx={{ display: 'flex', alignItems: 'flex-start', mt: 2 }}>
            {/* Sidebar Lateral */}
            <Paper
                elevation={0}
                sx={{
                    width: 180,
                    flexShrink: 0,
                    borderRight: 1,
                    borderColor: 'divider',
                    mr: 3,
                    // Sidebar sticks to the top while scrolling and always fills
                    // at least the visible viewport height so the border never ends abruptly.
                    position: 'sticky',
                    top: 0,
                    minHeight: 'calc(100vh - 80px)',
                }}
            >
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
            {/* FIX: Removed `overflow: 'auto'` — content now scrolls at the page level,
                not trapped inside a fixed-height box. */}
            <Box sx={{ flexGrow: 1, px: 2, minWidth: 0 }}>
                <Outlet />
            </Box>
        </Box>
    );
};

export default AdminLayout;
