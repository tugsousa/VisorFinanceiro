import React, { useState, useMemo } from 'react';
import { 
    Box, Typography, FormControl, InputLabel, Select, MenuItem, 
    Grid, Card, CardContent, Divider, Skeleton, Tooltip, IconButton
} from '@mui/material'; 
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'; 
import { useAuth } from '../../auth/AuthContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import DividendsSection from '../components/DividendsSection';
import FutureProjectionChart from '../components/FutureProjectionChart'; // NOVO COMPONENTE
import { ALL_YEARS_OPTION } from '../../../constants';
import { extractYearsFromData, getYearString } from '../../../lib/utils/dateUtils';
import { formatCurrency } from '../../../lib/utils/formatUtils';

// Componente auxiliar para as métricas
const MetricCard = ({ title, value, unit, isPercentage = false, isLoading, tooltipText }) => {
    let displayValue;
    if (isLoading) {
        displayValue = <Skeleton width="60%" />;
    } else if (value === null || value === undefined || isNaN(value)) {
        displayValue = "N/A";
    } else {
        displayValue = isPercentage 
            ? `${value > 0 ? '+' : ''}${value.toFixed(2)}%`
            : formatCurrency(value);
        if (!isPercentage && unit) {
             displayValue = `${value.toFixed(0)} ${unit}`;
        }
    }

    const valueColor = value > 0 ? 'success.main' : (value < 0 ? 'error.main' : 'text.primary');

    return (
        <Card elevation={1} sx={{ height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 2 }}>
            <CardContent sx={{ flexGrow: 1, p: 2 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <Typography 
                        variant="caption" 
                        color="text.secondary" 
                        sx={{ fontWeight: 600, textTransform: 'uppercase', lineHeight: 1 }}
                    >
                        {title}
                    </Typography>
                    {tooltipText && (
                        <Tooltip title={<Typography variant="body2">{tooltipText}</Typography>} placement="top" arrow>
                            <IconButton size="small" sx={{ p: 0, color: 'text.secondary' }}>
                                <InfoOutlinedIcon fontSize="inherit" />
                            </IconButton>
                        </Tooltip>
                    )}
                </Box>
                <Divider sx={{ my: 0.5 }} />
                <Typography 
                    variant="h6" 
                    sx={{ fontWeight: 'bold', color: valueColor, lineHeight: 1.2 }}
                >
                    {displayValue}
                </Typography>
            </CardContent>
        </Card>
    );
};


const DividendsPage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
    // ADICIONADO 'metrics' ao useAnalyticsData
    const { dividendTransactionsData, dividendMetricsData, isLoading } = useAnalyticsData(token, ['dividends', 'metrics']); 

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

    // Métrica: Dividendos Acumulados no Período
    const periodAccumulatedDividends = useMemo(() => {
        return filteredData.reduce((sum, tx) => {
            if (tx.transaction_subtype !== 'TAX') {
                return sum + (tx.amount_eur || 0);
            }
            return sum;
        }, 0);
    }, [filteredData]);

    // Métrica: Imposto Retido no Período
    const periodTaxesWithheld = useMemo(() => {
        return filteredData.reduce((sum, tx) => {
            if (tx.transaction_subtype === 'TAX') {
                return sum + (tx.amount_eur || 0);
            }
            return sum;
        }, 0);
    }, [filteredData]);
    
    // Flag para mostrar se o portfólio tem dados
    const hasAnyData = dividendMetricsData?.hasData === true;
    
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

            {/* NEW: METRICS GRID & PROJECTION CHART */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                {/* Linha 1: Métricas globais/TTM */}
                <Grid item xs={12} container spacing={2}>
                    <Grid item xs={6} sm={3}>
                        <MetricCard 
                            title="Yield Atual" 
                            value={dividendMetricsData?.portfolio_yield} 
                            isPercentage 
                            isLoading={isLoading} 
                            tooltipText="Total de dividendos dos últimos 12 meses (TTM) dividido pelo valor de mercado atual do portfólio."
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <MetricCard 
                            title="Yield on Cost (YOC)" 
                            value={dividendMetricsData?.yield_on_cost} 
                            isPercentage 
                            isLoading={isLoading} 
                            tooltipText="Total de dividendos TTM dividido pelo custo de aquisição (custo total) das posições atuais."
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <MetricCard 
                            title="Dividendo Anual (TTM)" 
                            value={dividendMetricsData?.total_dividends_ttm} 
                            isLoading={isLoading} 
                            tooltipText="Total de dividendos brutos recebidos nos últimos 12 meses."
                        />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <MetricCard 
                            title={`Acumulado (${selectedYear === ALL_YEARS_OPTION ? 'Total' : selectedYear})`} 
                            value={selectedYear === ALL_YEARS_OPTION ? periodAccumulatedDividends : periodAccumulatedDividends} 
                            isLoading={isLoading} 
                            tooltipText="Dividendos brutos acumulados no período selecionado."
                        />
                    </Grid>
                </Grid>

                {/* Linha 2: Gráfico de Projeção */}
                {hasAnyData && (
                    <Grid item xs={12} lg={6}>
                        <FutureProjectionChart metricsData={dividendMetricsData} isLoading={isLoading} />
                    </Grid>
                )}

                {/* Linha 2: Impostos Retidos no Período */}
                <Grid item xs={12} lg={hasAnyData ? 6 : 12}>
                    <Card elevation={0} sx={{ p: 2, height: 350, borderRadius: 3, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                         <Typography variant="h6" component="h3" gutterBottom>Imposto Retido no Período</Typography>
                         <Typography variant="h4" sx={{ color: periodTaxesWithheld < 0 ? 'error.main' : 'text.primary', fontWeight: 'bold' }}>
                            {isLoading ? <Skeleton width="50%" /> : formatCurrency(periodTaxesWithheld)}
                         </Typography>
                         <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                            Este é o valor total de imposto retido na fonte para as transações de dividendos no período selecionado.
                         </Typography>
                         <Typography variant="body2" color="text.secondary" sx={{ mt: 2, fontStyle: 'italic', fontSize: '0.7rem' }}>
                            *O valor é negativo se o seu broker reportar o imposto como um custo.
                         </Typography>
                    </Card>
                </Grid>

            </Grid>

            <Typography variant="h5" sx={{ mb: 2, mt: 4 }}>Transações de Dividendos</Typography>
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