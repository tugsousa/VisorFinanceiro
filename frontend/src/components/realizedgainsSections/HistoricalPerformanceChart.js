import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import { 
    Box, 
    Paper, 
    Typography, 
    CircularProgress, 
    ToggleButton, 
    ToggleButtonGroup,
    Switch,
    FormControlLabel,
    Tooltip,
    IconButton
} from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { apiFetchHistoricalChartData } from '../../api/apiService';
import { formatCurrency } from '../../utils/formatUtils';
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip as ChartTooltip,
  Legend,
  Filler
} from 'chart.js';

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  ChartTooltip,
  Legend,
  Filler
);

// --- HELPER: Drawdown Calculation ---
const calculateDrawdown = (data) => {
    let maxPeak = -Infinity;
    return data.map(point => {
        if (point.portfolio_value > maxPeak) maxPeak = point.portfolio_value;
        // Avoid division by zero
        if (maxPeak === 0) return { ...point, drawdown: 0 };
        return {
            ...point,
            drawdown: ((point.portfolio_value - maxPeak) / maxPeak) * 100
        };
    });
};

export default function HistoricalPerformanceChart() {
  const chartRef = useRef(null);
  const [timeRange, setTimeRange] = useState('ALL');
  const [showBenchmark, setShowBenchmark] = useState(false);
  const [showDrawdown, setShowDrawdown] = useState(false);
  const [chartGradient, setChartGradient] = useState(null);

  const { data: rawData, isLoading, isError } = useQuery({
    queryKey: ['historicalChartData'],
    queryFn: async () => {
        const res = await apiFetchHistoricalChartData();
        return res.data;
    }
  });

  // Generate Gradient when chart is ready or data changes
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;

    const ctx = chart.ctx;
    // Create a gradient from top (0) to bottom (400px approx height)
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(75, 192, 192, 0.5)'); 
    gradient.addColorStop(1, 'rgba(75, 192, 192, 0.0)');
    setChartGradient(gradient);
  }, [rawData]);

  const processedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];
    
    // 1. Filter by Time Range
    // Create a 'now' date set to the end of the day to include all data points up to today
    const now = new Date();
    now.setHours(23, 59, 59, 999); 
    
    // Determine start date based on range
    let startDate = new Date(rawData[0].date); // Default to first available date

    if (timeRange !== 'ALL') {
        const tempStart = new Date();
        switch (timeRange) {
            case '1W':
                tempStart.setDate(now.getDate() - 7);
                break;
            case '1M':
                tempStart.setMonth(now.getMonth() - 1);
                break;
            case 'YTD':
                tempStart.setMonth(0, 1); // Jan 1st of current year
                break;
            case '1Y':
                tempStart.setFullYear(now.getFullYear() - 1);
                break;
            case '5Y':
                tempStart.setFullYear(now.getFullYear() - 5);
                break;
            default:
                break;
        }
        startDate = tempStart;
    }

    const filtered = rawData.filter(p => new Date(p.date) >= startDate);

    // 2. Calculate Drawdown if that mode is active
    if (showDrawdown) {
        return calculateDrawdown(filtered);
    }

    return filtered;
  }, [rawData, timeRange, showDrawdown]);

  // --- CHART DATA CONSTRUCTION ---
  const chartData = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;

    const datasets = [];

    if (showDrawdown) {
        // DRAWDOWN DATASET (Under-water chart)
        datasets.push({
            label: 'Drawdown (%)',
            data: processedData.map(p => p.drawdown),
            borderColor: 'rgba(239, 83, 80, 1)', // Red
            backgroundColor: 'rgba(239, 83, 80, 0.2)', // Light Red Fill
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 4,
            fill: true,
        });
    } else {
        // STANDARD DATASETS
        
        // 1. Invested Capital (Dashed Blue)
        datasets.push({
            label: 'Investimento Líquido',
            data: processedData.map(p => p.cumulative_cash_flow),
            borderColor: 'rgba(54, 162, 235, 0.5)', // Light Blue
            backgroundColor: 'transparent',
            borderDash: [5, 5],
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 0,
            fill: false,
            order: 2 // Draw this behind the portfolio line
        });

        // 2. Benchmark (Yellow) - Only if enabled
        if (showBenchmark) {
            datasets.push({
                label: 'Benchmark (S&P 500)',
                data: processedData.map(p => p.benchmark_value),
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

        // 3. Portfolio Value (Green with Gradient)
        datasets.push({
            label: 'Valor da Carteira',
            data: processedData.map(p => p.portfolio_value),
            borderColor: 'rgba(75, 192, 192, 1)', // Green
            backgroundColor: chartGradient || 'rgba(75, 192, 192, 0.2)',
            borderWidth: 2,
            pointRadius: 0,
            pointHoverRadius: 5,
            fill: true,
            tension: 0.1,
            order: 0 // Draw this on top
        });
    }

    return {
        labels: processedData.map(p => p.date),
        datasets: datasets
    };
  }, [processedData, chartGradient, showBenchmark, showDrawdown]);

  // --- CHART OPTIONS ---
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
        align: 'end',
        labels: {
            usePointStyle: true,
            boxWidth: 8
        }
      },
      title: {
        display: false, // We use a custom UI title
      },
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
            if (label) {
                label += ': ';
            }
            if (context.parsed.y !== null) {
                // If Drawdown mode, show percentage. Otherwise currency.
                label += showDrawdown 
                    ? `${context.parsed.y.toFixed(2)}%` 
                    : formatCurrency(context.parsed.y);
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
            maxTicksLimit: 8,
            maxRotation: 0,
            autoSkip: true
        }
      },
      y: {
        beginAtZero: false,
        grid: { color: '#f0f0f0' },
        ticks: {
            // Format Y-axis labels
            callback: (value) => {
                return showDrawdown 
                    ? `${value}%` 
                    : formatCurrency(value, { 
                        minimumFractionDigits: 0, 
                        maximumFractionDigits: 0,
                        compactDisplay: "short",
                        notation: "compact"
                    });
            }
        }
      }
    }
  };

  // --- TOOLTIP CONTENT ---
  const benchmarkInfo = (
    <Box sx={{ p: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold">Benchmark S&P 500</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            Esta linha simula um "Shadow Portfolio" (Carteira Sombra).
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            Para cada depósito ou levantamento que fez na sua conta, o sistema calcula quantas unidades do índice S&P 500 poderia ter comprado (ou vendido) nesse exato dia.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            A linha amarela mostra quanto valeria esse investimento passivo hoje, permitindo comparar a sua gestão ativa contra o mercado.
        </Typography>
    </Box>
  );

  const drawdownInfo = (
    <Box sx={{ p: 1 }}>
        <Typography variant="subtitle2" fontWeight="bold">Drawdown (Risco)</Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            Este gráfico inverte a perspectiva para mostrar o risco.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            Ele calcula a percentagem de desvalorização em relação ao máximo histórico anterior (All-Time High) da sua carteira.
        </Typography>
        <Typography variant="body2" sx={{ mt: 1 }}>
            <strong>0%</strong> significa que a carteira está num novo máximo.<br/>
            Valores negativos (ex: -15%) mostram quão "debaixo de água" está em relação ao seu pico anterior.
        </Typography>
    </Box>
  );

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}><CircularProgress /></Box>;
  if (isError || !chartData) return null; 

  return (
    <Paper elevation={0} sx={{ p: 3, mb: 3, border: 'none', height: 600, display: 'flex', flexDirection: 'column' }}>
      
      {/* Header and Controls */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2, flexWrap: 'wrap', gap: 2 }}>
        
        {/* Title Area with Info Icon */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Typography variant="h6" sx={{ fontWeight: 600 }}>
                {showDrawdown ? 'Drawdown (Risco)' : 'Evolução Histórica'}
            </Typography>
            <Tooltip title={showDrawdown ? drawdownInfo : benchmarkInfo} arrow placement="right">
                <IconButton size="small" sx={{ color: 'text.secondary' }}>
                    <InfoOutlinedIcon fontSize="small" />
                </IconButton>
            </Tooltip>
        </Box>

        {/* Toggles */}
        <Box sx={{ display: 'flex', gap: 3, alignItems: 'center' }}>
            <FormControlLabel 
                control={
                    <Switch 
                        size="small" 
                        checked={showBenchmark} 
                        onChange={(e) => setShowBenchmark(e.target.checked)} 
                        disabled={showDrawdown} // Disable benchmark toggle if in drawdown mode
                    />
                } 
                label={<Typography variant="body2" color="text.secondary">S&P 500</Typography>} 
            />
            <FormControlLabel 
                control={
                    <Switch 
                        size="small" 
                        color="error" 
                        checked={showDrawdown} 
                        onChange={(e) => setShowDrawdown(e.target.checked)} 
                    />
                } 
                label={<Typography variant="body2" color="text.secondary">Drawdown</Typography>} 
            />
        </Box>
      </Box>

      {/* Time Range Filter Buttons */}
      <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
        <ToggleButtonGroup
            value={timeRange}
            exclusive
            onChange={(e, newRange) => newRange && setTimeRange(newRange)}
            aria-label="time range"
            size="small"
            sx={{ 
                '& .MuiToggleButton-root': { 
                    py: 0.5, 
                    px: 1.5, 
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    textTransform: 'none',
                    border: '1px solid #e0e0e0'
                },
                '& .Mui-selected': {
                    backgroundColor: 'rgba(25, 118, 210, 0.08)',
                    color: '#1976d2',
                    borderColor: '#1976d2'
                }
            }}
        >
            <ToggleButton value="1W">1S</ToggleButton>
            <ToggleButton value="1M">1M</ToggleButton>
            <ToggleButton value="YTD">YTD</ToggleButton>
            <ToggleButton value="1Y">1A</ToggleButton>
            <ToggleButton value="5Y">5A</ToggleButton>
            <ToggleButton value="ALL">Tudo</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {/* Chart Canvas Area */}
      <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative' }}>
        <Line ref={chartRef} data={chartData} options={options} />
      </Box>
    </Paper>
  );
}