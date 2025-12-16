import React from 'react';
import { Box, Paper, Typography, Skeleton, useTheme, Grid, Tooltip, IconButton } from '@mui/material';
import InfoOutlinedIcon from '@mui/icons-material/InfoOutlined';
import { formatCurrency } from '../../../lib/utils/formatUtils';

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

  const formattedValue = isLoading ? <Skeleton width="60%" /> : (isPercentage ? `${Number(value).toFixed(2)}%` : (isCurrency ? formatCurrency(value) : value));

  return (
    <Paper elevation={0} sx={{
      p: 1,
      display: 'flex',
      flexDirection: 'column',
      justifyContent: 'center',
      border: `1px solid ${theme.palette.divider}`,
      borderRadius: 2,
      height: '100%',
    }}
    >
      <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.25 }}>
        <Typography variant="caption" color="text.secondary" sx={{ fontWeight: 600, textTransform: 'uppercase', fontSize: '0.65rem', lineHeight: 1 }} >
          {title}
        </Typography>
        {tooltip && (
          <Tooltip title={<Typography variant="body2" sx={{ fontSize: '0.75rem' }}>{tooltip}</Typography>} placement="top" arrow>
            <IconButton size="small" sx={{ p: 0, ml: 0.5, color: 'text.disabled', '&:hover': { color: theme.palette.primary.main } }}>
              <InfoOutlinedIcon sx={{ fontSize: 14 }} />
            </IconButton>
          </Tooltip>
        )}
      </Box>
      <Typography variant="h6" sx={{
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
            React.isValidElement(subValue) ? React.cloneElement(subValue, { style: { ...subValue.props.style, fontSize: '0.75rem' } }) : (
              <Typography variant="caption" component="div" sx={{ fontWeight: 500, color: 'text.secondary', fontSize: '0.75rem' }} >
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
  const allMetrics = [
    {
      title: "Valor Total",
      value: metrics.totalPortfolioValue,
      isCurrency: true,
      tooltip: "Soma do valor de mercado das posições abertas + Saldo em caixa."
    },
    {
      title: "Depósitos Líquidos",
      value: metrics.netDeposits,
      isCurrency: true,
      tooltip: "Total depositado - Total levantado desde o início."
    },
    {
      title: "Capital Investido",
      value: metrics.investedCapital,
      isCurrency: true,
      tooltip: "Custo de aquisição (Cost Basis) das posições atualmente em carteira."
    },
    {
      title: "Cash Disponível",
      value: metrics.cashBalance,
      isCurrency: true,
      tooltip: "Saldo em dinheiro não investido disponível na conta."
    },
    {
      title: "Lucro / Prejuízo",
      value: metrics.totalPL,
      isCurrency: true,
      tooltip: "Cálculo: Valor Total da Carteira - Depósitos Líquidos."
    },
    {
      title: "Retorno Total",
      value: metrics.totalReturnPct,
      isPercentage: true,
      tooltip: "Cálculo: (Lucro Total / Depósitos Líquidos) × 100."
    },
    {
      title: "Variação Diária",
      value: metrics.dailyChangeValue,
      isCurrency: true,
      tooltip: "Variação do valor da carteira face a ontem (excluindo novos depósitos/levantamentos do dia).",
      subValue: (
        <Typography variant="caption" sx={{ color: metrics.dailyChangePct >= 0 ? '#1b5e20' : '#b71c1c', fontSize: '0.75rem', fontWeight: 600 }} >
          {metrics.dailyChangePct >= 0 ? '+' : ''} {Number(metrics.dailyChangePct).toFixed(2)}%
        </Typography>
      ),
    },
    {
      title: "Retorno Anual (XIRR)",
      value: metrics.annualizedReturn,
      isPercentage: true,
      tooltip: "Taxa Interna de Rentabilidade (Money-Weighted). Considera o impacto temporal de cada depósito e levantamento."
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