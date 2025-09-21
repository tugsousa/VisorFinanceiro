import React from 'react';
import { useParams, Link as RouterLink } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetchAdminUserDetails } from '../api/apiService';
import { Box, Typography, CircularProgress, Alert, Paper, Grid, Divider, Link } from '@mui/material';
import { useAuth } from '../context/AuthContext';
import { DataGrid } from '@mui/x-data-grid';
import { parseDateRobust } from '../utils/dateUtils';
import { formatCurrency } from '../utils/formatUtils';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';

// Componente para cartões de KPIs
const StatCard = ({ title, value }) => (
    <Paper variant="outlined" sx={{ p: 2, textAlign: 'center', height: '100%' }}>
        <Typography variant="body2" color="text.secondary">{title}</Typography>
        <Typography variant="h6" component="p" sx={{ fontWeight: 'bold' }}>
            {value}
        </Typography>
    </Paper>
);

const UserDetailPage = () => {
    const { userId } = useParams();
    const { token } = useAuth();

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['adminUserDetails', userId, token],
        queryFn: () => apiFetchAdminUserDetails(userId).then(res => res.data),
        enabled: !!token && !!userId,
    });

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
                    <Grid item xs={12} sm={6} md={3}><StatCard title="Valor Carteira" value={formatCurrency(user.portfolio_value_eur)} /></Grid>
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Data Registo:</strong> {new Date(user.created_at).toLocaleString()}</Typography></Grid>
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Último Login:</strong> {user.last_login_at.Valid ? new Date(user.last_login_at.Time).toLocaleString() : 'N/A'}</Typography></Grid>
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>IP Último Login:</strong> {user.last_login_ip || 'N/A'}</Typography></Grid>
                    <Grid item xs={12} sm={6}><Typography variant="body2"><strong>Fornecedor Auth:</strong> {user.auth_provider}</Typography></Grid>
                </Grid>
            </Paper>

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
                <Typography variant="h6" gutterBottom>Transações Processadas</Typography>
                 <Box sx={{ height: 500, width: '100%' }}>
                    <DataGrid
                        rows={transactions.map(t => ({...t, id: t.ID}))} // Garante que cada linha tem um `id` único
                        columns={transactionColumns}
                    />
                </Box>
            </Paper>
        </Box>
    );
};

export default UserDetailPage;