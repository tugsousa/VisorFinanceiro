// frontend/src/pages/AdminDashboardPage.js
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
// MODIFICATION: Import IconButton and RefreshIcon
import { apiFetchAdminStats, apiFetchAdminUsers, apiRefreshUserMetrics } from '../api/apiService';
import { Box, Typography, Paper, Grid, CircularProgress, Alert, Tooltip, IconButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useAuth } from '../context/AuthContext';
import { Bar, Line } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, Tooltip as ChartTooltip } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, ChartTooltip);

const KPICard = ({ title, value, loading }) => (
    <Paper sx={{ p: 2, textAlign: 'center', height: '100%' }}>
        <Typography variant="h6" color="text.secondary">{title}</Typography>
        <Typography variant="h4" component="p" sx={{ fontWeight: 'bold', mt: 1 }}>
            {loading ? <CircularProgress size={28} /> : (value ?? 'N/A')}
        </Typography>
    </Paper>
);

const timeSeriesChartOptions = (title) => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
        legend: { display: false },
        title: { display: true, text: title, font: { size: 16 } },
    },
    scales: {
        x: { grid: { display: false } },
        y: { beginAtZero: true },
    },
});

const AdminDashboardPage = () => {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    // NEW: State to track which user is being refreshed
    const [refreshingUserId, setRefreshingUserId] = useState(null);

    const { data: statsData, isLoading: statsLoading, isError: statsIsError, error: statsError } = useQuery({
        queryKey: ['adminStats', token],
        queryFn: () => apiFetchAdminStats().then(res => res.data),
        enabled: !!token,
    });

    const { data: usersData, isLoading: usersLoading, isError: usersIsError, error: usersError } = useQuery({
        queryKey: ['adminUsers', token],
        queryFn: () => apiFetchAdminUsers().then(res => res.data),
        enabled: !!token,
    });
    
    // NEW: Mutation for refreshing user metrics
    const refreshMutation = useMutation({
        mutationFn: (userId) => {
            setRefreshingUserId(userId);
            return apiRefreshUserMetrics(userId);
        },
        onSuccess: () => {
            // Invalidate the users query to refetch the updated data for the table
            queryClient.invalidateQueries(['adminUsers', token]);
        },
        onError: (error) => {
            console.error("Failed to refresh user metrics:", error);
            // Optionally, show a toast notification for the error
        },
        onSettled: () => {
            // Whether success or error, stop showing the loading spinner
            setRefreshingUserId(null);
        }
    });

    const userColumns = [
        { field: 'id', headerName: 'ID', width: 70 },
        { field: 'email', headerName: 'Email', width: 220 },
        { field: 'auth_provider', headerName: 'Sign-in', width: 100 },
        { field: 'total_upload_count', headerName: 'Uploads (Total)', type: 'number', width: 120 },
        { field: 'upload_count', headerName: 'Ficheiros (Atuais)', type: 'number', width: 120 },
        { field: 'distinct_broker_count', headerName: 'Corretoras', type: 'number', width: 100 },
        { field: 'portfolio_value_eur', headerName: 'Valor Carteira (€)', type: 'number', width: 150, valueFormatter: (value) => value ? value.toFixed(2) : '0.00' },
        { 
            field: 'top_5_holdings', 
            headerName: 'Top 5 Posições', 
            width: 250,
            sortable: false,
            renderCell: (params) => {
                try {
                    const holdings = JSON.parse(params.value);
                    if (!Array.isArray(holdings) || holdings.length === 0) return 'N/A';
                    return (
                        <Tooltip title={holdings.map(h => `${h.name}: €${h.value.toFixed(2)}`).join('\n')}>
                            <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {holdings.map(h => h.name).join(', ')}
                            </Box>
                        </Tooltip>
                    );
                } catch {
                    return 'N/A';
                }
            }
        },
        { field: 'login_count', headerName: 'Nº de Logins', type: 'number', width: 120 },
        { 
            field: 'last_login_at', 
            headerName: 'Último Login', 
            width: 170, 
            type: 'dateTime', 
            // FIX: Correctly parse the date string from the API
            valueGetter: (value) => value ? new Date(value) : null 
        },
        { field: 'last_login_ip', headerName: 'Último IP', width: 130 },
        { field: 'created_at', headerName: 'Data Registo', width: 170, type: 'dateTime', valueGetter: (value) => new Date(value) },
        // NEW: Actions column with refresh button
        {
            field: 'actions',
            headerName: 'Ações',
            width: 80,
            sortable: false,
            disableColumnMenu: true,
            renderCell: (params) => {
                const isRefreshing = refreshingUserId === params.id;
                return (
                    <Tooltip title="Atualizar valor da carteira">
                        <IconButton
                            onClick={() => refreshMutation.mutate(params.id)}
                            disabled={isRefreshing}
                            size="small"
                        >
                            {isRefreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
                        </IconButton>
                    </Tooltip>
                );
            }
        }
    ];

    if (statsIsError || usersIsError) {
        return <Alert severity="error">Erro ao carregar dados: {statsError?.message || usersError?.message}</Alert>;
    }
    
    return (
        <Box sx={{ p: 3 }}>
            <Typography variant="h4" component="h1" gutterBottom>Dashboard de Administrador</Typography>
            
            {/* --- NEW: KPI section for new users --- */}
            <Typography variant="h5" component="h2" gutterBottom>Registos</Typography>
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} sm={4}><KPICard title="Novos Utilizadores (Hoje)" value={statsData?.newUsersToday} loading={statsLoading} /></Grid>
                <Grid item xs={12} sm={4}><KPICard title="Novos Utilizadores (7 dias)" value={statsData?.newUsersThisWeek} loading={statsLoading} /></Grid>
                <Grid item xs={12} sm={4}><KPICard title="Novos Utilizadores (30 dias)" value={statsData?.newUsersThisMonth} loading={statsLoading} /></Grid>
            </Grid>

            <Typography variant="h5" component="h2" gutterBottom>Métricas Gerais</Typography>
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={6} sm={4} md={2.4}><KPICard title="Total de Utilizadores" value={statsData?.totalUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2.4}><KPICard title="DAU" value={statsData?.dailyActiveUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2.4}><KPICard title="MAU" value={statsData?.monthlyActiveUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2.4}><KPICard title="Total de Uploads" value={statsData?.totalUploads} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2.4}><KPICard title="Total de Transações" value={statsData?.totalTransactions} loading={statsLoading} /></Grid>
            </Grid>
            
            {/* --- MODIFICATION: Improved grid layout for charts --- */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, height: 350 }}><Line data={{ labels: statsData?.usersPerDay?.map(d => d.date) || [], datasets: [{ data: statsData?.usersPerDay?.map(d => d.count), borderColor: 'rgb(75, 192, 192)', tension: 0.1 }] }} options={timeSeriesChartOptions("Novos Utilizadores/Dia")} /></Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, height: 350 }}><Bar data={{ labels: statsData?.uploadsPerDay?.map(d => d.date) || [], datasets: [{ data: statsData?.uploadsPerDay?.map(d => d.count), backgroundColor: 'rgba(255, 99, 132, 0.5)' }] }} options={timeSeriesChartOptions("Uploads/Dia")} /></Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, height: 350 }}><Bar data={{ labels: statsData?.transactionsPerDay?.map(d => d.date) || [], datasets: [{ data: statsData?.transactionsPerDay?.map(d => d.count), backgroundColor: 'rgba(54, 162, 235, 0.5)' }] }} options={timeSeriesChartOptions("Transações Processadas/Dia")} /></Paper>
                </Grid>
                 <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, height: 350 }}><Line data={{ labels: statsData?.activeUsersPerDay?.map(d => d.date) || [], datasets: [{ data: statsData?.activeUsersPerDay?.map(d => d.count), borderColor: 'rgb(153, 102, 255)', tension: 0.1 }] }} options={timeSeriesChartOptions("Utilizadores Ativos/Dia")} /></Paper>
                </Grid>
            </Grid>

            <Typography variant="h5" component="h2" gutterBottom>Utilizadores Registados</Typography>
            <Paper sx={{ height: 600, width: '100%' }}>
                <DataGrid
                    rows={usersData || []}
                    columns={userColumns}
                    loading={usersLoading}
                    slots={{ toolbar: GridToolbar }}
                    density="compact"
                />
            </Paper>
        </Box>
    );
};

export default AdminDashboardPage;