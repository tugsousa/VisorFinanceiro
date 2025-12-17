import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Box, Typography, FormControl, Select, MenuItem, InputLabel, Button, Alert } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { apiFetchAdminStats, apiClearAdminStatsCache } from '../api/adminApi';
import AdminMetricsSection from '../components/AdminMetricsSection';
import AdminChartsSection from '../components/AdminChartsSection';
import { prepareChartData, getCommonChartOptions, getTimeSeriesChartOptions, getHorizontalBarOptions } from '../config/adminChartConfig';

const AdminOverviewPage = () => {
    const [dateRange, setDateRange] = useState('all_time');
    
    const { data: statsData, isLoading, isError, refetch } = useQuery({
        queryKey: ['adminStats', dateRange],
        queryFn: () => apiFetchAdminStats(dateRange),
        staleTime: 5 * 60 * 1000,
    });

    const handleClearCache = async () => {
        try {
            await apiClearAdminStatsCache();
            refetch();
        } catch (error) {
            console.error("Erro a limpar cache", error);
        }
    };

    // Preparar dados dos gráficos (Lógica extraída do antigo Dashboard)
    const chartData = statsData ? {
        registrations: prepareChartData(statsData.registrationsOverTime, 'Novos Utilizadores', '#3f51b5'),
        activity: prepareChartData(statsData.activeUsersOverTime, 'Utilizadores Ativos', '#f50057'),
        uploads: prepareChartData(statsData.uploadsOverTime, 'Uploads', '#009688'),
        // ... adicione os outros gráficos conforme necessário
    } : {};

    if (isError) return <Alert severity="error">Erro ao carregar métricas.</Alert>;

    return (
        <Box>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">Visão Geral</Typography>
                <Box sx={{ display: 'flex', gap: 2 }}>
                    <Button startIcon={<RefreshIcon />} onClick={handleClearCache}>Limpar Cache</Button>
                    <FormControl size="small" sx={{ minWidth: 150 }}>
                        <InputLabel>Período</InputLabel>
                        <Select value={dateRange} label="Período" onChange={(e) => setDateRange(e.target.value)}>
                            <MenuItem value="7d">Últimos 7 dias</MenuItem>
                            <MenuItem value="30d">Últimos 30 dias</MenuItem>
                            <MenuItem value="this_year">Este Ano</MenuItem>
                            <MenuItem value="all_time">Todo o Sempre</MenuItem>
                        </Select>
                    </FormControl>
                </Box>
            </Box>

            <AdminMetricsSection statsData={statsData} statsLoading={isLoading} />
            
            <Box sx={{ mt: 4 }}>
                {!isLoading && statsData && (
                    <AdminChartsSection 
                        chartData={chartData} 
                        options={{
                            common: getCommonChartOptions(),
                            timeSeries: getTimeSeriesChartOptions(),
                            horizontal: getHorizontalBarOptions()
                        }} 
                    />
                )}
            </Box>
        </Box>
    );
};

export default AdminOverviewPage;