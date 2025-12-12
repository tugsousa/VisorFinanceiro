import React from 'react';
import { Box, Paper, Typography, Skeleton, useTheme, Grid } from '@mui/material';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const KPICard = ({ title, value, subValue, isCurrency = true, isPercentage = false, isLoading, colorOverride }) => {
    const theme = useTheme();
    
    let valueColor = theme.palette.text.primary;
    const numValue = parseFloat(value);
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
                // 1. Reduced padding to '1' (8px) for maximum compactness
                p: 1,
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                height: '100%', 
            }}
        >
            <Typography 
                variant="caption" 
                color="text.secondary" 
                sx={{ 
                    fontWeight: 600, 
                    textTransform: 'uppercase', 
                    fontSize: '0.65rem', 
                    mb: 0.25,
                    lineHeight: 1
                }}
            >
                {title}
            </Typography>
            
            <Typography 
                variant="h6"
                sx={{ 
                    fontWeight: 700, 
                    color: valueColor, 
                    // Slightly reduced font size for compact height
                    fontSize: { xs: '1rem', md: '1.1rem' }, 
                    lineHeight: 1.2,
                    letterSpacing: '-0.2px' 
                }}
            >
                {formattedValue}
            </Typography>

            {subValue && (
                <Box sx={{ mt: 0.25, lineHeight: 1 }}>
                    {isLoading ? (
                        <Skeleton width="40%" height={15} />
                    ) : (
                        React.isValidElement(subValue) 
                            ? React.cloneElement(subValue, { style: { ...subValue.props.style, fontSize: '0.75rem' } })
                            : (
                                <Typography 
                                    variant="caption" 
                                    component="div" 
                                    sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.75rem' }}
                                >
                                    {subValue}
                                </Typography>
                            )
                    )}
                </Box>
            )}
        </Paper>
    );
};

const DashboardKPISection = ({ metrics, isLoading }) => {
    // 2. Merged all items into a single array
    const allMetrics = [
        { title: "Valor Total", value: metrics.totalPortfolioValue, isCurrency: true },
        { title: "Depósitos Líquidos", value: metrics.netDeposits, isCurrency: true },
        { title: "Capital Investido", value: metrics.investedCapital, isCurrency: true },
        { title: "Cash Disponível", value: metrics.cashBalance, isCurrency: true },
        { title: "Lucro / Prejuízo", value: metrics.totalPL, isCurrency: true },
        { title: "Retorno Total", value: metrics.totalReturnPct, isPercentage: true },
        { 
            title: "Variação Diária", 
            value: metrics.dailyChangeValue,
            isCurrency: true,
            subValue: (
                <Typography
                    variant="caption"
                    sx={{
                        color: metrics.dailyChangePct >= 0 ? '#1b5e20' : '#b71c1c',
                        fontSize: '0.75rem',
                        fontWeight: 600
                    }}
                >
                    {metrics.dailyChangePct >= 0 ? '+' : ''}
                    {Number(metrics.dailyChangePct).toFixed(2)}%
                </Typography>
            ),
        },
        { 
            title: "Retorno Anual (XIRR)", 
            value: metrics.annualizedReturn, 
            isPercentage: true 
        },
    ];

    return (
        <Box>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1.5 }}>
                Resumo Geral
            </Typography>
            
            {/* 3. Single Grid Container: 
               This ensures the gap between Row 1 and Row 2 is exactly 16px (spacing={2})
               and prevents borders from overlapping.
            */}
            <Grid container spacing={2} alignItems="stretch">
                {allMetrics.map((item, idx) => (
                    <Grid item xs={6} sm={3} md={3} key={idx} sx={{ mb: 1.5 }}>
                        <KPICard {...item} isLoading={isLoading} />
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default DashboardKPISection;