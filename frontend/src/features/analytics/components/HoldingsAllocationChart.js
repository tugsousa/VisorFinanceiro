// frontend/src/components/realizedgainsSections/HoldingsAllocationChart.js
import React, { useState, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Paper, Typography, Box, FormControlLabel, Switch } from '@mui/material';
import { formatCurrency } from '../../../lib/utils/formatUtils';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

const generateColorPalette = (count) => {
  if (count === 0) return [];
  const palette = [];
  const baseHue = 145; 
  const saturation = 60;
  const startLightness = 25; 
  const endLightness = 85;   
  const lightnessStep = (endLightness - startLightness) / (count > 1 ? count - 1 : 1);

  for (let i = 0; i < count; i++) {
    const lightness = startLightness + (i * lightnessStep);
    palette.push(`hsl(${baseHue}, ${saturation}%, ${lightness}%)`);
  }
  return palette;
};

const wrapText = (ctx, text, maxWidth) => {
  if (!text) return [];
  const words = text.split(' ');
  const lines = [];
  let currentLine = words[0] || '';

  for (let i = 1; i < words.length; i++) {
    const word = words[i];
    const width = ctx.measureText(currentLine + " " + word).width;
    if (width < maxWidth) {
      currentLine += " " + word;
    } else {
      lines.push(currentLine);
      currentLine = word;
    }
  }
  lines.push(currentLine);
  return lines;
};

const fontFamily = 'Poppins, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif';

const centerTextPlugin = {
  id: 'centerTextPlugin',
  beforeDraw(chart, args, options) {
    const { ctx, data } = chart;
    const { totalValue, hoveredData } = options;
    
    // --- FIX: Added safety check for 'data' ---
    if (!data || !data.labels || data.labels.length === 0) return;
    // ----------------------------------------

    ctx.save();
    const centerX = chart.getDatasetMeta(0).data[0]?.x || chart.width / 2;
    const centerY = chart.getDatasetMeta(0).data[0]?.y || chart.height / 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (hoveredData) {
      const chartSize = Math.min(chart.width, chart.height);
      const cutoutPercentage = parseFloat(chart.options.cutout) / 100;
      const holeDiameter = chartSize * cutoutPercentage;
      const maxWidth = holeDiameter * 0.8;

      const labelLineHeight = 18;
      const valueFontSize = 18;
      const percentageFontSize = 13;
      const valueMarginTop = 10;
      const percentageMarginTop = 8;

      ctx.font = `500 13px ${fontFamily}`;
      ctx.fillStyle = '#333';
      
      const lines = wrapText(ctx, hoveredData.label, maxWidth);
      const labelBlockHeight = lines.length * labelLineHeight;
      const totalBlockHeight = labelBlockHeight + valueMarginTop + valueFontSize + percentageMarginTop + percentageFontSize;
      
      let currentY = centerY - (totalBlockHeight / 2) + (labelLineHeight / 2);

      lines.forEach(line => {
        ctx.fillText(line, centerX, currentY);
        currentY += labelLineHeight;
      });

      currentY += valueMarginTop;
      ctx.font = `bold ${valueFontSize}px ${fontFamily}`;
      ctx.fillStyle = '#111';
      ctx.fillText(formatCurrency(hoveredData.value), centerX, currentY);

      currentY += (valueFontSize / 2) + percentageMarginTop + (percentageFontSize / 2);
      ctx.font = `16px ${fontFamily}`;
      ctx.fillStyle = '#666';
      ctx.fillText(hoveredData.percentage, centerX, currentY);

    } else {
      ctx.font = `500 13px ${fontFamily}`;
      ctx.fillStyle = '#666';
      ctx.fillText('Valor Total', centerX, centerY - 15);
      
      ctx.font = `bold 18px ${fontFamily}`;
      ctx.fillStyle = '#111';
      ctx.fillText(formatCurrency(totalValue), centerX, centerY + 15);
    }
    ctx.restore();
  }
};

const fadeColor = (colorString, alpha = 0.3) => {
    if (typeof colorString !== 'string' || !colorString.startsWith('hsl')) return 'rgba(200, 200, 200, 0.3)';
    return colorString.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
};

export default function HoldingsAllocationChart({ holdings }) {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [showPurchaseValue, setShowPurchaseValue] = useState(false);

    // --- DATA PROCESSING LOGIC MOVED HERE ---
    const chartData = useMemo(() => {
        if (!holdings || holdings.length === 0) return { labels: [], datasets: [] };
        
        const isHistorical = holdings[0]?.isHistorical;

        // Process items based on the selected mode
        const chartItems = holdings.map(h => {
            let value;
            if (showPurchaseValue) {
                // Mode: Purchase Value (Cost Basis)
                value = Math.abs(h.total_cost_basis_eur || 0);
            } else {
                // Mode: Current Value (Market Value)
                // Fallback to cost basis if historical and market value is missing/zero (existing logic preserved)
                value = isHistorical ? Math.abs(h.total_cost_basis_eur || 0) : (h.marketValueEUR || 0);
            }
            return {
                name: h.product_name,
                value: value
            };
        }).sort((a, b) => b.value - a.value); // Sort descending

        const topN = 7;
        const top = chartItems.slice(0, topN);
        const other = chartItems.slice(topN);

        const labels = top.map(item => item.name);
        const data = top.map(item => item.value);

        if (other.length > 0) {
            labels.push('Outros');
            data.push(other.reduce((sum, item) => sum + item.value, 0));
        }

        return { labels, datasets: [{ data }] };
    }, [holdings, showPurchaseValue]);
    // ----------------------------------------

    const totalValue = useMemo(() => {
        const data = chartData?.datasets?.[0]?.data || [];
        if (data.length === 0) return 0;
        return data.reduce((sum, value) => sum + value, 0);
    }, [chartData]);

    const baseColors = useMemo(() => {
        const dataLength = chartData?.datasets?.[0]?.data?.length ?? 0;
        return generateColorPalette(dataLength);
    }, [chartData]);

    const dynamicBackgroundColors = useMemo(() => {
        if (hoveredIndex === null) return baseColors;
        return baseColors.map((color, index) =>
            index === hoveredIndex ? color : fadeColor(color, 0.2)
        );
    }, [hoveredIndex, baseColors]);

    const dynamicBorderColors = useMemo(() => {
        if (hoveredIndex === null) return baseColors;
        return baseColors.map((color, index) =>
            index === hoveredIndex ? color : fadeColor(color, 0.3)
        );
    }, [hoveredIndex, baseColors]);

    const hoveredData = useMemo(() => {
        if (hoveredIndex !== null && totalValue > 0 && chartData?.datasets?.[0]?.data[hoveredIndex] !== undefined) {
            const value = chartData.datasets[0].data[hoveredIndex];
            const label = chartData.labels[hoveredIndex];
            return {
                label,
                value,
                percentage: `${((value / totalValue) * 100).toFixed(2)}%`
            };
        }
        return null;
    }, [hoveredIndex, chartData, totalValue]);

    const noData = !chartData?.datasets?.[0]?.data?.length > 0;

    if (noData) {
        return (
            <Paper elevation={0} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', border: 'none' }}>
                <Typography color="text.secondary">Sem dados de posições para o gráfico.</Typography>
            </Paper>
        );
    }

    const dataWithColors = {
        ...chartData,
        datasets: chartData.datasets.map(dataset => ({
            ...dataset,
            backgroundColor: dynamicBackgroundColors,
            borderColor: dynamicBorderColors,
            borderWidth: 1,
            borderRadius: 2,
        }))
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        hoverOffset: 12,
        onHover: (event, activeElements) => {
            if (activeElements && activeElements.length > 0) {
                const newIndex = activeElements[0].index;
                if (newIndex !== hoveredIndex) {
                    setHoveredIndex(newIndex);
                }
            }
        },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            title: { display: false },
            centerTextPlugin: { totalValue, hoveredData }
        },
        layout: { padding: 8 },
        animation: { animateRotate: true, animateScale: true },
    };

   return (
      <Box sx={{ width: '100%', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
        {/* Header with Toggle Only (Title removed) */}
        <Box sx={{ width: '100%', display: 'flex', justifyContent: 'flex-end', alignItems: 'center', mb: 1, px: 1 }}>
            <FormControlLabel
                control={
                    <Switch
                        size="small"
                        checked={showPurchaseValue}
                        onChange={(e) => setShowPurchaseValue(e.target.checked)}
                        color="primary"
                    />
                }
                label={
                    <Typography variant="caption" color="text.secondary">
                        {showPurchaseValue ? "Valor de Compra" : "Valor Atual"}
                    </Typography>
                }
                labelPlacement="start"
            />
        </Box>
        
        <div 
            onMouseLeave={() => setHoveredIndex(null)}
            style={{ position: 'relative', width: '100%', flexGrow: 1, minHeight: '280px' }}
        >
            <Doughnut data={dataWithColors} options={options} plugins={[centerTextPlugin]} />
        </div>
      </Box>
    );
}