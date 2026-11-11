// frontend/src/features/dividends/components/DividendMonthChart.jsx
import React from 'react';
import { Box } from '@mui/material';
import { useTheme, alpha } from '@mui/material/styles';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, Tooltip, Legend } from 'chart.js';
import { formatCurrency } from '../../../lib/utils/formatUtils';

ChartJS.register(CategoryScale, LinearScale, BarElement, Tooltip, Legend);

/**
 * The gross dividends of the next 12 months by month of payment, from the dividend calendar: announced
 * ones in a solid bar, estimated ones in a light bar on top.
 */
const DividendMonthChart = ({ months }) => {
    const theme = useTheme();
    const color = theme.palette.primary.main;

    const data = {
        labels: months.map(m => m.label),
        datasets: [
            { label: 'Anunciado', data: months.map(m => m.announced), backgroundColor: color, borderRadius: 4, stack: 'gross' },
            {
                label: 'Estimado', data: months.map(m => m.estimated), backgroundColor: alpha(color, 0.35),
                borderColor: color, borderWidth: 1, borderRadius: 4, stack: 'gross',
            },
        ],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { position: 'bottom', labels: { boxWidth: 12 } },
            tooltip: {
                mode: 'index',
                intersect: false,
                displayColors: false,
                filter: (item) => item.datasetIndex === 0, // One tooltip per month, not one per bar
                callbacks: {
                    title: (items) => months[items[0].dataIndex].label,
                    label: (item) => {
                        const m = months[item.dataIndex];
                        return `Bruto: ${formatCurrency(m.announced + m.estimated)}`;
                    },
                    afterBody: (items) => months[items[0].dataIndex].events.map(e =>
                        `• ${e.product_name}: ${e.status === 'estimated' ? '~' : ''}${formatCurrency(e.gross_eur)}`),
                },
            },
        },
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, beginAtZero: true, ticks: { callback: (v) => formatCurrency(v, { maximumFractionDigits: 0, minimumFractionDigits: 0 }) } },
        },
    };

    return (
        <Box sx={{ height: 220 }}>
            <Bar data={data} options={options} />
        </Box>
    );
};

export default DividendMonthChart;
