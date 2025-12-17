import React, { useState, useMemo, useEffect } from 'react';
import { 
    Box, Typography, FormControl, InputLabel, Select, MenuItem, 
    Grid, Paper, Skeleton, Tooltip, IconButton, useTheme
} from '@mui/material'; 
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'; 
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import TrendingDownIcon from '@mui/icons-material/TrendingDown';
import { useAuth } from '../../auth/AuthContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import DividendsSection from '../components/DividendsSection';
import FutureProjectionChart from '../components/FutureProjectionChart';
import { ALL_YEARS_OPTION } from '../../../constants';
import { extractYearsFromData, getYearString, getMonthIndex } from '../../../lib/utils/dateUtils';
import { formatCurrency } from '../../../lib/utils/formatUtils';

// Componente MetricCard atualizado para ser compacto e semelhante ao Dashboard
const MetricCard = ({ title, value, unit, isPercentage = false, isLoading, tooltipText, colorOverride, subValue }) => {
    const theme = useTheme();

    let displayValue;
    if (isLoading) {
        displayValue = <Skeleton width="60%" />;
    } else if (value === null || value === undefined || isNaN(value)) {
        displayValue = "N/A";
    } else {
        displayValue = isPercentage 
            ? `${value.toFixed(2)}%`
            : formatCurrency(value);
        if (!isPercentage && unit) {
             displayValue = `${value.toFixed(0)} ${unit}`;
        }
    }

    // Lógica de Cores
    let valueColor = 'text.primary'; // Preto por defeito (para Yields)

    if (colorOverride) {
        valueColor = colorOverride;
    } else if (!isPercentage) {
        // Para valores monetários (Total, Médias), usamos verde para indicar lucro
        valueColor = value >= 0 ? 'success.main' : 'error.main';
    } 

    return (
        <Paper
            elevation={0}
            sx={{
                p: 1.5, // Padding reduzido (compacto)
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'center',
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                height: '100%',
                maxHeight: 70, // Altura máxima forçada
                minHeight: 30, // Altura mínima para consistência
                position: 'relative'
            }}
        >
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 0.5 }}>
                <Typography 
                    variant="caption" 
                    color="text.secondary" 
                    sx={{ 
                        fontWeight: 600, 
                        textTransform: 'uppercase', 
                        fontSize: '0.65rem', // Letra do título mais pequena
                        lineHeight: 1
                    }}
                >
                    {title}
                </Typography>
                
                {tooltipText && (
                    <Tooltip title={<Typography variant="body2">{tooltipText}</Typography>} placement="top" arrow>
                        <IconButton size="small" sx={{ p: 0, ml: 1, mt: -0.5, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}>
                            <InfoOutlinedIcon sx={{ fontSize: 16 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            <Typography 
                variant="h6" // Reduzido de h5 para h6
                sx={{ 
                    fontWeight: 700, 
                    color: valueColor, 
                    fontSize: { xs: '1.1rem', md: '1.25rem' }, // Tamanho de letra ajustado
                    lineHeight: 1.2,
                    mt: 0.5,
                    letterSpacing: '-0.5px'
                }}
            >
                {displayValue}
            </Typography>
            
            {subValue && (
                <Box sx={{ mt: 0.5 }}>
                    {subValue}
                </Box>
            )}
        </Paper>
    );
};

const DividendsPage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
    const { dividendTransactionsData, dividendMetricsData, isLoading } = useAnalyticsData(token, ['dividends', 'metrics']); 

    // --- DEBUG PARA VERIFICAR DADOS ---
    useEffect(() => {
        if (!isLoading && dividendMetricsData) {
            // Logs mantidos para debug se necessário
            // console.log("Métricas Recebidas:", dividendMetricsData);
        }
    }, [dividendMetricsData, isLoading]);

    const years = useMemo(() => {
        if (!dividendTransactionsData || dividendTransactionsData.length === 0) return [ALL_YEARS_OPTION];
        const rawYears = extractYearsFromData({ fees: dividendTransactionsData }, { fees: 'date' }); 
        return [ALL_YEARS_OPTION, ...rawYears.filter(y => y !== 'all').sort((a,b) => b.localeCompare(a))];
    }, [dividendTransactionsData]);

    const filteredData = useMemo(() => {
        if (!dividendTransactionsData) return [];
        if (selectedYear === ALL_YEARS_OPTION) return dividendTransactionsData;
        return dividendTransactionsData.filter(d => getYearString(d.date) === selectedYear);
    }, [dividendTransactionsData, selectedYear]);

    const periodMetrics = useMemo(() => {
        const dividendTxs = filteredData.filter(tx => tx.transaction_subtype !== 'TAX');
        const total = dividendTxs.reduce((sum, tx) => sum + (tx.amount_eur || 0), 0);
        
        let monthlyAvg = 0;
        let bestMonthVal = 0;
        let growthPct = null;
        let historicalYield = null;

        if (selectedYear !== ALL_YEARS_OPTION) {
            monthlyAvg = total / 12;

            const monthMap = new Array(12).fill(0);
            dividendTxs.forEach(tx => {
                const mIdx = getMonthIndex(tx.date);
                if (mIdx !== null) monthMap[mIdx] += (tx.amount_eur || 0);
            });
            bestMonthVal = Math.max(...monthMap);

            // Crescimento vs Ano Anterior
            const prevYear = (parseInt(selectedYear) - 1).toString();
            const allTxs = dividendTransactionsData || [];
            const prevYearTotal = allTxs
                .filter(d => getYearString(d.date) === prevYear && d.transaction_subtype !== 'TAX')
                .reduce((sum, tx) => sum + (tx.amount_eur || 0), 0);

            if (prevYearTotal > 0) {
                growthPct = ((total - prevYearTotal) / prevYearTotal) * 100;
            }

            // Yield Histórico (Vem do backend)
            if (dividendMetricsData?.yearly_yields && dividendMetricsData.yearly_yields[selectedYear]) {
                historicalYield = dividendMetricsData.yearly_yields[selectedYear];
            }
        }

        return { total, monthlyAvg, bestMonthVal, growthPct, historicalYield };
    }, [filteredData, selectedYear, dividendTransactionsData, dividendMetricsData]);

    // Atenção: Use snake_case porque é o que vem do backend (has_data)
    const hasAnyData = dividendMetricsData?.has_data === true;
    const isGlobalView = selectedYear === ALL_YEARS_OPTION;

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 3 }}>
                <Typography variant="h4">Dividendos e Rendimento</Typography>
                <FormControl size="small" sx={{ width: 120 }}>
                    <InputLabel>Ano</InputLabel>
                    <Select value={selectedYear} label="Ano" onChange={(e) => setSelectedYear(e.target.value)}>
                        {years.map(y => <MenuItem key={y} value={y}>{y === ALL_YEARS_OPTION ? 'Tudo' : y}</MenuItem>)}
                    </Select>
                </FormControl>
            </Box>

            <Grid container spacing={2} sx={{ mb: 4 }}>
                
                {isGlobalView ? (
                    // === VISTA GERAL (TUDO) ===
                    <>
                        <Grid item xs={12} sm={6} md={3}>
                            <MetricCard 
                                title="Yield Atual (Fwd)" 
                                value={dividendMetricsData?.portfolio_yield} 
                                isPercentage 
                                isLoading={isLoading} 
                                tooltipText="Yield estimado para os próximos 12 meses com base nas posições atuais."
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <MetricCard 
                                title="Yield on Cost (YOC)" 
                                value={dividendMetricsData?.yield_on_cost} 
                                isPercentage 
                                isLoading={isLoading} 
                                tooltipText="Total de dividendos (TTM) a dividir pelo custo total de aquisição das ações."
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <MetricCard 
                                title="Dividendo Anual (TTM)" 
                                value={dividendMetricsData?.total_dividends_ttm} 
                                isLoading={isLoading} 
                                tooltipText="Total de dividendos brutos recebidos nos últimos 12 meses."
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <MetricCard 
                                title="Total Histórico" 
                                value={periodMetrics.total} 
                                isLoading={isLoading} 
                                colorOverride="success.main"
                                tooltipText="Soma de todos os dividendos recebidos desde o início."
                            />
                        </Grid>
                    </>
                ) : (
                    // === VISTA ANUAL (ANO ESPECÍFICO) ===
                    <>
                        <Grid item xs={12} sm={6} md={3}>
                            <MetricCard 
                                title={`Total em ${selectedYear}`} 
                                value={periodMetrics.total} 
                                isLoading={isLoading} 
                                colorOverride="success.main"
                                tooltipText={`Total bruto recebido durante o ano de ${selectedYear}.`}
                                subValue={
                                    periodMetrics.growthPct !== null ? (
                                        <Box sx={{ display: 'flex', alignItems: 'center', color: periodMetrics.growthPct >= 0 ? 'success.main' : 'error.main' }}>
                                            {periodMetrics.growthPct >= 0 ? <TrendingUpIcon fontSize="small" /> : <TrendingDownIcon fontSize="small" />}
                                            <Typography variant="caption" sx={{ ml: 0.5, fontWeight: 'bold' }}>
                                                {periodMetrics.growthPct > 0 ? '+' : ''}{periodMetrics.growthPct.toFixed(1)}% vs {parseInt(selectedYear)-1}
                                            </Typography>
                                        </Box>
                                    ) : null
                                }
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <MetricCard 
                                title={`Yield Real (${selectedYear})`} 
                                value={periodMetrics.historicalYield} 
                                isPercentage
                                isLoading={isLoading} 
                                tooltipText="Yield calculado dividindo os dividendos do ano pelo valor médio do portfólio nesse mesmo ano."
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <MetricCard 
                                title="Média Mensal" 
                                value={periodMetrics.monthlyAvg} 
                                isLoading={isLoading} 
                                tooltipText="Valor total do ano a dividir por 12 meses."
                            />
                        </Grid>
                        <Grid item xs={12} sm={6} md={3}>
                            <MetricCard 
                                title="Melhor Mês" 
                                value={periodMetrics.bestMonthVal} 
                                isLoading={isLoading} 
                                tooltipText="O valor do mês em que recebeu mais dividendos neste ano."
                            />
                        </Grid>
                    </>
                )}

                {/* Gráfico de Projeção (SÓ aparece na vista GERAL) */}
                {isGlobalView && hasAnyData && (
                    <Grid item xs={12} sx={{ mt: 3 }}>
                        <FutureProjectionChart metricsData={dividendMetricsData} isLoading={isLoading} />
                    </Grid>
                )}
            </Grid>

            {/* Espaçamento aumentado para mt: 8 */}
            <Typography variant="h5" sx={{ mb: 2, mt: 8 }}>Histórico de Transações</Typography>
            <DividendsSection 
                dividendTransactionsData={filteredData} 
                selectedYear={selectedYear} 
                isLoading={isLoading} 
                NoRowsOverlay={() => <Box sx={{p:4, textAlign:'center'}}>Sem registo de dividendos.</Box>}
            />
        </Box>
    );
};
export default DividendsPage;