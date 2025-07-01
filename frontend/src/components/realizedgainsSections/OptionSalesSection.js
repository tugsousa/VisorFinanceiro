import React, { useMemo } from 'react';
import { Typography, Paper, Box } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Bar } from 'react-chartjs-2';
import { ALL_YEARS_OPTION } from '../../constants';
import { calculateDaysHeld } from '../../utils/dateUtils';
import { getBaseProductName } from '../../utils/chartUtils';
import { calculateAnnualizedReturn } from '../../utils/formatUtils';

const calculateAnnualizedReturnForOptionsLocal = (sale) => {
    const daysHeld = calculateDaysHeld(sale.open_date, sale.close_date);
    return calculateAnnualizedReturn(sale.delta, Math.abs(sale.open_amount_eur), daysHeld);
};

const columns = [
    { field: 'close_date', headerName: 'Close Date', width: 110 },
    { field: 'open_date', headerName: 'Open Date', width: 110 },
    {
        field: 'daysHeld',
        headerName: 'Days Held',
        width: 100,
        type: 'number',
        // FIX: Updated valueGetter signature
        valueGetter: (_, row) => calculateDaysHeld(row.open_date, row.close_date),
    },
    { field: 'product_name', headerName: 'Product', flex: 1, minWidth: 200 },
    { field: 'quantity', headerName: 'Qty', type: 'number', width: 80 },
    {
        field: 'delta',
        headerName: 'P/L (€)',
        type: 'number',
        width: 120,
        renderCell: (params) => (
            <Typography sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
                {params.value?.toFixed(2)}
            </Typography>
        ),
    },
    {
        field: 'annualizedReturn',
        headerName: 'Annualized',
        width: 130,
        // FIX: Updated valueGetter signature
        valueGetter: (_, row) => parseFloat(calculateAnnualizedReturnForOptionsLocal(row)) || 0,
        renderCell: (params) => (
            <Typography sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
                {`${params.value.toFixed(2)}%`}
            </Typography>
        ),
    },
    { field: 'open_amount_eur', headerName: 'Open Amt (€)', type: 'number', width: 130, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'close_amount_eur', headerName: 'Close Amt (€)', type: 'number', width: 130, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'commission', headerName: 'Commission (€)', type: 'number', width: 120, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
];

export default function OptionSalesSection({ optionSalesData, selectedYear }) {
    // Chart logic is identical to StockSalesSection, just with different data props
    const chartData = useMemo(() => {
        if (!optionSalesData || optionSalesData.length === 0) return { labels: [], datasets: [] };

        const productPLMap = {};
        optionSalesData.forEach(sale => {
            if (sale.delta != null) {
                const baseProduct = getBaseProductName(sale.product_name);
                productPLMap[baseProduct] = (productPLMap[baseProduct] || 0) + sale.delta;
            }
        });

        const sortedByAbsolutePL = Object.entries(productPLMap).sort(([, plA], [, plB]) => Math.abs(plB) - Math.abs(plA));
        const topN = 15;
        const topItems = sortedByAbsolutePL.slice(0, topN);
        const otherItems = sortedByAbsolutePL.slice(topN);

        const chartItems = topItems.map(([name, pl]) => ({ name, pl }));
        if (otherItems.length > 0) {
            const othersPL = otherItems.reduce((sum, [, pl]) => sum + pl, 0);
            chartItems.push({ name: 'Others', pl: othersPL });
        }

        chartItems.sort((a, b) => a.pl - b.pl);

        const labels = chartItems.map(item => item.name);
        const data = chartItems.map(item => item.pl);
        const backgroundColors = data.map(pl => pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)');

        return { labels, datasets: [{ data, backgroundColor: backgroundColors, borderWidth: 1 }] };
    }, [optionSalesData]);

    const chartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: `Option Sales P/L by Product (${(selectedYear === ALL_YEARS_OPTION) ? 'All Years' : selectedYear})` },
            tooltip: { callbacks: { label: (ctx) => `P/L: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(ctx.raw || 0)}` } }
        },
        scales: {
            x: { title: { display: true, text: 'Product' }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 } },
            y: { beginAtZero: false, title: { display: true, text: 'Profit/Loss (€)' } }
        }
    }), [selectedYear]);

    if (!optionSalesData || optionSalesData.length === 0) {
        return (
            <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
                <Typography>No option sales data {(selectedYear === ALL_YEARS_OPTION) ? 'available' : `for ${selectedYear}`}.</Typography>
            </Paper>
        );
    }
    
    const rows = optionSalesData.map((sale, index) => ({
        id: `${sale.product_name}-${sale.close_date}-${index}`,
        ...sale
    }));
    
    return (
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Option Sales</Typography>
            {chartData.labels.length > 0 && (
                <Box sx={{ height: 350, mb: 3 }}>
                    <Bar data={chartData} options={chartOptions} />
                </Box>
            )}
            <Box sx={{ height: 600, width: '100%' }}>
                <DataGrid
                    rows={rows}
                    columns={columns}
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10 } },
                    }}
                    pageSizeOptions={[10, 25, 50]}
                    disableRowSelectionOnClick
                />
            </Box>
        </Paper>
    );
}