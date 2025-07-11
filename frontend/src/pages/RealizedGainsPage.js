// frontend/src/pages/RealizedGainsPage.js

import React, { useState, useEffect } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Alert, Tabs, Tab, Card, CardContent, Divider
} from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { useRealizedGains } from '../hooks/useRealizedGains';
import { UI_TEXT, ALL_YEARS_OPTION } from '../constants';
import { formatCurrency } from '../utils/formatUtils';

// Import custom icons for Key Metrics for better visualization
import ShowChartIcon from '@mui/icons-material/ShowChart'; // for Stocks
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart'; // for Options
import AttachMoneyIcon from '@mui/icons-material/AttachMoney'; // for Dividends
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet'; // for Total

import StockHoldingsSection from '../components/realizedgainsSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/realizedgainsSections/OptionHoldingsSection';
import StockSalesSection from '../components/realizedgainsSections/StockSalesSection';
import OptionSalesSection from '../components/realizedgainsSections/OptionSalesSection';
import DividendsSection from '../components/realizedgainsSections/DividendsSection';
import OverallPLChart from '../components/realizedgainsSections/OverallPLChart';
import HoldingsAllocationChart from '../components/realizedgainsSections/HoldingsAllocationChart';
import PLContributionChart from '../components/realizedgainsSections/PLContributionChart';


const isDataEmpty = (data) => {
  if (!data) return true;
  return (
    (data.StockSaleDetails?.length ?? 0) === 0 &&
    (data.OptionSaleDetails?.length ?? 0) === 0 &&
    (data.DividendTransactionsList?.length ?? 0) === 0 &&
    (data.StockHoldings?.length ?? 0) === 0 &&
    (data.OptionHoldings?.length ?? 0) === 0
  );
};

// A small component for a single Key Metric for better reusability and cleaner code
const KeyMetricCard = ({ title, value, icon, color }) => (
    <Box display="flex" alignItems="center" justifyContent="space-between" py={1.5}>
        <Box display="flex" alignItems="center">
            {React.cloneElement(icon, { sx: { mr: 1.5, color: 'text.secondary' } })}
            <Typography>{title}:</Typography>
        </Box>
        <Typography sx={{ fontWeight: 'medium', color: value >= 0 ? 'success.main' : 'error.main' }}>
            {formatCurrency(value)}
        </Typography>
    </Box>
);

export default function RealizedGainsPage() {
  const { token } = useAuth();
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [currentTab, setCurrentTab] = useState('overview');

  const {
    allData,
    filteredData,
    summaryPLs,
    derivedDividendTaxSummary,
    availableYears,
    holdingsChartData,
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

  if (isLoading) {
    return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 4 }} />;
  }

  if (isError) {
    return <Alert severity="error" sx={{ m: 2 }}>{error?.message || UI_TEXT.errorLoadingData}</Alert>;
  }
  
  if (isDataEmpty(allData)) {
    return (
      <Box sx={{ p: 3, textAlign: 'center', mt: 4 }}>
        <Typography variant="h5" gutterBottom>Análise de Portefólio</Typography>
        <Typography>Sem dados disponíveis. Por favor, carregue primeiro um ficheiro de transações.</Typography>
      </Box>
    );
  }

  return (
    <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
      <Box sx={{ 
        display: 'flex', 
        justifyContent: 'space-between', 
        alignItems: { xs: 'flex-start', sm: 'center' }, 
        flexDirection: { xs: 'column', sm: 'row' },
        mb: 3 
      }}>
        <Typography variant="h4" component="h1" sx={{ mb: { xs: 2, sm: 0 } }}>
          Análise de Portefólio
        </Typography>
        <FormControl 
          sx={{ 
            minWidth: 150,
            width: { xs: '100%', sm: 'auto' } 
          }} 
          size="small"
        >
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
                {year === ALL_YEARS_OPTION ? 'Todos' : year}
              </MenuItem>
            ))}
          </Select>
        </FormControl>
      </Box>
      
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
        <Tabs value={currentTab} onChange={handleTabChange} aria-label="portfolio analysis sections" variant="scrollable" scrollButtons="auto">
          <Tab label="Visão Geral" value="overview" />
          <Tab label="Ativos" value="holdings" />
          <Tab label="Vendas de Ações" value="stock-sales" />
          <Tab label="Vendas de Opções" value="option-sales" />
          <Tab label="Dividendos" value="dividends" />
        </Tabs>
      </Box>

      {/* OVERVIEW TAB - REARRANGED LAYOUT */}
      {currentTab === 'overview' && (
        <Grid container spacing={3}>
            {/* --- TOP ROW --- */}
            {/* MODIFICATION: Adjusted lg props for sizing and positioning */}
            <Grid item xs={12} md={5} lg={5}>
                <Paper elevation={0} sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', border: 'none' }}>
                    <CardContent>
                        <Typography variant="h6" sx={{ mb: 1 }}>Métricas Principais ({selectedYear === ALL_YEARS_OPTION ? 'Acumulado' : selectedYear})</Typography>
                        <KeyMetricCard title="L/P de Ações" value={summaryPLs.stockPL} icon={<ShowChartIcon />} />
                        <KeyMetricCard title="L/P de Oplões" value={summaryPLs.optionPL} icon={<CandlestickChartIcon />} />
                        <KeyMetricCard title="Dividendos" value={summaryPLs.dividendPL} icon={<AttachMoneyIcon />} />
                        <Divider sx={{ my: 1 }} />
                        <Box display="flex" alignItems="center" justifyContent="space-between" pt={1.5}>
                            <Box display="flex" alignItems="center">
                                <AccountBalanceWalletIcon sx={{ mr: 1.5, color: 'text.secondary' }} />
                                <Typography variant="h6" sx={{fontWeight:'bold'}}>Total L/P:</Typography>
                            </Box>
                            <Typography variant="h6" sx={{ fontWeight: 'bold', color: summaryPLs.totalPL >= 0 ? 'success.main' : 'error.main' }}>
                                {formatCurrency(summaryPLs.totalPL)}
                            </Typography>
                        </Box>
                    </CardContent>
                </Paper>
            </Grid>
            <Grid item xs={12} md={7} lg={7}>
                <Paper elevation={0} sx={{ p: 2, height: 400, border: 'none' }}>
                    <HoldingsAllocationChart chartData={holdingsChartData} />
                </Paper>
            </Grid>

            {/* --- BOTTOM ROW --- */}
            <Grid item xs={12} lg={6}>
                <Paper elevation={0} sx={{ p: 2, height: 400, border: 'none' }}>
                    <OverallPLChart
                        stockSaleDetails={allData.StockSaleDetails || []}
                        optionSaleDetails={allData.OptionSaleDetails || []}
                        dividendTaxResultForChart={derivedDividendTaxSummary}
                        selectedYear={selectedYear}
                    />
                </Paper>
            </Grid>
            <Grid item xs={12} lg={6}>
                <Paper elevation={0} sx={{ p: 2, height: 400, border: 'none' }}>
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
      )}

      {/* HOLDINGS TAB */}
      {currentTab === 'holdings' && (
        <>
          <StockHoldingsSection holdingsData={allData.StockHoldings || []} />
          <OptionHoldingsSection holdingsData={allData.OptionHoldings || []} />
        </>
      )}
      
      {/* SALES TABS */}
      {currentTab === 'stock-sales' && (
        <StockSalesSection stockSalesData={filteredData.StockSaleDetails} selectedYear={selectedYear} />
      )}
      {currentTab === 'option-sales' && (
        <OptionSalesSection optionSalesData={filteredData.OptionSaleDetails} selectedYear={selectedYear} />
      )}
      
      {/* DIVIDENDS TAB */}
      {currentTab === 'dividends' && (
        <DividendsSection dividendTransactionsData={filteredData.DividendTransactionsList} selectedYear={selectedYear} />
      )}
    </Box>
  );
}