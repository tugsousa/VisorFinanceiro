// frontend/src/components/dashboardSections/DividendsSection.js
import React, { useMemo } from 'react';
import {
  Typography, Paper, Table, TableBody, TableCell,
  TableContainer, TableHead, TableRow
} from '@mui/material';

export default function DividendsSection({ dividendSummaryData, selectedYear }) {
  const processedDividendData = useMemo(() => {
    const rows = [];
    let totalGross = 0;
    let totalTax = 0;

    // dividendSummaryData structure is:
    // If selectedYear is 'all': { "2023": { "USA": {gross_amt, taxed_amt}, ... }, "2022": { ... } }
    // If selectedYear is specific: { "2023": { "USA": {gross_amt, taxed_amt}, ... } }
    // Or it could be empty: {}

    const dataToProcess = dividendSummaryData || {};

    for (const [year, countries] of Object.entries(dataToProcess)) {
      for (const [country, amounts] of Object.entries(countries)) {
        const gross = amounts.gross_amt || 0;
        const tax = amounts.taxed_amt || 0; // Tax is often negative
        const net = gross + tax;
        rows.push({
          year, // Keep year for display if "all years"
          country,
          grossAmount: gross,
          taxAmount: tax,
          netAmount: net
        });
        totalGross += gross;
        totalTax += tax;
      }
    }
    // Sort if needed, e.g., by year then country
    rows.sort((a, b) => (a.year.localeCompare(b.year) || a.country.localeCompare(b.country)));
    return { rows, totalGross, totalTax, totalNet: totalGross + totalTax };
  }, [dividendSummaryData]);


  if (!processedDividendData || processedDividendData.rows.length === 0) {
    return (
      <Paper elevation={2} sx={{ p: 2, mb: 3 }}>
        <Typography variant="subtitle1" gutterBottom>Dividends</Typography>
        <Typography>No dividend data {selectedYear === 'all' ? 'available' : `for ${selectedYear}`}.</Typography>
      </Paper>
    );
  }

  return (
    <Paper elevation={3} sx={{ p: 2, mb: 3 }}>
      <Typography variant="subtitle1" gutterBottom>
        Dividend Summary ({selectedYear === 'all' ? 'All Years' : selectedYear})
      </Typography>
      <Typography variant="body2" component="div">
        Total Gross: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedDividendData.totalGross.toFixed(2)} €</Typography>
      </Typography>
      <Typography variant="body2" component="div">
        Total Tax: <Typography component="span" sx={{ fontWeight: 'bold', color: processedDividendData.totalTax < 0 ? 'error.main' : 'inherit' }}>{processedDividendData.totalTax.toFixed(2)} €</Typography>
      </Typography>
      <Typography variant="body2" component="div" sx={{ mb: 2 }}>
        Total Net: <Typography component="span" sx={{ fontWeight: 'bold' }}>{processedDividendData.totalNet.toFixed(2)} €</Typography>
      </Typography>

      <TableContainer sx={{ maxHeight: 400 }}>
        <Table stickyHeader size="small">
          <TableHead>
            <TableRow>
              {selectedYear === 'all' && <TableCell>Year</TableCell>}
              <TableCell>Country</TableCell>
              <TableCell align="right">Gross (€)</TableCell>
              <TableCell align="right">Tax (€)</TableCell>
              <TableCell align="right">Net (€)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {processedDividendData.rows.map((row, index) => (
              <TableRow hover key={`${row.year}-${row.country}-${index}`}>
                {selectedYear === 'all' && <TableCell>{row.year}</TableCell>}
                <TableCell>{row.country}</TableCell>
                <TableCell align="right">{row.grossAmount.toFixed(2)}</TableCell>
                <TableCell align="right" sx={{ color: row.taxAmount < 0 ? 'error.main' : 'inherit' }}>
                    {row.taxAmount.toFixed(2)}
                </TableCell>
                <TableCell align="right">{row.netAmount.toFixed(2)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}