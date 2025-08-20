import React from 'react';
import { Box, Typography, Grid, Paper, Card, CardActionArea, CardContent } from '@mui/material';
import {
  Upload as UploadIcon,
  Paid as RealizedGainsIcon,
  ReceiptLong as TaxIcon, 
  TableView as TableViewIcon, 
} from '@mui/icons-material';
import { useAuth } from '../context/AuthContext';
import { Link as RouterLink } from 'react-router-dom';

const dashboardItems = [
  { title: "Carregar Transacções", to: "/upload", icon: <UploadIcon fontSize="large" />, description: "Carregue o seu ficheiro CSV com as transacções mais recentes." },
  { title: "Consultar Mais-Valias Realizadas", to: "/realizedgains", icon: <RealizedGainsIcon fontSize="large" />, description: "Analise o desempenho do seu portefólio e os seus resultados (P/L)." },
  { title: "Gerar Relatório Fiscal", to: "/tax", icon: <TaxIcon fontSize="large" />, description: "Prepare os dados para a sua declaração anual de impostos." },
  { title: "Consultar Transacções", to: "/transactions", icon: <TableViewIcon fontSize="large" />, description: "Ver todas as transacções já processadas." },
];

const DashboardPage = () => {
    const { user } = useAuth();

    return (
        <Box sx={{ p: { xs: 2, sm: 3 } }}>
            <Typography variant="h4" component="h1" gutterBottom>
                Bem-vindo, {user?.username || 'User'}!
            </Typography>
            <Typography variant="subtitle1" color="text.secondary" sx={{ mb: 4 }}>
                
            </Typography>
            <Grid container spacing={3}>
                {dashboardItems.map((item) => (
                    <Grid item xs={12} sm={6} md={4} key={item.title}>
                        <Card component={RouterLink} to={item.to} sx={{ textDecoration: 'none', height: '100%' }}>
                            <CardActionArea sx={{ p: 2, display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', height: '100%' }}>
                                <Box sx={{ color: 'primary.main', mb: 2 }}>
                                    {item.icon}
                                </Box>
                                <CardContent>
                                    <Typography gutterBottom variant="h6" component="div">
                                        {item.title}
                                    </Typography>
                                    <Typography variant="body2" color="text.secondary">
                                        {item.description}
                                    </Typography>
                                </CardContent>
                            </CardActionArea>
                        </Card>
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default DashboardPage;