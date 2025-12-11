// frontend/src/pages/AdminDashboardPage.js

import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchAdminStats, apiFetchAdminUsers, apiRefreshUserMetrics, apiRefreshMultipleUserMetrics, apiClearAdminStatsCache } from '../../../lib/api';
import { 
    Box, Typography, Paper, Grid, CircularProgress, Alert, 
    Tooltip, IconButton, FormControl, InputLabel, Select, MenuItem, 
    Button, Divider, useTheme
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useAuth } from '../../auth/AuthContext';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, Tooltip as ChartTooltip, ArcElement } from 'chart.js';
import { useNavigate } from 'react-router-dom';
import logger from '../../../lib/utils/logger';
import StatCard from '../components/StatCard';

ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, ChartTooltip, ArcElement);

const formatCurrency = (value) => new Intl.NumberFormat('pt-PT', { style: 'currency', currency: 'EUR' }).format(value || 0);

// Componente para renderizar gráficos
const ChartCard = ({ type, data, options, title }) => {
    const ChartComponent = type === 'doughnut' ? Doughnut : (type === 'bar' ? Bar : Line);
    const hasData = data && data.datasets.some(ds => ds && ds.data && ds.data.length > 0 && ds.data.some(d => d > 0 || d < 0));

    const finalOptions = {
        ...options,
        maintainAspectRatio: false,
        plugins: {
            ...options?.plugins,
            title: {
                ...options?.plugins?.title,
                display: true,
                text: title,
                font: { size: 16 }
            }
        }
    };

    return (
        <Paper variant="outlined" sx={{ p: 2, height: 350, display: 'flex', flexDirection: 'column' }}>
            <Box sx={{ flexGrow: 1, position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {hasData ? (
                    <ChartComponent data={data} options={finalOptions} />
                ) : (
                    <Typography sx={{ color: 'text.secondary' }}>
                        Sem dados disponíveis.
                    </Typography>
                )}
            </Box>
        </Paper>
    );
};

// Componente para renderizar tabelas de top utilizadores
const TopUsersTable = ({ users, title, valueHeader }) => {
    const columns = [
        { field: 'email', headerName: 'Email', flex: 1, minWidth: 150, renderCell: (params) => (<Tooltip title={params.value}><Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{params.value}</Typography></Tooltip>) },
        { field: 'value', headerName: valueHeader, type: 'number', width: 130, align: 'right', headerAlign: 'right' },
    ];
    const rows = users ? users.map((user, index) => ({ id: index, ...user })) : [];
    return (
        <Paper variant="outlined" sx={{ p: 2, height: 400, display: 'flex', flexDirection: 'column' }}>
            <Typography variant="h6" sx={{ mb: 2, textAlign: 'center' }}>{title}</Typography>
            <Box sx={{ flexGrow: 1 }}><DataGrid rows={rows} columns={columns} density="compact" hideFooter /></Box>
        </Paper>
    );
};

const AdminDashboardPage = () => {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const theme = useTheme(); // <-- Usar useTheme para aceder às cores do tema

    const [dateRange, setDateRange] = useState('all_time');
    const [selectedUserIds, setSelectedUserIds] = useState([]);
    const [refreshingUserId, setRefreshingUserId] = useState(null);
    const [paginationModel, setPaginationModel] = useState({ page: 0, pageSize: 25 });
    const [sortModel, setSortModel] = useState([{ field: 'created_at', sort: 'desc' }]);

    // Query para as estatísticas de administração
    const { data: statsData, isLoading: statsLoading, isError: statsIsError, error: statsError } = useQuery({
        queryKey: ['adminStats', token, dateRange],
        queryFn: () => apiFetchAdminStats(dateRange).then(res => res.data),
        enabled: !!token,
    });

    // Query para a lista de utilizadores (com paginação e ordenação no lado do servidor)
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
    
    // Mutação para refresh de métricas de utilizador individual
    const refreshMutation = useMutation({
        mutationFn: (userId) => {
            setRefreshingUserId(userId);
            return apiRefreshUserMetrics(userId);
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adminUsers'] }); },
        onError: (error) => { logger.error("Failed to refresh user metrics:", error); },
        onSettled: () => { setRefreshingUserId(null); }
    });

    // Mutação para refresh de métricas de múltiplos utilizadores (batch)
    const batchRefreshMutation = useMutation({
        mutationFn: (userIds) => apiRefreshMultipleUserMetrics(userIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
            setSelectedUserIds([]);
        },
        onError: (error) => { logger.error("Failed to refresh metrics in batch:", error); },
    });

    // Mutação para limpar a cache de estatísticas
    const clearCacheMutation = useMutation({
        mutationFn: apiClearAdminStatsCache,
        onSuccess: () => {
            logger.log("Admin cache cleared, refetching stats...");
            queryClient.invalidateQueries({ queryKey: ['adminStats', token, dateRange] });
        },
        onError: (error) => {
            logger.error("Failed to clear admin stats cache:", error);
        }
    });

    const handleRefreshStats = () => {
        clearCacheMutation.mutate();
    };

    const isRefreshingStats = statsLoading || clearCacheMutation.isPending;

    // Colunas da DataGrid de Utilizadores
    const userColumns = [
        { field: 'id', headerName: 'ID', width: 70 },
        { field: 'email', headerName: 'Email', width: 220, renderCell: (params) => (<Tooltip title={params.value}><Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{params.value}</Typography></Tooltip>) },
        { field: 'auth_provider', headerName: 'Sign-in', width: 100 },
        { field: 'total_upload_count', headerName: 'Uploads (Total)', type: 'number', width: 120 },
        { field: 'upload_count', headerName: 'Ficheiros (Atuais)', type: 'number', width: 120 },
        { field: 'distinct_broker_count', headerName: 'Corretoras', type: 'number', width: 100 },
        { field: 'portfolio_value_eur', headerName: 'Valor Carteira (€)', type: 'number', width: 150, valueFormatter: (value) => value ? formatCurrency(value) : '0.00' },
        { 
            field: 'top_5_holdings', headerName: 'Top 5 Posições', width: 250, sortable: false,
            renderCell: (params) => {
                try {
                    const holdings = JSON.parse(params.value);
                    if (!Array.isArray(holdings) || holdings.length === 0) return 'N/A';
                    return (
                        <Tooltip title={holdings.map(h => `${h.name}: ${formatCurrency(h.value)}`).join('\n')}>
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

    const emptyChartData = { labels: [], datasets: [] };

    // Funções de dados para gráficos
    const timeSeriesChartData = (dataKey, label) => ({
        labels: statsData?.[dataKey]?.map(d => d.date) || [],
        datasets: [{ label, data: statsData?.[dataKey]?.map(d => d.count) || [], tension: 0.1, borderColor: theme.palette.info.main, backgroundColor: theme.palette.info.light, fill: true }],
    });
    
    // Gráficos de Doughnut/Bar com cores do tema
    const verificationChartData = statsData ? { labels: ['Verificados', 'Não Verificados'], datasets: [{ data: [statsData.verificationStats?.verified || 0, statsData.verificationStats?.unverified || 0], backgroundColor: [theme.palette.success.main, theme.palette.error.main] }] } : emptyChartData;
    const authProviderChartData = statsData ? { labels: statsData.authProviderStats?.map(d => d.name) || [], datasets: [{ data: statsData.authProviderStats?.map(d => d.value) || [], backgroundColor: [theme.palette.info.main, theme.palette.warning.main] }] } : emptyChartData;
    const valueByBrokerChartData = statsData ? { labels: statsData.valueByBroker?.map(d => d.name) || [], datasets: [{ data: statsData.valueByBroker?.map(d => d.value) || [], backgroundColor: [theme.palette.primary.main, theme.palette.secondary.main, theme.palette.success.main, theme.palette.error.main, theme.palette.warning.main] }] } : emptyChartData;
    const depositsByBrokerChartData = statsData ? { labels: statsData.depositsByBroker?.map(d => d.name) || [], datasets: [{ data: statsData.depositsByBroker?.map(d => d.value) || [], backgroundColor: [theme.palette.info.light, theme.palette.success.light, theme.palette.warning.light, theme.palette.error.light] }] } : emptyChartData;
    const topStocksByValueChartData = statsData ? { labels: statsData.topStocksByValue?.map(d => d.productName || d.isin) || [], datasets: [{ label: 'Total Investido (€)', data: statsData.topStocksByValue?.map(d => d.value) || [], backgroundColor: theme.palette.primary.light, borderColor: theme.palette.primary.main, borderWidth: 1 }] } : emptyChartData;
    const topStocksByTradesChartData = statsData ? { labels: statsData.topStocksByTrades?.map(d => d.productName || d.isin) || [], datasets: [{ label: 'Nº de Transações', data: statsData.topStocksByTrades?.map(d => d.value) || [], backgroundColor: theme.palette.secondary.light, borderColor: theme.palette.secondary.main, borderWidth: 1 }] } : emptyChartData;
    const investmentDistributionChartData = statsData ? { labels: statsData.investmentDistributionByCountry?.map(d => d.name.split(' - ')[1] || d.name) || [], datasets: [{ data: statsData?.investmentDistributionByCountry?.map(d => d.value) || [], backgroundColor: ['#FF6384', '#36A2EB', '#FFCE56', '#4BC0C0', '#9966FF', '#FF9F40', '#C9CBCF', '#4D5360'] }] } : emptyChartData;


    // Opções de Gráfico
    const chartOptions = { responsive: true, plugins: { legend: { position: 'right' }, title: { display: false } } };
    const timeSeriesChartOptions = (title) => ({ responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: false } }, scales: { x: { grid: { display: false } }, y: { beginAtZero: true } } });
    const horizontalBarOptions = (title, tooltipLabel) => ({ indexAxis: 'y', responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: false }, tooltip: { callbacks: { label: (context) => `${tooltipLabel}: ${tooltipLabel.includes('€') ? formatCurrency(context.raw) : context.raw}` } } }, scales: { x: { beginAtZero: true } } });

    if (statsIsError || usersIsError) { return <Alert severity="error">Erro ao carregar dados: {statsError?.message || usersError?.message}</Alert>; }
    const periodTitle = dateRange.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Typography variant="h4" component="h1">Dashboard de Administrador</Typography>
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
                    <FormControl size="small" sx={{ minWidth: 180 }}>
                        <InputLabel>Intervalo de Datas</InputLabel>
                        <Select value={dateRange} label="Intervalo de Datas" onChange={(e) => setDateRange(e.target.value)}>
                            <MenuItem value="all_time">Desde Sempre</MenuItem>
                            <MenuItem value="last_7_days">Últimos 7 dias</MenuItem>
                            <MenuItem value="last_30_days">Últimos 30 dias</MenuItem>
                            <MenuItem value="last_365_days">Últimos 365 dias</MenuItem>
                        </Select>
                    </FormControl>
                    <Tooltip title="Atualizar Estatísticas (Limpa Cache)">
                        <span>
                            <IconButton onClick={handleRefreshStats} disabled={isRefreshingStats}>
                                {isRefreshingStats ? <CircularProgress size={24} /> : <RefreshIcon />}
                            </IconButton>
                        </span>
                    </Tooltip>
                </Box>
            </Box>
            
            {/* --- SECÇÃO DE MÉTRICAS GERAIS (SEMPRE) --- */}
            <Paper component={Box} variant="outlined" sx={{ p: 3, mt: 4, borderColor: 'divider' }}>
                <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 'bold' }}>Métricas Gerais (Sempre)</Typography>
                 <Divider sx={{ mb: 3 }} />
                 
                {/* Global KPI Cards (Grid de 6 colunas) */}
                <Grid container spacing={2} sx={{ mb: 4 }}>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Valor Total Carteiras" value={formatCurrency(statsData?.totalPortfolioValue)} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Total Utilizadores" value={statsData?.totalUsers} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Contas Eliminadas" value={statsData?.deletedUserCount} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Total Uploads" value={statsData?.totalUploads} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="DAU (Hoje)" value={statsData?.dailyActiveUsers} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Ativos (30d)" value={statsData?.monthlyActiveUsers} loading={statsLoading} /></Grid>
                    
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Tempo p/ 1º Upload" value={statsData ? `${statsData.avgTimeToFirstUploadDays.toFixed(1)} dias` : 'N/A'} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Novos Hoje" value={statsData?.newUsersToday} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Novos 7 Dias" value={statsData?.newUsersThisWeek} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={2}><StatCard title="Novos Mês" value={statsData?.newUsersThisMonth} loading={statsLoading} /></Grid>
                </Grid>

                {/* General Charts and Tables */}
                <Grid container spacing={3}>
                    <Grid item xs={12} lg={6}>
                        <TopUsersTable users={statsData?.topUsersByLogins} title="Top Utilizadores por Nº de Logins" valueHeader="Logins" />
                    </Grid>
                    <Grid item xs={12} lg={6}>
                        <TopUsersTable users={statsData?.topUsersByUploads} title="Top Utilizadores por Nº de Uploads" valueHeader="Uploads" />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <ChartCard type="doughnut" data={verificationChartData} options={chartOptions} title="Verificação de Email" />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <ChartCard type="doughnut" data={authProviderChartData} options={chartOptions} title="Método de Autenticação" />
                    </Grid>
                </Grid>
            </Paper>

            {/* --- SECÇÃO DE MÉTRICAS DO PERÍODO --- */}
            <Paper component={Box} variant="outlined" sx={{ p: 3, mt: 4, borderColor: 'divider' }}>
                <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 'bold' }}>Métricas do Período: {periodTitle}</Typography>
                <Divider sx={{ mb: 3 }} />
                
                {/* KPI Cards (Grid de 4 colunas) */}
                <Grid container spacing={2} sx={{ mb: 4 }}>
                    <Grid item xs={6} sm={4} md={3}><StatCard title="Novos Utilizadores" value={statsData?.newUsersInPeriod} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={3}><StatCard title="Utilizadores Ativos" value={statsData?.activeUsersInPeriod} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={3}><StatCard title="Uploads" value={statsData?.uploadsInPeriod} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={3}><StatCard title="Taxa de Falha Upload" value={statsData ? `${statsData.uploadFailureRate.toFixed(1)}%` : 'N/A'} loading={statsLoading} /></Grid>

                    <Grid item xs={6} sm={4} md={3}><StatCard title="Total Depositado" value={formatCurrency(statsData?.totalCashDepositedEURInPeriod)} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={3}><StatCard title="Nº Depósitos" value={statsData?.cashDepositsInPeriod} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={3}><StatCard title="Dividendos Recebidos" value={formatCurrency(statsData?.totalDividendsReceivedEURInPeriod)} loading={statsLoading} /></Grid>
                    <Grid item xs={6} sm={4} md={3}><StatCard title="Avg Dividendo" value={formatCurrency(statsData?.avgDividendReceivedEURInPeriod)} loading={statsLoading} /></Grid>
                </Grid>

                {/* Time Series Charts */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={6}>
                        <ChartCard type="line" data={timeSeriesChartData('activeUsersPerDay', 'Utilizadores Ativos')} options={timeSeriesChartOptions('Utilizadores Ativos por Dia')} title="Atividade Diária" />
                    </Grid>
                    <Grid item xs={12} md={6}>
                        <ChartCard type="line" data={timeSeriesChartData('usersPerDay', 'Novos Utilizadores')} options={timeSeriesChartOptions('Novos Utilizadores por Dia')} title="Novos Registos Diários" />
                    </Grid>
                </Grid>
                
                {/* Distribution Charts (Horizontal Bars & Doughnut) */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                     <Grid item xs={12} lg={6}>
                        <ChartCard type="bar" data={topStocksByValueChartData} options={horizontalBarOptions('Top 10 Ações por Valor Investido', 'Valor (€)')} title="Top Investimentos (Valor)" />
                    </Grid>
                    <Grid item xs={12} lg={6}>
                        <ChartCard type="bar" data={topStocksByTradesChartData} options={horizontalBarOptions('Top 10 Ações por Nº de Transações', 'Nº Transações')} title="Top Investimentos (Transações)" />
                    </Grid>
                </Grid>

                {/* Broker/Country Allocation Charts */}
                <Grid container spacing={3} sx={{ mb: 4 }}>
                    <Grid item xs={12} md={6} lg={4}>
                        <ChartCard type="doughnut" data={valueByBrokerChartData} options={chartOptions} title="Volume Transacionado (Ações/Opções)" />
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                        <ChartCard type="doughnut" data={depositsByBrokerChartData} options={chartOptions} title="Depósitos por Corretora" />
                    </Grid>
                    <Grid item xs={12} md={6} lg={4}>
                        <ChartCard type="doughnut" data={investmentDistributionChartData} options={chartOptions} title="Distribuição de Investimentos (País)"/>
                    </Grid>
                </Grid>
            </Paper>

            {/* --- SECÇÃO DA TABELA DE UTILIZADORES --- */}
            <Paper component={Box} variant="outlined" sx={{ p: 3, mt: 4, borderColor: 'divider' }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                    <Typography variant="h5" component="h2" sx={{ fontWeight: 'bold' }}>Utilizadores Registados</Typography>
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
                <Box sx={{ height: 600, width: '100%' }}>
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
                </Box>
            </Paper>
        </Box>
    );
};

export default AdminDashboardPage;