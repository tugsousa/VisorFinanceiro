// frontend/src/pages/AdminDashboardPage.js

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchAdminStats, apiFetchAdminUsers, apiRefreshUserMetrics, apiRefreshMultipleUserMetrics } from '../api/apiService';
import { Box, Typography, Paper, Grid, CircularProgress, Alert, Tooltip, IconButton, FormControl, InputLabel, Select, MenuItem, Button, Divider } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useAuth } from '../context/AuthContext';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, Tooltip as ChartTooltip, ArcElement } from 'chart.js';
import { useNavigate } from 'react-router-dom';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, ChartTooltip, ArcElement);

// Helper to format currency consistently
const formatCurrency = (value) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value || 0);

const KPICard = ({ title, value, loading }) => (
    <Paper sx={{ p: 2, textAlign: 'center', height: '100%' }}>
        <Typography variant="h6" color="text.secondary" sx={{fontSize: '1rem'}}>{title}</Typography>
        <Typography variant="h4" component="p" sx={{ fontWeight: 'bold', mt: 1 }}>
            {loading ? <CircularProgress size={28} /> : (value ?? 'N/A')}
        </Typography>
    </Paper>
);

const ChartCard = ({ type, data, options, title }) => {
    const ChartComponent = type === 'doughnut' ? Doughnut : (type === 'bar' ? Bar : Line);
    const hasData = data && data.datasets.some(ds => ds && ds.data && ds.data.length > 0 && ds.data.some(d => d > 0));

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
            <Box sx={{ flexGrow: 1 }}><DataGrid rows={rows} columns={columns} density="compact" hideFooter /></Box>
        </Paper>
    );
};

const AdminDashboardPage = () => {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();

    const [dateRange, setDateRange] = useState('all_time');
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [refreshingUserId, setRefreshingUserId] = useState(null);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [sortModel, setSortModel] = useState([{ field: 'created_at', sort: 'desc' }]);

    const { data: statsData, isLoading: statsLoading, isError: statsIsError, error: statsError } = useQuery({
        queryKey: ['adminStats', token, dateRange],
        queryFn: () => apiFetchAdminStats(dateRange).then(res => res.data),
        enabled: !!token,
    });

    const { data: usersData, isLoading: usersLoading, isError: usersIsError, error: usersError } = useQuery({
        queryKey: ['adminUsers', token, paginationModel, sortModel],
        queryFn: () => {
            const params = {
                page: paginationModel.page + 1,
                pageSize: paginationModel.pageSize,
                sortBy: sortModel[0]?.field || 'created_at',
                order: sortModel[0]?.sort || 'desc',
            };
            return apiFetchAdminUsers(params).then(res => res.data);
        },
        enabled: !!token,
        placeholderData: (previousData) => previousData,
    });
    
    const refreshMutation = useMutation({
        mutationFn: (userId) => {
            setRefreshingUserId(userId);
            return apiRefreshUserMetrics(userId);
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adminUsers'] }); },
        onError: (error) => { console.error("Failed to refresh user metrics:", error); },
        onSettled: () => { setRefreshingUserId(null); }
    });

    const batchRefreshMutation = useMutation({
        mutationFn: (userIds) => apiRefreshMultipleUserMetrics(userIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
            setSelectedUserIds([]);
        },
        onError: (error) => { console.error("Failed to refresh metrics in batch:", error); },
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
            field: 'top_5_holdings', headerName: 'Top 5 Posições', width: 250, sortable: false,
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
                } catch { return params.value || 'N/A'; }
            }
        },
        { field: 'login_count', headerName: 'Nº de Logins', type: 'number', width: 120 },
        { field: 'last_login_at', headerName: 'Último Login', width: 170, type: 'dateTime', valueGetter: (value) => value ? new Date(value.Time) : null },
        { field: 'created_at', headerName: 'Data Registo', width: 170, type: 'dateTime', valueGetter: (value) => new Date(value) },
        {
            field: 'actions', headerName: 'Ações', width: 80, sortable: false, disableColumnMenu: true,
            renderCell: (params) => {
                const isRefreshing = refreshingUserId === params.id;
                return (
                    <Tooltip title="Atualizar valor da carteira">
                        <IconButton onClick={(e) => { e.stopPropagation(); refreshMutation.mutate(params.id); }} disabled={isRefreshing} size="small">
                            {isRefreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
                        </IconButton>
                    </Tooltip>
                );
            }
        }
    ];

    // Chart Data Preparation
    const timeSeriesChartData = (dataKey, label) => ({
        labels: statsData?.[dataKey]?.map(d => d.date) || [],
        datasets: [{ 
            label, 
            data: statsData?.[dataKey]?.map(d => d.count) || [], 
            tension: 0.1, 
            borderColor: 'rgb(75, 192, 192)', 
            backgroundColor: 'rgba(75, 192, 192, 0.2)', 
            fill: true 
        }],
    });

    const verificationChartData = {
        labels: ['Verificados', 'Não Verificados'],
        datasets: [{
            data: [statsData?.verificationStats?.verified || 0, statsData?.verificationStats?.unverified || 0],
            backgroundColor: ['rgba(75, 192, 192, 0.7)', 'rgba(255, 99, 132, 0.7)'],
        }],
    };
    
    const authProviderChartData = {
        labels: statsData?.authProviderStats?.map(d => d.name) || [],
        datasets: [{
            data: statsData?.authProviderStats?.map(d => d.value) || [],
            backgroundColor: ['rgba(54, 162, 235, 0.7)', 'rgba(255, 206, 86, 0.7)'],
        }],
    };

    const valueByBrokerChartData = {
        labels: statsData?.valueByBroker?.map(d => d.name) || [],
        datasets: [{
            data: statsData?.valueByBroker?.map(d => d.value) || [],
            backgroundColor: [
                'rgba(255, 99, 132, 0.7)', 'rgba(54, 162, 235, 0.7)',
                'rgba(255, 206, 86, 0.7)', 'rgba(75, 192, 192, 0.7)',
                'rgba(153, 102, 255, 0.7)',
            ],
        }],
    };

    const topStocksByValueChartData = {
        labels: statsData?.topStocksByValue?.map(d => d.productName || d.isin) || [],
        datasets: [{
            label: 'Total Investido (€)',
            data: statsData?.topStocksByValue?.map(d => d.value) || [],
            backgroundColor: 'rgba(75, 192, 192, 0.7)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1,
        }],
    };
    
    const topStocksByTradesChartData = {
        labels: statsData?.topStocksByTrades?.map(d => d.productName || d.isin) || [],
        datasets: [{
            label: 'Nº de Transações',
            data: statsData?.topStocksByTrades?.map(d => d.value) || [],
            backgroundColor: 'rgba(255, 159, 64, 0.7)',
            borderColor: 'rgba(255, 159, 64, 1)',
            borderWidth: 1,
        }],
    };

    // Chart Options
    const chartOptions = { responsive: true, plugins: { legend: { position: 'top' }, title: { display: false } } };
    const timeSeriesChartOptions = (title) => ({
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 16 } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
    });
    const horizontalBarOptions = (title, tooltipLabel) => ({
        indexAxis: 'y',
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: title, font: { size: 16 } },
            tooltip: {
                callbacks: {
                    label: (context) => `${tooltipLabel}: ${tooltipLabel.includes('€') ? formatCurrency(context.raw) : context.raw}`
                }
            }
        },
        scales: { x: { beginAtZero: true } },
    });

    if (statsIsError || usersIsError) {
        return <Alert severity="error">Erro ao carregar dados: {statsError?.message || usersError?.message}</Alert>;
    }
    
    const periodTitle = dateRange.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" component="h1">Dashboard de Administrador</Typography>
                <FormControl size="small" sx={{ minWidth: 180 }}>
                    <InputLabel>Intervalo de Datas</InputLabel>
                    <Select value={dateRange} label="Intervalo de Datas" onChange={(e) => setDateRange(e.target.value)}>
                        <MenuItem value="all_time">Desde Sempre</MenuItem>
                        <MenuItem value="last_7_days">Últimos 7 dias</MenuItem>
                        <MenuItem value="last_30_days">Últimos 30 dias</MenuItem>
                        <MenuItem value="this_month">Este Mês</MenuItem>
                        <MenuItem value="this_year">Este Ano</MenuItem>
                    </Select>
                </FormControl>
            </Box>
            
            {/* Section for Period-Specific Data */}
            <Box component={Paper} variant="outlined" sx={{ p: 2, mt: 4, borderColor: 'primary.main' }}>
                <Typography variant="h5" component="h2" gutterBottom>Métricas do Período: {periodTitle}</Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    {/* Alterado de md={3} para md={4} para criar uma grelha de 3 colunas */}
                    <Grid item xs={6} sm={4} md={4}><KPICard title="Novos Utilizadores" value={statsData?.newUsersInPeriod} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={4}><KPICard title="Utilizadores Ativos" value={statsData?.activeUsersInPeriod} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={4}><KPICard title="Uploads" value={statsData?.uploadsInPeriod} loading={statsLoading} /></Grid>
                    {/* --- INÍCIO DOS NOVOS CARDS --- */}
                    <Grid item xs={6} sm={4} md={4}><KPICard title="Nº Depósitos" value={statsData?.cashDepositsInPeriod} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={4}><KPICard title="Total Depositado" value={formatCurrency(statsData?.totalCashDepositedEURInPeriod)} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={4}><KPICard title="Dividendos Recebidos" value={formatCurrency(statsData?.totalDividendsReceivedEURInPeriod)} loading={statsLoading} /></Grid>
                    {/* --- FIM DOS NOVOS CARDS --- */}
                </Grid>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6}><ChartCard type="line" data={timeSeriesChartData('activeUsersPerDay', 'Utilizadores Ativos')} options={timeSeriesChartOptions('Utilizadores Ativos por Dia')} title="" /></Grid>
                    <Grid item xs={12} md={6}><ChartCard type="line" data={timeSeriesChartData('usersPerDay', 'Novos Utilizadores')} options={timeSeriesChartOptions('Novos Utilizadores por Dia')} title="" /></Grid>
                    <Grid item xs={12} md={6}><ChartCard type="bar" data={topStocksByValueChartData} options={horizontalBarOptions('Top 10 Ações por Valor Investido', 'Valor (€)')} title="" /></Grid>
                    <Grid item xs={12} md={6}><ChartCard type="bar" data={topStocksByTradesChartData} options={horizontalBarOptions('Top 10 Ações por Nº de Transações', 'Nº Transações')} title="" /></Grid>
                    <Grid item xs={12} md={6}><ChartCard type="doughnut" data={valueByBrokerChartData} options={chartOptions} title="Valor Transacionado por Corretora" /></Grid>
                    <Grid item xs={12} md={6}><ChartCard type="doughnut" data={{ labels: statsData?.investmentDistributionByCountry?.map(d => d.name.split(' - ')[1] || d.name) || [], datasets: [{ data: statsData?.investmentDistributionByCountry?.map(d => d.value) || [], backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#4D5360'] }]}} options={chartOptions} title="Distribuição de Investimentos por País"/></Grid>
                </Grid>
            </Box>

            {/* Section for All-Time Data */}
            <Box component={Paper} variant="outlined" sx={{ p: 2, mt: 4 }}>
                <Typography variant="h5" component="h2" gutterBottom>Métricas Gerais (Sempre)</Typography>
                <Grid container spacing={2} sx={{ mb: 2 }}>
                    <Grid item xs={6} sm={4} md={2}><KPICard title="Valor Total Carteiras" value={formatCurrency(statsData?.totalPortfolioValue)} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><KPICard title="Total Utilizadores" value={statsData?.totalUsers} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><KPICard title="Total Uploads" value={statsData?.totalUploads} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><KPICard title="DAU (Hoje)" value={statsData?.dailyActiveUsers} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><KPICard title="Novos Hoje" value={statsData?.newUsersToday} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><KPICard title="Novos 7 Dias" value={statsData?.newUsersThisWeek} loading={statsLoading} /></Grid>
                </Grid>
                <Grid container spacing={3}>
                    <Grid item xs={12} md={6} lg={3}><ChartCard type="doughnut" data={verificationChartData} options={chartOptions} title="Verificação de Email" /></Grid>
                    <Grid item xs={12} md={6} lg={3}><ChartCard type="doughnut" data={authProviderChartData} options={chartOptions} title="Método de Autenticação" /></Grid>
                    <Grid item xs={12} lg={6}><TopUsersTable users={statsData?.topUsersByLogins} title="Top Utilizadores por Nº de Logins" valueHeader="Logins" /></Grid>
                    <Grid item xs={12} lg={6}><TopUsersTable users={statsData?.topUsersByUploads} title="Top Utilizadores por Nº de Uploads" valueHeader="Uploads" /></Grid>
                </Grid>
            </Box>

            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 4, mb: 2 }}>
                <Typography variant="h5" component="h2">Utilizadores Registados</Typography>
                {selectedUserIds.length > 0 && (
                    <Button
                        variant="contained"
                        size="small"
                        startIcon={batchRefreshMutation.isPending ? <CircularProgress size={16} color="inherit" /> : <RefreshIcon />}
                        onClick={() => batchRefreshMutation.mutate(selectedUserIds)}
                        disabled={batchRefreshMutation.isPending}
                    >
                        Atualizar Métricas ({selectedUserIds.length})
                    </Button>
                )}
            </Box>
            <Paper sx={{ height: 600, width: '100%' }}>
                <DataGrid
                    rows={usersData?.users || []}
                    columns={userColumns}
                    rowCount={usersData?.totalRows || 0}
                    loading={usersLoading}
                    pageSizeOptions={[10, 25, 50, 100]}
                    paginationModel={paginationModel}
                    onPaginationModelChange={setPaginationModel}
                    paginationMode="server"
                    sortModel={sortModel}
                    onSortModelChange={setSortModel}
                    sortingMode="server"
                    slots={{ toolbar: GridToolbar }}
                    density="compact"
                    checkboxSelection
                    onRowSelectionModelChange={(newSelectionModel) => setSelectedUserIds(newSelectionModel)}
                    rowSelectionModel={selectedUserIds}
                    onRowClick={(params) => navigate(`/admin/users/${params.id}`)}
                    sx={{ '& .MuiDataGrid-row:hover': { cursor: 'pointer' } }}
                />
            </Paper>
        </Box>
    );
};

export default AdminDashboardPage;