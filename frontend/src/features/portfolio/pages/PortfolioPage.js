import React from 'react';
import { Box, Typography, Grid, Paper, CircularProgress, Alert } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolioData } from '../hooks/usePortfolioData';
import StockHoldingsSection from '../../analytics/components/StockHoldingsSection';
import OptionHoldingsSection from '../../analytics/components/OptionHoldingsSection';
import HoldingsAllocationChart from '../../analytics/components/HoldingsAllocationChart';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const PortfolioPage = () => {
    const { token } = useAuth();
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
            <Typography variant="h4" component="h1" gutterBottom>
                A Minha Carteira
            </Typography>

            <Grid container spacing={3}>
                {/* Metrics Summary */}
                <Grid item xs={12} md={4}>
                    <Paper sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center' }}>
                        <Typography variant="subtitle2" color="text.secondary">P/L Não Realizado (Aberto)</Typography>
                        <Typography variant="h4" sx={{ color: unrealizedStockPL >= 0 ? 'success.main' : 'error.main', fontWeight: 'bold' }}>
                            {formatCurrency(unrealizedStockPL)}
                        </Typography>
                    </Paper>
                </Grid>
                
                {/* Allocation Chart */}
                <Grid item xs={12} md={8}>
                    <Paper sx={{ p: 2, height: 300 }}>
                        <HoldingsAllocationChart holdings={holdingsForGroupedView} />
                    </Paper>
                </Grid>

                {/* Stock Holdings Table */}
                <Grid item xs={12}>
                    <StockHoldingsSection 
                        groupedData={holdingsForGroupedView}
                        detailedData={detailedHoldingsForView}
                        isGroupedFetching={isLoading}
                        isDetailedFetching={false}
                        selectedYear="all"
                        NoRowsOverlay={() => <Box sx={{p:2, textAlign:'center'}}>Sem posições abertas.</Box>}
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
        </Box>
    );
};

export default PortfolioPage;