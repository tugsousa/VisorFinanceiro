// frontend/src/components/realizedgainsSections/FeesSection.js

import React from 'react';
import { Typography, Paper, Box } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { parseDateRobust } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';

const columns = [
    {
        field: 'date',
        headerName: 'Data',
        width: 110,
        type: 'date',
        valueGetter: (value) => parseDateRobust(value),
        valueFormatter: (value) => {
            if (!value) return '';
            const day = String(value.getDate()).padStart(2, '0');
            const month = String(value.getMonth() + 1).padStart(2, '0');
            const year = value.getFullYear();
            return `${day}-${month}-${year}`;
        }
    },
    { field: 'description', headerName: 'Descrição', flex: 1, minWidth: 250 },
    { field: 'category', headerName: 'Categoria', width: 150 },
    {
        field: 'amount_eur',
        headerName: 'Montante (€)',
        type: 'number',
        width: 130,
        headerAlign: 'right',
        align: 'right',
        renderCell: (params) => (
            <Box sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
                {formatCurrency(params.value)}
            </Box>
        ),
    },
    { field: 'source', headerName: 'Corretora', width: 120 },
];

// Ensure this component is exported correctly
export default function FeesSection({ feeData, selectedYear }) {
    if (!feeData || feeData.length === 0) {
        return (
            <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
                <Typography>Não existe informação sobre taxas e comissões para o período selecionado.</Typography>
            </Paper>
        );
    }

    const rows = feeData.map((fee, index) => ({
        id: `${fee.date}-${index}`,
        ...fee
    }));

    return (
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
            <Box sx={{ height: 600, width: '100%' }}>
                <DataGrid
                    rows={rows}
                    columns={columns}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10 } },
                        sorting: {
                            sortModel: [{ field: 'date', sort: 'desc' }],
                        },
                    }}
                    pageSizeOptions={[10, 25, 50]}
                    disableRowSelectionOnClick
                    sx={{ height: 'auto' }}
                    localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                />
            </Box>
        </Paper>
    );
}