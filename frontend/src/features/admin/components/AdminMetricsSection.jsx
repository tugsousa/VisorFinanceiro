// frontend/src/features/admin/components/AdminMetricsSection.js

import React from 'react';
import { Box, Typography, Divider, Grid } from '@mui/material';
import StatCard from './StatCard';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const AdminMetricsSection = ({ statsData, statsLoading }) => {
    
    // Função auxiliar para formatar números compactos se necessário (opcional)
    const formatNumber = (num) => {
        if (num === undefined || num === null) return 'N/A';
        return num.toLocaleString('pt-PT');
    };

    return (
        <Box sx={{ mt: 2 }}>
            <Box sx={{ mb: 4 }}>
                <Typography variant="h4" component="h2" gutterBottom sx={{ 
                    fontWeight: 800,
                    color: 'text.primary',
                    letterSpacing: '-0.02em'
                }}>
                    Dashboard Administrativo
                </Typography>
                <Typography variant="body1" color="text.secondary" sx={{ fontWeight: 500 }}>
                    Visão geral do desempenho da plataforma
                </Typography>
            </Box>
            
            <Divider sx={{ mb: 4, borderColor: 'divider' }} />

            {/* Seção 1: Métricas Financeiras */}
            <Box sx={{ mb: 6 }}>
                <Typography variant="h6" component="h3" sx={{ 
                    fontWeight: 700, 
                    color: 'text.primary',
                    mb: 3
                }}>
                    Métricas Financeiras
                </Typography>
                
                <Grid container spacing={4}>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Valor Total Carteiras" 
                            value={formatCurrency(statsData?.totalPortfolioValue)} 
                            loading={statsLoading}
                            variant="financial"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Total Transações" 
                            value={formatNumber(statsData?.total_transactions)} 
                            loading={statsLoading}
                            variant="financial"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Total Uploads" 
                            value={formatNumber(statsData?.totalUploads)} 
                            loading={statsLoading}
                            variant="financial"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Taxa de Ativação" 
                            value={statsData?.activation_rate ? `${statsData.activation_rate.toFixed(1)}%` : '0%'} 
                            loading={statsLoading}
                            variant="financial"
                        />
                    </Grid>
                </Grid>
            </Box>

            {/* Seção 2: Métricas de Usuários */}
            <Box sx={{ mb: 6 }}>
                <Typography variant="h6" component="h3" sx={{ 
                    fontWeight: 700, 
                    color: 'text.primary',
                    mb: 3
                }}>
                    Métricas de Usuários
                </Typography>
                
                <Grid container spacing={4}>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Total Utilizadores" 
                            value={formatNumber(statsData?.totalUsers)} 
                            loading={statsLoading}
                            variant="user"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Novos Hoje" 
                            value={formatNumber(statsData?.newUsersToday)} 
                            loading={statsLoading}
                            variant="user"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Novos 7 Dias" 
                            value={formatNumber(statsData?.newUsersThisWeek)} 
                            loading={statsLoading}
                            variant="user"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Novos Mês" 
                            value={formatNumber(statsData?.newUsersThisMonth)} 
                            loading={statsLoading}
                            variant="user"
                        />
                    </Grid>
                </Grid>
            </Box>

            {/* Seção 3: Métricas de Atividade */}
            <Box sx={{ mb: 6 }}>
                <Typography variant="h6" component="h3" sx={{ 
                    fontWeight: 700, 
                    color: 'text.primary',
                    mb: 3
                }}>
                    Métricas de Atividade
                </Typography>
                
                <Grid container spacing={4}>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="DAU (Hoje)" 
                            value={formatNumber(statsData?.dailyActiveUsers)} 
                            loading={statsLoading}
                            variant="activity"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Ativos (30d)" 
                            value={formatNumber(statsData?.monthlyActiveUsers)} 
                            loading={statsLoading}
                            variant="activity"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Contas Eliminadas" 
                            value={formatNumber(statsData?.deletedUserCount)} 
                            loading={statsLoading}
                            variant="default"
                        />
                    </Grid>
                    <Grid item xs={12} sm={6} lg={3}>
                        <StatCard 
                            title="Taxa de Retenção" 
                            value={statsData?.retention_rate ? `${statsData.retention_rate.toFixed(1)}%` : '0%'} 
                            loading={statsLoading}
                            variant="activity"
                        />
                    </Grid>
                </Grid>
            </Box>
        </Box>
    );
};

export default AdminMetricsSection;
