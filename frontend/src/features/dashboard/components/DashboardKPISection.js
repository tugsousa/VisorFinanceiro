import React from 'react';
import { Box, Paper, Typography, Skeleton, useTheme, Grid } from '@mui/material';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const KPICard = ({ title, value, subValue, isCurrency = true, isPercentage = false, isLoading, colorOverride }) => {
    const theme = useTheme();
    
    // Determinar cor baseada no valor
    let valueColor = theme.palette.text.primary;
    const numValue = parseFloat(value);

    // Lógica de cores para Performance (Verde/Vermelho)
    const isPerformanceMetric = isPercentage || title.includes('Variação') || title.includes('Lucro');
    
    if (!colorOverride && isPerformanceMetric) {
        if (numValue > 0) valueColor = theme.palette.success.main;
        if (numValue < 0) valueColor = theme.palette.error.main;
    } else if (colorOverride) {
        valueColor = colorOverride;
    }

    const formattedValue = isLoading 
        ? <Skeleton width="60%" /> 
        : (isPercentage ? `${Number(value).toFixed(2)}%` : (isCurrency ? formatCurrency(value) : value));

    return (
        <Paper 
            elevation={0} 
            sx={{ 
                p: 2, // Padding reduzido (era 2.5)
                // minHeight removido para a caixa ser compacta
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2, // Cantos ligeiramente menos arredondados
            }}
        >
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 500, textTransform: 'uppercase', fontSize: '0.7rem', mb: 0.5 }}>
                {title}
            </Typography>
            
            <Typography variant="h5" sx={{ fontWeight: 700, color: valueColor, fontSize: { xs: '1.25rem', md: '1.4rem' }, letterSpacing: '-0.5px' }}>
                {formattedValue}
            </Typography>
            
            {/* Sub-valor condicional (sem ocupar espaço se não existir) */}
            {subValue && (
                <Box sx={{ mt: 0.5 }}>
                    {isLoading ? <Skeleton width="40%" /> : (
                        <Typography variant="caption" component="div" sx={{ display: 'flex', alignItems: 'center', fontWeight: 500, color: 'text.secondary' }}>
                            {subValue}
                        </Typography>
                    )}
                </Box>
            )}
        </Paper>
    );
};

const DashboardKPISection = ({ metrics, isLoading }) => {
    // Configuração dos dados
    const row1 = [
        { title: "Valor Total", value: metrics.totalPortfolioValue, isCurrency: true },
        { title: "Depósitos Líquidos", value: metrics.netDeposits, isCurrency: true },
        { title: "Capital Investido", value: metrics.investedCapital, isCurrency: true },
        { title: "Cash Disponível", value: metrics.cashBalance, isCurrency: true },
    ];

    const row2 = [
        { title: "Lucro / Prejuízo", value: metrics.totalPL, isCurrency: true },
        { title: "Retorno Total", value: metrics.totalReturnPct, isPercentage: true },
        { 
            title: "Variação Diária", 
            value: metrics.dailyChangeValue, 
            isCurrency: true, 
            subValue: (
                <span style={{ 
                    color: metrics.dailyChangePct >= 0 ? '#1b5e20' : '#b71c1c', 
                    fontSize: '0.8rem'
                }}>
                    {metrics.dailyChangePct >= 0 ? '+' : ''}{Number(metrics.dailyChangePct).toFixed(2)}%
                </span>
            )
        },
        { 
            title: "Retorno Anual (XIRR)", 
            value: metrics.annualizedReturn, 
            isPercentage: true
        }, 
    ];

    return (
        <Box sx={{ mb: 4 }}>
            <Grid container spacing={2} sx={{ mb: 3 }}>
                {row1.map((item, idx) => (
                    <Grid item xs={12} sm={6} md={3} key={idx}>
                        <KPICard {...item} isLoading={isLoading} />
                    </Grid>
                ))}
            </Grid>
            <Grid container spacing={2}>
                {row2.map((item, idx) => (
                    <Grid item xs={12} sm={6} md={3} key={idx}>
                        <KPICard {...item} isLoading={isLoading} />
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default DashboardKPISection;