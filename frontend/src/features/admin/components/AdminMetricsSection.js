import React from 'react';
import { Paper, Box, Typography, Divider, Grid } from '@mui/material';
import StatCard from './StatCard';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const AdminMetricsSection = ({ statsData, statsLoading }) => {
    
    // Função auxiliar para formatar dias com segurança
    const formatDays = (val) => {
        if (val === undefined || val === null) return 'N/A';
        return `${Number(val).toFixed(1)} dias`;
    };

    return (
        <Paper component={Box} variant="outlined" sx={{ p: 3, mt: 4, borderColor: 'divider' }}>
            <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 'bold' }}>Métricas Gerais (Sempre)</Typography>
            <Divider sx={{ mb: 3 }} />
            <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="Valor Total Carteiras" value={formatCurrency(statsData?.totalPortfolioValue)} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="Total Utilizadores" value={statsData?.totalUsers} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="Contas Eliminadas" value={statsData?.deletedUserCount} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="Total Uploads" value={statsData?.totalUploads} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="DAU (Hoje)" value={statsData?.dailyActiveUsers} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="Ativos (30d)" value={statsData?.monthlyActiveUsers} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    {/* CORREÇÃO AQUI: Verificação de segurança antes do .toFixed() */}
                    <StatCard title="Tempo p/ 1º Upload" value={formatDays(statsData?.avgTimeToFirstUploadDays)} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="Novos Hoje" value={statsData?.newUsersToday} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="Novos 7 Dias" value={statsData?.newUsersThisWeek} loading={statsLoading} />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard title="Novos Mês" value={statsData?.newUsersThisMonth} loading={statsLoading} />
                </Grid>
            </Grid>
        </Paper>
    );
};

export default AdminMetricsSection;