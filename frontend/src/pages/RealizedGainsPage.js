// frontend/src/pages/RealizedGainsPage.js
import React, { useState, useEffect, useMemo } from 'react';
import {
  Typography, Box, FormControl, InputLabel, Select, MenuItem,
  Paper, CircularProgress, Grid, Alert, Tabs, Tab, Card
} from '@mui/material'; 
import { Tooltip } from '@mui/material'; 
import { useAuth } from '../context/AuthContext';
import { useRealizedGains } from '../hooks/useRealizedGains';
import { UI_TEXT, ALL_YEARS_OPTION } from '../constants';
import { formatCurrency } from '../utils/formatUtils';

import ShowChartIcon from '@mui/icons-material/ShowChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import SavingsIcon from '@mui/icons-material/Savings'; 
import ThumbUpAltIcon from '@mui/icons-material/ThumbUpAlt'; 
import ThumbDownAltIcon from '@mui/icons-material/ThumbDownAlt'; 

import StockHoldingsSection from '../components/realizedgainsSections/StockHoldingsSection';
import OptionHoldingsSection from '../components/realizedgainsSections/OptionHoldingsSection';
import StockSalesSection from '../components/realizedgainsSections/StockSalesSection';
import OptionSalesSection from '../components/realizedgainsSections/OptionSalesSection';
import DividendsSection from '../components/realizedgainsSections/DividendsSection';
import OverallPLChart from '../components/realizedgainsSections/OverallPLChart';
import HoldingsAllocationChart from '../components/realizedgainsSections/HoldingsAllocationChart';
import PLContributionChart from '../components/realizedgainsSections/PLContributionChart';
import FeesSection from '../components/realizedgainsSections/FeesSection';
import HistoricalPerformanceChart from '../components/realizedgainsSections/HistoricalPerformanceChart';


const isDataEmpty = (data) => {
  if (!data) return true;
  const hasStockHoldings = data.stockHoldingsByYearData && Object.keys(data.stockHoldingsByYearData).some(
    year => data.stockHoldingsByYearData[year] && data.stockHoldingsByYearData[year].length > 0
  );
  return (
    (data.stockSalesData?.length ?? 0) === 0 &&
    (data.optionSalesData?.length ?? 0) === 0 &&
    (data.dividendTransactionsData?.length ?? 0) === 0 &&
    (data.feesData?.length ?? 0) === 0 &&
    !hasStockHoldings &&
    (data.optionHoldingsData?.length ?? 0) === 0
  );
};

const NoRowsOverlay = () => (
  <Box 
    sx={{ 
      display: 'flex', 
      flexDirection: 'column',
      alignItems: 'center', 
      justifyContent: 'center', 
      height: '100%', 
      py: 4, 
      color: 'text.secondary',
      fontSize: '0.9rem'
    }}
  >
    Não existem transações ou posições para este filtro.
  </Box>
);

// Updated Card to support secondary value (Combined Return) and trade text
const KeyMetricCard = ({ title, value, icon, secondaryValue = null, isTrade = false }) => {
  const isPositive = typeof value === 'number' ? value >= 0 : true;
  
  // Define colors
  const bgColor = isTrade ? 'rgba(33, 150, 243, 0.1)' : (isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)');
  const textColor = isTrade ? 'primary.main' : (isPositive ? 'success.main' : 'error.main');
  
  let formattedValue;
  if (isTrade) {
      // For trades, value is { name, value }
      formattedValue = value ? (
          <Box>
              <Typography variant="body2" sx={{ fontWeight: 'bold', lineHeight: 1.2 }}>{value.name}</Typography>
              <Typography variant="caption">{formatCurrency(value.value)}</Typography>
          </Box>
      ) : 'N/A';
  } else {
      formattedValue = formatCurrency(value);
  }

  return (
    <Card elevation={0} sx={{ display: 'flex', alignItems: 'center', p: 1.5, bgcolor: bgColor, borderRadius: 2, minWidth: 140, flex: '1 1 0', height: '100%' }}>
      <Box sx={{ mr: 1.5, color: textColor, fontSize: 32 }}>
        {React.cloneElement(icon, { fontSize: 'inherit' })}
      </Box>
      <Box>
        <Typography variant="subtitle2" color="text.secondary" sx={{ mb: 0.2, fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px' }}>{title}</Typography>
        
        {isTrade ? formattedValue : (
            <Typography variant="h6" sx={{ fontWeight: 'bold', color: textColor, lineHeight: 1.2 }}>
                {formattedValue}
            </Typography>
        )}

        {/* Secondary Value (e.g., Percentage) */}
        {secondaryValue !== null && (
            <Typography variant="body2" sx={{ color: secondaryValue >= 0 ? 'success.main' : 'error.main', fontWeight: 500 }}>
                {secondaryValue >= 0 ? '+' : ''}{secondaryValue.toFixed(2)}%
            </Typography>
        )}
      </Box>
    </Card>
  );
};

export default function RealizedGainsPage() {
  const { token } = useAuth();
  const [selectedYear, setSelectedYear] = useState(ALL_YEARS_OPTION);
  const [currentTab, setCurrentTab] = useState('overview');

  const {
    stockSalesData, optionSalesData, dividendSummaryData,
    dividendTransactionsData, stockHoldingsByYearData, optionHoldingsData,
    feesData, 
    currentHoldingsValueData,
    
    periodSpecificData,
    summaryData,
    unrealizedStockPL,
    derivedDividendTaxSummary,
    availableYears,
    // holdingsChartData, // Removed: Not needed as we pass raw holdings now
    holdingsForGroupedView,
    isHoldingsValueFetching,
    isLoading,
    isError,
    error,
  } = useRealizedGains(token, selectedYear);

  useEffect(() => {
    if (!isLoading && !isError && selectedYear !== ALL_YEARS_OPTION && !availableYears.includes(selectedYear)) {
      setSelectedYear(ALL_YEARS_OPTION);
    }
  }, [availableYears, selectedYear, isLoading, isError]);

  const detailedHoldingsForView = useMemo(() => {
    const holdingsByYear = stockHoldingsByYearData;
    if (!holdingsByYear || Object.keys(holdingsByYear).length === 0) {
      return [];
    }

    const priceMap = {};
    if (currentHoldingsValueData && Array.isArray(currentHoldingsValueData)) {
      currentHoldingsValueData.forEach(holding => {
        if (holding.isin && holding.current_price_eur) {
          priceMap[holding.isin] = holding.current_price_eur;
        }
      });
    }

    const currentSystemYear = new Date().getFullYear().toString();
    let targetData = [];

    if (selectedYear === ALL_YEARS_OPTION || selectedYear === currentSystemYear) {
      const latestYear = Object.keys(holdingsByYear).sort((a, b) => b.localeCompare(a))[0];
      targetData = holdingsByYear[latestYear] || [];
    } else {
      targetData = holdingsByYear[selectedYear] || [];
    }

    return targetData.map(lot => ({
      ...lot,
      current_price_eur: priceMap[lot.isin] || 0
    }));

  }, [stockHoldingsByYearData, selectedYear, currentHoldingsValueData]);

  const handleYearChange = (event) => setSelectedYear(event.target.value);
  const handleTabChange = (event, newValue) => setCurrentTab(newValue);

  const isGroupedHoldingsLoading = (selectedYear === ALL_YEARS_OPTION || selectedYear === new Date().getFullYear().toString())
    ? isHoldingsValueFetching
    : isLoading;

  if (isLoading && isDataEmpty({ stockHoldingsByYearData, stockSalesData, optionSalesData, dividendTransactionsData, feesData, optionHoldingsData })) {
    return <CircularProgress sx={{ display: 'block', margin: 'auto', mt: 6 }} />;
  }

  if (isError) {
    return <Alert severity="error" sx={{ m: 3 }}>{error?.message || UI_TEXT.errorLoadingData}</Alert>;
  }
  
  const hasAnyData = !isDataEmpty({ stockHoldingsByYearData, stockSalesData, optionSalesData, dividendTransactionsData, feesData, optionHoldingsData });

  if (!hasAnyData && !isLoading) {
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
        <Typography variant="h4" component="h1" sx={{ mb: { xs: 2, sm: 0 } }}>Análise de Portefólio</Typography>
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
              {/* METRICS GRID - REWORKED */}
              <Box sx={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 2 }}>
                
                {/* 1. Combined Total Return (Value + %) */}
                <Tooltip title="Resultado líquido total (Realizado + Não Realizado + Dividendos - Custos) e o retorno sobre o capital total depositado." placement="top">
                  <Box>
                    <KeyMetricCard 
                        title="Retorno Total" 
                        value={summaryData.totalPL} 
                        secondaryValue={summaryData.returnPercentage} 
                        icon={<AccountBalanceWalletIcon />} 
                    />
                  </Box>
                </Tooltip>

                {/* 2. Total Invested Capital */}
                <Tooltip title="Montante total de dinheiro depositado na corretora durante o período." placement="top">
                  <Box>
                    <KeyMetricCard 
                        title="Capital Investido" 
                        value={summaryData.totalDeposits} 
                        icon={<SavingsIcon />} 
                        unit="€"
                    />
                  </Box>
                </Tooltip>

                {/* 3. Unrealized PL (Only for All Time) */}
                {selectedYear === ALL_YEARS_OPTION && (
                  <Tooltip title="Lucro/Prejuízo flutuante das posições que ainda detém em carteira." placement="top">
                    <Box><KeyMetricCard title="P/L em Aberto" value={unrealizedStockPL || 0} icon={<TrendingUpIcon />} /></Box>
                  </Tooltip>
                )}

                {/* 4. Best Trade */}
                <Tooltip title="A venda (Ação ou Opção) que gerou o maior lucro individual." placement="top">
                    <Box>
                        <KeyMetricCard 
                            title="Melhor Negócio" 
                            value={summaryData.bestTrade} 
                            icon={<ThumbUpAltIcon />} 
                            isTrade={true}
                        />
                    </Box>
                </Tooltip>

                {/* 5. Worst Trade */}
                <Tooltip title="A venda (Ação ou Opção) que gerou o maior prejuízo individual." placement="top">
                    <Box>
                        <KeyMetricCard 
                            title="Pior Negócio" 
                            value={summaryData.worstTrade} 
                            icon={<ThumbDownAltIcon />} 
                            isTrade={true}
                        />
                    </Box>
                </Tooltip>

                {/* 6. Standard Breakdowns */}
                <Tooltip title="Lucro total realizado com vendas de ações." placement="top">
                  <Box><KeyMetricCard title="Res. Ações" value={summaryData.stockPL} icon={<ShowChartIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Lucro total realizado com opções." placement="top">
                  <Box><KeyMetricCard title="Res. Opções" value={summaryData.optionPL} icon={<CandlestickChartIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Dividendos brutos recebidos." placement="top">
                  <Box><KeyMetricCard title="Dividendos" value={summaryData.dividendPL} icon={<AttachMoneyIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Total de custos operacionais." placement="top">
                  <Box><KeyMetricCard title="Comissões" value={summaryData.totalTaxesAndCommissions} icon={<RequestQuoteIcon />} /></Box>
                </Tooltip>

              </Box>
            </Grid>
            
            {/* HistoricalPerformance Chart */}
            <Grid item xs={12}>
                <HistoricalPerformanceChart />
            </Grid>

            {/* Holdings Chart */}
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ p: 3, height: 400, borderRadius: 3, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <HoldingsAllocationChart holdings={holdingsForGroupedView} />
              </Paper>
            </Grid>
          </Grid>

          {/* Right Column - Charts */}
          <Grid item xs={12} lg={7} container spacing={3} alignContent="flex-start">
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                <OverallPLChart 
                  stockSaleDetails={stockSalesData} 
                  optionSaleDetails={optionSalesData} 
                  dividendTaxResultForChart={derivedDividendTaxSummary} 
                  feesData={feesData}
                  selectedYear={selectedYear} 
                />
              </Paper>
            </Grid>
            <Grid item xs={12}>
              <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                <PLContributionChart 
                    stockSaleDetails={stockSalesData} 
                    optionSaleDetails={optionSalesData} 
                    dividendTaxResultForChart={derivedDividendTaxSummary} 
                    dividendTransactionsList={dividendTransactionsData} 
                    feesData={feesData} 
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
            selectedYear={selectedYear}
            NoRowsOverlay={NoRowsOverlay}
          />
          {periodSpecificData.optionHoldings && (
            <OptionHoldingsSection 
              holdingsData={periodSpecificData.optionHoldings} 
              isLoading={isLoading} 
              NoRowsOverlay={NoRowsOverlay} 
            />
          )}
        </Box>
      )}

      {currentTab === 'stock-sales' && (
        <StockSalesSection 
          stockSalesData={periodSpecificData.stockSales} 
          selectedYear={selectedYear} 
          isLoading={isLoading}
          NoRowsOverlay={NoRowsOverlay}
        />
      )}
      {currentTab === 'option-sales' && (
        <OptionSalesSection 
          optionSalesData={periodSpecificData.optionSales} 
          selectedYear={selectedYear} 
          isLoading={isLoading} 
          NoRowsOverlay={NoRowsOverlay}
        />
      )}
      {currentTab === 'dividends' && (
        <DividendsSection 
          dividendTransactionsData={periodSpecificData.dividendTransactions} 
          selectedYear={selectedYear} 
          isLoading={isLoading} 
          NoRowsOverlay={NoRowsOverlay}
        />
      )}
      {currentTab === 'fees' && (
        <FeesSection 
          feeData={periodSpecificData.fees} 
          selectedYear={selectedYear} 
          isLoading={isLoading}
          NoRowsOverlay={NoRowsOverlay}
        />
      )}
    </Box>
  );
}