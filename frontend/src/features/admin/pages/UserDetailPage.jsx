import React, { useMemo, useState } from 'react';
import { useParams, Link as RouterLink, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetchAdminUserDetails } from 'features/admin/api/adminApi';
import { 
    Box, Typography, CircularProgress, Alert, Grid, Divider, Link, Card, Tabs, Tab, 
    FormControl, Select, MenuItem, InputLabel, Button, Chip, Tooltip,
    Dialog, DialogTitle, DialogContent, DialogContentText, DialogActions, TextField
} from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { DataGrid } from '@mui/x-data-grid';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import StatCard from '../components/StatCard';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import LoginIcon from '@mui/icons-material/Login';

// Shared height for all tab DataGrid panels (pixels).
// Using a constant makes future changes a single-line edit.
const TAB_GRID_HEIGHT = 600;

const KeyMetricCard = ({ title, value, isPercentage = false, unit = '' }) => {
    const isPositive = typeof value === 'number' ? value >= 0 : true;
    const bgColor = unit ? '#f8fafc' : (isPositive ? '#f0fdf4' : '#fef2f2');
    const textColor = unit ? '#1f2937' : (isPositive ? '#166534' : '#991b1b');
    const borderColor = unit ? '#e5e7eb' : (isPositive ? '#bbf7d0' : '#fecaca');
    
    return (
        <Card elevation={0} sx={{ 
            display: 'flex', 
            alignItems: 'center', 
            p: 1.5, 
            bgcolor: bgColor, 
            borderRadius: 2, 
            height: '100%',
            border: '1px solid',
            borderColor: borderColor
        }}>
            <Box sx={{ mr: 1.5, color: textColor, fontSize: 32 }}>
                <Box sx={{ width: 32, height: 32, borderRadius: '50%', bgcolor: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Typography variant="body2" sx={{ fontWeight: 'bold', color: textColor }}>
                        {title.charAt(0)}
                    </Typography>
                </Box>
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
    
    const { token, impersonate, user: currentUser } = useAuth(); 
    
    const [selectedPortfolioId, setSelectedPortfolioId] = useState('');
    const [currentTab, setCurrentTab] = useState('overview');
    
    const [isImpersonating, setIsImpersonating] = useState(false);
    const [openImpersonateModal, setOpenImpersonateModal] = useState(false);
    const [impersonateMfaCode, setImpersonateMfaCode] = useState('');
    const [impersonateError, setImpersonateError] = useState('');

    const { data, isLoading, error } = useQuery({
        queryKey: ['adminUserDetail', userId, selectedPortfolioId],
        queryFn: () => apiFetchAdminUserDetails(userId, selectedPortfolioId).then(res => res.data),
        enabled: !!token && !!userId,
    });

    React.useEffect(() => {
        if (data && data.selected_portfolio_id && !selectedPortfolioId) {
            setSelectedPortfolioId(data.selected_portfolio_id);
        }
    }, [data, selectedPortfolioId]);

    const handleImpersonateClick = () => {
        if (!data?.user) return;

        if (!currentUser?.mfa_enabled) {
            if(window.confirm("Ação Bloqueada: Você deve ativar a Autenticação de Dois Fatores (2FA) nas suas definições antes de poder impersonar utilizadores. Deseja ir para as configurações agora?")) {
                navigate('/settings');
            }
            return;
        }

        setImpersonateError('');
        setImpersonateMfaCode('');
        setOpenImpersonateModal(true);
    };

    const handleConfirmImpersonate = async () => {
        if (!impersonateMfaCode || impersonateMfaCode.length < 6) {
            setImpersonateError("Por favor insira um código de 6 dígitos.");
            return;
        }

        setIsImpersonating(true);
        setImpersonateError('');
        
        try {
            await impersonate(userId, impersonateMfaCode);
            navigate('/dashboard'); 
        } catch (error) {
            console.error("Erro ao impersonar:", error);
            setImpersonateError(error.response?.data?.error || "Código incorreto ou erro no servidor.");
            setIsImpersonating(false);
        }
    };

    const keyMetrics = useMemo(() => {
        if (!data?.Metrics) return null;
        const m = data.Metrics;
        
        const stockPL = (m.StockSaleDetails || []).reduce((acc, s) => acc + (s.Delta || 0), 0);
        const optionPL = (m.OptionSaleDetails || []).reduce((acc, o) => acc + (o.Delta || 0), 0);
        const dividendPL = (m.DividendTransactionsList || []).reduce((acc, d) => {
             if (d.transaction_type === 'DIVIDEND' && d.transaction_subtype !== 'TAX') return acc + (d.amount_eur || 0);
             if (d.transaction_type === 'DIVIDEND' && d.transaction_subtype === 'TAX') return acc + (d.amount_eur || 0); 
             return acc;
        }, 0);
        
        const totalFees = (m.FeeDetails || []).reduce((acc, f) => acc + (f.AmountEUR || 0), 0);
        const stockCommissions = (m.StockSaleDetails || []).reduce((acc, s) => acc + (s.Commission || 0), 0);
        const optionCommissions = (m.OptionSaleDetails || []).reduce((acc, o) => acc + (o.Commission || 0), 0);
        
        const totalPL = stockPL + optionPL + dividendPL + totalFees; 
        
        const unrealizedStockPL = (data.current_holdings || []).reduce((acc, h) => {
            if (h.status !== 'OK') return acc;
            const mv = h.market_value_eur || 0;
            const cb = Math.abs(h.total_cost_basis_eur || 0);
            return acc + (mv - cb);
        }, 0);

        const stockWins = (m.StockSaleDetails || []).filter(s => s.Delta > 0).length;
        const stockLosses = (m.StockSaleDetails || []).filter(s => s.Delta <= 0).length;
        const totalTrades = stockWins + stockLosses;
        const winLossRatio = totalTrades > 0 ? (stockWins / totalTrades) * 100 : 0;

        return {
            stockPL,
            optionPL,
            dividendPL,
            totalFeesAndCommissions: totalFees + stockCommissions + optionCommissions,
            unrealizedStockPL,
            totalPL: totalPL + unrealizedStockPL,
            portfolioReturn: 0,
            winLossRatio,
            avgHoldingPeriodWinners: 0, 
            avgHoldingPeriodLosers: 0
        };
    }, [data]);

    const uploadHistoryColumns = [
        { field: 'id', headerName: 'ID', width: 70 },
        { field: 'uploaded_at', headerName: 'Data', width: 180, valueFormatter: (value) => new Date(value).toLocaleString() },
        { field: 'source', headerName: 'Fonte', width: 100 },
        { field: 'filename', headerName: 'Ficheiro', width: 200 },
        { field: 'transaction_count', headerName: 'Transações', width: 100, type: 'number' },
        { field: 'portfolio_name', headerName: 'Portfólio', width: 150 },
    ];

    const transactionColumns = [
        { field: 'date', headerName: 'Data', width: 110 },
        { field: 'transaction_type', headerName: 'Tipo', width: 100 },
        { field: 'product_name', headerName: 'Produto', width: 250 },
        { field: 'amount_eur', headerName: 'Valor (€)', width: 120, type: 'number', valueFormatter: (value) => formatCurrency(value) },
        { field: 'quantity', headerName: 'Qtd', width: 80, type: 'number' },
        { field: 'source', headerName: 'Broker', width: 90 },
    ];

    const holdingsColumns = [
        { field: 'product_name', headerName: 'Produto', width: 230, flex: 1 },
        { field: 'isin', headerName: 'ISIN', width: 130 },
        { field: 'quantity', headerName: 'Qtd', width: 75, type: 'number' },
        {
            field: 'status',
            headerName: 'Preço',
            width: 105,
            renderCell: (params) => {
                const ok = params.value === 'OK';
                return (
                    <Tooltip title={ok ? 'Preço de mercado em tempo real' : 'Preço indisponível — a mostrar custo base'}>
                        <Chip
                            label={ok ? 'Live' : 'N/D'}
                            size="small"
                            sx={{
                                bgcolor: ok ? '#dcfce7' : '#fef9c3',
                                color:   ok ? '#166534' : '#854d0e',
                                fontWeight: 600,
                                fontSize: '0.7rem',
                                height: 20,
                            }}
                        />
                    </Tooltip>
                );
            },
        },
        {
            field: 'market_value_eur',
            headerName: 'Valor Mercado (€)',
            width: 155,
            type: 'number',
            renderCell: (params) => {
                const priceOk = params.row.status === 'OK';
                const displayValue = priceOk
                    ? params.value
                    : Math.abs(params.row.total_cost_basis_eur || 0);
                return (
                    <Tooltip title={priceOk ? '' : 'Preço indisponível — a mostrar custo base como referência'}>
                        <Typography
                            variant="body2"
                            sx={{ color: priceOk ? 'text.primary' : 'text.secondary', fontStyle: priceOk ? 'normal' : 'italic' }}
                        >
                            {formatCurrency(displayValue)}
                        </Typography>
                    </Tooltip>
                );
            },
        },
        {
            field: 'total_cost_basis_eur',
            headerName: 'Custo Base (€)',
            width: 145,
            type: 'number',
            valueFormatter: (value) => formatCurrency(Math.abs(value)),
        },
        {
            field: 'pl_eur',
            headerName: 'P/L (€)',
            width: 120,
            type: 'number',
            valueGetter: (value, row) => {
                if (!row || row.status !== 'OK') return null;
                return (row.market_value_eur || 0) - Math.abs(row.total_cost_basis_eur || 0);
            },
            renderCell: (params) => {
                if (params.value === null || params.value === undefined) {
                    return <Typography variant="body2" color="text.disabled">—</Typography>;
                }
                const positive = params.value >= 0;
                return (
                    <Typography variant="body2" sx={{ color: positive ? '#166534' : '#991b1b', fontWeight: 600 }}>
                        {formatCurrency(params.value)}
                    </Typography>
                );
            },
        },
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
                        onClick={handleImpersonateClick}
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
                        <Box>
                            <Typography variant="h6" gutterBottom>Informação Geral</Typography>
                            <Divider sx={{ mb: 2 }} />
                            <Grid container spacing={2}>
                                <Grid item xs={12} sm={6} md={3}><StatCard title="ID Utilizador" value={user.id} /></Grid>
                                <Grid item xs={12} sm={6} md={3}><StatCard title="Total Portfólios" value={portfolios ? portfolios.length : 0} /></Grid>
                                <Grid item xs={12} sm={6} md={3}><StatCard title="Uploads Totais" value={user.total_upload_count} /></Grid>
                                <Grid item xs={12} sm={6} md={3}><StatCard title="Valor Global (Todos)" value={formatCurrency(user.portfolio_value_eur)} /></Grid>
                            </Grid>
                        </Box>
                    </Grid>
                    
                    {keyMetrics && (
                        <Grid item xs={12}>
                            <Box>
                                <Typography variant="h6" gutterBottom>Métricas do Portfólio Selecionado</Typography>
                                <Divider sx={{ mb: 2 }} />
                                <Grid container spacing={2}>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Resultados Ações" value={keyMetrics.stockPL} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Resultados Opções" value={keyMetrics.optionPL} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Dividendos" value={keyMetrics.dividendPL} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Taxas e Comissões" value={keyMetrics.totalFeesAndCommissions} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="P/L em Aberto" value={keyMetrics.unrealizedStockPL} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Retorno Total (€)" value={keyMetrics.totalPL} /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Retorno Total (%)" value={keyMetrics.portfolioReturn} isPercentage /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Taxa de Sucesso" value={keyMetrics.winLossRatio} isPercentage /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Duração (Ganhos)" value={keyMetrics.avgHoldingPeriodWinners} unit="dias" /></Grid>
                                    <Grid item xs={6} md={4} lg={3}><KeyMetricCard title="Duração (Perdas)" value={keyMetrics.avgHoldingPeriodLosers} unit="dias" /></Grid>
                                </Grid>
                            </Box>
                        </Grid>
                    )}
                </Grid>
            )}

            {currentTab === 'holdings' && (
                <Box sx={{ height: TAB_GRID_HEIGHT, width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" gutterBottom>Carteira de Ações Atual</Typography>

                    {currentHoldings && currentHoldings.length > 0 &&
                        currentHoldings.some(h => h.status !== 'OK') && (
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            Alguns ativos não têm preço de mercado disponível (marcados como <strong>N/D</strong>).
                            A coluna <em>Valor Mercado</em> mostra o custo base como referência para essas posições.
                            O P/L em aberto não está incluído nos totais para esses ativos.
                        </Alert>
                    )}

                    {currentHoldings && currentHoldings.length > 0 ? (
                        // flexGrow:1 makes the grid fill exactly the space left after the title/alert
                        <Box sx={{ flexGrow: 1 }}>
                            <DataGrid
                                rows={currentHoldings}
                                columns={holdingsColumns}
                                getRowId={(row) => row.isin + row.product_name}
                                density="compact"
                                sx={{ height: '100%' }}
                                localeText={{
                                    noRowsLabel: 'Nenhuma posição encontrada',
                                    noResultsOverlayLabel: 'Nenhum resultado encontrado'
                                }}
                            />
                        </Box>
                    ) : (
                        <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                            <Typography variant="body1" color="text.secondary">
                                Nenhuma posição encontrada para este portfólio.
                            </Typography>
                            <Typography variant="body2" color="text.secondary">
                                Isso pode ocorrer quando:
                            </Typography>
                            <ul style={{ margin: 0, paddingLeft: '20px' }}>
                                <li>Não há transações carregadas para este portfólio</li>
                                <li>Todas as posições foram vendidas</li>
                                <li>As transações ainda estão sendo processadas</li>
                            </ul>
                        </Box>
                    )}
                </Box>
            )}

            {currentTab === 'uploads' && (
                <Box sx={{ height: TAB_GRID_HEIGHT, width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" gutterBottom>Histórico de Uploads</Typography>
                    <Box sx={{ flexGrow: 1 }}>
                        <DataGrid
                            rows={upload_history || []}
                            columns={uploadHistoryColumns}
                            density="compact"
                            sx={{ height: '100%' }}
                        />
                    </Box>
                </Box>
            )}

            {currentTab === 'transactions' && (
                <Box sx={{ height: TAB_GRID_HEIGHT, width: '100%', display: 'flex', flexDirection: 'column' }}>
                    <Typography variant="h6" gutterBottom>Transações do Portfólio</Typography>
                    <Box sx={{ flexGrow: 1 }}>
                        <DataGrid
                            rows={transactions || []}
                            columns={transactionColumns}
                            getRowId={(row) => row.id}
                            density="compact"
                            sx={{ height: '100%' }}
                        />
                    </Box>
                </Box>
            )}

            {/* --- MODAL DE SEGURANÇA IMPERSONATE --- */}
            <Dialog open={openImpersonateModal} onClose={() => setOpenImpersonateModal(false)}>
                <DialogTitle sx={{ bgcolor: 'warning.light', color: 'warning.contrastText' }}>
                    Acesso Restrito: Impersonar {data?.user?.email}
                </DialogTitle>
                <DialogContent sx={{ mt: 2 }}>
                    <DialogContentText sx={{ mb: 2 }}>
                        Para aceder à conta deste utilizador, confirme a sua identidade inserindo o código 2FA do seu autenticador.
                    </DialogContentText>
                    <TextField
                        autoFocus
                        margin="dense"
                        label="Código 2FA"
                        type="text"
                        fullWidth
                        value={impersonateMfaCode}
                        onChange={(e) => setImpersonateMfaCode(e.target.value)}
                        inputProps={{ maxLength: 6, style: { textAlign: 'center', letterSpacing: 4, fontSize: '1.2rem' } }}
                    />
                    {impersonateError && (
                        <Alert severity="error" sx={{ mt: 2 }}>{impersonateError}</Alert>
                    )}
                </DialogContent>
                <DialogActions>
                    <Button onClick={() => setOpenImpersonateModal(false)} color="inherit" disabled={isImpersonating}>
                        Cancelar
                    </Button>
                    <Button onClick={handleConfirmImpersonate} color="warning" variant="contained" disabled={isImpersonating || !impersonateMfaCode}>
                        {isImpersonating ? <CircularProgress size={24} /> : "Confirmar Acesso"}
                    </Button>
                </DialogActions>
            </Dialog>

        </Box>
    );
};

export default UserDetailPage;
