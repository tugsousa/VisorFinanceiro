import React, { useState, useMemo } from 'react';
import { Doughnut } from 'react-chartjs-2';
import { Chart as ChartJS, ArcElement, Tooltip, Legend } from 'chart.js';
import { 
    Box, Typography, Table, TableBody, TableCell, TableContainer, 
    TableHead, TableRow, LinearProgress, Paper, FormControlLabel, Switch 
} from '@mui/material';
import { formatCurrency } from '../../../lib/utils/formatUtils';
import { generateColorPalette } from '../../../lib/utils/chartUtils';

ChartJS.register(ArcElement, Tooltip, Legend);

// Helper to fade colors for hover effect (Restored)
const fadeColor = (colorString, alpha = 0.3) => {
    if (!colorString) return 'rgba(200, 200, 200, 0.3)';
    if (colorString.startsWith('hsla')) {
        return colorString.replace(/[\d.]+\)$/g, `${alpha})`);
    }
    if (colorString.startsWith('hsl')) {
        return colorString.replace('hsl', 'hsla').replace(')', `, ${alpha})`);
    }
    return colorString;
};

// Plugin for Center Text
const centerTextPlugin = {
  id: 'centerTextPlugin',
  beforeDraw(chart, args, options) {
    const { ctx, data } = chart;
    const { totalValue, hoveredData } = options;
    if (!data || !data.labels || data.labels.length === 0) return;

    ctx.save();
    const centerX = chart.getDatasetMeta(0).data[0]?.x || chart.width / 2;
    const centerY = chart.getDatasetMeta(0).data[0]?.y || chart.height / 2;

    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';

    if (hoveredData) {
        // --- TEXTO HOVERED: TAMANHO AUMENTADO (e.g., de 14px/12px para 16px/14px) ---
        ctx.font = `bold 16px Poppins`; // Aumentado para 16px e adicionado Poppins
        ctx.fillStyle = '#333';
        ctx.fillText(formatCurrency(hoveredData.value), centerX, centerY - 10); // Ajustado Y
        
        ctx.font = `14px Poppins`; // Aumentado para 14px e adicionado Poppins
        ctx.fillStyle = '#666';
        ctx.fillText(hoveredData.percentage, centerX, centerY + 10);
        // --- ADICIONAR NOME HOVERED (NOVO) ---
        ctx.font = `italic 11px Poppins`; // Tamanho pequeno e itálico para o nome
        ctx.fillStyle = '#888';
        ctx.fillText(hoveredData.name, centerX, centerY + 25);
        
    } else {
        // --- TEXTO TOTAL: TAMANHO AUMENTADO (e.g., de 11px/14px para 13px/18px) ---
        ctx.font = `13px Poppins`; // Aumentado para 13px e adicionado Poppins
        ctx.fillStyle = '#888';
        ctx.fillText('Total', centerX, centerY - 15); // Ajustado Y
        
        ctx.font = `bold 18px Poppins`; // Aumentado para 18px e adicionado Poppins
        ctx.fillStyle = '#333';
        ctx.fillText(formatCurrency(totalValue), centerX, centerY + 8); // Ajustado Y
    }

    ctx.restore();
  }
};

export default function HoldingsAllocationChart({ data, title }) {
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [showPurchaseValue, setShowPurchaseValue] = useState(false);

    // 1. Process Data based on Toggle
    const { chartData, totalValue, sortedItems } = useMemo(() => {
        if (!data || data.length === 0) return { chartData: null, totalValue: 0, sortedItems: [] };

        // Map to active value (Cost vs Market)
        const processedItems = data.map(item => ({
            name: item.name,
            value: showPurchaseValue ? item.costBasis : item.marketValue
        }));

        const total = processedItems.reduce((sum, item) => sum + item.value, 0);

        // Sort descending
        const sorted = processedItems.sort((a, b) => b.value - a.value).map(item => ({
            ...item,
            percentage: total > 0 ? (item.value / total) * 100 : 0
        }));

        // Prepare Chart Slices (Top 5 + Others)
        const top5 = sorted.slice(0, 5);
        const others = sorted.slice(5);
        
        const chartItems = [...top5];
        if (others.length > 0) {
            chartItems.push({
                name: 'Outros',
                value: others.reduce((s, i) => s + i.value, 0)
            });
        }

        return {
            totalValue: total,
            sortedItems: sorted, // For the table
            chartData: {
                labels: chartItems.map(i => i.name),
                datasets: [{
                    data: chartItems.map(i => i.value),
                    borderWidth: 1,
                }]
            }
        };
    }, [data, showPurchaseValue]);

    // 2. Colors (Restored Logic)
    const baseColors = useMemo(() => {
        const len = chartData?.datasets[0]?.data.length || 0;
        return generateColorPalette(len);
    }, [chartData]);

    const dynamicBackgroundColors = useMemo(() => {
        if (hoveredIndex === null) return baseColors;
        return baseColors.map((color, index) =>
            index === hoveredIndex ? color : fadeColor(color, 0.2) // Fade others
        );
    }, [hoveredIndex, baseColors]);

    const dynamicBorderColors = useMemo(() => {
        if (hoveredIndex === null) return baseColors; // Or white if you prefer
        return baseColors.map((color, index) =>
            index === hoveredIndex ? color : fadeColor(color, 0.3)
        );
    }, [hoveredIndex, baseColors]);

    if (!data || data.length === 0) {
        return (
            <Paper elevation={0} variant="outlined" sx={{ p: 3, height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <Typography color="text.secondary">Sem dados.</Typography>
            </Paper>
        );
    }

    const finalChartData = {
        ...chartData,
        datasets: chartData.datasets.map(ds => ({
            ...ds,
            backgroundColor: dynamicBackgroundColors,
            borderColor: dynamicBorderColors,
        }))
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        cutout: '70%',
        onHover: (_, elements) => {
            if (elements && elements.length > 0) setHoveredIndex(elements[0].index);
            else setHoveredIndex(null);
        },
        plugins: {
            legend: { display: false },
            tooltip: { enabled: false },
            centerTextPlugin: { 
                totalValue, 
                hoveredData: hoveredIndex !== null ? {
                    value: finalChartData.datasets[0].data[hoveredIndex],
                    percentage: `${((finalChartData.datasets[0].data[hoveredIndex] / totalValue) * 100).toFixed(1)}%`,
                    name: finalChartData.labels[hoveredIndex]
                } : null
            }
        }
    };

    return (
        <Paper elevation={0} variant="outlined" sx={{ p: 2, height: '100%', display: 'flex', flexDirection: 'column', borderRadius: 3 }}>
            
            {/* Header: Title + Toggle */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                <Typography variant="subtitle1" fontWeight="bold">
                    {title}
                </Typography>
                <FormControlLabel
                    control={
                        <Switch 
                            size="small" 
                            checked={showPurchaseValue} 
                            onChange={e => setShowPurchaseValue(e.target.checked)} 
                        />
                    }
                    label={
                        <Typography variant="caption" sx={{ fontSize: '0.7rem', color: 'text.secondary' }}>
                            {showPurchaseValue ? "Compra" : "Atual"}
                        </Typography>
                    }
                    sx={{ mr: 0 }}
                />
            </Box>

            {/* Chart Area */}
            <Box 
                sx={{ height: 280, position: 'relative', mb: 2 }}
                onMouseLeave={() => setHoveredIndex(null)}
            >
                <Doughnut data={finalChartData} options={options} plugins={[centerTextPlugin]} />
            </Box>

            {/* List Area */}
            <TableContainer sx={{ flexGrow: 1, overflowY: 'auto', maxHeight: 200 }}>
                <Table size="small" stickyHeader>
                    <TableHead>
                        <TableRow>
                            <TableCell sx={{ fontSize: '0.75rem', py: 0.5, bgcolor: '#fff' }}>Nome</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.5, bgcolor: '#fff' }}>Valor</TableCell>
                            <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.5, bgcolor: '#fff' }}>%</TableCell>
                        </TableRow>
                    </TableHead>
                    <TableBody>
                        {sortedItems.map((item, idx) => (
                            <TableRow key={idx} hover>
                                <TableCell component="th" scope="row" sx={{ fontSize: '0.75rem', py: 0.5, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', maxWidth: 100 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                                        {idx < 5 && (
                                            <Box sx={{ width: 8, height: 8, borderRadius: '50%', bgcolor: baseColors[idx], flexShrink: 0 }} />
                                        )}
                                        {item.name}
                                    </Box>
                                </TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.5 }}>{formatCurrency(item.value)}</TableCell>
                                <TableCell align="right" sx={{ fontSize: '0.75rem', py: 0.5, width: 60 }}>
                                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                        <LinearProgress 
                                            variant="determinate" 
                                            value={item.percentage} 
                                            sx={{ width: 24, height: 4, borderRadius: 2, bgcolor: 'grey.100', '& .MuiLinearProgress-bar': { bgcolor: 'primary.main' } }} 
                                        />
                                        {item.percentage.toFixed(1)}%
                                    </Box>
                                </TableCell>
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </TableContainer>
        </Paper>
    );
}