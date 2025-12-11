import React, { useMemo } from 'react';
import { Box, Typography, Grid, Button, Card, CardContent, Skeleton } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { usePortfolioData } from '../../portfolio/hooks/usePortfolioData';
import HistoricalPerformanceChart from '../../analytics/components/HistoricalPerformanceChart';
import HoldingsAllocationChart from '../../analytics/components/HoldingsAllocationChart';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Link as RouterLink } from 'react-router-dom';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const DashboardMetric = ({ title, value, subValue, isLoading, color }) => (
    <Card elevation={0} sx={{ height: '100%', border: '1px solid', borderColor: 'divider', borderRadius: 3, bgcolor: '#ffffff' }}>
        <CardContent sx={{ p: 2, '&:last-child': { pb: 2 } }}>
            <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 700, letterSpacing: 0.5 }}>
                {title}
            </Typography>
            {isLoading ? (
                <Skeleton variant="text" width="60%" height={40} />
            ) : (
                <Box>
                    <Typography variant="h4" sx={{ fontWeight: 'bold', color: color || '#1a2027', mt: 0.5, fontSize: { xs: '1.5rem', md: '1.75rem' } }}>
                        {value}
                    </Typography>
                    {subValue && (
                        <Typography variant="body2" sx={{ mt: 0.5, color: subValue.includes('+') ? 'success.main' : (subValue.includes('-') ? 'error.main' : 'text.secondary'), fontWeight: 600 }}>
                            {subValue}
                        </Typography>
                    )}
                </Box>
            )}
        </CardContent>
    </Card>
);

const DashboardPage = () => {
    const { user } = useAuth();
    const { activePortfolio } = usePortfolio();
    const { token } = useAuth();

    const { 
        holdingsForGroupedView, 
        unrealizedStockPL, 
        isLoading 
    } = usePortfolioData(token);

    // Calculate Dashboard Metrics
    const metrics = useMemo(() => {
        if (!holdingsForGroupedView) return { totalValue: 0, totalInvested: 0, returnPct: 0 };
        
        const totals = holdingsForGroupedView.reduce((acc, h) => ({
            totalValue: acc.totalValue + (h.marketValueEUR || 0),
            totalInvested: acc.totalInvested + (h.total_cost_basis_eur || 0)
        }), { totalValue: 0, totalInvested: 0 });

        const returnPct = totals.totalInvested > 0 
            ? ((totals.totalValue - totals.totalInvested) / totals.totalInvested) * 100 
            : 0;

        return { ...totals, returnPct };
    }, [holdingsForGroupedView]);

    const plColor = unrealizedStockPL >= 0 ? 'success.main' : 'error.main';
    const plPrefix = unrealizedStockPL > 0 ? '+' : '';
    const pctPrefix = metrics.returnPct > 0 ? '+' : '';

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            {/* 1. Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 3 }}>
                <Box>
                    <Typography variant="h4" component="h1" fontWeight="800" sx={{ color: '#2c3e50', letterSpacing: '-0.5px' }}>
                        Olá, {user?.username?.split(' ')[0] || 'Investidor'}
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Resumo do portfólio <strong>{activePortfolio?.name}</strong>
                    </Typography>
                </Box>
            </Box>

            {/* 2. Key Metrics Grid */}
            <Grid container spacing={2} sx={{ mb: 3 }}>
                <Grid item xs={12} sm={6} md={3}>
                    <DashboardMetric 
                        title="Valor Total" 
                        value={formatCurrency(metrics.totalValue)} 
                        isLoading={isLoading} 
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <DashboardMetric 
                        title="Capital Investido" 
                        value={formatCurrency(metrics.totalInvested)} 
                        isLoading={isLoading} 
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <DashboardMetric 
                        title="Lucro/Prejuízo (€)" 
                        value={`${plPrefix}${formatCurrency(unrealizedStockPL)}`}
                        color={plColor}
                        isLoading={isLoading}
                    />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <DashboardMetric 
                        title="Performance Global" 
                        value={`${pctPrefix}${metrics.returnPct.toFixed(2)}%`}
                        color={metrics.returnPct >= 0 ? 'success.main' : 'error.main'}
                        isLoading={isLoading}
                    />
                </Grid>
            </Grid>

            {/* 3. Main Chart & Allocation (Layout Update) */}
            <Grid container spacing={3}>
                {/* Main Historical Chart (Full Width or 8/12) */}
                <Grid item xs={12} lg={8}>
                    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '500px', p: 0 }}>
                       <HistoricalPerformanceChart />
                    </Card>
                </Grid>

                {/* Allocation Chart (Smaller Side Panel) */}
                <Grid item xs={12} lg={4}>
                    <Card elevation={0} sx={{ border: '1px solid', borderColor: 'divider', borderRadius: 3, height: '500px', p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom>Alocação de Ativos</Typography>
                        <Box sx={{ width: '100%', height: '100%', maxHeight: 350 }}>
                            <HoldingsAllocationChart holdings={holdingsForGroupedView} />
                        </Box>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default DashboardPage;