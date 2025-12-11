// frontend/src/components/realizedgainsSections/HistoricalPerformanceChart.js
import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import { 
    Box, Paper, Typography, CircularProgress, ToggleButton, 
    ToggleButtonGroup, Switch, FormControlLabel, Tooltip, IconButton
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { apiFetchHistoricalChartData } from '../../../lib/api';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import {
  Chart as ChartJS, CategoryScale, LinearScale, PointElement, 
  LineElement, Title, Tooltip as ChartTooltip, Legend, Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, 
  Title, ChartTooltip, Legend, Filler
);

export default function HistoricalPerformanceChart() {
  const chartRef = useRef(null);
  const [timeRange, setTimeRange] = useState('ALL');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [chartGradient, setChartGradient] = useState(null);

  // --- USE PORTFOLIO CONTEXT ---
  const { activePortfolio } = usePortfolio();
  const portfolioId = activePortfolio?.id;

  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ['historicalChartData', portfolioId], // Include portfolioId in key
    queryFn: async () => {
        if (!portfolioId) return [];
        const res = await apiFetchHistoricalChartData(portfolioId); // Pass ID to API
        return res.data;
    },
    enabled: !!portfolioId, // Only fetch if portfolio exists
  });

  // Generate Gradient
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const ctx = chart.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(75, 192, 192, 0.5)'); 
    gradient.addColorStop(1, 'rgba(75, 192, 192, 0.0)');
    setChartGradient(gradient);
  }, [rawData]);

  const processedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    
    // 1. Determine Start Date based on Time Range
    const now = new Date();
    now.setHours(23, 59, 59, 999); 
    
    let startDate = new Date(rawData[0].date); 

    if (timeRange !== 'ALL') {
        const tempStart = new Date();
        switch (timeRange) {
            case '1W': tempStart.setDate(now.getDate() - 7); break;
            case '1M': tempStart.setMonth(now.getMonth() - 1); break;
            case 'YTD': tempStart.setMonth(0, 1); break; // Jan 1st
            case '1Y': tempStart.setFullYear(now.getFullYear() - 1); break;
            case '5Y': tempStart.setFullYear(now.getFullYear() - 5); break;
            default: break;
        }
        startDate = tempStart;
    }

    // 2. Filter Data
    const filtered = rawData.filter(p => new Date(p.date) >= startDate);
    if (filtered.length === 0) return [];

    // Initialize Benchmark Tracking
    let benchmarkUnits = 0;
    const initialSpyPrice = filtered[0].spy_price || 0;
    
    if (initialSpyPrice > 0) {
        benchmarkUnits = filtered[0].portfolio_value / initialSpyPrice;
    }

    let previousCashFlow = filtered[0].cumulative_cash_flow;

    return filtered.map((point, index) => {
        const currentSpyPrice = point.spy_price || 0;
        
        if (index > 0) {
            const netFlow = point.cumulative_cash_flow - previousCashFlow;
            if (netFlow !== 0 && currentSpyPrice > 0) {
                benchmarkUnits += (netFlow / currentSpyPrice);
            }
        }

        const safeBenchmarkUnits = Math.max(0, benchmarkUnits);
        const rebasedBenchmarkValue = safeBenchmarkUnits * currentSpyPrice;
        previousCashFlow = point.cumulative_cash_flow;

        return {
            ...point,
            rebased_benchmark_value: rebasedBenchmarkValue,
        };
    });
  }, [rawData, timeRange]);

  const chartData = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;

    const datasets = [];

    datasets.push({
        label: 'Investimento Líquido',
        data: processedData.map(p => p.cumulative_cash_flow),
        borderColor: 'rgba(54, 162, 235, 0.5)',
        backgroundColor: 'transparent',
        borderDash: [5, 5],
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 0,
        fill: false,
        order: 2
    });

    if (showBenchmark) {
        datasets.push({
            label: 'Benchmark (S&P 500)',
            data: processedData.map(p => p.rebased_benchmark_value),
            borderColor: '#FFC107',
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.4,
            order: 1
        });
    }

    datasets.push({
        label: 'Valor da Carteira',
        data: processedData.map(p => p.portfolio_value),
        borderColor: 'rgba(75, 192, 192, 1)',
        backgroundColor: chartGradient || 'rgba(75, 192, 192, 0.2)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        fill: true,
        tension: 0.1,
        order: 0
    });

    return {
        labels: processedData.map(p => p.date),
        datasets: datasets
    };
  }, [processedData, chartGradient, showBenchmark]);

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index', intersect: false },
    plugins: {
      legend: { position: 'top', align: 'end', labels: { usePointStyle: true, boxWidth: 8 } },
      title: { display: false },
      tooltip: {
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        titleColor: '#000',
        bodyColor: '#333',
        borderColor: '#ddd',
        borderWidth: 1,
        padding: 10,
        callbacks: {
          label: function(context) {
            let label = context.dataset.label || '';
            if (label) { label += ': '; }
            if (context.parsed.y !== null) { label += formatCurrency(context.parsed.y); }
            return label;
          }
        }
      }
    },
    scales: {
      x: { grid: { display: false }, ticks: { maxTicksLimit: 8, maxRotation: 0, autoSkip: true } },
      y: {
        beginAtZero: false,
        grid: { color: '#f0f0f0' },
        ticks: { callback: (value) => formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 0, compactDisplay: "short", notation: "compact" }) }
      }
    }
  };

  const benchmarkInfo = (
    <Box sx={{ p: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold">Benchmark S&P 500</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            Esta linha compara a performance da sua carteira contra o S&P 500 para o período selecionado.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            A comparação começa no primeiro dia do gráfico. Para cada depósito ou levantamento, o sistema ajusta o benchmark proporcionalmente.
        </Typography>
    </Box>
  );

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  // Don't error out if just missing portfolio, return null
  if (!portfolioId) return null;
  if (isError || !chartData) return null; 

  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, border: 'none', height: 600, display: 'flex', flexDirection: 'column' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Evolução Histórica</Typography>
            <Tooltip title={benchmarkInfo} arrow placement="right">
                <IconButton size="small" sx={{ color: 'text.secondary' }}>
                    <InfoOutlinedIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <FormControlLabel 
                control={<Switch size="small" checked={showBenchmark} onChange={(e) => setShowBenchmark(e.target.checked)} />} 
                label={<Typography variant="body2" color="text.secondary">S&P 500</Typography>} 
            />
        </Box>
      </Box>
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(e, newRange) => newRange && setTimeRange(newRange)}
            aria-label="time range"
            size="small"
            sx={{ '& .MuiToggleButton-root': { py: 0.5, px: 1.5, fontSize: '0.75rem', fontWeight: 600, textTransform: 'none', border: '1px solid #e0e0e0' }, '& .Mui-selected': { backgroundColor: 'rgba(25, 118, 210, 0.08)', color: '#1976d2', borderColor: '#1976d2' } }}
        >
            <ToggleButton value="1W">1S</ToggleButton>
            <ToggleButton value="1M">1M</ToggleButton>
            <ToggleButton value="YTD">YTD</ToggleButton>
            <ToggleButton value="1Y">1A</ToggleButton>
            <ToggleButton value="5Y">5A</ToggleButton>
            <ToggleButton value="ALL">Tudo</ToggleButton>
        </ToggleButtonGroup>
      </Box>
      <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
        <Line ref={chartRef} data={chartData} options={options} />
      </Box>
    </Paper>
  );
}