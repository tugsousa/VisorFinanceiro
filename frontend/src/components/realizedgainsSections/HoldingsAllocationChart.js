// frontend/src/components/realizedgainsSections/HoldingsAllocationChart.js
import React, { useState, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend, Title } from 'chart.js';
import { generateColorPalette } from '../../utils/chartUtils';
import { Paper, Typography } from '@mui/material';
import { formatCurrency } from '../../utils/formatUtils';

ChartJS.register(ArcElement, Tooltip, Legend, Title);

/**
 * Função auxiliar que quebra uma string em várias linhas para caber numa largura máxima.
 * @param {CanvasRenderingContext2D} ctx - O contexto do canvas para medir o texto.
 * @param {string} text - O texto a ser quebrado.
 * @param {number} maxWidth - A largura máxima em píxeis.
 * @returns {string[]} Um array de strings, onde cada string é uma linha.
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


// Plugin personalizado para desenhar texto no centro do gráfico de rosca
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
      // --- CÁLCULO ROBUSTO DA LARGURA MÁXIMA ---
      const chartSize = Math.min(chart.width, chart.height);
      const cutoutPercentage = parseFloat(chart.options.cutout) / 100;
      const holeDiameter = chartSize * cutoutPercentage;
      const maxWidth = holeDiameter * 0.9; // Usa 90% do diâmetro para uma margem segura

      // --- Lógica de Quebra de Linha e Posicionamento Vertical ---
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

      // 1. Desenha as linhas do nome do produto
      lines.forEach(line => {
        ctx.fillText(line, centerX, currentY);
        currentY += labelLineHeight;
      });

      // 2. Desenha o valor
      currentY += valueMarginTop;
      ctx.font = `bold ${valueFontSize}px sans-serif`;
      ctx.fillStyle = '#111';
      ctx.fillText(formatCurrency(hoveredData.value), centerX, currentY);
      
      // 3. Desenha a percentagem
      currentY += (valueFontSize / 2) + percentageMarginTop + (percentageFontSize / 2);
      ctx.font = `${percentageFontSize}px sans-serif`;
      ctx.fillStyle = '#666';
      ctx.fillText(hoveredData.percentage, centerX, currentY);

    } else {
      // Desenho por defeito (valor total)
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

// Função auxiliar para desvanecer uma cor (torná-la mais transparente)
const fadeColor = (colorString, alpha = 0.3) => {
    if (typeof colorString !== 'string') return 'rgba(200, 200, 200, 0.3)';
    let parts = colorString.match(/(\w+)\(([^)]+)\)/);
    if (!parts) return 'rgba(200, 200, 200, 0.3)';
    let type = parts[1];
    let values = parts[2].split(',').map(s => s.trim());
    if (type.startsWith('hsl') || type.startsWith('rgb')) {
        const typeWithAlpha = type.startsWith('hsl') ? 'hsla' : 'rgba';
        if (values.length === 3) values.push(alpha);
        else if (values.length === 4) values[3] = alpha;
        return `${typeWithAlpha}(${values.join(', ')})`;
    }
    return colorString;
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
        return generateColorPalette(dataLength, 'background');
    }, [chartData]);

    const baseBorderColors = useMemo(() => {
        const dataLength = chartData?.datasets?.[0]?.data?.length ?? 0;
        return generateColorPalette(dataLength, 'border');
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
                display: true,
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

    return <Doughnut data={dataWithColors} options={options} plugins={[centerTextPlugin]} />;
}