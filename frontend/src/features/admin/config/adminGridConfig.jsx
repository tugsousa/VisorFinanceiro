import React from 'react';
import { Tooltip, Typography, Box, CircularProgress, IconButton } from '@mui/material';
import RefreshIcon from '@mui/icons-material/Refresh';
import { formatCurrency } from '../../../lib/utils/formatUtils';

export const getUserColumns = (refreshingUserId, refreshMutation) => [
    { field: 'id', headerName: 'ID', width: 70 },
    { field: 'email', headerName: 'Email', width: 220, renderCell: (params) => (<Tooltip title={params.value}><Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{params.value}</Typography></Tooltip>) },
    { field: 'auth_provider', headerName: 'Sign-in', width: 100 },
    { field: 'total_upload_count', headerName: 'Uploads (Total)', type: 'number', width: 120 },
    { field: 'upload_count', headerName: 'Ficheiros (Atuais)', type: 'number', width: 120 },
    { field: 'distinct_broker_count', headerName: 'Corretoras', type: 'number', width: 100 },
    { field: 'portfolio_value_eur', headerName: 'Valor Carteira (€)', type: 'number', width: 150, valueFormatter: (value) => value ? formatCurrency(value) : '0.00' },
    { 
        field: 'top_5_holdings', headerName: 'Top 5 Posições', width: 250, sortable: false,
        renderCell: (params) => {
            try {
                const holdings = JSON.parse(params.value);
                if (!Array.isArray(holdings) || holdings.length === 0) return 'N/A';
                return (
                    <Tooltip title={holdings.map(h => `${h.name}: ${formatCurrency(h.value)}`).join('\n')}>
                        <Box sx={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {holdings.map(h => h.name).join(', ')}
                        </Box>
                    </Tooltip>
                );
            } catch { return params.value || 'N/A'; }
        }
    },
    { field: 'login_count', headerName: 'Nº de Logins', type: 'number', width: 120 },
    { field: 'last_login_at', headerName: 'Último Login', width: 170, type: 'dateTime', valueGetter: (value) => value ? new Date(value.Time) : null },
    { field: 'created_at', headerName: 'Data Registo', width: 170, type: 'dateTime', valueGetter: (value) => new Date(value) },
    {
        field: 'actions', headerName: 'Ações', width: 80, sortable: false, disableColumnMenu: true,
        renderCell: (params) => {
            const isRefreshing = refreshingUserId === params.id;
            return (
                <Tooltip title="Atualizar valor da carteira">
                    <IconButton onClick={(e) => { e.stopPropagation(); refreshMutation.mutate(params.id); }} disabled={isRefreshing} size="small">
                        {isRefreshing ? <CircularProgress size={20} /> : <RefreshIcon />}
                    </IconButton>
                </Tooltip>
            );
        }
    }
];

export const getTopUsersTableColumns = (valueHeader) => [
    { field: 'email', headerName: 'Email', flex: 1, minWidth: 150, renderCell: (params) => (<Tooltip title={params.value}><Typography variant="body2" sx={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{params.value}</Typography></Tooltip>) },
    { field: 'value', headerName: valueHeader, type: 'number', width: 130, align: 'right', headerAlign: 'right' },
];