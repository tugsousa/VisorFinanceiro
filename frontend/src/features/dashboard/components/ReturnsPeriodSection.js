import React, { useMemo } from 'react';
import { Box, Paper, Typography, Grid, Skeleton, Tooltip, IconButton, Divider } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';

const PeriodCard = ({ label, value, isLoading, type }) => {
    let color = 'text.secondary';
    let displayValue = '-';

    if (value !== null && value !== undefined && !isNaN(value)) {
        if (value > 0) color = 'success.main';
        if (value < 0) color = 'error.main';
        if (Math.abs(value) > 100000) displayValue = '>999%';
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
            
            {/* Pequena etiqueta discreta para identificar o método usado */}
             {value !== null && (
                <Typography variant="caption" sx={{ fontSize: '0.6rem', color: 'text.disabled', position: 'absolute', bottom: 2, right: 6 }}>
                    {type}
                </Typography>
            )}
        </Paper>
    );
};

export default function ReturnsPeriodSection({ historicalData, currentMetrics, isLoading }) {
    const returns = useMemo(() => {
        if (!historicalData || historicalData.length === 0) return {};

        const sortedData = [...historicalData].sort((a, b) => a.date.localeCompare(b.date));

        // --- CÁLCULO 1: TWR (Para períodos parciais como 1A, 5A) ---
        // Replica a lógica do gráfico de evolução (Performance da Estratégia)
        const twrSeries = [];
        let currentIndex = 1.0;
        const MIN_BALANCE = 50; 
        
        let startIndex = sortedData.findIndex(d => d.portfolio_value > MIN_BALANCE);
        if (startIndex === -1) startIndex = 0;

        for (let i = 0; i < sortedData.length; i++) {
            const curr = sortedData[i];
            
            if (i <= startIndex) {
                twrSeries.push({ date: curr.date, index: 1.0 });
                continue;
            }

            const prev = sortedData[i-1];
            
            if (prev.portfolio_value < MIN_BALANCE) {
                 twrSeries.push({ date: curr.date, index: currentIndex });
                 continue;
            }

            const dailyFlow = curr.cumulative_cash_flow - prev.cumulative_cash_flow;
            let dailyReturn = (curr.portfolio_value - dailyFlow) / prev.portfolio_value - 1;
            
            if (dailyReturn > 5 || dailyReturn < -0.9) dailyReturn = 0;

            currentIndex *= (1 + dailyReturn);
            twrSeries.push({ date: curr.date, index: currentIndex });
        }

        const calculateTWR = (startDate) => {
            if (twrSeries.length === 0) return 0;
            const endPoint = twrSeries[twrSeries.length - 1]; 
            
            if (!startDate) return 0; 

            const startIso = startDate.toISOString().split('T')[0];
            const startPoint = twrSeries.find(p => p.date >= startIso) || twrSeries[0];

            if (!startPoint || startPoint.index === 0) return 0;
            return ((endPoint.index / startPoint.index) - 1) * 100;
        };

        // --- CÁLCULO 2: ROI Simples (Exclusivo para All Time) ---
        // Performance do Dinheiro Real
        const calculateTotalROI = () => {
             if (!currentMetrics) return 0;
             const invested = currentMetrics.netDeposits || 1;
             const gain = currentMetrics.totalPL; 
             
             if (invested === 0) return 0;
             return (gain / invested) * 100;
        };

        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const oneWeekAgo = new Date(today); oneWeekAgo.setDate(today.getDate() - 7);
        const oneMonthAgo = new Date(today); oneMonthAgo.setMonth(today.getMonth() - 1);
        const threeMonthsAgo = new Date(today); threeMonthsAgo.setMonth(today.getMonth() - 3);
        const sixMonthsAgo = new Date(today); sixMonthsAgo.setMonth(today.getMonth() - 6);
        const startOfYear = new Date(today.getFullYear(), 0, 1);
        const oneYearAgo = new Date(today); oneYearAgo.setFullYear(today.getFullYear() - 1);
        const fiveYearsAgo = new Date(today); fiveYearsAgo.setFullYear(today.getFullYear() - 5);

        return {
            today: currentMetrics?.dailyChangePct,
            w1: { val: calculateTWR(oneWeekAgo), type: 'TWR' },
            m1: { val: calculateTWR(oneMonthAgo), type: 'TWR' },
            m3: { val: calculateTWR(threeMonthsAgo), type: 'TWR' },
            m6: { val: calculateTWR(sixMonthsAgo), type: 'TWR' },
            ytd: { val: calculateTWR(startOfYear), type: 'TWR' },
            y1: { val: calculateTWR(oneYearAgo), type: 'TWR' },
            y5: { val: calculateTWR(fiveYearsAgo), type: 'TWR' },
            all: { val: calculateTotalROI(), type: 'ROI' } 
        };
    }, [historicalData, currentMetrics]);

    const periods = [
        { key: 'today', label: 'Hoje' },
        { key: 'w1', label: '1W' },
        { key: 'm1', label: '1M' },
        { key: 'm3', label: '3M' },
        { key: 'm6', label: '6M' },
        { key: 'ytd', label: 'YTD' },
        { key: 'y1', label: '1Y' },
        { key: 'y5', label: '5Y' },
        { key: 'all', label: 'Início' },
    ];

    // --- DESCRIÇÃO DO CÁLCULO (TOOLTIP/MODAL) ---
    const CalculationInfo = (
        <Box sx={{ p: 2, maxWidth: 350 }}>
            <Typography variant="subtitle2" sx={{ fontWeight: 'bold', mb: 1 }}>
                Como são calculados os retornos?
            </Typography>
            
            <Box sx={{ mb: 2 }}>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Períodos (1S a 5A): TWR
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.4, display: 'block' }}>
                    Utiliza o <em>Time-Weighted Return</em>. Mede a performance da sua estratégia dia a dia, ignorando o impacto de depositar ou levantar dinheiro. É ideal para comparar a evolução do portfólio com o mercado.
                </Typography>
            </Box>

            <Divider sx={{ my: 1, borderColor: 'rgba(255,255,255,0.1)' }} />

            <Box>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>
                    Desde o Início: ROI
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.4, display: 'block' }}>
                    Utiliza o <em>Retorno sobre Investimento</em>. Mostra o crescimento efetivo do seu património real. <br/>
                    Fórmula: <code>(Lucro Total / Capital Investido)</code>.
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
                
                {/* Ícone de Informação com Tooltip */}
                <Tooltip 
                    title={CalculationInfo} 
                    arrow 
                    placement="right"
                    componentsProps={{
                        tooltip: {
                            sx: {
                                bgcolor: 'background.paper',
                                border: '1px solid',
                                borderColor: 'divider',
                                color: 'text.primary',
                                boxShadow: 3
                            }
                        }
                    }}
                >
                    <IconButton size="small" sx={{ color: 'text.secondary', '&:hover': { color: 'primary.main' } }}>
                        <InfoOutlinedIcon fontSize="small" />
                    </IconButton>
                </Tooltip>
            </Box>
            
            <Grid container spacing={2}>
                {periods.map((p) => {
                    const data = returns[p.key];
                    const value = data?.val !== undefined ? data.val : data;
                    const type = data?.type || '';

                    return (
                        <Grid item xs={6} sm={4} md={3} lg={1.33} key={p.key}>
                            <PeriodCard 
                                label={p.label} 
                                value={value} 
                                type={type}
                                isLoading={isLoading} 
                            />
                        </Grid>
                    );
                })}
            </Grid>
        </Box>
    );
}