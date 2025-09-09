import React, { useState, useEffect } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Alert, Tabs, Tab, Card, CardContent
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useRealizedGains } from '../hooks/useRealizedGains';
import { UI_TEXT, ALL_YEARS_OPTION, NO_YEAR_SELECTED } from '../constants';
import { formatCurrency } from '../utils/formatUtils';

import ShowChartIcon from '@mui/icons-material/ShowChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';

import StockHoldingsSection from '../components/realizedgainsSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/realizedgainsSections/OptionHoldingsSection';
import StockSalesSection from '../components/realizedgainsSections/StockSalesSection';
import OptionSalesSection from '../components/realizedgainsSections/OptionSalesSection';
import DividendsSection from '../components/realizedgainsSections/DividendsSection';
import OverallPLChart from '../components/realizedgainsSections/OverallPLChart';
import HoldingsAllocationChart from '../components/realizedgainsSections/HoldingsAllocationChart';
import PLContributionChart from '../components/realizedgainsSections/PLContributionChart';
import FeesSection from '../components/realizedgainsSections/FeesSection';

const isDataEmpty = (data) => {
  if (!data) return true;
  
  const hasStockHoldings = data.StockHoldings && Object.keys(data.StockHoldings).some(
    year => data.StockHoldings[year] && data.StockHoldings[year].length > 0
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

const KeyMetricCard = ({ title, value, icon, color }) => {
  const isPositive = value >= 0;
  const bgColor = isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)';
  const textColor = isPositive ? 'success.main' : 'error.main';

  return (
    <Card
      elevation={0}
      sx={{
        display: 'flex',
        alignItems: 'center',
        p: 1.5,
        bgcolor: bgColor,
        borderRadius: 2,
        minWidth: 140,
        flex: '1 1 0',
      }}
    >
      <Box sx={{ mr: 1.5, color: textColor, fontSize: 32 }}>
        {React.cloneElement(icon, { fontSize: 'inherit' })}
      </Box>
      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.2 }}>
          {title}
        </Typography>
        <Typography variant="subtitle1" sx={{ fontWeight: 'bold', color: textColor }}>
          {formatCurrency(value)}
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
    filteredData,
    summaryPLs,
    unrealizedStockPL,
    derivedDividendTaxSummary,
    availableYears,
    holdingsChartData,
    holdingsForGroupedView,
    isHoldingsValueFetching,
    isLoading, 
    isError,
    error,
  } = useRealizedGains(token, selectedYear);

  useEffect(() => {
    if (!isLoading && !isError) {
      if (selectedYear !== ALL_YEARS_OPTION && !availableYears.includes(selectedYear)) {
        setSelectedYear(ALL_YEARS_OPTION);
      }
    }
  }, [availableYears, selectedYear, isLoading, isError]);

  const handleYearChange = (event) => setSelectedYear(event.target.value);
  const handleTabChange = (event, newValue) => setCurrentTab(newValue);
  
  const isGroupedDataLoading = (selectedYear === ALL_YEARS_OPTION || selectedYear === new Date().getFullYear().toString()) 
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
      <Box sx={{
        display: 'flex',
        flexDirection: { xs: 'column', sm: 'row' },
        justifyContent: 'space-between',
        alignItems: { xs: 'flex-start', sm: 'center' },
        mb: 4,
        gap: 2,
      }}>
        <Typography variant="h3" component="h1" sx={{ fontWeight: 'bold' }}>
          Análise de Portefólio
        </Typography>
        <FormControl size="small" sx={{ minWidth: 140, width: { xs: '100%', sm: 'auto' } }}>
          <InputLabel id="year-select-label">Ano</InputLabel>
          <Select
            labelId="year-select-label"
            value={selectedYear}
            label="Ano"
            onChange={handleYearChange}
            disabled={availableYears.length <= 1}
          >
            {availableYears.map(year => (
              <MenuItem key={year} value={year}>
                {year === ALL_YEARS_OPTION ? 'Total' : year}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>

      <Tabs
        value={currentTab}
        onChange={handleTabChange}
        aria-label="portfolio analysis sections"
        variant="scrollable"
        scrollButtons="auto"
        sx={{ mb: 5, borderBottom: 1, borderColor: 'divider' }}
      >
        <Tab label="Visão Geral" value="overview" />
        <Tab label="Ativos" value="holdings" />
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
                  {selectedYear === ALL_YEARS_OPTION && (
                    <KeyMetricCard title="L/P Não Realizado" value={unrealizedStockPL} icon={<TrendingUpIcon />} />
                  )}
                  <KeyMetricCard title="L/P de Ações" value={summaryPLs.stockPL} icon={<ShowChartIcon />} />
                  <KeyMetricCard title="L/P de Opções" value={summaryPLs.optionPL} icon={<CandlestickChartIcon />} />
                  <KeyMetricCard title="Dividendos" value={summaryPLs.dividendPL} icon={<AttachMoneyIcon />} />
                  <KeyMetricCard title="Total L/P" value={summaryPLs.totalPL} icon={<AccountBalanceWalletIcon />} />
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
                  stockSaleDetails={allData.StockSaleDetails || []}
                  optionSaleDetails={allData.OptionSaleDetails || []}
                  dividendTaxResultForChart={derivedDividendTaxSummary}
                  selectedYear={selectedYear}
                />
              </Paper>
            </Grid>
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                <PLContributionChart 
                  stockSaleDetails={allData.StockSaleDetails || []}
                  optionSaleDetails={allData.OptionSaleDetails || []}
                  dividendTaxResultForChart={derivedDividendTaxSummary}
                  dividendTransactionsList={filteredData.DividendTransactionsList || []}
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
            groupedData={holdingsForGroupedView || []}
            detailedData={filteredData.StockHoldings || []}
            isGroupedFetching={isGroupedDataLoading}
            isDetailedFetching={isLoading}
          />
          {/* CORREÇÃO: A renderização agora baseia-se na presença de dados no array filtrado */}
          {filteredData.OptionHoldings && filteredData.OptionHoldings.length > 0 && (
            <OptionHoldingsSection holdingsData={filteredData.OptionHoldings} />
          )}
        </Box>
      )}

      {currentTab === 'stock-sales' && (
        <StockSalesSection stockSalesData={filteredData.StockSaleDetails} selectedYear={selectedYear} />
      )}

      {currentTab === 'option-sales' && (
        <OptionSalesSection optionSalesData={filteredData.OptionSaleDetails} selectedYear={selectedYear} />
      )}

      {currentTab === 'dividends' && (
        <DividendsSection dividendTransactionsData={filteredData.DividendTransactionsList} selectedYear={selectedYear} />
      )}
      {currentTab === 'fees' && (
        <FeesSection 
          feeData={filteredData.FeeDetails} 
          selectedYear={selectedYear} 
        />
      )}
    </Box>
  );
}