// frontend/src/features/admin/components/AdminMetricsSection.js

import React from 'react';
import { Paper, Box, Typography, Divider, Grid } from '@mui/material';
import StatCard from './StatCard';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const AdminMetricsSection = ({ statsData, statsLoading }) => {
    
    // Função auxiliar para formatar números compactos se necessário (opcional)
    const formatNumber = (num) => {
        if (num === undefined || num === null) return 'N/A';
        return num.toLocaleString('pt-PT');
    };

    return (
        <Paper component={Box} variant="outlined" sx={{ p: 3, mt: 4, borderColor: 'divider' }}>
            <Typography variant="h5" component="h2" gutterBottom sx={{ fontWeight: 'bold' }}>
                Métricas Gerais (Sempre)
            </Typography>
            <Divider sx={{ mb: 3 }} />
            
            <Grid container spacing={2} sx={{ mb: 4 }}>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="Valor Total Carteiras" 
                        value={formatCurrency(statsData?.totalPortfolioValue)} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="Total Utilizadores" 
                        value={formatNumber(statsData?.totalUsers)} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    {/* NOVA MÉTRICA: Taxa de Ativação */}
                    <StatCard 
                        title="Taxa de Ativação" 
                        value={statsData?.activation_rate ? `${statsData.activation_rate.toFixed(1)}%` : '0%'} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    {/* NOVA MÉTRICA: Volume de Transações */}
                    <StatCard 
                        title="Total Transações" 
                        value={formatNumber(statsData?.total_transactions)} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="Total Uploads" 
                        value={formatNumber(statsData?.totalUploads)} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="Contas Eliminadas" 
                        value={formatNumber(statsData?.deletedUserCount)} 
                        loading={statsLoading} 
                    />
                </Grid>

                {/* --- Métricas de Atividade e Crescimento --- */}
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="DAU (Hoje)" 
                        value={formatNumber(statsData?.dailyActiveUsers)} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="Ativos (30d)" 
                        value={formatNumber(statsData?.monthlyActiveUsers)} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="Novos Hoje" 
                        value={formatNumber(statsData?.newUsersToday)} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="Novos 7 Dias" 
                        value={formatNumber(statsData?.newUsersThisWeek)} 
                        loading={statsLoading} 
                    />
                </Grid>
                <Grid item xs={6} sm={4} md={2}>
                    <StatCard 
                        title="Novos Mês" 
                        value={formatNumber(statsData?.newUsersThisMonth)} 
                        loading={statsLoading} 
                    />
                </Grid>
            </Grid>
        </Paper>
    );
};

export default AdminMetricsSection;