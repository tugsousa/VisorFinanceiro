// frontend/src/pages/AdminDashboardPage.js
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchAdminStats, apiFetchAdminUsers, apiRefreshUserMetrics } from '../api/apiService';
import { Box, Typography, Paper, Grid, CircularProgress, Alert, Tooltip, IconButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useAuth } from '../context/AuthContext';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, Tooltip as ChartTooltip, ArcElement } from 'chart.js';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, ChartTooltip, ArcElement);

const KPICard = ({ title, value, loading }) => (
    <Paper sx={{ p: 2, textAlign: 'center', height: '100%' }}>
        <Typography variant="h6" color="text.secondary" sx={{fontSize: '1rem'}}>{title}</Typography>
        <Typography variant="h4" component="p" sx={{ fontWeight: 'bold', mt: 1 }}>
            {loading ? <CircularProgress size={28} /> : (value ?? 'N/A')}
        </Typography>
    </Paper>
);

// --- INÍCIO DOS NOVOS COMPONENTES REUTILIZÁVEIS ---
const ChartCard = ({ type, data, options, title }) => {
    const ChartComponent = type === 'doughnut' ? Doughnut : (type === 'bar' ? Bar : Line);
    const hasData = data && data.datasets.some(ds => ds.data.length > 0 && ds.data.some(d => d > 0));

    return (
        <Paper sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>{title}</Typography>
            <Box sx={{ flexGrow: 1, position: 'relative' }}>
                {hasData ? (
                    <ChartComponent data={data} options={{ ...options, maintainAspectRatio: false }} />
                ) : (
                    <Typography sx={{ textAlign: 'center', pt: '30%', color: 'text.secondary' }}>
                        Sem dados disponíveis.
                    </Typography>
                )}
            </Box>
        </Paper>
    );
};

const TopUsersTable = ({ users, title, valueHeader }) => {
    const columns = [
        { field: 'email', headerName: 'Email', flex: 1, minWidth: 150 },
        { field: 'value', headerName: valueHeader, type: 'number', width: 130, align: 'right', headerAlign: 'right' },
    ];

    const rows = users ? users.map((user, index) => ({ id: index, ...user })) : [];

    return (
        <Paper sx={{ p: 2, height: 400, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>{title}</Typography>
            <Box sx={{ flexGrow: 1 }}>
                <DataGrid
                    rows={rows}
                    columns={columns}
                    density="compact"
                    hideFooter
                />
            </Box>
        </Paper>
    );
};
// --- FIM DOS NOVOS COMPONENTES REUTILIZÁVEIS ---


const AdminDashboardPage = () => {
    const { token } = useAuth();
    const queryClient = useQueryClient();
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
    
    const refreshMutation = useMutation({
        mutationFn: (userId) => {
            setRefreshingUserId(userId);
            return apiRefreshUserMetrics(userId);
        },
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminUsers', token] });
        },
        onError: (error) => {
            console.error("Failed to refresh user metrics:", error);
        },
        onSettled: () => {
            setRefreshingUserId(null);
        }
    });

    // --- LÓGICA DE PREPARAÇÃO DOS DADOS PARA OS GRÁFICOS ---
    const verificationChartData = {
        labels: ['Verificados', 'Não Verificados'],
        datasets: [{
            data: [
                statsData?.verificationStats?.verified || 0,
                statsData?.verificationStats?.unverified || 0
            ],
            backgroundColor: ['rgba(75, 192, 192, 0.7)', 'rgba(255, 99, 132, 0.7)'],
            borderColor: ['rgba(75, 192, 192, 1)', 'rgba(255, 99, 132, 1)'],
            borderWidth: 1,
        }],
    };

    const authProviderChartData = {
        labels: statsData?.authProviderStats?.map(d => d.name) || [],
        datasets: [{
            data: statsData?.authProviderStats?.map(d => d.value) || [],
            backgroundColor: ['rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)'],
            borderColor: ['rgba(153, 102, 255, 1)', 'rgba(255, 159, 64, 1)'],
            borderWidth: 1,
        }],
    };

    const brokerChartData = {
        labels: statsData?.uploadsByBroker?.map(d => d.name) || [],
        datasets: [{
            label: 'Uploads por Corretora',
            data: statsData?.uploadsByBroker?.map(d => d.value) || [],
            backgroundColor: 'rgba(54, 162, 235, 0.7)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1,
        }],
    };
    
    const chartOptions = (title) => ({
        responsive: true,
        plugins: {
            legend: { position: 'top' },
            title: { display: false },
        },
    });

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
                    return params.value || 'N/A';
                }
            }
        },
        { field: 'login_count', headerName: 'Nº de Logins', type: 'number', width: 120 },
        { 
            field: 'last_login_at', 
            headerName: 'Último Login', 
            width: 170, 
            type: 'dateTime', 
            valueGetter: (value) => value ? new Date(value) : null 
        },
        { field: 'last_login_ip', headerName: 'Último IP', width: 130 },
        { field: 'created_at', headerName: 'Data Registo', width: 170, type: 'dateTime', valueGetter: (value) => new Date(value) },
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
            
            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>Registos</Typography>
            <Grid container spacing={3} sx={{ mb: 2 }}>
                <Grid item xs={12} sm={4}><KPICard title="Novos Utilizadores (Hoje)" value={statsData?.newUsersToday} loading={statsLoading} /></Grid>
                <Grid item xs={12} sm={4}><KPICard title="Novos Utilizadores (7 dias)" value={statsData?.newUsersThisWeek} loading={statsLoading} /></Grid>
                <Grid item xs={12} sm={4}><KPICard title="Novos Utilizadores (30 dias)" value={statsData?.newUsersThisMonth} loading={statsLoading} /></Grid>
            </Grid>

            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>Métricas Gerais</Typography>
            <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid item xs={6} sm={4} md={2}><KPICard title="Total Utilizadores" value={statsData?.totalUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="DAU" value={statsData?.dailyActiveUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="MAU" value={statsData?.monthlyActiveUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="Total Uploads" value={statsData?.totalUploads} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="Média Trans./Upload" value={statsData?.avgTransactionsPerUpload?.toFixed(1)} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="Tam. Médio Fich. (MB)" value={statsData?.avgFileSizeMB?.toFixed(2)} loading={statsLoading} /></Grid>
            </Grid>

            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>Análise de Utilizadores</Typography>
            <Grid container spacing={3} sx={{ mb: 2 }}>
                <Grid item xs={12} md={6} lg={4}>
                    <ChartCard type="doughnut" data={verificationChartData} options={chartOptions()} title="Verificação de Email" />
                </Grid>
                <Grid item xs={12} md={6} lg={4}>
                    <ChartCard type="doughnut" data={authProviderChartData} options={chartOptions()} title="Método de Autenticação" />
                </Grid>
                <Grid item xs={12} md={12} lg={4}>
                     <ChartCard type="bar" data={brokerChartData} options={chartOptions()} title="Uploads por Corretora" />
                </Grid>
            </Grid>
            
            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>Atividade da Plataforma</Typography>
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={6}><Paper sx={{ p: 2, height: 350 }}><Line data={{ labels: statsData?.usersPerDay?.map(d => d.date) || [], datasets: [{ data: statsData?.usersPerDay?.map(d => d.count), borderColor: 'rgb(75, 192, 192)', tension: 0.1, fill: true, backgroundColor: 'rgba(75, 192, 192, 0.1)' }] }} options={timeSeriesChartOptions("Novos Utilizadores/Dia")} /></Paper></Grid>
                <Grid item xs={12} md={6}><Paper sx={{ p: 2, height: 350 }}><Bar data={{ labels: statsData?.uploadsPerDay?.map(d => d.date) || [], datasets: [{ data: statsData?.uploadsPerDay?.map(d => d.count), backgroundColor: 'rgba(255, 99, 132, 0.5)' }] }} options={timeSeriesChartOptions("Uploads/Dia")} /></Paper></Grid>
                <Grid item xs={12} md={6}><Paper sx={{ p: 2, height: 350 }}><Bar data={{ labels: statsData?.transactionsPerDay?.map(d => d.date) || [], datasets: [{ data: statsData?.transactionsPerDay?.map(d => d.count), backgroundColor: 'rgba(54, 162, 235, 0.5)' }] }} options={timeSeriesChartOptions("Transações Processadas/Dia")} /></Paper></Grid>
                <Grid item xs={12} md={6}><Paper sx={{ p: 2, height: 350 }}><Line data={{ labels: statsData?.activeUsersPerDay?.map(d => d.date) || [], datasets: [{ data: statsData?.activeUsersPerDay?.map(d => d.count), borderColor: 'rgb(153, 102, 255)', tension: 0.1, fill: true, backgroundColor: 'rgba(153, 102, 255, 0.1)' }] }} options={timeSeriesChartOptions("Utilizadores Ativos/Dia")} /></Paper></Grid>
            </Grid>

            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>Power Users</Typography>
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} lg={6}>
                    <TopUsersTable users={statsData?.TopUsersByUploads} title="Top 10 por Uploads" valueHeader="Total de Uploads" />
                </Grid>
                <Grid item xs={12} lg={6}>
                    <TopUsersTable users={statsData?.TopUsersByLogins} title="Top 10 por Logins" valueHeader="Nº de Logins" />
                </Grid>
            </Grid>

            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>Utilizadores Registados</Typography>
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