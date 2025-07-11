import React, { useMemo } from 'react';
import { Typography, Paper, Box, Grid } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { Bar } from 'react-chartjs-2';
import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../constants';
import { getYearString, getMonthIndex, calculateDaysHeld, parseDateRobust } from '../../utils/dateUtils';
import { getBaseProductName } from '../../utils/chartUtils';
import { calculateAnnualizedReturn } from '../../utils/formatUtils';

const calculateAnnualizedReturnForOptionsLocal = (sale) => {
    const daysHeld = calculateDaysHeld(sale.open_date, sale.close_date);
    return calculateAnnualizedReturn(sale.delta, Math.abs(sale.open_amount_eur), daysHeld);
};

const columns = [
    { 
      field: 'open_date', 
      headerName: 'Dt. abertura', 
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
      field: 'close_date', 
      headerName: 'Dt. fecho', 
      width: 110,
      type: 'date',
      valueGetter: (value) => parseDateRobust(value),
    },
    {
        field: 'daysHeld',
        headerName: 'Dias em posse',
        width: 100,
        type: 'number',
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

export default function OptionSalesSection({ optionSalesData, selectedYear }) {
    const { salesByProductChartData, salesByTimeSeriesChartData } = useMemo(() => {
        const emptyResult = {
            salesByProductChartData: { labels: [], datasets: [] },
            salesByTimeSeriesChartData: { labels: [], datasets: [] },
        };
        if (!optionSalesData || optionSalesData.length === 0) return emptyResult;

        // --- P/L by Product Chart Data ---
        const productPLMap = {};
        optionSalesData.forEach(sale => {
            if (sale.delta != null) {
                const baseProduct = getBaseProductName(sale.product_name);
                productPLMap[baseProduct] = (productPLMap[baseProduct] || 0) + sale.delta;
            }
        });

        const sortedByAbsolutePL = Object.entries(productPLMap).sort(([, plA], [, plB]) => Math.abs(plB) - Math.abs(plA));
        const topN = 9;
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
        
        const smallDataSetThreshold = 5;
        const maxThickness = 60;
        if (productChart.labels.length > 0 && productChart.labels.length <= smallDataSetThreshold) {
            productChart.datasets[0].maxBarThickness = maxThickness;
        }

        // --- P/L by Time-Series Chart Data ---
        let timeSeriesChart;
        if (selectedYear === ALL_YEARS_OPTION) {
            const yearlyMap = {};
            optionSalesData.forEach(sale => {
                const year = getYearString(sale.close_date);
                if (year && sale.delta != null) {
                    yearlyMap[year] = (yearlyMap[year] || 0) + sale.delta;
                }
            });
            const sortedYears = Object.keys(yearlyMap).sort((a, b) => a.localeCompare(b));
            timeSeriesChart = {
                labels: sortedYears,
                datasets: [{
                    data: sortedYears.map(year => yearlyMap[year]),
                    backgroundColor: sortedYears.map(year => (yearlyMap[year] >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)')),
                    borderWidth: 1,
                }]
            };
        } else {
            const monthlyData = new Array(12).fill(0);
            optionSalesData.forEach(sale => {
                const monthIndex = getMonthIndex(sale.close_date);
                if (monthIndex !== null && sale.delta != null) {
                    monthlyData[monthIndex] += sale.delta;
                }
            });
            timeSeriesChart = {
                labels: MONTH_NAMES_CHART,
                datasets: [{
                    data: monthlyData,
                    backgroundColor: monthlyData.map(pl => (pl >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)')),
                    borderWidth: 1,
                }]
            };
        }

        if (timeSeriesChart.labels.length > 0 && timeSeriesChart.labels.length <= smallDataSetThreshold) {
            timeSeriesChart.datasets[0].maxBarThickness = maxThickness;
        }

        return { salesByProductChartData: productChart, salesByTimeSeriesChartData: timeSeriesChart };
    }, [optionSalesData, selectedYear]);

    const salesByProductChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: `L/P por Produto` },
            tooltip: { callbacks: { label: (ctx) => `L/P: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(ctx.raw || 0)}` } }
        },
        scales: {
            x: { title: { display: true, text: 'Produto' }, ticks: { autoSkip: false, maxRotation: 45, minRotation: 30 } },
            y: { beginAtZero: false, title: { display: true, text: 'Lucro/Prejuízo (€)' } }
        }
    }), []);
    
    const salesByTimeSeriesChartOptions = useMemo(() => ({
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: { display: true, text: `L/P por ${selectedYear === ALL_YEARS_OPTION ? 'ano' : 'mês'}` },
            tooltip: { callbacks: { label: (ctx) => `L/P: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(ctx.raw || 0)}` } }
        },
        scales: {
            x: { title: { display: true, text: selectedYear === ALL_YEARS_OPTION ? 'Ano' : 'Mês' } },
            y: { beginAtZero: false, title: { display: true, text: 'Lucro/Prejuízo (€)' } }
        }
    }), [selectedYear]);

    if (!optionSalesData || optionSalesData.length === 0) {
        return (
            <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
                <Typography>Sem dados de vendas de opções {(selectedYear === ALL_YEARS_OPTION) ? 'disponivel' : `para ${selectedYear}`}.</Typography>
            </Paper>
        );
    }
    
    const rows = optionSalesData.map((sale, index) => ({
        id: `${sale.product_name}-${sale.close_date}-${index}`,
        ...sale
    }));
    
    return (
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
                      
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

      <Box sx={{ maxHeight: 600, width: '100%' }}>
        <DataGrid
          rows={rows}
          columns={columns}
          initialState={{
            pagination: { paginationModel: { pageSize: 10 } },
            sorting: {
              sortModel: [{ field: 'open_date', sort: 'desc' }],
            },
          }}
          pageSizeOptions={[10, 25, 50]}
          disableRowSelectionOnClick
          autoHeight
          localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
        />
      </Box>
        </Paper>
    );
}