import React from 'react';
import { Box, Paper, Typography, Skeleton, useTheme, Grid, Tooltip, IconButton } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { formatCurrency } from '../../../lib/utils/formatUtils';

// Estilo para o Tooltip (Caixa flutuante branca com sombra)
const tooltipComponentsProps = {
    tooltip: {
        sx: {
            bgcolor: 'background.paper', // Fundo Branco
            color: 'text.primary',
            boxShadow: '0px 4px 20px rgba(0,0,0,0.15)',
            borderRadius: 3,
            maxWidth: 300,
            p: 1.5 // Mais espaço interno
        }
    },
    arrow: {
        sx: { color: 'background.paper' }
    }
};

// Componente auxiliar simplificado (Sem ícones, Fundo branco limpo)
const RichTooltipContent = ({ title, description }) => (
    <Box>
        <Typography variant="subtitle2" fontWeight="bold" gutterBottom sx={{ color: 'text.primary', mb: 1 }}>
            {title}
        </Typography>
        <Typography variant="body2" sx={{ lineHeight: 1.5, color: 'text.secondary', fontSize: '0.85rem' }}>
            {description}
        </Typography>
    </Box>
);

const KPICard = ({ title, value, subValue, isCurrency = true, isPercentage = false, isLoading, colorOverride, tooltip }) => {
    const theme = useTheme();
    
    let valueColor = theme.palette.text.primary;
    const numValue = parseFloat(value);
    const isPerformanceMetric = isPercentage || title.includes('Variação') || title.includes('Lucro');

    if (!colorOverride && isPerformanceMetric) {
        if (numValue > 0) valueColor = theme.palette.success.main;
        if (numValue < 0) valueColor = theme.palette.error.main;
    } else if (colorOverride) {
        valueColor = colorOverride;
    }

    const formattedValue = isLoading ? 
        <Skeleton width="60%" /> : 
        (isPercentage ? `${Number(value).toFixed(2)}%` : (isCurrency ? formatCurrency(value) : value));

    return (
        <Paper 
            elevation={0} 
            sx={{ 
                p: 1, 
                display: 'flex', 
                flexDirection: 'column', 
                justifyContent: 'center', 
                border: `1px solid ${theme.palette.divider}`,
                borderRadius: 2,
                height: '100%',
                bgcolor: 'white'
            }}
        >
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
                <Typography 
                    variant="caption" 
                    color="text.secondary" 
                    sx={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', lineHeight: 1 }}
                >
                    {title}
                </Typography>
                {tooltip && (
                    <Tooltip 
                        title={tooltip} 
                        placement="top" 
                        arrow
                        componentsProps={tooltipComponentsProps}
                    >
                        <IconButton size="small" sx={{ p: 0, ml: 0.5, color: 'text.disabled', '&:hover': { color: theme.palette.primary.main } }}>
                            <InfoOutlinedIcon sx={{ fontSize: 14 }} />
                        </IconButton>
                    </Tooltip>
                )}
            </Box>
            <Typography 
                variant="h6" 
                sx={{ 
                    fontWeight: 700, 
                    color: valueColor, 
                    fontSize: { xs: '1rem', md: '1.1rem' }, 
                    lineHeight: 1.2,
                    letterSpacing: '-0.2px'
                }}
            >
                {formattedValue}
            </Typography>
            {subValue && (
                <Box sx={{ mt: 0.25, lineHeight: 1 }}>
                    {isLoading ? (
                        <Skeleton width="40%" height={15} />
                    ) : (
                        React.isValidElement(subValue) ? 
                            React.cloneElement(subValue, { style: { ...subValue.props.style, fontSize: '0.75rem' } }) : 
                            (
                                <Typography variant="caption" component="div" sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.75rem' }}>
                                    {subValue}
                                </Typography>
                            )
                    )}
                </Box>
            )}
        </Paper>
    );
};

const DashboardKPISection = ({ metrics, isLoading }) => {
    // Definição dos conteúdos dos tooltips (Apenas Texto)
    const tooltips = {
        totalValue: (
            <RichTooltipContent 
                title="Valor Total da Carteira" 
                description="A soma do valor de mercado de todas as tuas posições (ações, ETFs) mais o saldo disponível em caixa." 
            />
        ),
        netDeposits: (
            <RichTooltipContent 
                title="Investimento Líquido" 
                description="O teu esforço financeiro real. Calculado como: (Total Depositado) - (Total Levantado)." 
            />
        ),
        investedCapital: (
            <RichTooltipContent 
                title="Custo de Aquisição" 
                description="Quanto pagaste originalmente pelos ativos que ainda deténs em carteira (Cost Basis)." 
            />
        ),
        cashBalance: (
            <RichTooltipContent 
                title="Liquidez Disponível" 
                description="Dinheiro parado na conta da corretora pronto a ser investido." 
            />
        ),
        totalPL: (
            <RichTooltipContent 
                title="Resultado Acumulado" 
                description="Ganho ou perda monetária absoluta desde o início (Valor Total - Depósitos Líquidos)." 
            />
        ),
        totalReturn: (
            <RichTooltipContent 
                title="Rentabilidade Simples" 
                description="Percentagem de ganho sobre o capital investido líquido." 
            />
        ),
        dailyChange: (
            <RichTooltipContent 
                title="Variação Hoje" 
                description="Como a tua carteira oscilou desde o fecho do mercado de ontem." 
            />
        ),
        xirr: (
            <RichTooltipContent 
                title="Taxa Anualizada (XIRR)" 
                description="A rentabilidade real ponderada pelo tempo. Considera quando fizeste cada depósito." 
            />
        )
    };

    const allMetrics = [
        { 
            title: "Valor Total", 
            value: metrics.totalPortfolioValue, 
            isCurrency: true, 
            tooltip: tooltips.totalValue 
        },
        { 
            title: "Depósitos Líquidos", 
            value: metrics.netDeposits, 
            isCurrency: true, 
            tooltip: tooltips.netDeposits 
        },
        { 
            title: "Capital Investido", 
            value: metrics.investedCapital, 
            isCurrency: true, 
            tooltip: tooltips.investedCapital 
        },
        { 
            title: "Cash Disponível", 
            value: metrics.cashBalance, 
            isCurrency: true, 
            tooltip: tooltips.cashBalance 
        },
        { 
            title: "Lucro / Prejuízo", 
            value: metrics.totalPL, 
            isCurrency: true, 
            tooltip: tooltips.totalPL 
        },
        { 
            title: "Retorno Total", 
            value: metrics.totalReturnPct, 
            isPercentage: true, 
            tooltip: tooltips.totalReturn 
        },
        { 
            title: "Variação Diária", 
            value: metrics.dailyChangeValue, 
            isCurrency: true, 
            tooltip: tooltips.dailyChange,
            subValue: (
                <Typography variant="caption" sx={{ color: metrics.dailyChangePct >= 0 ? '#1b5e20' : '#b71c1c', fontSize: '0.75rem', fontWeight: 600 }}>
                    {metrics.dailyChangePct >= 0 ? '+' : ''} {Number(metrics.dailyChangePct).toFixed(2)}%
                </Typography>
            ),
        },
        { 
            title: "Retorno Anual (XIRR)", 
            value: metrics.annualizedReturn, 
            isPercentage: true, 
            tooltip: tooltips.xirr 
        },
    ];

    return (
        <Box>
            <Typography variant="h6" sx={{ fontWeight: 'bold', mb: 1.5 }}>
                Resumo Geral
            </Typography>
            <Grid container spacing={2} alignItems="stretch">
                {allMetrics.map((item, idx) => (
                    <Grid item xs={6} sm={3} md={3} key={idx} sx={{ mb: 1.5 }}>
                        <KPICard 
                            title={item.title} 
                            value={item.value} 
                            subValue={item.subValue}
                            isCurrency={item.isCurrency} 
                            isPercentage={item.isPercentage} 
                            isLoading={isLoading}
                            colorOverride={item.colorOverride}
                            tooltip={item.tooltip}
                        />
                    </Grid>
                ))}
            </Grid>
        </Box>
    );
};

export default DashboardKPISection;