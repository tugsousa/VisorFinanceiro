// frontend/src/pages/UserDetailPage.js (Exemplo de estrutura)
import React from 'react';
import { useParams } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { apiFetchAdminUserDetails } from '../api/apiService'; // Função a criar
import { Box, Typography, CircularProgress, Alert, Paper } from '@mui/material';
import { useAuth } from '../context/AuthContext';

const UserDetailPage = () => {
    const { userId } = useParams();
    const { token } = useAuth();

    const { data, isLoading, isError, error } = useQuery({
        queryKey: ['adminUserDetails', userId, token],
        queryFn: () => apiFetchAdminUserDetails(userId).then(res => res.data),
        enabled: !!token && !!userId,
    });

    if (isLoading) return <CircularProgress />;
    if (isError) return <Alert severity="error">{error.message}</Alert>;

    return (
        <Box>
            <Typography variant="h4">Detalhes do Utilizador: {data?.user.email}</Typography>
            
            <Paper sx={{ p: 2, mt: 2 }}>
                <Typography variant="h6">Informação Geral</Typography>
                {/* Mostre aqui os detalhes do utilizador: data de registo, nº de logins, etc. */}
            </Paper>
            
            <Paper sx={{ p: 2, mt: 2 }}>
                <Typography variant="h6">Histórico de Uploads</Typography>
                {/* Crie uma tabela para mostrar data, nome do ficheiro, nº de transações, etc. */}
            </Paper>

            <Paper sx={{ p: 2, mt: 2 }}>
                <Typography variant="h6">Transações Processadas</Typography>
                {/* Pode reutilizar o componente DataGrid para mostrar as transações do utilizador */}
            </Paper>
        </Box>
    );
};

export default UserDetailPage;