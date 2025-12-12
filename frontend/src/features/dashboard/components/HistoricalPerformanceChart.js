import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import { 
    Box, CircularProgress, ToggleButton, 
    ToggleButtonGroup, Switch, FormControlLabel, Typography
} from '@mui/material';
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
  const [viewMode, setViewMode] = useState('VALUE');
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
    
    const now = new Date();
    now.setHours(23, 59, 59, 999); 
    
    let startDate = new Date(rawData[0].date); 

    if (timeRange !== 'ALL') {
        const tempStart = new Date();
        switch (timeRange) {
            case '1W': tempStart.setDate(now.getDate() - 7); break;
            case '1M': tempStart.setMonth(now.getMonth() - 1); break;
            case '3M': tempStart.setMonth(now.getMonth() - 3); break;
            case 'YTD': tempStart.setFullYear(now.getFullYear(), 0, 1); break;
            case '1Y': tempStart.setFullYear(now.getFullYear() - 1); break;
            case '5Y': tempStart.setFullYear(now.getFullYear() - 5); break;
            default: break;
        }
        // Ensure start date isn't before the first available data point
        const firstDataDate = new Date(rawData[0].date);
        startDate = tempStart < firstDataDate ? firstDataDate : tempStart;
    }

    const filtered = rawData.filter(p => new Date(p.date) >= startDate);
    if (filtered.length === 0) return [];

    // --- Benchmark Simulation Logic ---
    let benchmarkUnits = 0;
    const startPoint = filtered[0];
    const initialSpyPrice = startPoint.spy_price || 0;
    
    // Initial investment buys benchmark units
    if (initialSpyPrice > 0) {
        benchmarkUnits = startPoint.portfolio_value / initialSpyPrice;
    }

    let previousCashFlow = startPoint.cumulative_cash_flow;

    return filtered.map((point, index) => {
        const currentSpyPrice = point.spy_price || 0;
        
        // Handle new deposits/withdrawals
        if (index > 0) {
            const netFlow = point.cumulative_cash_flow - previousCashFlow;
            if (netFlow !== 0 && currentSpyPrice > 0) {
                // Buy/Sell benchmark units with the new cash flow
                benchmarkUnits += (netFlow / currentSpyPrice);
            }
        }
        previousCashFlow = point.cumulative_cash_flow;

        const benchmarkValue = Math.max(0, benchmarkUnits) * currentSpyPrice;
        const invested = point.cumulative_cash_flow;

        // Calculate Percentages
        const portfolioReturnPct = invested > 0 ? ((point.portfolio_value - invested) / invested) * 100 : 0;
        const benchmarkReturnPct = invested > 0 ? ((benchmarkValue - invested) / invested) * 100 : 0;

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

    // 1. Net Invested Line (Only for Value Mode)
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

    // 2. Benchmark Line (Optional)
    if (showBenchmark) {
        datasets.push({
            label: isPercent ? 'S&P 500 (%)' : 'S&P 500 (Simulado)',
            data: processedData.map(p => isPercent ? p.benchmark_pct_view : p.benchmark_value_view),
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

    // 3. Main Portfolio Line
    datasets.push({
        label: isPercent ? 'Retorno (%)' : 'Valor da Carteira',
        data: processedData.map(p => isPercent ? p.portfolio_pct_view : p.portfolio_value),
        borderColor: isPercent ? '#9C27B0' : 'rgba(75, 192, 192, 1)',
        backgroundColor: chartGradient || 'rgba(75, 192, 192, 0.2)',
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        fill: !isPercent,
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
      x: { 
          grid: { display: false }, 
          ticks: { maxTicksLimit: 8, maxRotation: 0, autoSkip: true } 
      },
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

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (!portfolioId || isError || !chartData) return null; 

  return (
    <Box 
        sx={{ 
            p: 3, 
            height: '100%', 
            display: 'flex', 
            flexDirection: 'column',
            bgcolor: '#ffffff',
            borderRadius: 3
        }}
    >
      {/* TOOLBAR ROW - Now only contains controls, aligned right */}
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 2, flexShrink: 0 }}>
        {/* Right: Controls */}
        <Box sx={{ display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
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

            <FormControlLabel 
                control={<Switch size="small" checked={showBenchmark} onChange={(e) => setShowBenchmark(e.target.checked)} />} 
                label={<Typography variant="caption" sx={{fontWeight: 600}}>SPY</Typography>} 
                sx={{ ml: 1, mr: 0 }}
            />
        </Box>
      </Box>

      {/* Chart Canvas Container */}
      <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative', width: '100%', pb: 1 }}>
        <Line ref={chartRef} data={chartData} options={options} />
      </Box>
    </Box>
  );
}