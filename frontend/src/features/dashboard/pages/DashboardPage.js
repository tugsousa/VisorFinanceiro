import React from 'react';
import { Box, Typography, Grid, Paper, Button } from '@mui/material';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import HistoricalPerformanceChart from '../../analytics/components/HistoricalPerformanceChart';
import UploadFileIcon from '@mui/icons-material/UploadFile';
import { Link as RouterLink } from 'react-router-dom';

// Simple hook for dashboard high-level metrics could be added here
// For now, we use the chart which fetches its own data

const DashboardPage = () => {
    const { user } = useAuth();
    const { activePortfolio } = usePortfolio();

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
                <Box>
                    <Typography variant="h4" component="h1" gutterBottom>
                        Olá, {user?.username || 'Investidor'}!
                    </Typography>
                    <Typography variant="body1" color="text.secondary">
                        Aqui está o resumo do teu portfólio: <strong>{activePortfolio?.name || 'Nenhum selecionado'}</strong>
                    </Typography>
                </Box>
                <Button 
                    variant="contained" 
                    startIcon={<UploadFileIcon />} 
                    component={RouterLink} 
                    to="/upload"
                >
                    Importar Dados
                </Button>
            </Box>

            <Grid container spacing={3}>
                {/* Historical Chart Section */}
                <Grid item xs={12}>
                    <Paper elevation={0} sx={{ p: 2, borderRadius: 2, border: '1px solid', borderColor: 'divider' }}>
                        <Typography variant="h6" gutterBottom sx={{ px: 2, pt: 1 }}>Performance Histórica</Typography>
                        <HistoricalPerformanceChart />
                    </Paper>
                </Grid>

                {/* We can add KPI cards here later using a useDashboardData hook */}
            </Grid>
        </Box>
    );
};

export default DashboardPage;