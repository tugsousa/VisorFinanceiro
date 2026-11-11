import React, { useState } from 'react';
import { Box, Typography, Grid, CircularProgress, Alert, Paper, Tabs, Tab } from '@mui/material';
import { useSearchParams } from 'react-router-dom';
import AllocationTab from '../../allocation/pages/AllocationTab';
import { ALLOCATION_TAB } from '../../allocation/logic/allocationLogic';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolioData } from '../hooks/usePortfolioData';
import StockHoldingsSection from '../../analytics/components/StockHoldingsSection';
import OptionHoldingsSection from '../../analytics/components/OptionHoldingsSection';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import SaleSimulatorDrawer from '../../tax/components/SaleSimulatorDrawer';
import { usePortfolio } from '../PortfolioContext';

const PortfolioPage = () => {
    const { token } = useAuth();
    const { activePortfolio } = usePortfolio();
    const [positionToSimulate, setPositionToSimulate] = useState(null);
    // The tab is in the address (/portfolio?tab=alocacao), so the dashboard can link to it.
    const [searchParams, setSearchParams] = useSearchParams();
    const tab = searchParams.get('tab') === ALLOCATION_TAB ? ALLOCATION_TAB : 'posicoes';
    const changeTab = (_, value) => setSearchParams(value === ALLOCATION_TAB ? { tab: ALLOCATION_TAB } : {}, { replace: true });
    const {
        holdingsForGroupedView,
        detailedHoldingsForView,
        optionHoldings, 
        unrealizedStockPL, 
        isLoading, 
        isError 
    } = usePortfolioData(token);

    if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    if (isError) return <Alert severity="error">Erro ao carregar dados do portfólio.</Alert>;

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1" fontWeight="bold">
                    A Minha Carteira
                </Typography>
            </Box>

            <Tabs value={tab} onChange={changeTab} sx={{ mb: 3, borderBottom: 1, borderColor: 'divider' }}>
                <Tab value="posicoes" label="Posições" sx={{ textTransform: 'none' }} />
                <Tab value={ALLOCATION_TAB} label="Alocação-alvo" sx={{ textTransform: 'none' }} />
            </Tabs>

            {tab === ALLOCATION_TAB ? (
                <AllocationTab portfolioId={activePortfolio?.id} />
            ) : (
            <Grid container spacing={3}>
                {/* Stock Holdings Table */}
                <Grid item xs={12}>
                    <StockHoldingsSection 
                        groupedData={holdingsForGroupedView}
                        detailedData={detailedHoldingsForView}
                        isGroupedFetching={isLoading}
                        isDetailedFetching={false}
                        selectedYear="all"
                        NoRowsOverlay={() => <Box sx={{p:2, textAlign:'center'}}>Sem posições abertas.</Box>}
                        onSimulateSale={setPositionToSimulate}
                    />
                </Grid>

                {/* Option Holdings Table */}
                {optionHoldings && optionHoldings.length > 0 && (
                    <Grid item xs={12}>
                        <OptionHoldingsSection 
                            holdingsData={optionHoldings} 
                            isLoading={isLoading} 
                        />
                    </Grid>
                )}
            </Grid>
            )}

            <SaleSimulatorDrawer
                portfolioId={activePortfolio?.id}
                position={positionToSimulate}
                onClose={() => setPositionToSimulate(null)}
            />
        </Box>
    );
};

export default PortfolioPage;