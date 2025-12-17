import React, { useState, useMemo } from 'react';
import { Box, Typography, Grid, Paper, FormControl, InputLabel, Select, MenuItem, Card, Tooltip, IconButton } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { useAnalyticsData } from '../hooks/useAnalyticsData';
import OverallPLChart from '../components/OverallPLChart';
import PLContributionChart from '../components/PLContributionChart';
import { ALL_YEARS_OPTION } from '../../../constants';
import { extractYearsFromData, getYearString } from '../../../lib/utils/dateUtils';
import { formatCurrency } from '../../../lib/utils/formatUtils';
// Icons
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PercentIcon from '@mui/icons-material/Percent';
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt';
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownAlt';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined'; // Novo Icone para Tooltip

// --- ESTILOS TOOLTIP ---
const tooltipComponentsProps = {
    tooltip: {
        sx: {
            bgcolor: 'background.paper',
            color: 'text.primary',
            boxShadow: '0px 4px 20px rgba(0,0,0,0.15)',
            borderRadius: 3,
            maxWidth: 300,
            p: 1.5
        }
    },
    arrow: {
        sx: { color: 'background.paper' }
    }
};

const RichTooltipContent = ({ title, description }) => (
    <Box>
        <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ color: 'text.primary', mb: 0.5 }}>
            {title}
        </Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.4, color: 'text.secondary', fontSize: '0.8rem' }}>
            {description}
        </Typography>
    </Box>
);

// REVERTIDO: KPICard para p:1.5 e h6, com espaçamento ajustado.
// ADICIONADO: Propriedade 'tooltip'
const KPICard = ({ title, value, icon, isPercentage = false, isTrade = false, secondaryValue, tooltip }) => {
    const numericValue = isTrade ? (value?.value || 0) : value;
    const isPositive = numericValue >= 0;
    
    // Conditional color for performance metrics (green/red)
    const performanceColor = isPositive ? 'success.main' : 'error.main';
    
    // Determine primary color: use performance color only if it's performance related
    const primaryColor = (
        title.includes('Líquido') || 
        title.includes('Retorno') || 
        title.includes('Negócio') || 
        title === 'Ações' || 
        title === 'Opções' || 
        title === 'Dividendos'
    )
        ? performanceColor
        : 'text.primary'; // Default for non-P/L metrics

    // Override commission color to error.main regardless of sign
    const finalColor = title === 'Comissões' ? 'error.main' : primaryColor;

    let formattedValue;
    if (isTrade) {
        formattedValue = value ? (
            <Box>
                <Typography variant="caption" sx={{ fontWeight: 'bold', lineHeight: 1.2, textAlign: 'left' }}>
                    {value.name}
                </Typography>
                <Typography variant="body2" sx={{ color: performanceColor, textAlign: 'left' }}>
                    {formatCurrency(value.value)}
                </Typography>
            </Box>
        ) : (
            // REVERTIDO: para h6
            <Typography variant="h6" sx={{ color: 'text.secondary', textAlign: 'left' }}>N/A</Typography>
        );
    } else {
        formattedValue = (
            // REVERTIDO: para h6
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: finalColor, textAlign: 'left' }}>
                {isPercentage ? `${value?.toFixed(2)}%` : formatCurrency(value)}
            </Typography>
        );
    }

    return (
        <Card 
            elevation={0} 
            sx={{ 
                // REVERTIDO: para p: 1.5 (12px padding)
                p: 1.5, 
                bgcolor: 'background.paper', 
                border: theme => `1px solid ${theme.palette.divider}`,
                borderRadius: 2, 
                height: '100%', 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'center', 
                textAlign: 'left', 
            }}
        >
            {/* Título e Tooltip - Alinhado à esquerda */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
                <Typography 
                    variant="caption" 
                    color="text.secondary" 
                    sx={{ 
                        // REVERTIDO: para font original (0.75rem)
                        fontSize: '0.75rem', 
                        fontWeight: 600, 
                        textTransform: 'uppercase', 
                        lineHeight: 1,
                    }}
                >
                    {title}
                </Typography>
                
                {/* Lógica do Tooltip */}
                {tooltip && (
                    <Tooltip title={tooltip} placement="top" arrow componentsProps={tooltipComponentsProps}>
                        <IconButton size="small" sx={{ p: 0, ml: 0.5, color: 'text.disabled', '&:hover': { color: 'primary.main' } }}>
                            <InfoOutlinedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>

            {/* Valor - Alinhado à esquerda */}
            <Box sx={{ minHeight: 30, display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                {formattedValue}
                {/* Secondary Value (e.g., Percentage) - Only rendered if provided */}
                {secondaryValue !== null && secondaryValue !== undefined && (
                    <Typography variant="body2" sx={{ color: performanceColor, fontWeight: 500, mt: 0.25, textAlign: 'left' }}>
                        {secondaryValue >= 0 ? '+' : ''}{secondaryValue.toFixed(2)}%
                    </Typography>
                )}
            </Box>
        </Card>
    );
};

const PerformancePage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
    const [currentTab, setCurrentTab] = useState('overview');
    const { stockSalesData, optionSalesData, dividendSummaryData, dividendTransactionsData, feesData, isLoading } = useAnalyticsData(token, ['all']);
    
    // 1. Extract Years
    const years = useMemo(() => {
        if (isLoading) return [ALL_YEARS_OPTION];
        const rawYears = extractYearsFromData({
            stockSales: stockSalesData,
            optionSales: optionSalesData,
            DividendTaxResult: dividendSummaryData,
            fees: feesData
        }, { stockSales: 'SaleDate', optionSales: 'close_date', DividendTaxResult: null, fees: 'date' });
        return [ALL_YEARS_OPTION, ...rawYears.filter(y => y !== 'all').sort((a,b) => b.localeCompare(a))];
    }, [stockSalesData, optionSalesData, dividendSummaryData, feesData, isLoading]);

    // 2. Calculate Summary KPIs + Best/Worst Trades
    const metrics = useMemo(() => {
        const res = { 
            stocks: 0, 
            options: 0, 
            dividends: 0, 
            fees: 0, 
            total: 0, 
            roi: 0,
            bestTrade: null,
            worstTrade: null
        };
        let bestVal = -Infinity;
        let worstVal = Infinity;

        // Helper to check for best/worst
        const checkOutlier = (name, val) => {
            if (val > bestVal) { bestVal = val; res.bestTrade = { name, value: val }; }
            if (val < worstVal) { worstVal = val; res.worstTrade = { name, value: val }; }
        };

        const isYearMatch = (dateStr) => selectedYear === ALL_YEARS_OPTION || getYearString(dateStr) === selectedYear;

        // Stocks
        stockSalesData?.forEach(s => {
            if (isYearMatch(s.SaleDate)) {
                const val = s.Delta || 0;
                res.stocks += val;
                checkOutlier(s.ProductName, val); // Track individual trade
            }
        });

        // Options
        optionSalesData?.forEach(o => {
            if (isYearMatch(o.close_date)) {
                const val = o.delta || 0;
                res.options += val;
                checkOutlier(o.product_name, val); // Track individual trade
            }
        });

        // Dividends
        dividendTransactionsData?.forEach(d => {
            if (d.transaction_subtype !== 'TAX' && isYearMatch(d.date)) {
                res.dividends += (d.amount_eur || 0);
            }
        });

        // Fees
        feesData?.forEach(f => {
            if (isYearMatch(f.date)) res.fees += (f.amount_eur || 0);
        });

        res.total = res.stocks + res.options + res.dividends + res.fees;

        // ROI Calculation
        let totalCostBasis = 0;
        stockSalesData?.forEach(s => { if (isYearMatch(s.SaleDate)) totalCostBasis += Math.abs(s.BuyAmountEUR || 0); });
        optionSalesData?.forEach(o => { if (isYearMatch(o.close_date)) totalCostBasis += Math.abs(o.open_amount_eur || 0); });
        
        if (totalCostBasis > 0) {
            res.roi = (res.total / totalCostBasis) * 100;
        }

        return res;
    }, [stockSalesData, optionSalesData, dividendTransactionsData, feesData, selectedYear]);

    // --- Definição dos conteúdos Tooltip ---
    const tooltips = {
        total: <RichTooltipContent title="Total Líquido" description="Resultado final somando Ações, Opções e Dividendos, subtraindo as Comissões." />,
        roi: <RichTooltipContent title="Retorno % (ROI)" description="Percentagem de retorno sobre o capital investido nas posições fechadas." />,
        best: <RichTooltipContent title="Melhor Negócio" description="O trade individual que gerou o maior lucro absoluto no período." />,
        worst: <RichTooltipContent title="Pior Negócio" description="O trade individual que gerou o maior prejuízo absoluto no período." />,
        stocks: <RichTooltipContent title="Ações" description="Lucro ou prejuízo realizado exclusivamente com a compra e venda de Ações/ETFs." />,
        options: <RichTooltipContent title="Opções" description="Resultado financeiro obtido com o fecho de contratos de Opções." />,
        dividends: <RichTooltipContent title="Dividendos" description="Total de dividendos recebidos (brutos) durante o período." />,
        fees: <RichTooltipContent title="Comissões" description="Total gasto em taxas de transação e custos de corretagem." />,
    };

    return (
        <Box sx={{ p: 3 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4">Performance Global</Typography>
                <FormControl size="small" sx={{ width: 140 }}>
                    <InputLabel>Ano</InputLabel>
                    <Select value={selectedYear} label="Ano" onChange={(e) => setSelectedYear(e.target.value)}>
                        {years.map(y => <MenuItem key={y} value={y}>{y === 'all' ? 'Tudo' : y}</MenuItem>)}
                    </Select>
                </FormControl>
            </Box>
            
            {/* KPI GRID - 4 Columns Layout */}
            <Grid container spacing={2} sx={{ mb: 4 }}>
                {/* LINHA 1: KPIs Principais. */}
                <Grid container item xs={12} spacing={2} sx={{ mb: 3 }}>
                    <Grid item xs={12} sm={6} md={3}>
                        <KPICard title="Total Líquido" value={metrics.total} icon={<AccountBalanceWalletIcon />} tooltip={tooltips.total} />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <KPICard title="Retorno %" value={metrics.roi} isPercentage icon={<PercentIcon />} tooltip={tooltips.roi} />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <KPICard title="Melhor Negócio" value={metrics.bestTrade} isTrade icon={<ThumbUpAltIcon />} tooltip={tooltips.best} />
                    </Grid>
                    <Grid item xs={12} sm={6} md={3}>
                        <KPICard title="Pior Negócio" value={metrics.worstTrade} isTrade icon={<ThumbDownAltIcon />} tooltip={tooltips.worst} />
                    </Grid>
                </Grid>
                
                {/* LINHA 2: KPIs de Detalhe. */}
                <Grid container item xs={12} spacing={2}> 
                    <Grid item xs={6} sm={3}>
                        <KPICard title="Ações" value={metrics.stocks} icon={<ShowChartIcon />} tooltip={tooltips.stocks} />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <KPICard title="Opções" value={metrics.options} icon={<CandlestickChartIcon />} tooltip={tooltips.options} />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <KPICard title="Dividendos" value={metrics.dividends} icon={<AttachMoneyIcon />} tooltip={tooltips.dividends} />
                    </Grid>
                    <Grid item xs={6} sm={3}>
                        <KPICard title="Comissões" value={metrics.fees} icon={<RequestQuoteIcon />} tooltip={tooltips.fees} />
                    </Grid>
                </Grid>
            </Grid>
            
            {/* Charts */}
            <Grid container spacing={3}>
                {/* CHART 1: Overall PL Chart (Removed border) */}
                <Grid item xs={12} md={6}>
                    <Paper elevation={0} sx={{ p: 2, height: 400, border: 'none' }}>
                        <OverallPLChart 
                            stockSaleDetails={stockSalesData}
                            optionSalesData={optionSalesData}
                            dividendTaxResultForChart={dividendSummaryData}
                            feesData={feesData}
                            selectedYear={selectedYear}
                        />
                    </Paper>
                </Grid>
                {/* CHART 2: PL Contribution Chart (Removed border) */}
                <Grid item xs={12} md={6}>
                    <Paper elevation={0} sx={{ p: 2, height: 400, border: 'none' }}>
                        <PLContributionChart 
                            stockSaleDetails={stockSalesData}
                            optionSalesData={optionSalesData}
                            dividendTaxResultForChart={dividendSummaryData}
                            dividendTransactionsList={dividendTransactionsData}
                            feesData={feesData}
                            selectedYear={selectedYear}
                        />
                    </Paper>
                </Grid>
            </Grid>
        </Box>
    );
};

export default PerformancePage;