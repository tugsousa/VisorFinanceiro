// frontend/src/pages/UserDetailPage.js

import React, { useMemo, useState } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetchAdminUserDetails } from '../lib/api';
import { 
    Box, Typography, CircularProgress, Alert, Paper, Grid, Divider, Link, Card, 
    Tabs, Tab, Tooltip, FormControl, Select, MenuItem, InputLabel 
} from '@mui/material';
import { useAuth } from '../features/auth/AuthContext';
import { DataGrid } from '@mui/x-data-grid';
import { parseDateRobust, calculateDaysHeld } from '../lib/utils/dateUtils';
import { formatCurrency } from '../lib/utils/formatUtils';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PercentIcon from '@mui/icons-material/Percent';
import StatCard from '../components/admin/StatCard';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TimelapseIcon from '@mui/icons-material/Timelapse';

const KeyMetricCard = ({ title, value, icon, isPercentage = false, unit = '' }) => {
  const isPositive = typeof value === 'number' ? value >= 0 : true;
  const bgColor = unit ? 'rgba(63, 81, 181, 0.1)' : (isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)');
  const textColor = unit ? 'primary.main' : (isPositive ? 'success.main' : 'error.main');
  
  const formattedValue = isPercentage 
    ? `${(value || 0).toFixed(2)}%` 
    : (unit ? `${(value || 0).toFixed(0)} ${unit}` : formatCurrency(value));

  return (
    <Card elevation={0} sx={{ display: 'flex', alignItems: 'center', p: 1.5, bgcolor: bgColor, borderRadius: 2, height: '100%' }}>
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

const UserDetailPage = () => {
    const { userId } = useParams();
    const { token } = useAuth();
    const [currentTab, setCurrentTab] = useState('overview');
    const [selectedPortfolioId, setSelectedPortfolioId] = useState('');

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['adminUserDetails', userId, token, selectedPortfolioId],
        queryFn: () => apiFetchAdminUserDetails(userId, selectedPortfolioId).then(res => res.data),
        enabled: !!token && !!userId,
    });

    const { keyMetrics, currentHoldings } = useMemo(() => {
        const defaultResult = { keyMetrics: null, currentHoldings: [] };
        if (!data) return defaultResult;

        const metricsData = data.metrics || {};
        const currentHoldingsData = data.current_holdings || [];
        const allTransactions = data.transactions || [];

        const stockPL = (metricsData.StockSaleDetails || []).reduce((sum, s) => sum + (s.Delta || 0), 0);
        const optionPL = (metricsData.OptionSaleDetails || []).reduce((sum, s) => sum + (s.delta || 0), 0);
        const { gross, tax } = (metricsData.DividendTransactionsList || []).reduce((acc, tx) => {
            if (tx.transaction_subtype === 'TAX') acc.tax += tx.amount_eur || 0;
            else acc.gross += tx.amount_eur || 0;
            return acc;
        }, { gross: 0, tax: 0 });
        const dividendPL = gross + tax;
        const totalFeesAndCommissions = (metricsData.FeeDetails || []).reduce((sum, f) => sum + (f.amount_eur || 0), 0);

        const { marketValue, costBasis } = currentHoldingsData.reduce((acc, h) => {
            acc.marketValue += h.market_value_eur || 0;
            acc.costBasis += Math.abs(h.total_cost_basis_eur || 0);
            return acc;
        }, { marketValue: 0, costBasis: 0 });
        const unrealizedStockPL = marketValue - costBasis;

        const totalPL = stockPL + optionPL + dividendPL + totalFeesAndCommissions + unrealizedStockPL;

        const { totalDeposits, totalWithdrawals } = allTransactions.reduce((acc, tx) => {
            if (tx.transaction_type === 'CASH') {
                if (tx.transaction_subtype === 'DEPOSIT') acc.totalDeposits += tx.amount_eur || 0;
                else if (tx.transaction_subtype === 'WITHDRAWAL') acc.totalWithdrawals += tx.amount_eur || 0;
            }
            return acc;
        }, { totalDeposits: 0, totalWithdrawals: 0 });
        
        const totalGrowth = (marketValue + Math.abs(totalWithdrawals)) - totalDeposits;
        const portfolioReturn = totalDeposits > 0 ? (totalGrowth / totalDeposits) * 100 : 0;

        const stockSales = metricsData.StockSaleDetails || [];
        const optionSales = metricsData.OptionSaleDetails || [];
        const winningTrades = stockSales.filter(s => s.Delta > 0).length + optionSales.filter(o => o.delta > 0).length;
        const totalTrades = stockSales.length + optionSales.length;
        const winLossRatio = totalTrades > 0 ? (winningTrades / totalTrades) * 100 : 0;

        let totalDaysWinners = 0;
        let countWinners = 0;
        let totalDaysLosers = 0;
        let countLosers = 0;

        stockSales.forEach(sale => {
            const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
            if (typeof daysHeld === 'number') {
                if (sale.Delta > 0) {
                    totalDaysWinners += daysHeld;
                    countWinners++;
                } else if (sale.Delta < 0) {
                    totalDaysLosers += daysHeld;
                    countLosers++;
                }
            }
        });

        optionSales.forEach(sale => {
            const daysHeld = calculateDaysHeld(sale.open_date, sale.close_date);
            if (typeof daysHeld === 'number') {
                if (sale.delta > 0) {
                    totalDaysWinners += daysHeld;
                    countWinners++;
                } else if (sale.delta < 0) {
                    totalDaysLosers += daysHeld;
                    countLosers++;
                }
            }
        });

        const avgHoldingPeriodWinners = countWinners > 0 ? totalDaysWinners / countWinners : 0;
        const avgHoldingPeriodLosers = countLosers > 0 ? totalDaysLosers / countLosers : 0;

        const finalKeyMetrics = { 
            stockPL, optionPL, dividendPL, totalFeesAndCommissions, unrealizedStockPL, totalPL, portfolioReturn,
            winLossRatio, avgHoldingPeriodWinners, avgHoldingPeriodLosers
        };
        
        const holdings = currentHoldingsData.map(h => ({
            id: h.isin,
            productName: h.product_name,
            quantity: h.quantity,
            avgBuyPrice: h.quantity > 0 ? Math.abs(h.total_cost_basis_eur) / h.quantity : 0,
            totalCost: Math.abs(h.total_cost_basis_eur),
            currentPrice: h.current_price_eur,
            marketValue: h.market_value_eur,
            unrealizedPL: h.market_value_eur - Math.abs(h.total_cost_basis_eur)
        }));
        
        return { keyMetrics: finalKeyMetrics, currentHoldings: holdings };
    }, [data]);
    
    // Set default selected portfolio on first load
    React.useEffect(() => {
        if (data && data.selected_portfolio_id && !selectedPortfolioId) {
            setSelectedPortfolioId(data.selected_portfolio_id);
        }
    }, [data, selectedPortfolioId]);

    // --- FIX APPLIED HERE ---
    const uploadHistoryColumns = [
        { 
            field: 'portfolioName', 
            headerName: 'Portfólio', 
            width: 150, 
            // In DataGrid v6/v7, valueGetter receives (value, row).
            // Since 'portfolioName' doesn't exist on row, value is undefined.
            // We access row.portfolio_name directly.
            valueGetter: (value, row) => row?.portfolio_name || value 
        },
        { field: 'source', headerName: 'Corretora', width: 100 },
        { field: 'uploaded_at', headerName: 'Data Upload', width: 170, type: 'dateTime', valueGetter: (value) => value ? new Date(value) : null },
        { field: 'filename', headerName: 'Nome Ficheiro', flex: 1, minWidth: 200 },
        { field: 'transaction_count', headerName: 'Nº Transações', type: 'number', width: 130 },
        { field: 'file_size', headerName: 'Tamanho (KB)', type: 'number', width: 120, valueFormatter: (value) => (value / 1024).toFixed(2) },
    ];
    // -----------------------

    const transactionColumns = [
        { field: 'date', headerName: 'Data', width: 110, type: 'date', valueGetter: (value) => parseDateRobust(value) },
        { field: 'source', headerName: 'Origem', width: 100 },
        { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 180 },
        { field: 'buy_sell', headerName: 'Ação', width: 90 },
        { field: 'quantity', headerName: 'Qtd.', type: 'number', width: 80 },
        { field: 'amount_eur', headerName: 'Montante (€)', type: 'number', width: 120, valueFormatter: (value) => formatCurrency(value) },
    ];
    const holdingsColumns = [
        { field: 'productName', headerName: 'Produto', flex: 1, minWidth: 180 },
        { field: 'quantity', headerName: 'Qtd.', type: 'number', width: 90 },
        { field: 'avgBuyPrice', headerName: 'Preço Médio (€)', type: 'number', width: 150, valueFormatter: (value) => formatCurrency(value, { minimumFractionDigits: 4, maximumFractionDigits: 4 }) },
        { field: 'totalCost', headerName: 'Custo Total (€)', type: 'number', width: 150, valueFormatter: (value) => formatCurrency(value) },
        { field: 'marketValue', headerName: 'Valor Atual (€)', type: 'number', width: 150, valueFormatter: (value) => formatCurrency(value) },
        { field: 'unrealizedPL', headerName: 'P/L (€)', type: 'number', width: 150,
            renderCell: (params) => {
                const value = params.value || 0;
                const textColor = value >= 0 ? 'success.main' : 'error.main';
                return <Box sx={{ color: textColor, fontWeight: 500 }}>{formatCurrency(value)}</Box>;
            }
        },
    ];

    if (isLoading && !data) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (isError) return <Alert severity="error" sx={{ m: 2 }}>{error.message}</Alert>;
    if (!data) return <Alert severity="info" sx={{ m: 2 }}>Utilizador não encontrado.</Alert>;

    const { user, upload_history, transactions, portfolios } = data;

    return (
        <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
                <Link component={RouterLink} to="/admin" sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                    <ArrowBackIcon sx={{ mr: 1 }} />
                    Voltar ao Dashboard
                </Link>
                {portfolios && portfolios.length > 0 && (
                    <FormControl size="small" sx={{ minWidth: 200 }}>
                        <InputLabel id="portfolio-select-label">Portfólio</InputLabel>
                        <Select
                            labelId="portfolio-select-label"
                            value={selectedPortfolioId}
                            label="Portfólio"
                            onChange={(e) => setSelectedPortfolioId(e.target.value)}
                        >
                            {portfolios.map(p => (
                                <MenuItem key={p.id} value={p.id}>
                                    {p.name} {p.is_default && '(Padrão)'}
                                </MenuItem>
                            ))}
                        </Select>
                    </FormControl>
                )}
            </Box>

            <Typography variant="h4" gutterBottom>Detalhes: <strong>{user.email}</strong></Typography>

            <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 3 }}>
                <Tabs value={currentTab} onChange={(e, newValue) => setCurrentTab(newValue)} aria-label="user detail tabs">
                    <Tab label="Visão Geral" value="overview" />
                    <Tab label="Carteira Atual" value="holdings" />
                    <Tab label="Histórico de Uploads" value="uploads" />
                    <Tab label="Transações" value="transactions" />
                </Tabs>
            </Box>

            {currentTab === 'overview' && (
                <Grid container spacing={3}>
                    <Grid item xs={12}>
                        <Paper variant="outlined" sx={{ p: 3 }}>
                            <Typography variant="h6" gutterBottom>Informação Geral</Typography>
                            <Divider sx={{ mb: 2 }} />
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6} md={3}><StatCard title="ID Utilizador" value={user.id} /></Grid>
                                <Grid item xs={12} sm={6} md={3}><StatCard title="Total Portfólios" value={portfolios ? portfolios.length : 0} /></Grid>
                                <Grid item xs={12} sm={6} md={3}><StatCard title="Uploads Totais" value={user.total_upload_count} /></Grid>
                                <Grid item xs={12} sm={6} md={3}><StatCard title="Valor Global (Todos)" value={formatCurrency(user.portfolio_value_eur)} /></Grid>
                            </Grid>
                        </Paper>
                    </Grid>
                    {keyMetrics && (
                        <Grid item xs={12}>
                            <Paper variant="outlined" sx={{ p: 3 }}>
                                <Typography variant="h6" gutterBottom>Métricas do Portfólio Selecionado</Typography>
                                <Divider sx={{ mb: 2 }} />
                                <Grid container spacing={2}>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Resultados Ações" value={keyMetrics.stockPL} icon={<ShowChartIcon />} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Resultados Opções" value={keyMetrics.optionPL} icon={<CandlestickChartIcon />} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Dividendos" value={keyMetrics.dividendPL} icon={<AttachMoneyIcon />} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Taxas e Comissões" value={keyMetrics.totalFeesAndCommissions} icon={<RequestQuoteIcon />} /></Grid>
                                    
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="P/L em Aberto" value={keyMetrics.unrealizedStockPL} icon={<TrendingUpIcon />} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Retorno Total (€)" value={keyMetrics.totalPL} icon={<AccountBalanceWalletIcon />} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Retorno Total (%)" value={keyMetrics.portfolioReturn} icon={<PercentIcon />} isPercentage /></Grid>
                                    
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Taxa de Sucesso" value={keyMetrics.winLossRatio} icon={<EmojiEventsIcon />} isPercentage /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Duração (Ganhos)" value={keyMetrics.avgHoldingPeriodWinners} icon={<TimelapseIcon />} unit="dias" /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Duração (Perdas)" value={keyMetrics.avgHoldingPeriodLosers} icon={<TimelapseIcon />} unit="dias" /></Grid>
                                </Grid>
                            </Paper>
                        </Grid>
                    )}
                </Grid>
            )}

            {currentTab === 'holdings' && (
                <Paper variant="outlined" sx={{ p: 3, height: 600, width: '100%' }}>
                    <Typography variant="h6" gutterBottom>Carteira de Ações Atual</Typography>
                    {currentHoldings && currentHoldings.length > 0 ? (
                        <DataGrid rows={currentHoldings} columns={holdingsColumns} density="compact" />
                    ) : (
                        <Typography>Não existem posições em carteira para este portfólio.</Typography>
                    )}
                </Paper>
            )}

            {currentTab === 'uploads' && (
                <Paper variant="outlined" sx={{ p: 3, height: 500, width: '100%' }}>
                     <Typography variant="h6" gutterBottom>Histórico de Uploads</Typography>
                    <DataGrid rows={upload_history} columns={uploadHistoryColumns} density="compact" />
                </Paper>
            )}

            {currentTab === 'transactions' && (
                <Paper variant="outlined" sx={{ p: 3, height: 700, width: '100%' }}>
                     <Typography variant="h6" gutterBottom>Transações do Portfólio</Typography>
                    <DataGrid rows={transactions} columns={transactionColumns} getRowId={(row) => row.id} />
                </Paper>
            )}
        </Box>
    );
};

export default UserDetailPage;