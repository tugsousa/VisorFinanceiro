import React, { useMemo } from 'react';
import { Typography, Paper, Box, CircularProgress } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { MONTH_NAMES_CHART } from '../../../constants';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const FutureProjectionChart = ({ metricsData, isLoading }) => {
    const chartData = useMemo(() => {
        const projection = metricsData?.projectionByMonth || [];
        
        // Rotacionar os meses para começar no mês atual
        const currentMonthIndex = new Date().getMonth();
        const rotatedMonths = [...MONTH_NAMES_CHART.slice(currentMonthIndex), ...MONTH_NAMES_CHART.slice(0, currentMonthIndex)];
        
        // Garantir que os dados têm o mesmo comprimento
        const dataPoints = projection.slice(0, 12);

        return {
            labels: rotatedMonths,
            datasets: [{
                label: 'Dividendo Esperado (€)',
                data: dataPoints,
                backgroundColor: 'rgba(54, 162, 235, 0.8)', // Cor azul para o futuro
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                borderRadius: 4,
                hoverBorderWidth: 2,
            }]
        };
    }, [metricsData]);

    const chartOptions = {
        responsive: true, maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            title: {
                display: true,
                text: 'Projeção de Rendimento (Próx. 12 Meses)',
                font: { size: 16, weight: '600' },
                padding: { top: 10, bottom: 20 },
            },
            tooltip: {
                callbacks: {
                    label: (ctx) => `${ctx.dataset.label}: ${formatCurrency(ctx.raw || 0)}`
                }
            }
        },
        scales: {
            y: { beginAtZero: true, title: { display: true, text: 'Montante (€)' } },
            x: { grid: { display: false } }
        }
    };
    
    const hasData = metricsData?.hasData === true;

    return (
        <Paper elevation={0} sx={{ p: 2, height: 350, borderRadius: 3 }}>
            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : hasData ? (
                <Bar options={chartOptions} data={chartData} />
            ) : (
                <Typography sx={{ my: 2, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center', pt: '30%' }}>
                    Carregue transações para gerar projeções.
                </Typography>
            )}
        </Paper>
    );
};

export default FutureProjectionChart;