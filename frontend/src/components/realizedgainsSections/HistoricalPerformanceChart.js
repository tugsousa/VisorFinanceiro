import React, { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import { Box, Paper, Typography, CircularProgress } from '@mui/material';
import { apiFetchHistoricalChartData } from '../../api/apiService';
import { formatCurrency } from '../../utils/formatUtils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler
);

export default function HistoricalPerformanceChart() {
  const { data: chartDataPoints, isLoading, isError } = useQuery({
    queryKey: ['historicalChartData'],
    queryFn: async () => {
        const res = await apiFetchHistoricalChartData();
        return res.data;
    }
  });

  const chartData = useMemo(() => {
    if (!chartDataPoints || chartDataPoints.length === 0) return null;

    return {
      labels: chartDataPoints.map(p => p.date),
      datasets: [
        {
          label: 'Investimento Líquido Acumulado (Net Cash Flow)',
          data: chartDataPoints.map(p => p.cumulative_cash_flow),
          borderColor: 'rgba(54, 162, 235, 1)', // Blue
          backgroundColor: 'rgba(54, 162, 235, 0.1)',
          borderWidth: 2,
          pointRadius: 0, // Hide points for cleaner look on large history
          pointHoverRadius: 4,
          fill: true,
          tension: 0.1, // Slight curve
        },
        // Uncomment this when you populate the portfolio_value in backend
        /*
        {
          label: 'Valor Total do Portfólio',
          data: chartDataPoints.map(p => p.portfolio_value),
          borderColor: 'rgba(75, 192, 192, 1)', // Green
          backgroundColor: 'transparent',
          borderWidth: 2,
          pointRadius: 0,
          pointHoverRadius: 4,
          tension: 0.1,
        }
        */
      ]
    };
  }, [chartDataPoints]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'index',
      intersect: false,
    },
    plugins: {
      legend: {
        position: 'top',
      },
      title: {
        display: true,
        text: 'Evolução Histórica: Investimento vs. Valor',
        font: { size: 16 }
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) {
                label += ': ';
            }
            if (context.parsed.y !== null) {
                label += formatCurrency(context.parsed.y);
            }
            return label;
          }
        }
      }
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: {
            maxTicksLimit: 12 
        }
      },
      y: {
        beginAtZero: false,
        grid: { color: '#f0f0f0' },
        ticks: {
            // FIX: Explicitly set minimum to 0 to match maximum
            callback: (value) => formatCurrency(value, { 
                minimumFractionDigits: 0, 
                maximumFractionDigits: 0 
            })
        }
      }
    }
  };

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (isError || !chartData) return null; 

  return (
    <Paper elevation={0} sx={{ p: 2, mb: 3, border: 'none', height: 400 }}>
      <Box sx={{ width: '100%', height: '100%' }}>
        <Line data={chartData} options={options} />
      </Box>
    </Paper>
  );
}