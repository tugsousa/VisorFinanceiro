import React from 'react';
import { Box, Typography, Grid, CircularProgress, Alert, Paper } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolioData } from '../hooks/usePortfolioData';
import StockHoldingsSection from '../../analytics/components/StockHoldingsSection';
import OptionHoldingsSection from '../../analytics/components/OptionHoldingsSection';
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
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Typography variant="h4" component="h1" fontWeight="bold">
                    A Minha Carteira
                </Typography>
            </Box>

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