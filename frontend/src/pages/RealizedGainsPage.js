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

import PercentIcon from '@mui/icons-material/Percent';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents'; 
import TimelapseIcon from '@mui/icons-material/Timelapse';

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

// --- Componente para o slot NoRowsOverlay (Reutilizável) ---
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

const KeyMetricCard = ({ title, value, icon, isPercentage = false, unit = '' }) => {
  const isPositive = typeof value === 'number' ? value >= 0 : true;
  // Ajustar a cor de fundo para métricas neutras como a duração
  const bgColor = unit ? 'rgba(63, 81, 181, 0.1)' : (isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)');
  const textColor = unit ? 'primary.main' : (isPositive ? 'success.main' : 'error.main');
  
  const formattedValue = isPercentage 
    ? `${(value || 0).toFixed(2)}%` 
    : (unit ? `${(value || 0).toFixed(0)} ${unit}` : formatCurrency(value));

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
    stockSalesData, optionSalesData, dividendSummaryData,
    dividendTransactionsData, stockHoldingsByYearData, optionHoldingsData,
    feesData, 
    currentHoldingsValueData, // <--- NOVA EXTRAÇÃO AQUI
    
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

  // --- LÓGICA ATUALIZADA PARA O MODO DETALHADO ---
  const detailedHoldingsForView = useMemo(() => {
    const holdingsByYear = stockHoldingsByYearData;
    if (!holdingsByYear || Object.keys(holdingsByYear).length === 0) {
      return [];
    }

    // 1. Criar mapa de preços (ISIN -> Preço Atual)
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

    // Se "Total" ou o ano corrente for selecionado, mostrar o snapshot mais recente
    if (selectedYear === ALL_YEARS_OPTION || selectedYear === currentSystemYear) {
      const latestYear = Object.keys(holdingsByYear).sort((a, b) => b.localeCompare(a))[0];
      targetData = holdingsByYear[latestYear] || [];
    } else {
      // Para anos históricos, mostrar os dados desse ano específico
      targetData = holdingsByYear[selectedYear] || [];
    }

    // 2. Injetar o preço atual em cada lote de compra
    return targetData.map(lot => ({
      ...lot,
      current_price_eur: priceMap[lot.isin] || 0 // Injectar preço ou 0 se não encontrado
    }));

  }, [stockHoldingsByYearData, selectedYear, currentHoldingsValueData]);
  // ----------------------------------------------------


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
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                <Tooltip title="Lucro ou prejuízo total realizado com a venda de ações no período selecionado." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Resultado Ações" value={summaryData.stockPL} icon={<ShowChartIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Lucro ou prejuízo total realizado com o fecho de posições de opções no período selecionado." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Resultado Opções" value={summaryData.optionPL} icon={<CandlestickChartIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Montante bruto recebido de dividendos (não tem em conta retenções na fonte) no período selecionado." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Dividendos" value={summaryData.dividendPL} icon={<AttachMoneyIcon />} /></Box>
                </Tooltip>
                <Tooltip title="Soma de todas as taxas e comissões pagas no período selecionado." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Taxas e Comissões" value={summaryData.totalTaxesAndCommissions} icon={<RequestQuoteIcon />} /></Box>
                </Tooltip>
                 <Tooltip title="Percentagem de transações fechadas (ações e opções) que resultaram em lucro." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Taxa de Sucesso" value={summaryData.winLossRatio} icon={<EmojiEventsIcon />} isPercentage /></Box>
                </Tooltip>
                <Tooltip title="Tempo médio de detenção para as posições vendidas com lucro." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Duração (Ganhos)" value={summaryData.avgHoldingPeriodWinners} icon={<TimelapseIcon />} unit="dias" /></Box>
                </Tooltip>
                <Tooltip title="Tempo médio de detenção para as posições vendidas com prejuízo." placement="top">
                  <Box sx={{ flex: '1 1 0', minWidth: 140 }}><KeyMetricCard title="Duração (Perdas)" value={summaryData.avgHoldingPeriodLosers} icon={<TimelapseIcon />} unit="dias" /></Box>
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