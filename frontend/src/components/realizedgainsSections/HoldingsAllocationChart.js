import React from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { generateColorPalette } from '../../utils/chartUtils';
import { Paper, Typography } from '@mui/material';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

export default function HoldingsAllocationChart({ chartData }) {
    if (!chartData || !chartData.datasets || chartData.datasets[0].data.length === 0) {
        return (
            <Paper elevation={0} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', border: 'none' }}>
                <Typography color="text.secondary">Sem dados de posições para o gráfico.</Typography>
            </Paper>
        );
    }

    const dataWithColors = {
        ...chartData,
        datasets: chartData.datasets.map(dataset => ({
            ...dataset,
            backgroundColor: generateColorPalette(dataset.data.length, 'background'),
            borderColor: generateColorPalette(dataset.data.length, 'border'),
            borderWidth: 1,
        }))
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                position: 'right',
            },
            title: {
                display: true,
                text: 'Composição do Portefólio (€)',
            },
            tooltip: {
                callbacks: {
                    label: (context) => {
                        const label = context.label || '';
                        const value = context.parsed || 0;
                        const total = context.chart.getDatasetMeta(0).total;
                        const percentage = total > 0 ? ((value / total) * 100).toFixed(2) : 0;
                        return `${label}: ${new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' }).format(value)} (${percentage}%)`;
                    },
                },
            },
        },
    };

    return <Doughnut data={dataWithColors} options={options} />;
}