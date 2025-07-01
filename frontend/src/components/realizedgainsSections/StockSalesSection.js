import React, { useMemo } from 'react';
import { Typography, Paper, Box, Grid } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { Bar } from 'react-chartjs-2';
import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../constants';
import { getYearString, getMonthIndex, calculateDaysHeld } from '../../utils/dateUtils';
import { getBaseProductName } from '../../utils/chartUtils';
import { calculateAnnualizedReturn } from '../../utils/formatUtils';

const calculateAnnualizedReturnForStocksLocal = (sale) => {
    const daysHeld = calculateDaysHeld(sale.BuyDate, sale.SaleDate);
    return calculateAnnualizedReturn(sale.Delta, sale.BuyAmountEUR, daysHeld);
};

const columns = [
    { field: 'SaleDate', headerName: 'Sale Date', width: 110 },
    { field: 'BuyDate', headerName: 'Buy Date', width: 110 },
    {
        field: 'daysHeld',
        headerName: 'Days Held',
        width: 100,
        type: 'number',
        valueGetter: (_, row) => calculateDaysHeld(row.BuyDate, row.SaleDate),
    },
    { field: 'ProductName', headerName: 'Product', flex: 1, minWidth: 200 },
    { field: 'Quantity', headerName: 'Qty', type: 'number', width: 80 },
    {
        field: 'Delta',
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
        valueGetter: (_, row) => parseFloat(calculateAnnualizedReturnForStocksLocal(row)) || 0,
        renderCell: (params) => (
            <Typography sx={{ color: params.value >= 0 ? 'success.main' : 'error.main' }}>
                {`${params.value.toFixed(2)}%`}
            </Typography>
        ),
    },
    { field: 'BuyAmountEUR', headerName: 'Cost Basis (€)', type: 'number', width: 130, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'SaleAmountEUR', headerName: 'Proceeds (€)', type: 'number', width: 130, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'Commission', headerName: 'Commission (€)', type: 'number', width: 120, valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
];

export default function StockSalesSection({ stockSalesData, selectedYear }) {
    const { salesByProductChartData, salesByTimeSeriesChartData } = useMemo(() => {
        const emptyResult = {
            salesByProductChartData: { labels: [], datasets: [] },
            salesByTimeSeriesChartData: { labels: [], datasets: [] },
        };
        if (!stockSalesData || stockSalesData.length === 0) return emptyResult;

        // --- P/L by Product Chart Data ---
        const productPLMap = {};
        stockSalesData.forEach(sale => {
            if (sale.Delta != null) {
                const baseProduct = getBaseProductName(sale.ProductName);
                productPLMap[baseProduct] = (productPLMap[baseProduct] || 0) + sale.Delta;
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
        
        const productChart = {
            labels: chartItems.map(item => item.name),
            datasets: [{
                data: chartItems.map(item => item.pl),
                backgroundColor: chartItems.map(item => item.pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)'),
                borderWidth: 1,
            }]
        };

        // --- P/L by Time-Series Chart Data ---
        let timeSeriesChart;
        if (selectedYear === ALL_YEARS_OPTION) {
            const yearlyMap = {};
            stockSalesData.forEach(sale => {
                const year = getYearString(sale.SaleDate);
                if (year && sale.Delta != null) {
                    yearlyMap[year] = (yearlyMap[year] || 0) + sale.Delta;
                }
            });
            const sortedYears = Object.keys(yearlyMap).sort((a, b) => a.localeCompare(b));
            timeSeriesChart = {
                labels: sortedYears,
                datasets: [{
                    data: sortedYears.map(year => yearlyMap[year]),
                    backgroundColor: sortedYears.map(year => (yearlyMap[year] >= 0 ? 'rgba(153, 102, 255, 0.6)' : 'rgba(255, 159, 64, 0.6)')),
                    borderWidth: 1,
                }]
            };
        } else {
            const monthlyData = new Array(12).fill(0);
            stockSalesData.forEach(sale => {
                const monthIndex = getMonthIndex(sale.SaleDate);
                if (monthIndex !== null && sale.Delta != null) {
                    monthlyData[monthIndex] += sale.Delta;
                }
            });
            timeSeriesChart = {
                labels: MONTH_NAMES_CHART,
                datasets: [{
                    data: monthlyData,
                    backgroundColor: monthlyData.map(pl => (pl >= 0 ? 'rgba(153, 102, 255, 0.6)' : 'rgba(255, 159, 64, 0.6)')),
                    borderWidth: 1,
                }]
            };
        }

        return { salesByProductChartData: productChart, salesByTimeSeriesChartData: timeSeriesChart };
    }, [stockSalesData, selectedYear]);

    const salesByProductChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: `P/L by Product` },
            tooltip: { callbacks: { label: (ctx) => `P/L: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(ctx.raw || 0)}` } }
        },
        scales: {
            x: { title: { display: true, text: 'Product' }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 } },
            y: { beginAtZero: false, title: { display: true, text: 'Profit/Loss (€)' } }
        }
    }), []);
    
    const salesByTimeSeriesChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: `P/L by ${selectedYear === ALL_YEARS_OPTION ? 'Year' : 'Month'}` },
            tooltip: { callbacks: { label: (ctx) => `P/L: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(ctx.raw || 0)}` } }
        },
        scales: {
            x: { title: { display: true, text: selectedYear === ALL_YEARS_OPTION ? 'Year' : 'Month' } },
            y: { beginAtZero: false, title: { display: true, text: 'Profit/Loss (€)' } }
        }
    }), [selectedYear]);

    if (!stockSalesData || stockSalesData.length === 0) {
        return (
            <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
                <Typography>No stock sales data {(selectedYear === ALL_YEARS_OPTION) ? 'available' : `for ${selectedYear}`}.</Typography>
            </Paper>
        );
    }
    
    const rows = stockSalesData.map((sale, index) => ({
        id: `${sale.ISIN}-${sale.SaleDate}-${index}`,
        ...sale
    }));

    return (
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Stock Sales ({selectedYear === ALL_YEARS_OPTION ? 'All Years' : selectedYear})</Typography>
            
            <Grid container spacing={3} sx={{ mb: 3 }}>
                <Grid item xs={12} lg={6}>
                    <Box sx={{ height: 350 }}>
                        <Bar data={salesByTimeSeriesChartData} options={salesByTimeSeriesChartOptions} />
                    </Box>
                </Grid>
                <Grid item xs={12} lg={6}>
                    <Box sx={{ height: 350 }}>
                        <Bar data={salesByProductChartData} options={salesByProductChartOptions} />
                    </Box>
                </Grid>
            </Grid>

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