// frontend/src/features/admin/pages/AdminOverviewPage.js
import React from 'react';
import { useQuery } from '@tanstack/react-query';
import { apiFetchAdminStats } from '../api/adminApi'; // Verifica o caminho de importação
import { useAuth } from '../../auth/AuthContext';
import { Box, CircularProgress, Alert } from '@mui/material';
import AdminMetricsSection from '../components/AdminMetricsSection';
import AdminChartsSection from '../components/AdminChartsSection';
import { prepareChartData, getCommonChartOptions, getTimeSeriesChartOptions } from '../config/adminChartConfig';
import { useTheme } from '@mui/material/styles';

const AdminOverviewPage = () => {
  const { token } = useAuth();
  
  const theme = useTheme();
  
  // 1. O fetch dos dados deve estar aqui
  const { data: statsData, isLoading, isError, error } = useQuery({
    queryKey: ['adminStats', token, 'all_time'], // Ou usar o estado de range
    queryFn: () => apiFetchAdminStats('all_time').then(res => res.data),
    enabled: !!token,
  });

  if (isLoading) return <Box sx={{display:'flex', justifyContent:'center', p:4}}><CircularProgress /></Box>;
  if (isError) return <Alert severity="error">{error.message}</Alert>;

  // Preparar dados para os gráficos
  const chartData = prepareChartData(statsData, theme);
  const chartOptions = getCommonChartOptions();
  const timeSeriesOptions = getTimeSeriesChartOptions();

  return (
    <Box>
      <AdminMetricsSection statsData={statsData} statsLoading={isLoading} />
      <AdminChartsSection 
         statsData={statsData} 
         chartData={chartData} 
         chartOptions={chartOptions} 
         timeSeriesOptions={timeSeriesOptions} 
      />
    </Box>
  );
};

export default AdminOverviewPage;