import React, { useMemo } from 'react';
import { Paper, Typography, Box, useTheme } from '@mui/material';
import { Chart as ChartJS, Tooltip, Legend, Title } from 'chart.js';
import { TreemapController, TreemapElement } from 'chartjs-chart-treemap';
import { Chart } from 'react-chartjs-2';
import { formatCurrency } from '../../../lib/utils/formatUtils';

// Register Chart.js components
ChartJS.register(TreemapController, TreemapElement, Tooltip, Legend, Title);

const HeatmapSection = ({ holdings }) => {
    const theme = useTheme();

    // Helper: Extrai os dados originais do nó do gráfico de forma segura
    const getSourceData = (ctxOrItem) => {
        // Se receber o contexto do chart (ctx)
        const raw = ctxOrItem.raw || ctxOrItem; 
        const node = raw._data;

        if (!node) return null;

        // Se for um grupo (tem children), os dados originais estão no primeiro filho
        // (Assumindo que cada posição é única pelo ISIN/Nome)
        if (node.children && node.children.length > 0) {
            return node.children[0];
        }
        
        // Se for folha, retorna o próprio nó
        return node;
    };

    const { chartData, isEmpty } = useMemo(() => {
        if (!holdings || holdings.length === 0) return { chartData: null, isEmpty: true };

        // 1. Preparar Dados
        const data = holdings
            .map(h => {
                const marketVal = h.marketValueEUR || 0;
                const costBasis = Math.abs(h.total_cost_basis_eur || 0);
                
                // Evitar divisão por zero e posições vazias
                if (marketVal <= 0.01) return null;

                const profit = marketVal - costBasis;
                const profitPct = costBasis > 0 ? (profit / costBasis) * 100 : 0;

                return {
                    name: h.product_name || 'Unknown',
                    ticker: h.isin || 'N/A',
                    value: marketVal, // Determina o Tamanho
                    profitPct: profitPct, // Determina a Cor
                    profitVal: profit
                };
            })
            .filter(Boolean) // Remove nulos
            .sort((a, b) => b.value - a.value); // Ordenar por tamanho

        if (data.length === 0) return { chartData: null, isEmpty: true };

        // 2. Lógica de Cor (Estilo Finviz)
        const getColor = (ctx) => {
            if (ctx.type !== 'data') return 'transparent';
            
            const item = getSourceData(ctx);
            if (!item || typeof item.profitPct !== 'number') return '#e0e0e0';

            const value = item.profitPct;
            
            // Cinzento neutro para ~0%
            if (Math.abs(value) < 0.05) return '#4f5b66'; 

            // Intensidade máxima aos +/- 50%
            const intensity = Math.min(Math.abs(value) / 50, 1);
            
            if (value > 0) {
                // Positivo: Verde
                // Ajusta luminosidade: começa em 60% e desce para 35% (mais escuro = mais intenso)
                const lightness = 60 - (intensity * 25); 
                return `hsl(135, 70%, ${lightness}%)`;
            } else {
                // Negativo: Vermelho
                const lightness = 60 - (intensity * 25);
                return `hsl(350, 75%, ${lightness}%)`;
            }
        };

        return {
            isEmpty: false,
            chartData: {
                datasets: [{
                    tree: data,
                    key: 'value', // Tamanho baseado no valor de mercado
                    groups: ['name'], // Agrupar por nome
                    backgroundColor: (ctx) => getColor(ctx),
                    borderWidth: 1,
                    borderColor: '#ffffff',
                    spacing: 1,
                    labels: {
                        display: true,
                        align: 'center',
                        position: 'center',
                        color: 'white',
                        font: (ctx) => {
                            const width = ctx.raw?.w;
                            // Fonte dinâmica: menor se o quadrado for pequeno
                            const size = width ? Math.max(10, Math.min(16, width / 6)) : 12;
                            return { size: size, weight: 'bold', family: 'Poppins' };
                        },
                        formatter: (ctx) => {
                            const item = getSourceData(ctx);
                            if (!item || typeof item.profitPct !== 'number') return [];
                            
                            // Mostrar nome e percentagem
                            // Cortar nome se for muito longo
                            const shortName = item.name.split(' ').slice(0, 2).join(' ');
                            
                            return [
                                shortName, 
                                `${item.profitPct > 0 ? '+' : ''}${item.profitPct.toFixed(2)}%`
                            ];
                        }
                    }
                }]
            }
        };
    }, [holdings]);

    const options = {
        maintainAspectRatio: false,
        plugins: {
            title: { display: false },
            legend: { display: false },
            tooltip: {
                displayColors: false,
                callbacks: {
                    title: (items) => {
                        const item = getSourceData(items[0]);
                        return item ? item.name : '';
                    },
                    label: (context) => {
                        const item = getSourceData(context);
                        if (!item) return '';
                        return [
                            `Valor Atual: ${formatCurrency(item.value)}`,
                            `Retorno: ${item.profitPct > 0 ? '+' : ''}${item.profitPct.toFixed(2)}% (${formatCurrency(item.profitVal)})`
                        ];
                    }
                }
            }
        }
    };

    return (
        <Paper 
            variant="outlined" 
            sx={{ 
                p: 2, 
                height: 500, 
                display: 'flex', 
                flexDirection: 'column',
                borderRadius: 2
            }}
        >
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 2 }}>
                Mapa de Mercado (Heatmap)
            </Typography>
            
            <Box sx={{ flexGrow: 1, position: 'relative', minHeight: 0 }}>
                {isEmpty ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: 'text.secondary' }}>
                        Sem dados suficientes para gerar o mapa.
                    </Box>
                ) : (
                    <Chart type="treemap" data={chartData} options={options} />
                )}
            </Box>
        </Paper>
    );
};

export default HeatmapSection;