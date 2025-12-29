import React, { useMemo, useState, useRef, useEffect } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Line } from 'react-chartjs-2';
import { Box, CircularProgress, ToggleButton, ToggleButtonGroup, Switch, FormControlLabel, Typography } from '@mui/material';
import { apiFetchHistoricalChartData } from 'features/analytics/api/analyticsApi';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { usePortfolio } from '../../portfolio/PortfolioContext';
import { Chart as ChartJS, CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip as ChartTooltip, Legend, Filler, TimeScale } from 'chart.js';
import 'chartjs-adapter-date-fns'; // Garante que tens este import para as escalas de tempo

ChartJS.register(
  CategoryScale, LinearScale, PointElement, LineElement, Title, ChartTooltip, Legend, Filler, TimeScale
);

export default function HistoricalPerformanceChart() {
  const chartRef = useRef(null);
  const [timeRange, setTimeRange] = useState('ALL');
  const [viewMode, setViewMode] = useState('VALUE'); // 'VALUE' ou 'PERCENT'
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

  // Configurar o gradiente do gráfico
  useEffect(() => {
    const chart = chartRef.current;
    if (!chart) return;
    const ctx = chart.ctx;
    const gradient = ctx.createLinearGradient(0, 0, 0, 400);
    gradient.addColorStop(0, 'rgba(75, 192, 192, 0.5)');
    gradient.addColorStop(1, 'rgba(75, 192, 192, 0.0)');
    setChartGradient(gradient);
  }, [rawData, viewMode]);

  // Processamento dos dados
  const processedData = useMemo(() => {
    if (!rawData || rawData.length === 0) return [];

    // 1. Determinar a data de início baseada no filtro
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
      // Garantir que a data não é anterior ao primeiro dado disponível
      const firstDataDate = new Date(rawData[0].date);
      startDate = tempStart < firstDataDate ? firstDataDate : tempStart;
    }

    // Filtrar array
    const filtered = rawData.filter(p => new Date(p.date) >= startDate);
    if (filtered.length === 0) return [];

    // CASO 1: "ALL" -> Lógica Original (Acumulado desde o início)
    if (timeRange === 'ALL') {
      return filtered.map(point => {
        const invested = point.cumulative_cash_flow; 
        const value = point.portfolio_value || 0;
        const benchValue = point.benchmark_value || 0;
        
        let pct = 0;
        let benchPct = 0;
        if (invested > 0) {
          pct = ((value - invested) / invested) * 100;
          benchPct = ((benchValue - invested) / invested) * 100;
        }

        return {
          date: point.date,
          cumulative_cash_flow: invested,
          portfolio_value: value,
          portfolio_pct_view: pct,
          benchmark_value_view: benchValue,
          benchmark_pct_view: benchPct
        };
      });
    }

    // CASO 2: PERÍODOS ESPECÍFICOS -> TWR + Benchmark Simulado
    
    // 2.1 Encontrar o valor inicial e o primeiro preço válido do SPY para inicializar
    const startPoint = filtered[0];
    const startPortValue = startPoint.portfolio_value || 0;
    
    // Encontrar o primeiro preço de SPY válido no dataset filtrado para evitar divisão por zero
    let initialSpyPrice = 0;
    let initialSpyIndex = -1;
    for (let i = 0; i < filtered.length; i++) {
        if (filtered[i].spy_price > 0) {
            initialSpyPrice = filtered[i].spy_price;
            initialSpyIndex = i;
            break;
        }
    }

    let simulatedBenchUnits = 0;
    // Se encontrámos um preço SPY, inicializamos a simulação como se comprássemos SPY 
    // com o valor da carteira no dia inicial (ou no primeiro dia com dados SPY)
    if (initialSpyPrice > 0 && startPortValue > 0) {
        simulatedBenchUnits = startPortValue / initialSpyPrice;
    }

    let cumulativeMult = 1.0;
    let cumulativeBenchMult = 1.0;
    
    // Referência para o último preço SPY conhecido para preencher buracos (ex: feriados)
    let lastKnownSpyPrice = initialSpyPrice;

    const result = [];

    for (let i = 0; i < filtered.length; i++) {
        const curr = filtered[i];
        
        // Ponto Inicial (Dia 0 do filtro)
        if (i === 0) {
            result.push({
                date: curr.date,
                cumulative_cash_flow: curr.cumulative_cash_flow, // Garante que isto é passado!
                portfolio_value: curr.portfolio_value,
                portfolio_pct_view: 0,
                // O Benchmark começa igual à carteira para comparação justa
                benchmark_value_view: curr.portfolio_value, 
                benchmark_pct_view: 0
            });
            continue;
        }

        const prev = filtered[i-1];

        // --- A. TWR do Portfolio ---
        const dailyFlow = curr.cumulative_cash_flow - prev.cumulative_cash_flow;
        const prevVal = prev.portfolio_value;
        let dailyReturn = 0;
        
        // Fórmula TWR: remove o efeito do fluxo de caixa do retorno do dia
        if (prevVal > 0) { 
            dailyReturn = ((curr.portfolio_value - dailyFlow) / prevVal) - 1;
        }
        cumulativeMult *= (1 + dailyReturn);

        // --- B. Benchmark Simulado (SPY) ---
        const currentSpyPrice = curr.spy_price || lastKnownSpyPrice; // Usar lastKnown se 0
        if (curr.spy_price > 0) lastKnownSpyPrice = curr.spy_price;

        // Se tivermos preço válido, processamos a simulação
        if (currentSpyPrice > 0) {
            // Se a simulação ainda não começou (porque o início do chart não tinha SPY), tenta começar agora
            if (simulatedBenchUnits === 0 && i === initialSpyIndex) {
                 simulatedBenchUnits = (curr.portfolio_value - dailyFlow) / currentSpyPrice;
            } else if (dailyFlow !== 0) {
                // Ajustar unidades do benchmark com o fluxo de caixa (compra/venda teórica)
                const unitsBought = dailyFlow / currentSpyPrice;
                simulatedBenchUnits += unitsBought;
            }
        }
        
        const currentBenchValue = simulatedBenchUnits * currentSpyPrice;
        
        // TWR do Benchmark (para o gráfico %)
        // Calcula o retorno puro do ativo subjacente (SPY)
        const prevSpyPrice = prev.spy_price || lastKnownSpyPrice; // Simplificação
        let dailyBenchReturn = 0;
        // Se temos preços consecutivos válidos, calculamos o retorno real do SPY
        if (currentSpyPrice > 0 && prevSpyPrice > 0) {
             dailyBenchReturn = (currentSpyPrice / prevSpyPrice) - 1;
        }
        cumulativeBenchMult *= (1 + dailyBenchReturn);

        result.push({
            date: curr.date,
            cumulative_cash_flow: curr.cumulative_cash_flow, // ADICIONADO: Essencial para a linha aparecer
            portfolio_value: curr.portfolio_value,
            portfolio_pct_view: (cumulativeMult - 1) * 100,
            benchmark_value_view: currentBenchValue, 
            benchmark_pct_view: (cumulativeBenchMult - 1) * 100
        });
    }

    return result;

  }, [rawData, timeRange]);

  const chartData = useMemo(() => {
    if (!processedData || processedData.length === 0) return null;

    const datasets = [];
    const isPercent = viewMode === 'PERCENT';

    // 1. Investimento Líquido
    // Removida a restrição 'hidden: timeRange !== ALL' conforme solicitado.
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

    // 2. Benchmark Line (S&P 500)
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
  }, [processedData, chartGradient, showBenchmark, viewMode]); // Removido timeRange das dependências pois já não afeta o 'hidden'

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
            if (label) {
              label += ': ';
            }
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
        type: 'time',
        time: {
          unit: 'month',
          tooltipFormat: 'dd-MM-yyyy',
          displayFormats: {
            day: 'MMM dd',
            week: 'MMM dd',
            month: 'MMM yyyy',
            year: 'yyyy'
          },
        },
        grid: {
          display: false
        },
        ticks: {
          maxRotation: 0,
          autoSkip: true
        }
      },
      y: {
        beginAtZero: false, // Permite ver melhor a variação em valores altos
        grid: {
          color: '#f0f0f0'
        },
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
    <Box sx={{ p: 3, height: '100%', display: 'flex', flexDirection: 'column', bgcolor: '#ffffff', borderRadius: 3 }} >
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 1, flexWrap: 'wrap', gap: 2, flexShrink: 0 }}>
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
      
      <Box sx={{ flexGrow: 1, minHeight: 0, position: 'relative', width: '100%', pb: 4 }}>
        <Line ref={chartRef} data={chartData} options={options} />
      </Box>
    </Box>
  );
}