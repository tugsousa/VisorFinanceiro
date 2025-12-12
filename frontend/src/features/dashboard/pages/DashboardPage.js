import React, { useMemo } from 'react';
import { Box, Typography, Card, CircularProgress, Alert, Grid } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { useDashboardData } from '../../analytics/hooks/useDashboardData';
import { useQuery } from '@tanstack/react-query';
import { apiFetchHistoricalChartData } from '../../analytics/api/analyticsApi';

// Componentes
import DashboardKPISection from '../components/DashboardKPISection';
import HistoricalPerformanceChart from '../../analytics/components/HistoricalPerformanceChart';
import HoldingsAllocationChart from '../../analytics/components/HoldingsAllocationChart';

// Utils
import { parseDateRobust } from '../../../lib/utils/dateUtils';

// --- FUNÇÃO AUXILIAR: XIRR (Cálculo de Retorno Ponderado pelo Tempo) ---
const calculateXIRR = (cashFlows, currentValue, guess = 0.1) => {
    // cashFlows: Array de { amount: -1000, date: Date } (Depósitos são negativos, Levantamentos positivos)
    // Adicionamos o valor atual como um "levantamento final" positivo
    const flows = [...cashFlows, { amount: currentValue, date: new Date() }];
    
    const func = (rate) => {
        return flows.reduce((sum, item) => {
            const days = (item.date - flows[0].date) / (1000 * 60 * 60 * 24);
            return sum + item.amount / Math.pow(1 + rate, days / 365);
        }, 0);
    };

    // Método de Newton-Raphson simplificado
    let rate = guess;
    for (let i = 0; i < 50; i++) { // Max 50 iterações
        const fValue = func(rate);
        if (Math.abs(fValue) < 0.01) break; // Convergiu
        // Derivada
        const derivative = flows.reduce((sum, item) => {
            const days = (item.date - flows[0].date) / (1000 * 60 * 60 * 24);
            return sum - (days / 365) * item.amount * Math.pow(1 + rate, - (days / 365) - 1);
        }, 0);
        const newRate = rate - fValue / derivative;
        if (Math.abs(newRate - rate) < 0.0001) break;
        rate = newRate;
    }
    return rate * 100; // Retorna em %
};

const DashboardPage = () => {
    const { user } = useAuth();
    const { activePortfolio } = usePortfolio();
    const { token } = useAuth();

    // 1. Carregar Dados
    const { 
        currentHoldingsValueData,
        allTransactionsData,
        isLoading: isDataLoading,
        isError
    } = useDashboardData(token);

    // 2. Carregar Histórico (Para variação diária)
    const { data: historicalData, isLoading: isHistoryLoading } = useQuery({
        queryKey: ['historicalChartData', activePortfolio?.id], 
        queryFn: async () => {
            if (!activePortfolio?.id) return [];
            const res = await apiFetchHistoricalChartData(activePortfolio?.id); 
            return res.data;
        },
        enabled: !!activePortfolio?.id, 
    });

    const isLoading = isDataLoading || isHistoryLoading;

    // 3. Calcular Métricas
    const metrics = useMemo(() => {
        const defaults = {
            totalPortfolioValue: 0, netDeposits: 0, investedCapital: 0, cashBalance: 0,
            totalPL: 0, totalReturnPct: 0, dailyChangeValue: 0, dailyChangePct: 0, annualizedReturn: 0
        };

        if (!currentHoldingsValueData || !allTransactionsData) return defaults;

        // --- A. Valor das Ações (Equity) ---
        // Este valor vem do endpoint /holdings/current-value e deve bater certo com a soma das posições
        const equityCurrentValue = currentHoldingsValueData.reduce((acc, h) => acc + (h.market_value_eur || 0), 0);
        const equityInvested = currentHoldingsValueData.reduce((acc, h) => acc + Math.abs(h.total_cost_basis_eur || 0), 0);

        // --- B. Cash Disponível (Lógica Corrigida) ---
        // Vamos agrupar por 'source' (ex: DEGIRO, IBKR) e pegar a data mais recente
        const latestBalances = {}; 
        let sumDeposits = 0;
        let sumWithdrawals = 0;
        let netFlowsToday = 0;
        const xirrFlows = []; // Para cálculo do XIRR

        const now = new Date();
        const todayStr = now.toISOString().split('T')[0]; // YYYY-MM-DD

        // Processar transações
        allTransactionsData.forEach(tx => {
            const txDate = parseDateRobust(tx.date);
            
            // 1. Acumular Depósitos Líquidos
            if (tx.transaction_type === 'CASH') {
                const amt = tx.amount_eur || 0;
                
                // Guardar fluxo para XIRR (Depósitos = negativo (investimento), Levantamento = positivo (retorno))
                // Nota: Na tua BD, Depósitos costumam ser positivos e Withdrawals negativos.
                // Para XIRR, "Money In" tem de ser negativo.
                if (txDate) {
                    // Inverter sinal: Se entrei dinheiro (+), para XIRR é um desembolso (-)
                    xirrFlows.push({ amount: -amt, date: txDate });
                }

                if (tx.transaction_subtype === 'DEPOSIT') sumDeposits += amt;
                if (tx.transaction_subtype === 'WITHDRAWAL') sumWithdrawals += amt;

                // Fluxo de hoje para Variação Diária
                if (txDate && txDate.toISOString().split('T')[0] === todayStr) {
                    netFlowsToday += amt;
                }
            }

            // 2. Encontrar o último saldo de caixa REPORTADO pelo broker
            // Só olhamos para transações que tenham saldo registado
            if (tx.cash_balance !== undefined && tx.cash_balance !== null && tx.source) {
                // Se ainda não temos saldo desta fonte OU se esta transação é mais recente que a guardada
                const currentStored = latestBalances[tx.source];
                if (!currentStored || (txDate && currentStored.date && txDate > currentStored.date) || (tx.id > currentStored.id)) {
                    latestBalances[tx.source] = {
                        balance: tx.cash_balance,
                        currency: tx.balance_currency,
                        date: txDate,
                        id: tx.id
                    };
                }
            }
        });

        // Somar os saldos mais recentes de todas as fontes (Convertendo se necessário, assumindo EUR por agora)
        let currentCash = 0;
        Object.values(latestBalances).forEach(item => {
            if (item.currency === 'EUR') {
                currentCash += item.balance;
            } else {
                // Se tiveres saldos em USD, precisarias de converter. 
                // Por agora assumimos que o parser já converteu ou que é EUR.
                currentCash += item.balance; 
            }
        });

        // --- C. Totais ---
        const totalPortfolioValue = equityCurrentValue + currentCash;
        const netDeposits = sumDeposits + sumWithdrawals; // Depósitos Líquidos

        // --- D. Lucro e Retorno Simples ---
        // Fórmula pedida: Valor Total - Depósitos Líquidos
        const totalPL = totalPortfolioValue - netDeposits;
        
        // Fórmula pedida: % sobre Depósitos Líquidos
        const totalReturnPct = netDeposits > 0 ? (totalPL / netDeposits) * 100 : 0;

        // --- E. Variação Diária ---
        let dailyChangeValue = 0;
        let dailyChangePct = 0;

        if (historicalData && historicalData.length > 0) {
            // Ignorar snapshot de hoje se já existir
            const pastSnapshots = historicalData.filter(h => h.date < todayStr);
            const prevSnapshot = pastSnapshots.length > 0 ? pastSnapshots[pastSnapshots.length - 1] : null;

            if (prevSnapshot) {
                // Variação Bruta
                const rawDiff = totalPortfolioValue - prevSnapshot.portfolio_value;
                // Ajustar fluxos de caixa de hoje:
                // Variação Real = (Valor Hoje - Valor Ontem) - (Dinheiro que entrou hoje)
                dailyChangeValue = rawDiff - netFlowsToday;
                
                if (prevSnapshot.portfolio_value > 0) {
                    dailyChangePct = (dailyChangeValue / prevSnapshot.portfolio_value) * 100;
                }
            }
        }

        // --- F. XIRR (Retorno Anualizado Real) ---
        let xirr = 0;
        try {
            if (xirrFlows.length > 0 && totalPortfolioValue > 0) {
                xirr = calculateXIRR(xirrFlows, totalPortfolioValue);
            }
        } catch (e) {
            console.error("Erro cálculo XIRR", e);
            xirr = 0; // Fallback
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
            annualizedReturn: xirr // Usamos o XIRR aqui
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

    if (isError) return <Alert severity="error">Erro ao carregar dados do dashboard.</Alert>;

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ mb: 3 }}>
                <Typography variant="h4" component="h1" fontWeight="800" sx={{ color: '#2c3e50', letterSpacing: '-0.5px' }}>
                    Olá, {user?.username?.split(' ')[0] || 'Investidor'}
                </Typography>
                <Typography variant="body1" color="text.secondary">
                    Resumo do portfólio <strong>{activePortfolio?.name}</strong>
                </Typography>
            </Box>

            <DashboardKPISection metrics={metrics} isLoading={isLoading} sx={{ mb: 2 }} />

            <Grid container spacing={3}>
                <Grid item xs={12} lg={8}>
                    <Card elevation={0} sx={{ borderRadius: 3, height: '500px', border: 'none', display: 'flex', flexDirection: 'column' }}>
                        <Box sx={{ flexGrow: 1, minHeight: 0 }}>
                            <HistoricalPerformanceChart />
                        </Box>
                    </Card>
                </Grid>
                <Grid item xs={12} lg={4}>
                    <Card elevation={0} sx={{ borderRadius: 3, height: '500px', border: 'none', p: 3, display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <Typography variant="h6" fontWeight="bold" gutterBottom sx={{ alignSelf: 'flex-start' }}>Alocação</Typography>
                        <Box sx={{ width: '100%', flexGrow: 1, position: 'relative' }}>
                            <HoldingsAllocationChart holdings={holdingsForGroupedView} />
                        </Box>
                    </Card>
                </Grid>
            </Grid>
        </Box>
    );
};

export default DashboardPage;