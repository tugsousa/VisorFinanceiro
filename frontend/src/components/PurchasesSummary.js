import React from 'react';
import { Typography, Paper } from '@mui/material';

export default function PurchasesSummary({ data }) {
  return (
    <Paper elevation={3} sx={{ p: 2 }}>
      <Typography variant="h6">Remaining Purchases</Typography>
      {/* Add your purchases summary logic here */}
    </Paper>
  );
}