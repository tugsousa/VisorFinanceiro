// frontend/src/components/realizedgainsSections/FeesSection.js
import React, { useMemo } from 'react';
import { Typography, Paper, Box, Grid } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { Bar, Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend } from 'chart.js';

import { parseDateRobust, getYearString, getMonthIndex } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/formatUtils';
import { ALL_YEARS_OPTION, MONTH_NAMES_CHART } from '../../constants';
import { generateRedTonePalette } from '../../utils/chartUtils';


// Register all necessary components for Chart.js
ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend);

// --- CHANGE START: Added translation map ---
const categoryTranslations = {
    'Trade Commission': 'Comissões de transação',
    'Brokerage Fee': 'Custo corretagem',
};

// Helper function to translate a category, falling back to the original if not found
const translateCategory = (category) => categoryTranslations[category] || category;
// --- CHANGE END ---


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
            // Fees are costs, so they are always negative or zero.
            <Box sx={{ color: 'error.main' }}>
                {formatCurrency(params.value)}
            </Box>
        ),
    },
    { field: 'source', headerName: 'Corretora', width: 120 },
];

export default function FeesSection({ feeData, selectedYear }) {
    
    const chartData = useMemo(() => {
        if (!feeData || feeData.length === 0) {
            return {
                bySource: null,
                byCategory: null,
                timeSeries: null,
            };
        }

        // --- Data Aggregation ---
        const sourceMap = {};
        const categoryMap = {};

        // For Time Series Chart
        const timeSeriesMap = {};
        // --- CHANGE START: Translate categories when creating the Set ---
        const categories = new Set(feeData.map(f => translateCategory(f.category)));
        // --- CHANGE END ---

        feeData.forEach(fee => {
            const absAmount = Math.abs(fee.amount_eur);
            
            // By Source
            sourceMap[fee.source] = (sourceMap[fee.source] || 0) + absAmount;
            
            // --- CHANGE START: Use translated category for grouping ---
            const translatedCat = translateCategory(fee.category);
            categoryMap[translatedCat] = (categoryMap[translatedCat] || 0) + absAmount;
            // --- CHANGE END ---

            // By Time (Yearly or Monthly)
            const key = selectedYear === ALL_YEARS_OPTION ? getYearString(fee.date) : getMonthIndex(fee.date);
            if (key === null || key === undefined) return;
            
            if (!timeSeriesMap[key]) {
                 timeSeriesMap[key] = {};
                 categories.forEach(cat => timeSeriesMap[key][cat] = 0);
            }
            // --- CHANGE START: Use translated category for time series ---
            timeSeriesMap[key][translatedCat] = (timeSeriesMap[key][translatedCat] || 0) + absAmount;
            // --- CHANGE END ---
        });

        // --- Chart Data Preparation ---
        
        // Doughnut Chart: By Source
        const sourceLabels = Object.keys(sourceMap);
        const bySource = {
            labels: sourceLabels,
            datasets: [{
                data: sourceLabels.map(label => sourceMap[label]),
                backgroundColor: generateRedTonePalette(sourceLabels.length, 'background'),
                borderColor: generateRedTonePalette(sourceLabels.length, 'border'),
                borderWidth: 1,
            }],
        };
        
        // Doughnut Chart: By Category
        const categoryLabels = Object.keys(categoryMap);
        const byCategory = {
            labels: categoryLabels,
            datasets: [{
                data: categoryLabels.map(label => categoryMap[label]),
                backgroundColor: generateRedTonePalette(categoryLabels.length, 'background'),
                borderColor: generateRedTonePalette(categoryLabels.length, 'border'),
                borderWidth: 1,
            }],
        };

        // Stacked Bar Chart: Time Series
        const timeLabels = selectedYear === ALL_YEARS_OPTION 
            ? Object.keys(timeSeriesMap).sort()
            : MONTH_NAMES_CHART;
        
        const categoryColors = generateRedTonePalette(categories.size, 'background');
        const categoryBorderColors = generateRedTonePalette(categories.size, 'border');

        const timeSeries = {
            labels: timeLabels,
            datasets: Array.from(categories).map((cat, index) => ({
                label: cat,
                data: timeLabels.map((label, monthIndex) => {
                    const key = selectedYear === ALL_YEARS_OPTION ? label : monthIndex;
                    return timeSeriesMap[key]?.[cat] || 0;
                }),
                backgroundColor: categoryColors[index % categoryColors.length],
                borderColor: categoryBorderColors[index % categoryBorderColors.length],
                borderWidth: 1,
                borderRadius: 4,
            })),
        };

        return { bySource, byCategory, timeSeries };
    }, [feeData, selectedYear]);

    // --- Chart Options ---

    const doughnutOptions = (title) => ({
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'right' },
            title: { display: true, text: title, font: { size: 16, weight: '600' } },
            tooltip: { callbacks: { label: (ctx) => `${ctx.label}: ${formatCurrency(ctx.raw)}` } }
        },
        cutout: '50%',
    });
    
    const barOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            title: { display: true, text: `Taxas por ${selectedYear === ALL_YEARS_OPTION ? 'Ano' : 'Mês'}`, font: { size: 16, weight: '600' } },
            legend: { position: 'top' },
            tooltip: { mode: 'index', intersect: false, callbacks: { label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw)}` } }
        },
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, title: { display: true, text: 'Total Taxas (€)' } }
        },
    };

    // --- Render Logic ---

    if (!feeData || feeData.length === 0) {
        return (
            <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
                <Typography>Não existe informação sobre taxas e comissões para o período selecionado.</Typography>
            </Paper>
        );
    }

    // --- CHANGE START: Translate categories for the DataGrid ---
    const rows = feeData.map((fee, index) => ({
        id: `${fee.date}-${fee.description}-${index}`,
        ...fee,
        category: translateCategory(fee.category),
    }));
    // --- CHANGE END ---

    return (
        <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none' }}>
            {/* Charts Grid */}
            <Grid container spacing={3} sx={{ mb: 4 }}>
                <Grid item xs={12} md={8}>
                    <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
                         {chartData.timeSeries && chartData.timeSeries.datasets.some(ds => ds.data.some(d => d > 0)) ? (
                            <Bar options={barOptions} data={chartData.timeSeries} />
                        ) : (
                             <Typography sx={{ textAlign: 'center', pt: '30%' }}>Sem dados para o gráfico de tempo.</Typography>
                        )}
                    </Paper>
                </Grid>
                <Grid item xs={12} md={4} container spacing={3}>
                    <Grid item xs={12}>
                        <Paper elevation={0} sx={{ p: 2, height: 163, borderRadius: 3 }}>
                            {chartData.bySource ? (
                                <Doughnut options={doughnutOptions('Taxas por Corretora')} data={chartData.bySource} />
                            ) : (
                                <Typography>Sem dados.</Typography>
                            )}
                        </Paper>
                    </Grid>
                    <Grid item xs={12}>
                        <Paper elevation={0} sx={{ p: 2, height: 163, borderRadius: 3 }}>
                            {chartData.byCategory ? (
                                <Doughnut options={doughnutOptions('Taxas por Categoria')} data={chartData.byCategory} />
                            ) : (
                                 <Typography>Sem dados.</Typography>
                            )}
                        </Paper>
                    </Grid>
                </Grid>
            </Grid>
            
            {/* DataGrid */}
            <Box sx={{ width: '100%' }}>
                <DataGrid
                    rows={rows}
                    columns={columns}
                    autoHeight
                    initialState={{
                        pagination: { paginationModel: { pageSize: 10 } },
                        sorting: { sortModel: [{ field: 'date', sort: 'desc' }] },
                    }}
                    pageSizeOptions={[10, 25, 50]}
                    disableRowSelectionOnClick
                    localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
                />
            </Box>
        </Paper>
    );
}