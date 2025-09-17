// frontend/src/pages/RealizedGainsPage.js
import React, { useState, useEffect, useMemo } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Alert, Tabs, Tab, Card, Tooltip
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useRealizedGains } from '../hooks/useRealizedGains';
import { UI_TEXT, ALL_YEARS_OPTION } from '../constants';
import { formatCurrency } from '../utils/formatUtils';

// --- INÍCIO DA CORREÇÃO ---
// Importações em falta
import PercentIcon from '@mui/icons-material/Percent';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';

import StockHoldingsSection from '../components/realizedgainsSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/realizedgainsSections/OptionHoldingsSection';
import StockSalesSection from '../components/realizedgainsSections/StockSalesSection';
import OptionSalesSection from '../components/realizedgainsSections/OptionSalesSection';
import DividendsSection from '../components/realizedgainsSections/DividendsSection';
import OverallPLChart from '../components/realizedgainsSections/OverallPLChart';
import HoldingsAllocationChart from '../components/realizedgainsSections/HoldingsAllocationChart';
import PLContributionChart from '../components/realizedgainsSections/PLContributionChart';
import FeesSection from '../components/realizedgainsSections/FeesSection';
// --- FIM DA CORREÇÃO ---


const isDataEmpty = (data) => {
  if (!data) return true;
  const hasStockHoldings = data.StockHoldingsByYear && Object.keys(data.StockHoldingsByYear).some(
    year => data.StockHoldingsByYear[year] && data.StockHoldingsByYear[year].length > 0
  );
  return (
    (data.StockSaleDetails?.length ?? 0) === 0 &&
    (data.OptionSaleDetails?.length ?? 0) === 0 &&
    (data.DividendTransactionsList?.length ?? 0) === 0 &&
    (data.FeeDetails?.length ?? 0) === 0 &&
    !hasStockHoldings &&
    (data.OptionHoldings?.length ?? 0) === 0
  );
};

const KeyMetricCard = ({ title, value, icon, isPercentage = false }) => {
  const isPositive = value >= 0;
  const bgColor = isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)';
  const textColor = isPositive ? 'success.main' : 'error.main';
  const formattedValue = isPercentage ? `${value.toFixed(2)}%` : formatCurrency(value);

  return (
    <Card elevation={0} sx={{ display: 'flex', alignItems: 'center', p: 1.5, bgcolor: bgColor, borderRadius: 2, minWidth: 140, flex: '1 1 0' }}>
      <Box sx={{ mr: 1.5, color: textColor, fontSize: 32 }}>
        {React.cloneElement(icon, { fontSize: 'inherit' })}
      </Box>
      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.2 }}>{title}</Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: textColor }}>
          {formattedValue}
        </Typography>
      </Box>
    </Card>
  );
};

export default function RealizedGainsPage() {
  const { token } = useAuth();
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [currentTab, setCurrentTab] = useState('overview');

  const {
    allData,
    periodSpecificData,
    summaryData,
    unrealizedStockPL,
    derivedDividendTaxSummary,
    availableYears,
    holdingsChartData,
    holdingsForGroupedView,
    isHoldingsValueFetching,
    isLoading,
    isError,
    error,
    portfolioMetrics,
  } = useRealizedGains(token, selectedYear);

  useEffect(() => {
    if (!isLoading && !isError && selectedYear !== ALL_YEARS_OPTION && !availableYears.includes(selectedYear)) {
      setSelectedYear(ALL_YEARS_OPTION);
    }
  }, [availableYears, selectedYear, isLoading, isError]);

  const detailedHoldingsForView = useMemo(() => {
    if (!allData.StockHoldingsByYear) return [];
    if (selectedYear === ALL_YEARS_OPTION) {
      return Object.values(allData.StockHoldingsByYear).flat();
    }
    return allData.StockHoldingsByYear[selectedYear] || [];
  }, [allData.StockHoldingsByYear, selectedYear]);


  const handleYearChange = (event) => setSelectedYear(event.target.value);
  const handleTabChange = (event, newValue) => setCurrentTab(newValue);

  const isGroupedHoldingsLoading = (selectedYear === ALL_YEARS_OPTION || selectedYear === new Date().getFullYear().toString())
    ? isHoldingsValueFetching
    : isLoading;

  if (isLoading) {
    return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 6 }} />;
  }

  if (isError) {
    return <Alert severity="error" sx={{ m: 3 }}>{error?.message || UI_TEXT.errorLoadingData}</Alert>;
  }

  if (isDataEmpty(allData)) {
    return (
      <Box sx={{ p: 4, textAlign: 'center' }}>
        <Typography variant="h4" gutterBottom>Análise de Portefólio</Typography>
        <Typography variant="body1">Sem dados disponíveis. Por favor, carregue primeiro um ficheiro de transações.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 4, md: 6 }, maxWidth: 1200, mx: 'auto' }}>
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', sm: 'row' }, justifyContent: 'space-between', alignItems: { xs: 'flex-start', sm: 'center' }, mb: 4, gap: 2 }}>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 'bold' }}>Análise de Portefólio</Typography>
        <FormControl size="small" sx={{ minWidth: 140, width: { xs: '100%', sm: 'auto' } }}>
          <InputLabel id="year-select-label">Ano</InputLabel>
          <Select labelId="year-select-label" value={selectedYear} label="Ano" onChange={handleYearChange} disabled={availableYears.length <= 1}>
            {availableYears.map(year => (<MenuItem key={year} value={year}>{year === ALL_YEARS_OPTION ? 'Total' : year}</MenuItem>))}
          </Select>
        </FormControl>
      </Box>

      <Tabs value={currentTab} onChange={handleTabChange} aria-label="portfolio analysis sections" variant="scrollable" scrollButtons="auto" sx={{ mb: 5, borderBottom: 1, borderColor: 'divider' }}>
        <Tab label="Visão Geral" value="overview" />
        <Tab label="Carteira" value="holdings" />
        <Tab label="Vendas de Ações" value="stock-sales" />
        <Tab label="Vendas de Opções" value="option-sales" />
        <Tab label="Dividendos" value="dividends" />
        <Tab label="Taxas e Comissões" value="fees" />
      </Tabs>

      {currentTab === 'overview' && (
        <Grid container spacing={3}>
          <Grid item xs={12} lg={5} container spacing={3} alignContent="flex-start">
            <Grid item xs={12}>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Tooltip title="Lucro ou prejuízo total realizado com a venda de ações no período selecionado." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Resultado Ações" value={summaryData.stockPL} icon={<ShowChartIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Lucro ou prejuízo total realizado com o fecho de posições de opções no período selecionado." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Resultado Opções" value={summaryData.optionPL} icon={<CandlestickChartIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Montante líquido recebido em dividendos (após impostos retidos na fonte) no período selecionado." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Dividendos" value={summaryData.dividendPL} icon={<AttachMoneyIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Soma de todas as taxas e comissões pagas no período selecionado." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Taxas e Comissões" value={summaryData.totalTaxesAndCommissions} icon={<RequestQuoteIcon />} /></Box>
                </Tooltip>
                {selectedYear === ALL_YEARS_OPTION && (<>
                  <Tooltip title="Diferença entre o custo de aquisição e o valor de mercado atual das suas posições em aberto." placement="top">
                    <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="P/L em Aberto" value={unrealizedStockPL || 0} icon={<TrendingUpIcon />} /></Box>
                  </Tooltip>
                  <Tooltip title="Rentabilidade total do portfólio desde o início, considerando o valor atual, lucros realizados e capital investido." placement="top">
                    <Box sx={{ flex: '1 1 0', minWidth: 140 }}>
                      <KeyMetricCard title="Retorno Total (%)" value={portfolioMetrics.portfolioReturn} icon={<PercentIcon />} isPercentage={true} />
                    </Box>
                  </Tooltip>
                </>)}
                <Tooltip title="Resultado líquido do período (Ganhos - Custos). Na vista 'Total', inclui também o 'P/L em Aberto'." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Retorno Total" value={summaryData.totalPL} icon={<AccountBalanceWalletIcon />} /></Box>
                </Tooltip>
              </Box>
            </Grid>
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ p: 3, height: 400, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HoldingsAllocationChart chartData={holdingsChartData} />
              </Paper>
            </Grid>
          </Grid>
          <Grid item xs={12} lg={7} container spacing={3} alignContent="flex-start">
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                <OverallPLChart 
                  stockSaleDetails={allData.StockSaleDetails} 
                  optionSaleDetails={allData.OptionSaleDetails} 
                  dividendTaxResultForChart={derivedDividendTaxSummary} 
                  feesData={allData.FeeDetails}
                  selectedYear={selectedYear} 
                />
              </Paper>
            </Grid>
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                <PLContributionChart 
                    stockSaleDetails={allData.StockSaleDetails} 
                    optionSaleDetails={allData.OptionSaleDetails} 
                    dividendTaxResultForChart={derivedDividendTaxSummary} 
                    dividendTransactionsList={allData.DividendTransactionsList} 
                    feesData={periodSpecificData.fees} 
                    selectedYear={selectedYear} 
                />
              </Paper>
            </Grid>
          </Grid>
        </Grid>
      )}

      {currentTab === 'holdings' && (
        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <StockHoldingsSection
            groupedData={holdingsForGroupedView}
            detailedData={detailedHoldingsForView}
            isGroupedFetching={isGroupedHoldingsLoading}
            isDetailedFetching={isLoading}
          />
          {periodSpecificData.optionHoldings && periodSpecificData.optionHoldings.length > 0 && (
            <OptionHoldingsSection holdingsData={periodSpecificData.optionHoldings} />
          )}
        </Box>
      )}

      {currentTab === 'stock-sales' && (<StockSalesSection stockSalesData={periodSpecificData.stockSales} selectedYear={selectedYear} />)}
      {currentTab === 'option-sales' && (<OptionSalesSection optionSalesData={periodSpecificData.optionSales} selectedYear={selectedYear} />)}
      {currentTab === 'dividends' && (<DividendsSection dividendTransactionsData={periodSpecificData.dividendTransactions} selectedYear={selectedYear} />)}
      {currentTab === 'fees' && (<FeesSection feeData={periodSpecificData.fees} selectedYear={selectedYear} />)}
    </Box>
  );
}