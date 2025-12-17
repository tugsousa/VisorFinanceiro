import React, { useMemo } from 'react';
import { Typography, Paper, Box, CircularProgress } from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { MONTH_NAMES_CHART } from '../../../constants';
import { formatCurrency } from '../../../lib/utils/formatUtils';

const FutureProjectionChart = ({ metricsData, isLoading }) => {
    
    const hasData = metricsData?.has_data === true;
    const rawProjection = metricsData?.projection_by_month || [];
    // Receber o breakdown
    const rawBreakdown = metricsData?.projection_breakdown || {};

    const chartData = useMemo(() => {
        const currentMonthIndex = new Date().getMonth();

        // 1. Rodar Labels
        const rotatedLabels = [
            ...MONTH_NAMES_CHART.slice(currentMonthIndex), 
            ...MONTH_NAMES_CHART.slice(0, currentMonthIndex)
        ];
        
        // 2. Rodar Dados (Totais)
        const rotatedData = [
            ...rawProjection.slice(currentMonthIndex),
            ...rawProjection.slice(0, currentMonthIndex)
        ];

        // 3. Rodar Breakdown (Detalhes) - É um mapa/objeto, precisamos converter para array ordenado
        // Criar array [0..11] com os dados do mapa
        const breakdownArray = new Array(12).fill([]).map((_, i) => rawBreakdown[i] || []);
        
        const rotatedBreakdown = [
            ...breakdownArray.slice(currentMonthIndex),
            ...breakdownArray.slice(0, currentMonthIndex)
        ];

        // Cortar para 12 meses
        const finalLabels = rotatedLabels.slice(0, 12);
        const finalData = rotatedData.slice(0, 12);
        const finalBreakdown = rotatedBreakdown.slice(0, 12);

        return {
            labels: finalLabels,
            // Passamos o breakdown aqui dentro, o chartjs ignora propriedades extra no dataset,
            // mas podemos aceder a elas na tooltip via 'chart.data.datasets[0].breakdown'
            breakdown: finalBreakdown, 
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
    }, [rawProjection, rawBreakdown]);

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
                    label: (ctx) => `Total: ${formatCurrency(ctx.raw || 0)}`,
                    // AfterBody para mostrar a lista
                    afterBody: (tooltipItems) => {
                        const index = tooltipItems[0].dataIndex;
                        // Aceder aos dados de breakdown que guardámos no useMemo
                        const breakdownData = chartData.breakdown[index];
                        
                        if (!breakdownData || breakdownData.length === 0) return [];

                        // Ordenar por valor decrescente para mostrar os maiores pagadores primeiro
                        const sorted = [...breakdownData].sort((a, b) => b.amount - a.amount);

                        // Formatar linhas
                        return sorted.map(item => 
                            `• ${item.ticker}: ${formatCurrency(item.amount)}`
                        );
                    }
                },
                // Ajustar estilo da tooltip para acomodar várias linhas
                bodyFont: { size: 12 },
                padding: 10,
                displayColors: false, 
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