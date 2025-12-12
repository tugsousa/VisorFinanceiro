import React, { useMemo } from 'react';
import { Box, Paper, Typography, Grid, Skeleton, Tooltip, IconButton, Divider } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const PeriodCard = ({ label, value, isLoading, isTwr }) => {
    let color = 'text.secondary';
    let displayValue = '-';

    if (value !== null && value !== undefined && !isNaN(value)) {
        if (value > 0) color = 'success.main';
        if (value < 0) color = 'error.main';
        // Handle massive outlier numbers (e.g. data errors) visually
        if (value > 100000) displayValue = '>9999%';
        else displayValue = `${value > 0 ? '+' : ''}${value.toFixed(2)}%`;
    }

    if (isLoading) {
        return (
            <Paper variant="outlined" sx={{ p: 2, height: '100%', borderRadius: 2 }}>
                <Typography variant="caption" color="text.secondary">{label}</Typography>
                <Skeleton variant="text" width="60%" height={32} />
            </Paper>
        );
    }

    return (
        <Paper
            elevation={0}
            sx={{
                p: 2,
                textAlign: 'center',
                border: '1px solid',
                borderColor: 'divider',
                borderRadius: 2,
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                bgcolor: 'background.paper',
                position: 'relative'
            }}
        >
            <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', mb: 1 }}>
                {label}
            </Typography>
            <Typography variant="h6" sx={{ color: color, fontWeight: 'bold' }}>
                {displayValue}
            </Typography>
            {value !== null && (
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', position: 'absolute', bottom: 2, right: 6 }}>
                    {isTwr ? 'TWR' : 'Dietz'}
                </Typography>
            )}
        </Paper>
    );
};

export default function ReturnsPeriodSection({ historicalData, currentMetrics, isLoading }) {
    const returns = useMemo(() => {
        if (!historicalData || historicalData.length === 0 || !currentMetrics) return {};

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());

        // --- 1. Modified Dietz (Short Term: < 1 Year) ---
        // Good for short periods where compounding isn't critical.
        const calculateDietz = (startDate) => {
            const startIso = startDate.toISOString().split('T')[0];
            const sorted = [...historicalData].sort((a, b) => b.date.localeCompare(a.date));
            const startPoint = sorted.find(p => p.date <= startIso);

            if (!startPoint) return null;

            const startVal = startPoint.portfolio_value;
            const startFlow = startPoint.cumulative_cash_flow;
            const endVal = currentMetrics.totalPortfolioValue;
            const endFlow = currentMetrics.netDeposits;

            // If account was empty at start of period, Dietz is unstable. Fallback to TWR logic or 0.
            if (startVal < 1) return null; 

            const netFlowsInPeriod = endFlow - startFlow;
            const gain = (endVal - startVal) - netFlowsInPeriod;
            const adjustedStartCapital = startVal + (netFlowsInPeriod * 0.5);

            if (adjustedStartCapital < 1) return 0;
            return (gain / adjustedStartCapital) * 100;
        };

        // --- 2. Robust Time-Weighted Return (Long Term) ---
        // Handles gaps (Value=0) by "pausing" performance for those days.
        const calculateTWR = (startDate) => {
            const startIso = startDate.toISOString().split('T')[0];
            
            const periodData = historicalData
                .filter(p => p.date >= startIso)
                .sort((a, b) => a.date.localeCompare(b.date)); // Sort Oldest -> Newest

            if (periodData.length < 2) return null;

            let cumulativeReturn = 1.0;
            let hasStarted = false;

            for (let i = 1; i < periodData.length; i++) {
                const prev = periodData[i - 1];
                const curr = periodData[i];

                // Daily Flow
                const dailyFlow = curr.cumulative_cash_flow - prev.cumulative_cash_flow;
                
                // Denominator: Value at start of day (Before gains, but AFTER deposits)
                // Logic: If I have 0, deposit 1000 -> Denom is 1000.
                // If I have 1000, withdraw 1000 -> Denom is 0.
                const denominator = prev.portfolio_value + dailyFlow;

                // GAP PROTECTION:
                // If denominator is near zero (empty account), we skip this day.
                // This correctly "bridges" the gap without adding return.
                if (denominator > 1) {
                    hasStarted = true;
                    // Daily Return = (EndValue - Denom) / Denom
                    // Simplifies to: (EndValue / Denom) - 1
                    const dailyReturn = (curr.portfolio_value / denominator) - 1;
                    
                    // Sanity check: cap extreme daily returns (e.g. data glitch) to 1000%
                    if (dailyReturn > 10) continue; 

                    cumulativeReturn *= (1 + dailyReturn);
                } else if (!hasStarted && curr.portfolio_value > 1) {
                    // This handles the very first deposit day if denominator logic missed it
                    hasStarted = true;
                }
            }

            // Final Step: Last Snapshot -> Live Dashboard Values
            const lastSnap = periodData[periodData.length - 1];
            const finalFlow = currentMetrics.netDeposits - lastSnap.cumulative_cash_flow;
            const finalDenom = lastSnap.portfolio_value + finalFlow;
            
            if (finalDenom > 1) {
                const finalReturn = (currentMetrics.totalPortfolioValue / finalDenom) - 1;
                cumulativeReturn *= (1 + finalReturn);
            }

            return (cumulativeReturn - 1) * 100;
        };

        // Dates
        const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
        const oneMonthAgo = new Date(today); oneMonthAgo.setMonth(today.getMonth() - 1);
        const threeMonthsAgo = new Date(today); threeMonthsAgo.setMonth(today.getMonth() - 3);
        const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(today.getMonth() - 6);
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        const oneYearAgo = new Date(today); oneYearAgo.setFullYear(today.getFullYear() - 1);
        const fiveYearsAgo = new Date(today); fiveYearsAgo.setFullYear(today.getFullYear() - 5);
        const inceptionDate = new Date(2000, 0, 1); 

        return {
            today: currentMetrics.dailyChangePct,
            w1: calculateDietz(oneWeekAgo),
            m1: calculateDietz(oneMonthAgo),
            m3: calculateDietz(threeMonthsAgo),
            m6: calculateDietz(sixMonthsAgo),
            ytd: calculateTWR(startOfYear),
            y1: calculateTWR(oneYearAgo),
            y5: calculateTWR(fiveYearsAgo),
            all: calculateTWR(inceptionDate) // Now using TWR as requested
        };

    }, [historicalData, currentMetrics]);

    const periods = [
        { key: 'today', label: 'Hoje', method: 'Simple' },
        { key: 'w1', label: '1W', method: 'Dietz' },
        { key: 'm1', label: '1M', method: 'Dietz' },
        { key: 'm3', label: '3M', method: 'Dietz' },
        { key: 'm6', label: '6M', method: 'Dietz' },
        { key: 'ytd', label: 'YTD', method: 'TWR' },
        { key: 'y1', label: '1Y', method: 'TWR' },
        { key: 'y5', label: '5Y', method: 'TWR' },
        { key: 'all', label: 'Início', method: 'TWR' },
    ];

    // Info Tooltip
    const MethodTooltip = (
        <Box sx={{ p: 1.5, maxWidth: 320 }}>
            <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ borderBottom: '1px solid rgba(255,255,255,0.2)', pb: 0.5 }}>
                Metodologia de Retorno
            </Typography>

            <Box sx={{ mt: 1.5 }}>
                <Typography variant="body2" gutterBottom>
                    Curto Prazo (1 Ano)
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: 'text.secondary' }}>
                    <strong>Modified Dietz:</strong> Aproximação rápida que pondera os fluxos de caixa (depósitos/levantamentos).
                </Typography>
                <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', p: 0.5, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.7rem', textAlign: 'center', color: '#fff' }}>
                    Retorno = Ganho / (Valor Inicial + 0.5 × Fluxos)
                </Box>
            </Box>

            <Box sx={{ mt: 2 }}>
                <Typography variant="body2" gutterBottom>
                    Longo Prazo (YTD, 1Y+)
                </Typography>
                <Typography variant="caption" sx={{ display: 'block', mb: 0.5, color: 'text.secondary' }}>
                    <strong>Time-Weighted Return (TWR):</strong> Remove o efeito de depósitos/levantamentos para mostrar a real performance da estratégia.
                </Typography>
                <Box sx={{ bgcolor: 'rgba(0,0,0,0.2)', p: 0.5, borderRadius: 1, fontFamily: 'monospace', fontSize: '0.7rem', textAlign: 'center', color: '#fff' }}>
                    TWR = (1 + r₁) × (1 + r₂) × ... - 1
                </Box>
                <Typography variant="caption" sx={{ display: 'block', mt: 0.5, color: 'text.disabled', fontStyle: 'italic' }}>
                    *Gere intervalos vazios (saldo 0) ignorando-os no cálculo.
                </Typography>
            </Box>
        </Box>
    );

    return (
        <Box sx={{ mb: 4 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                    Retornos por Período
                </Typography>
                <Tooltip title={MethodTooltip} arrow placement="right">
                    <IconButton size="small" sx={{ color: 'text.secondary' }}>
                        <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
            
            <Grid container spacing={2}>
                {periods.map((p) => (
                    <Grid item xs={6} sm={4} md={3} lg={1.33} key={p.key}>
                        <PeriodCard 
                            label={p.label} 
                            value={returns[p.key]} 
                            isTwr={p.method === 'TWR'}
                            isLoading={isLoading} 
                        />
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
}