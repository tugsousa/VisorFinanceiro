import React, { useMemo, useState } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetchAdminUserDetails } from 'features/admin/api/adminApi';
import { 
    Box, Typography, CircularProgress, Alert, Paper, Grid, Divider, Link, Card, Tabs, Tab, 
    FormControl, Select, MenuItem, InputLabel, Button 
} from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { DataGrid } from '@mui/x-data-grid';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CandlestickChartIcon from '@mui/icons-material/CandlestickChart';
import AttachMoneyIcon from '@mui/icons-material/AttachMoney';
import RequestQuoteIcon from '@mui/icons-material/RequestQuote';
import TrendingUpIcon from '@mui/icons-material/TrendingUp';
import AccountBalanceWalletIcon from '@mui/icons-material/AccountBalanceWallet';
import PercentIcon from '@mui/icons-material/Percent';
import StatCard from '../components/StatCard';
import EmojiEventsIcon from '@mui/icons-material/EmojiEvents';
import TimelapseIcon from '@mui/icons-material/Timelapse';
import LoginIcon from '@mui/icons-material/Login';

const KeyMetricCard = ({ title, value, icon, isPercentage = false, unit = '' }) => {
    const isPositive = typeof value === 'number' ? value >= 0 : true;
    const bgColor = unit ? 'rgba(63, 81, 181, 0.1)' : (isPositive ? 'rgba(76, 175, 80, 0.1)' : 'rgba(244, 67, 54, 0.1)');
    const textColor = unit ? 'primary.main' : (isPositive ? 'success.main' : 'error.main');
    
    return (
        <Card elevation={0} sx={{ display: 'flex', alignItems: 'center', p: 1.5, bgcolor: bgColor, borderRadius: 2, height: '100%' }}>
            <Box sx={{ mr: 1.5, color: textColor, fontSize: 32 }}>
                {React.cloneElement(icon, { fontSize: 'inherit' })}
            </Box>
            <Box>
                <Typography variant="body2" color="text.secondary" sx={{ fontWeight: 500 }}>{title}</Typography>
                <Typography variant="h6" sx={{ fontWeight: 'bold', color: 'text.primary' }}>
                    {isPercentage ? `${(value || 0).toFixed(2)}%` : (unit ? `${(value || 0).toFixed(0)} ${unit}` : formatCurrency(value))}
                </Typography>
            </Box>
        </Card>
    );
};

const UserDetailPage = () => {
    const { userId } = useParams();
    const navigate = useNavigate();
    const { token, impersonate } = useAuth();
    const [selectedPortfolioId, setSelectedPortfolioId] = useState('');
    const [currentTab, setCurrentTab] = useState('overview');
    const [isImpersonating, setIsImpersonating] = useState(false);

    const { data, isLoading, error } = useQuery({
        queryKey: ['adminUserDetail', userId, selectedPortfolioId],
        queryFn: () => apiFetchAdminUserDetails(userId, selectedPortfolioId).then(res => res.data),
        enabled: !!token && !!userId,
    });

    // Atualiza o portfólio selecionado quando os dados carregam pela primeira vez
    React.useEffect(() => {
        if (data && data.selected_portfolio_id && !selectedPortfolioId) {
            setSelectedPortfolioId(data.selected_portfolio_id);
        }
    }, [data, selectedPortfolioId]);

    const handleImpersonate = async () => {
        if (!data?.user) return;
        
        if (!window.confirm(`Tem a certeza que quer entrar como ${data.user.email}?`)) return;
        
        setIsImpersonating(true);
        try {
            await impersonate(userId);
            // Sucesso! O AuthContext atualizou o estado, redireciona para o dashboard
            navigate('/dashboard'); 
        } catch (error) {
            console.error("Erro ao impersonar:", error);
            alert("Erro ao entrar como utilizador.");
            setIsImpersonating(false);
        }
    };

    const keyMetrics = useMemo(() => {
        if (!data?.Metrics) return null;
        const m = data.Metrics;
        
        // Calcular totais simples baseados nos dados disponíveis
        const stockPL = (m.StockSaleDetails || []).reduce((acc, s) => acc + (s.Delta || 0), 0);
        const optionPL = (m.OptionSaleDetails || []).reduce((acc, o) => acc + (o.Delta || 0), 0);
        const dividendPL = (m.DividendTransactionsList || []).reduce((acc, d) => {
             // Assumindo que AmountEUR é o valor líquido ou bruto dependendo da transação
             // Para simplificar, somamos AmountEUR de transações do tipo DIVIDEND (excluindo impostos se estiverem separados ou somando se forem negativos)
             if (d.transaction_type === 'DIVIDEND' && d.transaction_subtype !== 'TAX') return acc + (d.amount_eur || 0);
             if (d.transaction_type === 'DIVIDEND' && d.transaction_subtype === 'TAX') return acc + (d.amount_eur || 0); // é negativo
             return acc;
        }, 0);
        
        const totalFees = (m.FeeDetails || []).reduce((acc, f) => acc + (f.AmountEUR || 0), 0);
        const stockCommissions = (m.StockSaleDetails || []).reduce((acc, s) => acc + (s.Commission || 0), 0);
        const optionCommissions = (m.OptionSaleDetails || []).reduce((acc, o) => acc + (o.Commission || 0), 0);
        
        const totalPL = stockPL + optionPL + dividendPL + totalFees; // Fees geralmente são negativas
        
        // Calcular unrealized PL das ações atuais
        const unrealizedStockPL = (data.current_holdings || []).reduce((acc, h) => {
            const mv = h.market_value_eur || 0;
            const cb = Math.abs(h.total_cost_basis_eur || 0);
            return acc + (mv - cb);
        }, 0);

        // Cálculos aproximados para rácios
        const stockWins = (m.StockSaleDetails || []).filter(s => s.Delta > 0).length;
        const stockLosses = (m.StockSaleDetails || []).filter(s => s.Delta <= 0).length;
        const totalTrades = stockWins + stockLosses;
        const winLossRatio = totalTrades > 0 ? (stockWins / totalTrades) * 100 : 0;

        return {
            stockPL,
            optionPL,
            dividendPL,
            totalFeesAndCommissions: totalFees + stockCommissions + optionCommissions, // Isto pode duplicar se Fees já incluir comissões
            unrealizedStockPL,
            totalPL: totalPL + unrealizedStockPL,
            portfolioReturn: 0, // Necessitaria de cálculo complexo de TWR ou MWR
            winLossRatio,
            avgHoldingPeriodWinners: 0, 
            avgHoldingPeriodLosers: 0
        };
    }, [data]);

    const uploadHistoryColumns = [
        { field: 'id', headerName: 'ID', width: 70 },
        { field: 'uploaded_at', headerName: 'Data', width: 180, valueFormatter: (params) => new Date(params.value).toLocaleString() },
        { field: 'source', headerName: 'Fonte', width: 100 },
        { field: 'filename', headerName: 'Ficheiro', width: 200 },
        { field: 'transaction_count', headerName: 'Transações', width: 100, type: 'number' },
        { field: 'portfolio_name', headerName: 'Portfólio', width: 150 },
    ];

    const transactionColumns = [
        { field: 'date', headerName: 'Data', width: 110 },
        { field: 'transaction_type', headerName: 'Tipo', width: 100 },
        { field: 'product_name', headerName: 'Produto', width: 250 },
        { field: 'amount_eur', headerName: 'Valor (€)', width: 120, type: 'number', valueFormatter: (params) => formatCurrency(params.value) },
        { field: 'quantity', headerName: 'Qtd', width: 80, type: 'number' },
        { field: 'source', headerName: 'Broker', width: 90 },
    ];

    const holdingsColumns = [
        { field: 'product_name', headerName: 'Produto', width: 250 },
        { field: 'isin', headerName: 'ISIN', width: 130 },
        { field: 'quantity', headerName: 'Qtd', width: 80, type: 'number' },
        { field: 'market_value_eur', headerName: 'Valor Mercado (€)', width: 150, type: 'number', valueFormatter: (params) => formatCurrency(params.value) },
        { field: 'total_cost_basis_eur', headerName: 'Custo Base (€)', width: 150, type: 'number', valueFormatter: (params) => formatCurrency(Math.abs(params.value)) },
    ];

    if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (error) return <Alert severity="error" sx={{ m: 2 }}>{error.message}</Alert>;
    if (!data) return <Alert severity="info" sx={{ m: 2 }}>Utilizador não encontrado.</Alert>;

    const { user, upload_history, transactions, portfolios, current_holdings: currentHoldings } = data;

    return (
        <Box sx={{ p: { xs: 1, sm: 2, md: 3 } }}>
            {/* Cabeçalho e Ações */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
                <Link component={RouterLink} to="/admin/users" sx={{ display: 'flex', alignItems: 'center', textDecoration: 'none' }}>
                    <ArrowBackIcon sx={{ mr: 1 }} /> Voltar à Lista
                </Link>
                
                <Box sx={{ display: 'flex', gap: 2, alignItems: 'center' }}>
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

                    <Button
                        variant="contained"
                        color="warning"
                        startIcon={isImpersonating ? <CircularProgress size={20} color="inherit" /> : <LoginIcon />}
                        onClick={handleImpersonate}
                        disabled={isImpersonating}
                        sx={{ textTransform: 'none' }}
                    >
                        Entrar como Utilizador
                    </Button>
                </Box>
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
                        <DataGrid 
                            rows={currentHoldings} 
                            columns={holdingsColumns} 
                            getRowId={(row) => row.isin + row.product_name}
                            density="compact" 
                        />
                    ) : (
                        <Typography>Não existem posições em carteira para este portfólio.</Typography>
                    )}
                </Paper>
            )}

            {currentTab === 'uploads' && (
                <Paper variant="outlined" sx={{ p: 3, height: 500, width: '100%' }}>
                    <Typography variant="h6" gutterBottom>Histórico de Uploads</Typography>
                    <DataGrid rows={upload_history || []} columns={uploadHistoryColumns} density="compact" />
                </Paper>
            )}

            {currentTab === 'transactions' && (
                <Paper variant="outlined" sx={{ p: 3, height: 700, width: '100%' }}>
                    <Typography variant="h6" gutterBottom>Transações do Portfólio</Typography>
                    <DataGrid rows={transactions || []} columns={transactionColumns} getRowId={(row) => row.id} density="compact" />
                </Paper>
            )}
        </Box>
    );
};

export default UserDetailPage;