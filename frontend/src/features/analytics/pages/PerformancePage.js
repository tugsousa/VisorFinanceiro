import React, { useState, useMemo } from 'react';
import { Box, Typography, Grid, Paper, FormControl, InputLabel, Select, MenuItem, Card } from '@mui/material';
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

const KPICard = ({ title, value, icon, isPercentage = false, isTrade = false }) => {
    // If it's a trade object {name, value}, check the value. Otherwise check the number directly.
    const numericValue = isTrade ? (value?.value || 0) : value;
    const isPositive = numericValue >= 0;
    
    // Trade cards (Best/Worst) use Blue/Red backgrounds to distinguish them from P/L cards
    const bgColor = isTrade 
        ? 'rgba(33, 150, 243, 0.08)' 
        : (isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)');
        
    const textColor = isTrade 
        ? 'text.primary'
        : (isPositive ? 'success.main' : 'error.main');

    const valueColor = isPositive ? 'success.main' : 'error.main';

    return (
        <Card elevation={0} sx={{ p: 2, bgcolor: bgColor, borderRadius: 2, height: '100%', display: 'flex', alignItems: 'center' }}>
            <Box sx={{ mr: 2, color: isTrade ? 'primary.main' : textColor }}>{icon}</Box>
            <Box sx={{ overflow: 'hidden' }}>
                <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>{title}</Typography>
                
                {isTrade ? (
                    value ? (
                        <>
                            <Typography variant="body2" sx={{ fontWeight: 'bold', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                                {value.name}
                            </Typography>
                            <Typography variant="h6" sx={{ fontWeight: 'bold', color: valueColor }}>
                                {formatCurrency(value.value)}
                            </Typography>
                        </>
                    ) : (
                        <Typography variant="h6" sx={{ color: 'text.secondary' }}>N/A</Typography>
                    )
                ) : (
                    <Typography variant="h6" sx={{ fontWeight: 'bold', color: textColor }}>
                        {isPercentage ? `${value?.toFixed(2)}%` : formatCurrency(value)}
                    </Typography>
                )}
            </Box>
        </Card>
    );
};

const PerformancePage = () => {
    const { token } = useAuth();
    const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
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
                // Note: We usually don't count a single dividend payment as a "Best Trade", 
                // but if you want to include them, uncomment the line below:
                // checkOutlier(`Div: ${d.product_name}`, d.amount_eur);
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
                <Grid item xs={12} sm={6} md={3}>
                    <KPICard title="Total Líquido" value={metrics.total} icon={<AccountBalanceWalletIcon />} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KPICard title="Retorno %" value={metrics.roi} isPercentage icon={<PercentIcon />} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KPICard title="Melhor Negócio" value={metrics.bestTrade} isTrade icon={<ThumbUpAltIcon />} />
                </Grid>
                <Grid item xs={12} sm={6} md={3}>
                    <KPICard title="Pior Negócio" value={metrics.worstTrade} isTrade icon={<ThumbDownAltIcon />} />
                </Grid>

                {/* Secondary Metrics Row */}
                <Grid item xs={6} sm={3}>
                    <KPICard title="Ações" value={metrics.stocks} icon={<ShowChartIcon />} />
                </Grid>
                <Grid item xs={6} sm={3}>
                    <KPICard title="Opções" value={metrics.options} icon={<CandlestickChartIcon />} />
                </Grid>
                <Grid item xs={6} sm={3}>
                    <KPICard title="Dividendos" value={metrics.dividends} icon={<AttachMoneyIcon />} />
                </Grid>
                <Grid item xs={6} sm={3}>
                    <KPICard title="Comissões" value={metrics.fees} icon={<RequestQuoteIcon />} />
                </Grid>
            </Grid>

            {/* Charts */}
            <Grid container spacing={3}>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, height: 400 }}>
                        <OverallPLChart 
                            stockSaleDetails={stockSalesData}
                            optionSaleDetails={optionSalesData}
                            dividendTaxResultForChart={dividendSummaryData}
                            feesData={feesData}
                            selectedYear={selectedYear}
                        />
                    </Paper>
                </Grid>
                <Grid item xs={12} md={6}>
                    <Paper sx={{ p: 2, height: 400 }}>
                        <PLContributionChart 
                            stockSaleDetails={stockSalesData}
                            optionSaleDetails={optionSalesData}
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