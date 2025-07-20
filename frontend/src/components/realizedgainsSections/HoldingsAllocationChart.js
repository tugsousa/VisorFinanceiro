import React, { useState, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { Paper, Typography } from '@mui/material';
import { formatCurrency } from '../../utils/formatUtils';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

/**
 * Modern and professional color palettes for the chart.
 */
const modernPalettes = {
  // A palette with various shades of green for a fresh, modern look
  greenTones: [
    '#004d40', // Dark Teal
    '#00796b', // Medium Teal
    '#4DB6AC', // Light Teal
    '#2E7D32', // Dark Green
    '#66BB6A', // Medium Green
    '#AED581'  // Light Green
  ],
  // A palette with cool and professional tones
  coolTones: [
    '#1C2833', '#2E4053', '#AAB7B8', '#D5DBDB', '#F4F6F6'
  ],
  // A palette with a mix of vibrant and muted colors
  vibrantAndMuted: [
    '#056875', '#50C2E5', '#C9495E', '#D46600', '#1F3A93', '#27AE60', '#F1C40F'
  ]
};

/**
 * Generates a color palette of a specified length.
 * @param {number} count - The number of colors needed.
 * @param {string} paletteName - The name of the palette to use.
 * @returns {string[]} An array of color strings.
 */
const generateColorPalette = (count, paletteName = 'greenTones') => {
  const selectedPalette = modernPalettes[paletteName] || modernPalettes.greenTones;
  const palette = [];
  for (let i = 0; i < count; i++) {
    palette.push(selectedPalette[i % selectedPalette.length]);
  }
  return palette;
};


/**
 * Helper function to wrap text into multiple lines to fit within a max width.
 * @param {CanvasRenderingContext2D} ctx - The canvas context for measuring text.
 * @param {string} text - The text to be wrapped.
 * @param {number} maxWidth - The maximum width in pixels.
 * @returns {string[]} An array of strings, where each string is a line.
 */
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


// Custom plugin to draw text in the center of the doughnut chart
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
      // --- ROBUST MAX WIDTH CALCULATION ---
      const chartSize = Math.min(chart.width, chart.height);
      const cutoutPercentage = parseFloat(chart.options.cutout) / 100;
      const holeDiameter = chartSize * cutoutPercentage;
      // THE FIX: Reduced the multiplier from 0.9 to 0.8 for more aggressive wrapping
      const maxWidth = holeDiameter * 0.8;

      // --- LINE WRAPPING & VERTICAL POSITIONING LOGIC ---
      const labelLineHeight = 18;
      const valueFontSize = 24;
      const percentageFontSize = 16;
      const valueMarginTop = 10;
      const percentageMarginTop = 8;

      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#333';
      const lines = wrapText(ctx, hoveredData.label, maxWidth);

      const labelBlockHeight = lines.length * labelLineHeight;
      const totalBlockHeight = labelBlockHeight + valueMarginTop + valueFontSize + percentageMarginTop + percentageFontSize;

      let currentY = centerY - (totalBlockHeight / 2) + (labelLineHeight / 2);

      // 1. Draw the product name lines
      lines.forEach(line => {
        ctx.fillText(line, centerX, currentY);
        currentY += labelLineHeight;
      });

      // 2. Draw the value
      currentY += valueMarginTop;
      ctx.font = `bold ${valueFontSize}px sans-serif`;
      ctx.fillStyle = '#111';
      ctx.fillText(formatCurrency(hoveredData.value), centerX, currentY);

      // 3. Draw the percentage
      currentY += (valueFontSize / 2) + percentageMarginTop + (percentageFontSize / 2);
      ctx.font = `${percentageFontSize}px sans-serif`;
      ctx.fillStyle = '#666';
      ctx.fillText(hoveredData.percentage, centerX, currentY);

    } else {
      // Default display (total value)
      ctx.font = '16px sans-serif';
      ctx.fillStyle = '#666';
      ctx.fillText('Valor Total do Portefólio', centerX, centerY - 15);

      ctx.font = 'bold 24px sans-serif';
      ctx.fillStyle = '#111';
      ctx.fillText(formatCurrency(totalValue), centerX, centerY + 15);
    }
    ctx.restore();
  }
};

// Helper function to fade a color (make it more transparent)
const fadeColor = (colorString, alpha = 0.3) => {
    if (typeof colorString !== 'string' || !colorString.startsWith('#')) return 'rgba(200, 200, 200, 0.3)';

    const hex = colorString.slice(1);
    const r = parseInt(hex.substring(0, 2), 16);
    const g = parseInt(hex.substring(2, 4), 16);
    const b = parseInt(hex.substring(4, 6), 16);

    return `rgba(${r}, ${g}, ${b}, ${alpha})`;
};


export default function HoldingsAllocationChart({ chartData }) {
    const [hoveredIndex, setHoveredIndex] = useState(null);

    const totalValue = useMemo(() => {
        if (!chartData || !chartData.datasets || chartData.datasets[0].data.length === 0) {
            return 0;
        }
        return chartData.datasets[0].data.reduce((sum, value) => sum + value, 0);
    }, [chartData]);

    const baseColors = useMemo(() => {
        const dataLength = chartData?.datasets?.[0]?.data?.length ?? 0;
        // Using the new 'greenTones' palette by default
        return generateColorPalette(dataLength, 'greenTones');
    }, [chartData]);

    const baseBorderColors = useMemo(() => {
        const dataLength = chartData?.datasets?.[0]?.data?.length ?? 0;
        // Using the new 'greenTones' palette by default
        return generateColorPalette(dataLength, 'greenTones');
    }, [chartData]);

    const dynamicBackgroundColors = useMemo(() => {
        if (hoveredIndex === null) return baseColors;
        return baseColors.map((color, index) =>
            index === hoveredIndex ? color : fadeColor(color, 0.2)
        );
    }, [hoveredIndex, baseColors]);

    const dynamicBorderColors = useMemo(() => {
        if (hoveredIndex === null) return baseBorderColors;
        return baseBorderColors.map((color, index) =>
            index === hoveredIndex ? color : fadeColor(color, 0.3)
        );
    }, [hoveredIndex, baseBorderColors]);

    const hoveredData = useMemo(() => {
        if (hoveredIndex !== null && totalValue > 0 && chartData?.datasets?.[0]?.data[hoveredIndex] !== undefined) {
            const value = chartData.datasets[0].data[hoveredIndex];
            const label = chartData.labels[hoveredIndex];
            return {
                label: label,
                value: value,
                percentage: `${((value / totalValue) * 100).toFixed(2)}%`
            };
        }
        return null;
    }, [hoveredIndex, chartData, totalValue]);

    if (!chartData || !chartData.datasets || chartData.datasets[0].data.length === 0) {
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
        }))
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        plugins: {
            legend: {
                display: false,
            },
            title: {
                display: false,
                text: 'Composição do Portefólio (€)',
            },
            tooltip: {
                enabled: false,
            },
            centerTextPlugin: {
                totalValue,
                hoveredData,
            }
        },
        onHover: (event, chartElement) => {
            if (chartElement.length > 0) {
                setHoveredIndex(chartElement[0].index);
            } else {
                setHoveredIndex(null);
            }
        },
    };

    return (
      <div style={{ width: '300px', height: '300px' }}>
        <Doughnut data={dataWithColors} options={options} plugins={[centerTextPlugin]} />
      </div>
    );
}