import React from 'react';
import { Box } from '@mui/material';
import { parseDateRobust, calculateDaysHeld } from '../../../lib/utils/dateUtils';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const dateFormatter = (value) => {
    if (!value) return '';
    const day = String(value.getDate()).padStart(2, '0');
    const month = String(value.getMonth() + 1).padStart(2, '0');
    const year = value.getFullYear();
    return `${day}-${month}-${year}`;
};

export const stockSalesColumns = [
    {
      field: 'BuyDate', headerName: 'Dt. abertura', width: 110, type: 'date',
      valueGetter: (value) => parseDateRobust(value),
      valueFormatter: dateFormatter
    },
    {
      field: 'SaleDate', headerName: 'Dt. fecho', width: 110, type: 'date',
      valueGetter: (value) => parseDateRobust(value),
      valueFormatter: dateFormatter
    },
    {
        field: 'daysHeld', headerName: 'Dias em posse', width: 100, type: 'number',
        valueGetter: (_, row) => calculateDaysHeld(row.BuyDate, row.SaleDate),
    },
    { field: 'ProductName', headerName: 'Produto', flex: 1, minWidth: 200 },
    { field: 'Quantity', headerName: 'Qtd', type: 'number', width: 80 },
    { field: 'BuyAmountEUR', headerName: 'Mont. abertura (€)', type: 'number', width: 130, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'SaleAmountEUR', headerName: 'Mont. fecho (€)', type: 'number', width: 130, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'Delta', headerName: 'L/P (€)', type: 'number', width: 120, headerAlign: 'right', align: 'right',
        renderCell: (params) => (
            <Box sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
                {params.value?.toFixed(2)}
            </Box>
        ),
    },
];

export const optionSalesColumns = [
    {
      field: 'open_date', headerName: 'Dt. abertura', width: 110, type: 'date',
      valueGetter: (value) => parseDateRobust(value),
      valueFormatter: dateFormatter
    },
    {
      field: 'close_date', headerName: 'Dt. fecho', width: 110, type: 'date',
      valueGetter: (value) => parseDateRobust(value),
      valueFormatter: dateFormatter
    },
    {
        field: 'daysHeld', headerName: 'Dias em posse', width: 100, type: 'number',
        valueGetter: (_, row) => calculateDaysHeld(row.open_date, row.close_date),
    },
    { field: 'product_name', headerName: 'Produto', flex: 1, width: 140 },
    { field: 'quantity', headerName: 'Qtd', type: 'number', width: 80 },
    { field: 'open_amount_eur', headerName: 'Mont. abertura (€)', type: 'number', width: 130, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'close_amount_eur', headerName: 'Mont. fecho (€)', type: 'number', width: 130, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'delta', headerName: 'L/P (€)', type: 'number', width: 120, headerAlign: 'right', align: 'right',
        renderCell: (params) => (
            <Box sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
                {params.value?.toFixed(2)}
            </Box>
        ),
    },
];