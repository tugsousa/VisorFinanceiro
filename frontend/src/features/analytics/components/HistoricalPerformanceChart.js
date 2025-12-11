import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import { 
    Box, Paper, Typography, CircularProgress, ToggleButton, 
    ToggleButtonGroup, Switch, FormControlLabel, Tooltip, IconButton
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { apiFetchHistoricalChartData } from 'features/analytics/api/analyticsApi';
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
  const [viewMode, setViewMode] = useState('VALUE'); // 'VALUE' or 'PERCENT'
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [chartGradient, setChartGradient] = useState(null);

  const { activePortfolio } = usePortfolio();
  const portfolioId = activePortfolio?.id;

  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ['historicalChartData', portfolioId], 
    queryFn: async () => {
        if (!portfolioId) return [];
        const res = await apiFetchHistoricalChartData(portfolioId); 
        return res.data;
    },
    enabled: !!portfolioId, 
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
  }, [rawData, viewMode]);

  const processedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    // 1. Filter Date Range
    const now = new Date();
    // Set to end of day to ensure we include today's data points if they exist
    now.setHours(23, 59, 59, 999); 
    
    let startDate = new Date(rawData[0].date); 
    
    if (timeRange !== 'ALL') {
        const tempStart = new Date();
        switch (timeRange) {
            case '1W': 
                tempStart.setDate(now.getDate() - 7); 
                break;
            case '1M': 
                tempStart.setMonth(now.getMonth() - 1); 
                break;
            case '3M': 
                tempStart.setMonth(now.getMonth() - 3); 
                break;
            case 'YTD': 
                tempStart.setFullYear(now.getFullYear(), 0, 1); // Jan 1st of current year
                break;
            case '1Y': 
                tempStart.setFullYear(now.getFullYear() - 1); 
                break;
            case '5Y': 
                tempStart.setFullYear(now.getFullYear() - 5); 
                break;
            default: break;
        }
        // Ensure we don't go before the first available data point
        // If calculated start date is older than first data point, use first data point
        const firstDataDate = new Date(rawData[0].date);
        startDate = tempStart < firstDataDate ? firstDataDate : tempStart;
    }

    const filtered = rawData.filter(p => new Date(p.date) >= startDate);
    
    // Safety check: if filter returns empty (e.g., user selected "Today" but no data yet), return empty
    if (filtered.length === 0) return [];

    // 2. Calculate Benchmark & Percentage Logic
    // We rebase benchmark to the start of the visible period
    let benchmarkUnits = 0;
    const startPoint = filtered[0];
    const initialSpyPrice = startPoint.spy_price || 0;
    
    // For Value View: Standard Benchmark Tracking (adjusting for cashflows)
    if (initialSpyPrice > 0) {
        benchmarkUnits = startPoint.portfolio_value / initialSpyPrice;
    }
    let previousCashFlow = startPoint.cumulative_cash_flow;

    return filtered.map((point, index) => {
        const currentSpyPrice = point.spy_price || 0;
        
        // --- Benchmark Value Logic ---
        if (index > 0) {
            const netFlow = point.cumulative_cash_flow - previousCashFlow;
            if (netFlow !== 0 && currentSpyPrice > 0) {
                benchmarkUnits += (netFlow / currentSpyPrice);
            }
        }
        previousCashFlow = point.cumulative_cash_flow;
        const benchmarkValue = Math.max(0, benchmarkUnits) * currentSpyPrice;

        // --- Percentage Logic ---
        // Portfolio % Return = (Total Value - Net Invested) / Net Invested
        // Avoid division by zero
        const invested = point.cumulative_cash_flow;
        const portfolioReturnPct = invested > 0 
            ? ((point.portfolio_value - invested) / invested) * 100 
            : 0;

        // Benchmark % Return 
        const benchmarkReturnPct = invested > 0
            ? ((benchmarkValue - invested) / invested) * 100
            : 0;

        return {
            ...point,
            benchmark_value_view: benchmarkValue,
            portfolio_pct_view: portfolioReturnPct,
            benchmark_pct_view: benchmarkReturnPct
        };
    });
  }, [rawData, timeRange]);

  const chartData = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;

    const datasets = [];
    const isPercent = viewMode === 'PERCENT';

    // 1. Invested Capital (Only relevant in Value Mode)
    if (!isPercent) {
        datasets.push({
            label: 'Investimento Líquido',
            data: processedData.map(p => p.cumulative_cash_flow),
            borderColor: 'rgba(54, 162, 235, 0.5)',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            order: 2
        });
    }

    // 2. Benchmark (SPY)
    if (showBenchmark) {
        datasets.push({
            label: isPercent ? 'S&P 500 (%)' : 'S&P 500 (Simulado)',
            data: processedData.map(p => isPercent ? p.benchmark_pct_view : p.benchmark_value_view),
            borderColor: '#FFC107', // Amber/Yellow
            backgroundColor: 'transparent',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: false,
            tension: 0.4,
            order: 1
        });
    }

    // 3. Portfolio Main Line
    datasets.push({
        label: isPercent ? 'Retorno (%)' : 'Valor da Carteira',
        data: processedData.map(p => isPercent ? p.portfolio_pct_view : p.portfolio_value),
        borderColor: isPercent ? '#9C27B0' : 'rgba(75, 192, 192, 1)', // Purple for %, Teal for Value
        backgroundColor: chartGradient || 'rgba(75, 192, 192, 0.2)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        fill: !isPercent, // Don't fill percentage chart to keep it clean
        tension: 0.1,
        order: 0
    });

    return {
        labels: processedData.map(p => p.date),
        datasets: datasets
    };
  }, [processedData, chartGradient, showBenchmark, viewMode]);

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
            if (context.parsed.y !== null) {
                if (viewMode === 'PERCENT') {
                    label += context.parsed.y.toFixed(2) + '%';
                } else {
                    label += formatCurrency(context.parsed.y);
                }
            }
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
        ticks: { 
            callback: (value) => {
                if (viewMode === 'PERCENT') return value.toFixed(1) + '%';
                return formatCurrency(value, { minimumFractionDigits: 0, maximumFractionDigits: 0, notation: "compact" });
            }
        }
      }
    }
  };

  const benchmarkInfo = (
    <Box sx={{ p: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold">Benchmark S&P 500</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            Compara a tua performance com o índice S&P 500.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            O sistema simula que compraste S&P 500 no mesmo momento em que depositaste dinheiro na tua carteira.
        </Typography>
    </Box>
  );

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (!portfolioId) return null;
  if (isError || !chartData) return null; 

  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, border: 'none', height: 500, display: 'flex', flexDirection: 'column' }}>
      
      {/* TOOLBAR ROW */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        
        {/* Left: Title & Info */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>Evolução</Typography>
            <Tooltip title={benchmarkInfo} arrow placement="right">
                <IconButton size="small" sx={{ color: 'text.secondary' }}>
                    <InfoOutlinedIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>

        {/* Right: Controls */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            
            {/* View Mode Toggle: Value vs % */}
            <ToggleButtonGroup
                value={viewMode}
                exclusive
                onChange={(e, newMode) => newMode && setViewMode(newMode)}
                size="small"
                sx={{ height: 32 }}
            >
                <ToggleButton value="VALUE">€</ToggleButton>
                <ToggleButton value="PERCENT">%</ToggleButton>
            </ToggleButtonGroup>

            <Box sx={{ height: 24, width: 1, bgcolor: 'divider', mx: 1 }} />

            {/* Time Range */}
            <ToggleButtonGroup
                value={timeRange}
                exclusive
                onChange={(e, newRange) => newRange && setTimeRange(newRange)}
                size="small"
                sx={{ '& .MuiToggleButton-root': { px: 1.5, py: 0.5, fontSize: '0.75rem', fontWeight: 600 } }}
            >
                <ToggleButton value="1W">1S</ToggleButton>
                <ToggleButton value="1M">1M</ToggleButton>
                <ToggleButton value="3M">3M</ToggleButton>
                <ToggleButton value="YTD">YTD</ToggleButton>
                <ToggleButton value="1Y">1A</ToggleButton>
                <ToggleButton value="5Y">5A</ToggleButton>
                <ToggleButton value="ALL">Tudo</ToggleButton>
            </ToggleButtonGroup>

            {/* Benchmark Switch */}
            <FormControlLabel 
                control={<Switch size="small" checked={showBenchmark} onChange={(e) => setShowBenchmark(e.target.checked)} />} 
                label={<Typography variant="caption" sx={{fontWeight: 600}}>SPY</Typography>} 
                sx={{ ml: 1, mr: 0 }}
            />
        </Box>
      </Box>

      <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
        <Line ref={chartRef} data={chartData} options={options} />
      </Box>
    </Paper>
  );
}