import React from 'react';
import { Typography, Box, Paper } from '@mui/material';

/**
 * A reusable component to display a standard financial disclaimer.
 */
const FinancialDisclaimer = () => {
  return (
    <Paper sx={{ p: 2, mt: 4, backgroundColor: 'grey.100', border: '1px solid', borderColor: 'grey.300' }}>
      <Typography variant="body2" color="text.secondary" align="center">
        <strong>Aviso Legal:</strong> O Rumo Claro é uma ferramenta para fins informativos e não constitui aconselhamento financeiro ou fiscal. As informações e cálculos fornecidos podem não ser exatos ou completos. Por favor, consulte um profissional qualificado para a sua situação específica antes de tomar qualquer decisão financeira ou fiscal.
      </Typography>
    </Paper>
  );
};

export default FinancialDisclaimer;