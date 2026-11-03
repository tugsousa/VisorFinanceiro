// frontend/src/features/analytics/components/CashFlowsSection.jsx
import React, { Fragment, useMemo } from 'react';
import {
    Typography, Paper, Box, Grid, CircularProgress,
    Table, TableBody, TableCell, TableContainer, TableHead, TableRow,
} from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';

import { parseDateRobust } from '../../../lib/utils/dateUtils';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { formatBroker, summarizeCashMovements } from '../logic/cashFlowCalculations';

const formatOriginalAmount = (amount, currency) => {
    const formatted = (amount || 0).toLocaleString('pt-PT', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    return currency ? `${formatted} ${currency}` : formatted;
};

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
    {
        field: 'transaction_subtype',
        headerName: 'Tipo',
        flex: 1,
        minWidth: 120,
        valueFormatter: (value) => (value === 'DEPOSIT' ? 'Depósito' : 'Levantamento'),
    },
    { field: 'source', headerName: 'Corretora', width: 120, valueFormatter: (value) => formatBroker(value) },
    {
        field: 'amount',
        headerName: 'Montante original',
        type: 'number',
        width: 160,
        headerAlign: 'right',
        align: 'right',
        renderCell: (params) => formatOriginalAmount(params.value, params.row.currency),
    },
    {
        field: 'amount_eur',
        headerName: 'Montante (€)',
        type: 'number',
        width: 130,
        headerAlign: 'right',
        align: 'right',
        renderCell: (params) => formatCurrency(params.value),
    },
];

const SummaryCard = ({ title, value }) => (
    <Paper elevation={0} sx={{ p: 2, borderRadius: 3 }}>
        <Typography variant="body2" color="text.secondary">{title}</Typography>
        <Typography variant="h5" sx={{ fontWeight: 600 }}>{formatCurrency(value)}</Typography>
    </Paper>
);

const SummaryRow = ({ year, broker, totals, isBold }) => {
    const cellSx = isBold ? { fontWeight: 600 } : undefined;
    return (
        <TableRow>
            <TableCell sx={cellSx}>{year}</TableCell>
            <TableCell sx={cellSx}>{broker}</TableCell>
            <TableCell align="right" sx={cellSx}>{formatCurrency(totals.deposited)}</TableCell>
            <TableCell align="right" sx={cellSx}>{formatCurrency(totals.withdrawn)}</TableCell>
            <TableCell align="right" sx={cellSx}>{formatCurrency(totals.net)}</TableCell>
        </TableRow>
    );
};

export default function CashFlowsSection({ movements, isLoading, NoRowsOverlay }) {
    const summary = useMemo(() => summarizeCashMovements(movements), [movements]);
    const hasData = movements.length > 0;

    if (isLoading && !hasData) {
        return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
    }

    if (!hasData) {
        return (
            <Typography align="center" sx={{ my: 4, color: 'text.secondary' }}>
                Não existem depósitos nem levantamentos para o período selecionado.
            </Typography>
        );
    }

    return (
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={4}><SummaryCard title="Total Depositado" value={summary.totals.deposited} /></Grid>
                <Grid item xs={12} md={4}><SummaryCard title="Total Levantado" value={summary.totals.withdrawn} /></Grid>
                <Grid item xs={12} md={4}><SummaryCard title="Valor Líquido" value={summary.totals.net} /></Grid>
            </Grid>

            <TableContainer sx={{ mb: 1 }}>
                <Table size="small">
                    <TableHead>
                        <TableRow>
                            <TableCell>Ano</TableCell>
                            <TableCell>Corretora</TableCell>
                            <TableCell align="right">Depositado</TableCell>
                            <TableCell align="right">Levantado</TableCell>
                            <TableCell align="right">Líquido</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {summary.years.map(({ year, totals, brokers }) => (
                            <Fragment key={year}>
                                <SummaryRow year={year} broker="Total" totals={totals} isBold />
                                {brokers.map(({ broker, totals: brokerTotals }) => (
                                    <SummaryRow key={broker} year="" broker={broker} totals={brokerTotals} />
                                ))}
                            </Fragment>
                        ))}
                        {summary.years.length > 1 && (
                            <SummaryRow year="Total" broker="" totals={summary.totals} isBold />
                        )}
                    </TableBody>
                </Table>
            </TableContainer>
            <Typography variant="caption" color="text.secondary" component="p" sx={{ mb: 4 }}>
                As transferências entre corretoras contam como um levantamento e um depósito, pelo que aumentam estes dois totais, mas não o valor líquido.
            </Typography>

            <Box sx={{ width: '100%' }}>
                <DataGrid
                    rows={movements}
                    columns={columns}
                    loading={isLoading}
                    autoHeight
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10 } },
                        sorting: { sortModel: [{ field: 'date', sort: 'desc' }] },
                    }}
                    pageSizeOptions={[10, 25, 50]}
                    disableRowSelectionOnClick
                    localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                    slots={{ noRowsOverlay: NoRowsOverlay }}
                />
            </Box>
        </Paper>
    );
}
