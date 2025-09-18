// frontend/src/pages/AdminDashboardPage.js
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetchAdminStats } from '../api/apiService';
import { Box, Typography, Paper, Grid, CircularProgress, Alert, Table, TableBody, TableCell, TableContainer, TableHead, TableRow } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const AdminDashboardPage = () => {
    const { token } = useAuth();
    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['adminStats', token],
        queryFn: apiFetchAdminStats,
        enabled: !!token,
    });

    if (isLoading) {
        return (
            <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
                <CircularProgress />
            </Box>
        );
    }

    if (isError) {
        return <Alert severity="error">Erro ao carregar dados de administrador: {error.response?.data?.error || error.message}</Alert>;
    }

    // A resposta do axios fica em `data.data`
    const stats = data?.data;

    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Dashboard de Administrador
            </Typography>
            
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={6} md={4}>
                    <Paper sx={{ p: 2, textAlign: 'center' }}>
                        <Typography variant="h6">Total de Utilizadores</Typography>
                        <Typography variant="h4" component="p" sx={{ fontWeight: 'bold' }}>
                            {stats?.totalUsers ?? '...'}
                        </Typography>
                    </Paper>
                </Grid>
            </Grid>

            <Typography variant="h5" component="h2" gutterBottom>
                Utilizadores Recentes
            </Typography>
            <TableContainer component={Paper}>
                <Table>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontWeight: 'bold' }}>ID</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Username</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Email</TableCell>
                            <TableCell sx={{ fontWeight: 'bold' }}>Data de Registo</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {stats?.recentUsers?.map((user) => (
                            <TableRow key={user.id} hover>
                                {/* --- CORREÇÃO AQUI --- */}
                                <TableCell>{user.id}</TableCell>
                                <TableCell>{user.username}</TableCell>
                                <TableCell>{user.email}</TableCell>
                                <TableCell>{new Date(user.createdAt).toLocaleDateString('pt-PT')}</TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Box>
    );
};

export default AdminDashboardPage;