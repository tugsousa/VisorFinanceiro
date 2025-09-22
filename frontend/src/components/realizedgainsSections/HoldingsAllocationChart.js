import React, { useState, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Paper, Typography } from '@mui/material';
import { formatCurrency } from '../../utils/formatUtils';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

const modernPalettes = {
  greenTones: [
    '#004d40', '#00796b', '#4DB6AC', '#2E7D32', '#66BB6A', '#AED581'
  ]
};

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
    if (!data.labels || data.labels.length === 0) return;

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
      ctx.fillText('Valor Total do Portefólio', centerX, centerY - 15);
      
      ctx.font = `bold 18px ${fontFamily}`;
      ctx.fillStyle = '#111';
      ctx.fillText(formatCurrency(totalValue), centerX, centerY + 15);
    }
    ctx.restore();
  }
};

const fadeColor = (colorString, alpha = 0.3) => {
    if (typeof colorString !== 'string' || !colorString.startsWith('hsl')) return 'rgba(200, 200, 200, 0.3)';
    // Convert hsl(h, s%, l%) to hsla(h, s%, l%, a)
    return colorString.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
};

export default function HoldingsAllocationChart({ chartData }) {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const totalValue = useMemo(() => {
        // --- INÍCIO DA CORREÇÃO ---
        // A verificação agora usa "optional chaining" (?.) para evitar o erro.
        // Se qualquer parte do caminho (chartData, datasets, [0], data) for nula ou indefinida,
        // a expressão retorna `undefined` sem causar um erro, e o `|| 0` trata disso.
        const data = chartData?.datasets?.[0]?.data || [];
        if (data.length === 0) {
            return 0;
        }
        return data.reduce((sum, value) => sum + value, 0);
        // --- FIM DA CORREÇÃO ---
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

    // --- INÍCIO DA CORREÇÃO ---
    // A verificação de "sem dados" também é robustecida.
    const noData = !chartData?.datasets?.[0]?.data?.length > 0;

    if (noData) {
        return (
            <Paper elevation={0} sx={{ p: 2, display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', border: 'none' }}>
                <Typography color="text.secondary">Sem dados de posições para o gráfico.</Typography>
            </Paper>
        );
    }
    // --- FIM DA CORREÇÃO ---

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
      <div 
        onMouseLeave={() => setHoveredIndex(null)}
        style={{ position: 'relative', width: '100%', height: '100%', minHeight: '280px', margin: 'auto' }}
      >
        <Doughnut data={dataWithColors} options={options} plugins={[centerTextPlugin]} />
      </div>
    );
}