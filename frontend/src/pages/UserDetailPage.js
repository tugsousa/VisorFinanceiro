import React, { useMemo } from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetchAdminUserDetails } from '../api/apiService';
import { Box, Typography, CircularProgress, Alert, Paper, Grid, Divider, Link, Card } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { DataGrid } from '@mui/x-data-grid';
import { parseDateRobust } from '../utils/dateUtils';
import { formatCurrency } from '../utils/formatUtils';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PercentIcon from '@mui/icons-material/Percent';

const StatCard = ({ title, value }) => (
    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">{title}</Typography>
        <Typography variant="h6" component="p" sx={{ fontWeight: 'bold' }}>
            {value}
        </Typography>
    </Paper>
);

const KeyMetricCard = ({ title, value, icon, isPercentage = false }) => {
  const isPositive = value >= 0;
  const bgColor = isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)';
  const textColor = isPositive ? 'success.main' : 'error.main';
  const formattedValue = isPercentage ? `${value.toFixed(2)}%` : formatCurrency(value);

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

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['adminUserDetails', userId, token],
        queryFn: () => apiFetchAdminUserDetails(userId).then(res => res.data),
        enabled: !!token && !!userId,
    });

    const { keyMetrics, currentHoldings } = useMemo(() => {
        const defaultResult = { keyMetrics: null, currentHoldings: [] };
        if (!data) return defaultResult;

        const metricsData = data.metrics || {};
        const currentHoldingsData = data.current_holdings || [];
        const allTransactions = data.transactions || [];

        // Cálculos de Lucro/Prejuízo Realizado
        const stockPL = (metricsData.StockSaleDetails || []).reduce((sum, s) => sum + (s.Delta || 0), 0);
        const optionPL = (metricsData.OptionSaleDetails || []).reduce((sum, s) => sum + (s.delta || 0), 0);
        const { gross, tax } = (metricsData.DividendTransactionsList || []).reduce((acc, tx) => {
            if (tx.transaction_subtype === 'TAX') acc.tax += tx.amount_eur || 0;
            else acc.gross += tx.amount_eur || 0;
            return acc;
        }, { gross: 0, tax: 0 });
        const dividendPL = gross + tax;
        const totalFeesAndCommissions = (metricsData.FeeDetails || []).reduce((sum, f) => sum + (f.amount_eur || 0), 0);

        // Cálculos de Posições Atuais (Não Realizadas) usando os dados corretos da API
        const { marketValue, costBasis } = currentHoldingsData.reduce((acc, h) => {
            acc.marketValue += h.market_value_eur || 0;
            acc.costBasis += Math.abs(h.total_cost_basis_eur || 0);
            return acc;
        }, { marketValue: 0, costBasis: 0 });
        const unrealizedStockPL = marketValue - costBasis;

        // "Retorno Total (€)" é a soma de todos os ganhos e perdas (realizados e não realizados) menos os custos.
        const totalPL = stockPL + optionPL + dividendPL + totalFeesAndCommissions + unrealizedStockPL;

        // Cálculos de Retorno do Portfólio (%)
        const { totalDeposits, totalWithdrawals } = allTransactions.reduce((acc, tx) => {
            if (tx.transaction_type === 'CASH') {
                if (tx.transaction_subtype === 'DEPOSIT') acc.totalDeposits += tx.amount_eur || 0;
                else if (tx.transaction_subtype === 'WITHDRAWAL') acc.totalWithdrawals += tx.amount_eur || 0;
            }
            return acc;
        }, { totalDeposits: 0, totalWithdrawals: 0 });
        
        // Crescimento total = (Valor Final + Levantamentos) - Depósitos
        const totalGrowth = (marketValue + Math.abs(totalWithdrawals)) - totalDeposits;
        const portfolioReturn = totalDeposits > 0 ? (totalGrowth / totalDeposits) * 100 : 0;

        const finalKeyMetrics = { stockPL, optionPL, dividendPL, totalFeesAndCommissions, unrealizedStockPL, totalPL, portfolioReturn };
        
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

    const uploadHistoryColumns = [
        { field: 'source', headerName: 'Corretora', width: 120 },
        { field: 'uploaded_at', headerName: 'Data Upload', width: 170, type: 'dateTime', valueGetter: (value) => value ? new Date(value) : null },
        { field: 'filename', headerName: 'Nome Ficheiro', flex: 1, minWidth: 200 },
        { field: 'transaction_count', headerName: 'Nº Transações', type: 'number', width: 130 },
        { field: 'file_size', headerName: 'Tamanho (KB)', type: 'number', width: 120, valueFormatter: (value) => (value / 1024).toFixed(2) },
    ];

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
        { field: 'avgBuyPrice', headerName: 'Preço Médio Compra (€)', type: 'number', width: 180, valueFormatter: (value) => formatCurrency(value, { minimumFractionDigits: 4 }) },
        { field: 'totalCost', headerName: 'Custo Total (€)', type: 'number', width: 150, valueFormatter: (value) => formatCurrency(value) },
        { field: 'currentPrice', headerName: 'Preço Atual (€)', type: 'number', width: 150, valueFormatter: (value) => formatCurrency(value, { minimumFractionDigits: 4 }) },
        { field: 'marketValue', headerName: 'Valor de Mercado (€)', type: 'number', width: 180, valueFormatter: (value) => formatCurrency(value) },
        { field: 'unrealizedPL', headerName: 'P/L Não Realizado (€)', type: 'number', width: 180,
            renderCell: (params) => {
                const value = params.value || 0;
                const textColor = value >= 0 ? 'success.main' : 'error.main';
                return <Box sx={{ color: textColor, fontWeight: 500 }}>{formatCurrency(value)}</Box>;
            }
        },
    ];

    if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (isError) return <Alert severity="error" sx={{ m: 2 }}>{error.message}</Alert>;
    if (!data) return <Alert severity="info" sx={{ m: 2 }}>Utilizador não encontrado.</Alert>;

    const { user, upload_history, transactions } = data;

    return (
        <Box>
            <Link component={RouterLink} to="/admin" sx={{ display: 'flex', alignItems: 'center', mb: 2 }}>
                <ArrowBackIcon sx={{ mr: 1 }} />
                Voltar ao Dashboard
            </Link>

            <Typography variant="h4" gutterBottom>Detalhes do Utilizador: <strong>{user.email}</strong></Typography>

            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Informação Geral</Typography>
                <Divider sx={{ mb: 2 }} />
                <Grid container spacing={2}>
                    <Grid item xs={12} sm={6} md={3}><StatCard title="ID Utilizador" value={user.id} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard title="Nº de Logins" value={user.login_count} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard title="Uploads Totais" value={user.total_upload_count} /></Grid>
                    <Grid item xs={12} sm={6} md={3}><StatCard title="Valor Carteira (Snapshot)" value={formatCurrency(user.portfolio_value_eur)} /></Grid>
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Data Registo:</strong> {new Date(user.created_at).toLocaleString()}</Typography></Grid>
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Último Login:</strong> {user.last_login_at.Valid ? new Date(user.last_login_at.Time).toLocaleString() : 'N/A'}</Typography></Grid>
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>IP Último Login:</strong> {user.last_login_ip || 'N/A'}</Typography></Grid>
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Fornecedor Auth:</strong> {user.auth_provider}</Typography></Grid>
                </Grid>
            </Paper>

            {keyMetrics && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" gutterBottom>Métricas Chave (Análise Vitalícia)</Typography>
                    <Divider sx={{ mb: 2 }} />
                    <Grid container spacing={2}>
                        <Grid item xs={12} sm={6} md={3}><KeyMetricCard title="Resultados Ações" value={keyMetrics.stockPL} icon={<ShowChartIcon />} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><KeyMetricCard title="Resultados Opções" value={keyMetrics.optionPL} icon={<CandlestickChartIcon />} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><KeyMetricCard title="Dividendos" value={keyMetrics.dividendPL} icon={<AttachMoneyIcon />} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><KeyMetricCard title="Taxas e Comissões" value={keyMetrics.totalFeesAndCommissions} icon={<RequestQuoteIcon />} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><KeyMetricCard title="P/L em Aberto" value={keyMetrics.unrealizedStockPL} icon={<TrendingUpIcon />} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><KeyMetricCard title="Retorno Total (€)" value={keyMetrics.totalPL} icon={<AccountBalanceWalletIcon />} /></Grid>
                        <Grid item xs={12} sm={6} md={3}><KeyMetricCard title="Retorno Total (%)" value={keyMetrics.portfolioReturn} icon={<PercentIcon />} isPercentage /></Grid>
                    </Grid>
                </Paper>
            )}

            {currentHoldings && currentHoldings.length > 0 && (
                <Paper sx={{ p: 3, mb: 3 }}>
                    <Typography variant="h6" gutterBottom>Carteira de Ações Atual</Typography>
                    <Box sx={{ height: 400, width: '100%' }}>
                        <DataGrid
                            rows={currentHoldings}
                            columns={holdingsColumns}
                            density="compact"
                        />
                    </Box>
                </Paper>
            )}

            <Paper sx={{ p: 3, mb: 3 }}>
                <Typography variant="h6" gutterBottom>Histórico de Uploads</Typography>
                <Box sx={{ height: 300, width: '100%' }}>
                    <DataGrid
                        rows={upload_history}
                        columns={uploadHistoryColumns}
                        density="compact"
                    />
                </Box>
            </Paper>

            <Paper sx={{ p: 3 }}>
                <Typography variant="h6" gutterBottom>Últimas Transações Processadas</Typography>
                <Box sx={{ height: 500, width: '100%' }}>
                    <DataGrid
                        rows={transactions}
                        columns={transactionColumns}
                        getRowId={(row) => row.id}
                    />
                </Box>
            </Paper>
        </Box>
    );
};

export default UserDetailPage;