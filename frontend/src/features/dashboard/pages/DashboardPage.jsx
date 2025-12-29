// frontend/src/features/dashboard/pages/DashboardPage.js
import React, { useMemo } from 'react';
import { Box, Typography, Card, Alert, Button, CircularProgress, Grid, Tooltip } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import ShowChartIcon from '@mui/icons-material/ShowChart';
import CompareArrowsIcon from '@mui/icons-material/CompareArrows';
import { Link as RouterLink } from 'react-router-dom';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { useDashboardData } from '../hooks/useDashboardData';
import { useQuery } from '@tanstack/react-query';
import { apiFetchHistoricalChartData } from '../../analytics/api/analyticsApi';
import { apiRefreshPortfolioSnapshot } from '../../portfolio/api/portfolioApi';

// Components
import DashboardKPISection from '../components/DashboardKPISection';
import HistoricalPerformanceChart from '../components/HistoricalPerformanceChart';
import ReturnsPeriodSection from '../components/ReturnsPeriodSection';
import AllocationSection from '../components/AllocationSection';
import HeatmapSection from '../components/HeatmapSection';

// Utils
import { parseDateRobust } from '../../../lib/utils/dateUtils';

// --- FUNÇÃO AUXILIAR: XIRR ---
const calculateXIRR = (cashFlows, currentValue, guess = 0.1) => {
    // ... (função calculateXIRR completa) ...
    const flows = [...cashFlows, { amount: currentValue, date: new Date() }];

    const func = (rate) => {
        return flows.reduce((sum, item) => {
            const days = (item.date - flows[0].date) / (1000 * 60 * 60 * 24);
            return sum + item.amount / Math.pow(1 + rate, days / 365);
        }, 0);
    };

    let rate = guess;
    for (let i = 0; i < 50; i++) {
        const fValue = func(rate);
        if (Math.abs(fValue) < 0.01) break;
        const derivative = flows.reduce((sum, item) => {
            const days = (item.date - flows[0].date) / (1000 * 60 * 60 * 24);
            return sum - (days / 365) * item.amount * Math.pow(1 + rate, - (days / 365) - 1);
        }, 0);
        const newRate = rate - fValue / derivative;
        if (Math.abs(newRate - rate) < 0.0001) break;
        rate = newRate;
    }
    return rate * 100;
};

const DashboardPage = () => {
    // ######################################################################
    // ### 1. CHAME TODOS OS HOOKS NO TOPO AQUI, SEMPRE NA MESMA ORDEM ###
    // ######################################################################

    // Auth and Portfolio Hooks
    const { user, hasInitialData, checkingData, token } = useAuth();
    const { activePortfolio, loading: isPortfolioLoading } = usePortfolio();
    const queryClient = useQueryClient();

    // Data Hooks
    const { currentHoldingsValueData, allTransactionsData, isLoading: isDataLoading, isError } = useDashboardData(token);

    // Historical Data Hook (useQuery)
    const { data: historicalData, isLoading: isHistoryLoading } = useQuery({
        queryKey: ['historicalChartData', activePortfolio?.id],
        queryFn: async () => {
            if (!activePortfolio?.id) return [];
            const res = await apiFetchHistoricalChartData(activePortfolio?.id);
            return res.data;
        },
        enabled: !!activePortfolio?.id,
    });

    // Combined Loading State
    const isLoading = isDataLoading || isHistoryLoading || isPortfolioLoading;

    // 3. Calcular Métricas
    const metrics = useMemo(() => {
        const defaults = {
            totalPortfolioValue: 0,
            netDeposits: 0,
            investedCapital: 0,
            cashBalance: 0,
            totalPL: 0,
            totalReturnPct: 0,
            dailyChangeValue: 0,
            dailyChangePct: 0,
            annualizedReturn: 0
        };

        if (!currentHoldingsValueData || !allTransactionsData) return defaults;

        // A. Equity
        const equityCurrentValue = currentHoldingsValueData.reduce((acc, h) => acc + (h.market_value_eur || 0), 0);
        const equityInvested = currentHoldingsValueData.reduce((acc, h) => acc + Math.abs(h.total_cost_basis_eur || 0), 0);

        // B. Cash
        const latestBalances = {};
        let sumDeposits = 0;
        let sumWithdrawals = 0;
        let netFlowsToday = 0;
        const xirrFlows = [];
        const now = new Date();
        const todayStr = now.toISOString().split('T')[0];

        allTransactionsData.forEach(tx => {
            const txDate = parseDateRobust(tx.date);

            if (tx.transaction_type === 'CASH') {
                const amt = tx.amount_eur || 0;
                if (txDate) xirrFlows.push({ amount: -amt, date: txDate });

                if (tx.transaction_subtype === 'DEPOSIT') sumDeposits += amt;
                if (tx.transaction_subtype === 'WITHDRAWAL') sumWithdrawals += amt;

                if (txDate && txDate.toISOString().split('T')[0] === todayStr) {
                    netFlowsToday += amt;
                }
            }

            if (tx.cash_balance !== undefined && tx.cash_balance !== null && tx.source) {
                const currentStored = latestBalances[tx.source];
                if (!currentStored || (txDate && currentStored.date && txDate > currentStored.date) || (tx.id > currentStored.id)) {
                    latestBalances[tx.source] = { balance: tx.cash_balance, currency: tx.balance_currency, date: txDate, id: tx.id };
                }
            }
        });

        let currentCash = 0;
        Object.values(latestBalances).forEach(item => {
            currentCash += item.balance;
        });

        // C. Totais
        const totalPortfolioValue = equityCurrentValue + currentCash;
        const netDeposits = sumDeposits + sumWithdrawals;
        const totalPL = totalPortfolioValue - netDeposits;
        const totalReturnPct = netDeposits > 0 ? (totalPL / netDeposits) * 100 : 0;

        // D. Variação Diária
        let dailyChangeValue = 0;
        let dailyChangePct = 0;

        if (historicalData && historicalData.length > 0) {
            const pastSnapshots = historicalData.filter(h => h.date < todayStr);
            const prevSnapshot = pastSnapshots.length > 0 ? pastSnapshots[pastSnapshots.length - 1] : null;

            if (prevSnapshot) {
                const rawDiff = totalPortfolioValue - prevSnapshot.portfolio_value;
                dailyChangeValue = rawDiff - netFlowsToday;
                if (prevSnapshot.portfolio_value > 0) {
                    dailyChangePct = (dailyChangeValue / prevSnapshot.portfolio_value) * 100;
                }
            }
        }

        // E. XIRR
        let xirr = 0;
        try {
            if (xirrFlows.length > 0 && totalPortfolioValue > 0) {
                xirr = calculateXIRR(xirrFlows, totalPortfolioValue);
            }
        } catch (e) {
            console.error("XIRR error", e);
        }

        return {
            totalPortfolioValue,
            netDeposits,
            investedCapital: equityInvested,
            cashBalance: currentCash,
            totalPL,
            totalReturnPct,
            dailyChangeValue,
            dailyChangePct,
            annualizedReturn: xirr
        };
    }, [currentHoldingsValueData, allTransactionsData, historicalData]);

    const holdingsForGroupedView = useMemo(() => {
        if (!currentHoldingsValueData) return [];
        return currentHoldingsValueData.map(h => ({
            ...h,
            marketValueEUR: h.market_value_eur,
            total_cost_basis_eur: Math.abs(h.total_cost_basis_eur)
        }));
    }, [currentHoldingsValueData]);

    // Conteúdo do Tooltip da Evolução (Extraído para manter o JSX limpo)
    const evolutionTooltipContent = (
        <Box sx={{ p: 1 }}>
            <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ color: 'text.primary', fontSize: '0.95rem' }}>
                Evolução da Carteira vs. Benchmark
            </Typography>
            <Typography variant="body2" sx={{ color: 'text.secondary', mb: 2, fontSize: '0.8rem', lineHeight: 1.4 }}>
                Visualiza o crescimento do teu património e compara a performance com o mercado.
            </Typography>
            
            {/* Bloco Valor da Carteira */}
            <Box sx={{ bgcolor: 'grey.100', p: 1.5, borderRadius: 2, mb: 1.5 }}>
                <Grid container spacing={1} alignItems="center">
                    <Grid item>
                        <ShowChartIcon fontSize="small" color="primary" />
                    </Grid>
                    <Grid item xs>
                        <Typography variant="caption" fontWeight="bold" display="block" sx={{ color: 'text.primary' }}>Valor da Carteira</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.2, display: 'block' }}>
                            O valor real dos teus ativos dia a dia.
                        </Typography>
                    </Grid>
                </Grid>
            </Box>

            {/* Bloco Benchmark */}
            <Box sx={{ bgcolor: 'grey.100', p: 1.5, borderRadius: 2, mb: 1 }}>
                <Grid container spacing={1} alignItems="center">
                    <Grid item>
                        <CompareArrowsIcon fontSize="small" color="warning" />
                    </Grid>
                    <Grid item xs>
                        <Typography variant="caption" fontWeight="bold" display="block" sx={{ color: 'text.primary' }}>Benchmark S&P 500 (Simulado)</Typography>
                        <Typography variant="caption" sx={{ color: 'text.secondary', lineHeight: 1.2, display: 'block' }}>
                            Quanto terias hoje se tivesses investido todos os teus depósitos no S&P 500.
                        </Typography>
                    </Grid>
                </Grid>
            </Box>
        </Box>
    );

    // ######################################################################
    // ### 2. INÍCIO DA LÓGICA DE RETORNO CONDICIONAL ###
    // ######################################################################
    
    useEffect(() => {
        const triggerUpdate = async () => {
            if (!activePortfolio?.id) return;

            try {
                // 1. Trigger the backend calculation silently
                await apiRefreshPortfolioSnapshot(activePortfolio.id);
                
                // 2. Refetch the data to show the new values immediately
                // We invalidate these keys so React Query re-requests them
                queryClient.invalidateQueries({ queryKey: ['historicalChartData'] });
                queryClient.invalidateQueries({ queryKey: ['currentHoldingsValue'] });
                queryClient.invalidateQueries({ queryKey: ['dashboardKPIs'] }); // Or whatever keys affect the KPIs
            } catch (error) {
                // Optional: Log error silently, don't disturb the user if the auto-update fails
                console.warn("Auto-refresh of market data failed", error);
            }
        };

        triggerUpdate();
    }, [activePortfolio?.id, queryClient]);

    if (checkingData || isLoading) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }

    if (!activePortfolio) {
        return (
            <Box sx={{ p: 4, textAlign: 'center', maxWidth: 600, mx: 'auto' }}>
                <Alert severity="warning" sx={{ mb: 3 }}>
                    Nenhum portfólio ativo encontrado. Por favor, crie um portfólio para carregar dados e usar o dashboard.
                </Alert>
                <Button variant="contained" size="large" component={RouterLink} to="/portfolio" sx={{ textTransform: 'none' }}>
                    Gerir Portfólios
                </Button>
            </Box>
        );
    }

    if (hasInitialData === false) {
        return (
            <Box sx={{ p: 4, textAlign: 'center', maxWidth: 600, mx: 'auto' }}>
                <Alert severity="info" sx={{ mb: 3 }}>
                    Bem-vindo! O portfólio **{activePortfolio.name}** ainda não tem transações.
                </Alert>
                <Button variant="contained" size="large" component={RouterLink} to="/upload" sx={{ textTransform: 'none' }}>
                    Ir para Carregar Ficheiros
                </Button>
            </Box>
        );
    }

    if (isError) return <Alert severity="error">Erro ao carregar dados do dashboard.</Alert>;

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            {/* Header */}
            <Box sx={{ mb: 5 }}>
                <Typography variant="h4" component="h1" fontWeight="800" sx={{ color: '#2c3e50', letterSpacing: '-0.5px' }}>
                    Olá, {user?.username?.split(' ')[0] || 'Investidor'}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Resumo do <strong>{activePortfolio?.name}</strong>
                </Typography>
            </Box>

            {/* SECTION 1: HEADER / KPIs */}
            <Box sx={{ mb: 8 }}>
                <DashboardKPISection metrics={metrics} isLoading={isLoading} />
            </Box>

            {/* SECTION 2: MAIN CHART */}
            <Box sx={{ mb: 8 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', mb: 2, gap: 1 }}>
                    <Typography variant="h6" sx={{ fontWeight: 'bold' }}>
                        Evolução
                    </Typography>
                    
                    {/* ALTERADO: Tooltip Rich On Hover */}
                    <Tooltip 
                        title={evolutionTooltipContent}
                        arrow
                        placement="top"
                        componentsProps={{
                            tooltip: {
                                sx: {
                                    bgcolor: 'background.paper', // Fundo branco
                                    color: 'text.primary',
                                    boxShadow: '0px 4px 20px rgba(0,0,0,0.15)', // Sombra para parecer um modal/card
                                    borderRadius: 3,
                                    maxWidth: 360, // Largura maior para caber o texto
                                    p: 1 // Padding interno do tooltip
                                }
                            },
                            arrow: {
                                sx: { color: 'background.paper' } // Seta branca
                            }
                        }}
                    >
                        <InfoOutlinedIcon 
                            fontSize="small" 
                            sx={{ color: 'text.secondary', cursor: 'help', '&:hover': { color: 'primary.main' } }} 
                        />
                    </Tooltip>
                </Box>
                <Card elevation={0} sx={{ borderRadius: 3, height: '500px', border: 'none', display: 'flex', flexDirection: 'column' }}>
                    <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                        <HistoricalPerformanceChart />
                    </Box>
                </Card>
            </Box>

            {/* SECTION 3: RETURNS BY PERIOD */}
            <Box sx={{ mb: 8 }}>
                <ReturnsPeriodSection historicalData={historicalData} currentMetrics={metrics} isLoading={isLoading} />
            </Box>

            {/* SECTION 4: ALLOCATION */}
            <Box sx={{ mb: 8 }}>
                <AllocationSection holdings={holdingsForGroupedView} />
            </Box>

            {/* SECTION 5: HEATMAP */}
            <Box sx={{ mb: 4 }}>
                <HeatmapSection holdings={holdingsForGroupedView} />
            </Box>

        </Box>
    );
};

export default DashboardPage;