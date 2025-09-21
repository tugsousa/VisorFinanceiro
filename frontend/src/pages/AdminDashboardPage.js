// frontend/src/pages/AdminDashboardPage.js
import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchAdminStats, apiFetchAdminUsers, apiRefreshUserMetrics, apiRefreshMultipleUserMetrics } from '../api/apiService';
import { Box, Typography, Paper, Grid, CircularProgress, Alert, Tooltip, IconButton, FormControl, InputLabel, Select, MenuItem, Button } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useAuth } from '../context/AuthContext';
import { Bar, Line, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, Tooltip as ChartTooltip, ArcElement } from 'chart.js';
import { useNavigate } from 'react-router-dom';

// O registo do ChartJS já estava correto.
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, ChartTooltip, ArcElement);

// Componentes KPICard, ChartCard e TopUsersTable permanecem os mesmos

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
    // A verificação agora é mais segura: confirma que ds e ds.data existem antes de aceder a .length
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
    
    // As mutações (refreshMutation, batchRefreshMutation) e as colunas (userColumns) continuam iguais.
    const refreshMutation = useMutation({
        mutationFn: (userId) => {
            setRefreshingUserId(userId);
            return apiRefreshUserMetrics(userId);
        },
        onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['adminUsers'] }); }, // Simplificado
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
      // As colunas existentes estão corretas
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
        { field: 'last_login_at', headerName: 'Último Login', width: 170, type: 'dateTime', valueGetter: (value) => value ? new Date(value) : null },
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

    // --- Lógica para os Novos Gráficos ---
    const timeSeriesChartData = (dataKey, label) => ({
        labels: statsData?.[dataKey]?.map(d => d.date) || [],
        datasets: [{ 
            label, 
            // Adicionámos `|| []` para garantir que `data` é sempre um array
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
            backgroundColor: ['rgba(153, 102, 255, 0.7)', 'rgba(255, 159, 64, 0.7)'],
        }],
    };
    const brokerChartData = {
        labels: statsData?.uploadsByBroker?.map(d => d.name) || [],
        datasets: [{
            label: 'Uploads por Corretora',
            data: statsData?.uploadsByBroker?.map(d => d.value) || [],
            backgroundColor: 'rgba(54, 162, 235, 0.7)',
        }],
    };
    const chartOptions = { responsive: true, plugins: { legend: { position: 'top' }, title: { display: false } } };
    const timeSeriesChartOptions = (title) => ({
        responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false }, title: { display: true, text: title, font: { size: 16 } } },
        scales: { x: { grid: { display: false } }, y: { beginAtZero: true } },
    });

    if (statsIsError || usersIsError) {
        return <Alert severity="error">Erro ao carregar dados: {statsError?.message || usersError?.message}</Alert>;
    }
    
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
            
            <Typography variant="h5" component="h2" gutterBottom sx={{ mt: 4 }}>Métricas Gerais ({dateRange.replace(/_/g, ' ')})</Typography>
            <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={6} sm={4} md={2}><KPICard title="Total Utilizadores" value={statsData?.totalUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="DAU" value={statsData?.dailyActiveUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="MAU" value={statsData?.monthlyActiveUsers} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="Total Uploads" value={statsData?.totalUploads} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="Média Trans./Upload" value={statsData?.avgTransactionsPerUpload?.toFixed(1)} loading={statsLoading} /></Grid>
                <Grid item xs={6} sm={4} md={2}><KPICard title="Tam. Médio Fich. (MB)" value={statsData?.avgFileSizeMB?.toFixed(2)} loading={statsLoading} /></Grid>
            </Grid>
            
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={6} lg={4}><ChartCard type="line" data={timeSeriesChartData('activeUsersPerDay', 'Utilizadores Ativos')} options={timeSeriesChartOptions('Utilizadores Ativos por Dia')} title="" /></Grid>
                <Grid item xs={12} md={6} lg={4}><ChartCard type="line" data={timeSeriesChartData('usersPerDay', 'Novos Utilizadores')} options={timeSeriesChartOptions('Novos Utilizadores por Dia')} title="" /></Grid>
                <Grid item xs={12} md={6} lg={4}><ChartCard type="line" data={timeSeriesChartData('uploadsPerDay', 'Uploads')} options={timeSeriesChartOptions('Uploads por Dia')} title="" /></Grid>
                <Grid item xs={12} sm={6} md={3}><ChartCard type="doughnut" data={verificationChartData} options={chartOptions} title="Verificação de Email" /></Grid>
                <Grid item xs={12} sm={6} md={3}><ChartCard type="doughnut" data={authProviderChartData} options={chartOptions} title="Origem de Contas" /></Grid>
                <Grid item xs={12} md={6}><ChartCard type="bar" data={brokerChartData} options={chartOptions} title="Uploads por Corretora" /></Grid>
            </Grid>
            
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} lg={6}><TopUsersTable users={statsData?.topUsersByLogins} title="Top Utilizadores por Nº de Logins" valueHeader="Logins" /></Grid>
                <Grid item xs={12} lg={6}><TopUsersTable users={statsData?.topUsersByUploads} title="Top Utilizadores por Nº de Uploads" valueHeader="Uploads" /></Grid>
            </Grid>

            {/* A tabela de utilizadores com a paginação do servidor */}
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