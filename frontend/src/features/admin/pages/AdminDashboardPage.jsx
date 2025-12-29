import React, { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchAdminStats, apiFetchAdminUsers, apiRefreshUserMetrics, apiRefreshMultipleUserMetrics, apiClearAdminStatsCache } from 'features/admin/api/adminApi';
import { 
    Box, Typography, Paper, Alert, Tooltip, IconButton, FormControl, 
    InputLabel, Select, MenuItem, Button, CircularProgress, useTheme
} from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { DataGrid, GridToolbar } from '@mui/x-data-grid';
import { useAuth } from '../../auth/AuthContext';
import { useNavigate } from 'react-router-dom';
import logger from '../../../lib/utils/logger';

// New Imports
import AdminMetricsSection from '../components/AdminMetricsSection';
import AdminChartsSection from '../components/AdminChartsSection';
import { getUserColumns } from '../config/adminGridConfig';
import { prepareChartData, getCommonChartOptions, getTimeSeriesChartOptions, getHorizontalBarOptions } from '../config/adminChartConfig';

// Chart Registration
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, Tooltip as ChartTooltip, ArcElement } from 'chart.js';
ChartJS.register(CategoryScale, LinearScale, BarElement, LineElement, PointElement, Title, Legend, ChartTooltip, ArcElement);

const AdminDashboardPage = () => {
    const { token } = useAuth();
    const queryClient = useQueryClient();
    const navigate = useNavigate();
    const theme = useTheme();

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
        onError: (error) => { logger.error("Failed to refresh user metrics:", error); },
        onSettled: () => { setRefreshingUserId(null); }
    });

    const batchRefreshMutation = useMutation({
        mutationFn: (userIds) => apiRefreshMultipleUserMetrics(userIds),
        onSuccess: () => {
            queryClient.invalidateQueries({ queryKey: ['adminUsers'] });
            setSelectedUserIds([]);
        },
        onError: (error) => { logger.error("Failed to refresh metrics in batch:", error); },
    });

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

    const handleRefreshStats = () => clearCacheMutation.mutate();
    const isRefreshingStats = statsLoading || clearCacheMutation.isPending;

    if (statsIsError || usersIsError) { return <Alert severity="error">Erro ao carregar dados: {statsError?.message || usersError?.message}</Alert>; }

    const chartData = prepareChartData(statsData, theme);
    const userColumns = getUserColumns(refreshingUserId, refreshMutation);

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
            
            <AdminMetricsSection statsData={statsData} statsLoading={statsLoading} />

            <AdminChartsSection 
                statsData={statsData} 
                chartData={chartData} 
                chartOptions={getCommonChartOptions()}
                timeSeriesOptions={getTimeSeriesChartOptions('Atividade')}
            />

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