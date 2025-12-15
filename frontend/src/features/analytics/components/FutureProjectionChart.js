import React, { useMemo } from 'react';
import { Typography, Paper, Box, CircularProgress } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { MONTH_NAMES_CHART } from '../../../constants';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const FutureProjectionChart = ({ metricsData, isLoading }) => {
    
    // O backend envia em snake_case (has_data, projection_by_month)
    const hasData = metricsData?.has_data === true;
    // O backend envia sempre [Jan, Fev, ... Dez] (índices 0 a 11)
    const rawProjection = metricsData?.projection_by_month || [];

    const chartData = useMemo(() => {
        // Obter o índice do mês atual (0 = Janeiro, 11 = Dezembro)
        const currentMonthIndex = new Date().getMonth();

        // 1. Rodar as Labels (Nomes dos Meses)
        // Ex: Se estamos em Dezembro, queremos [Dez, Jan, Fev...]
        const rotatedLabels = [
            ...MONTH_NAMES_CHART.slice(currentMonthIndex), 
            ...MONTH_NAMES_CHART.slice(0, currentMonthIndex)
        ];
        
        // 2. Rodar os Dados (Valores)
        // O rawProjection vem fixo [Jan, Fev...]. Temos de o rodar para alinhar com as labels.
        const rotatedData = [
            ...rawProjection.slice(currentMonthIndex),
            ...rawProjection.slice(0, currentMonthIndex)
        ];

        // Garantir que mostramos apenas os próximos 12 meses
        const finalLabels = rotatedLabels.slice(0, 12);
        const finalData = rotatedData.slice(0, 12);

        return {
            labels: finalLabels,
            datasets: [{
                label: 'Dividendo Esperado (€)',
                data: finalData,
                backgroundColor: 'rgba(54, 162, 235, 0.8)',
                borderColor: 'rgba(54, 162, 235, 1)',
                borderWidth: 1,
                borderRadius: 4,
                hoverBorderWidth: 2,
            }]
        };
    }, [rawProjection]);

    const chartOptions = {
        responsive: true, 
        maintainAspectRatio: false,
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

    return (
        <Paper elevation={0} sx={{ p: 2, height: 200, borderRadius: 3 }}>
            {isLoading ? (
                <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>
            ) : hasData ? (
                <Bar options={chartOptions} data={chartData} />
            ) : (
                <Typography sx={{ my: 2, fontStyle: 'italic', color: 'text.secondary', textAlign: 'center', pt: '10%' }}>
                    Sem dados suficientes para projeção.
                </Typography>
            )}
        </Paper>
    );
};

export default FutureProjectionChart;