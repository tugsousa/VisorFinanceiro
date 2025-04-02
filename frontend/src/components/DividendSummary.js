import React, { useState } from 'react';
import { 
  Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Box, Select, MenuItem, FormControl, InputLabel,
  Grid
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, 
  Title, Tooltip, Legend } from 'chart.js';

// Register ChartJS components
ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
);

export default function DividendSummary({ data }) {
  const [selectedYear, setSelectedYear] = useState('all');

  // Process data and calculate yearly totals
  const { rows, years, yearlyTotals } = React.useMemo(() => {
    const rows = [];
    const years = new Set();
    const yearlyTotals = {};
    
    if (data) {
      for (const [year, countries] of Object.entries(data)) {
        years.add(year);
        let yearGross = 0;
        let yearTax = 0;
        
        for (const [country, amounts] of Object.entries(countries)) {
          const gross = amounts.gross_amt;
          const tax = amounts.taxed_amt;
          const net = gross + tax;
          
          rows.push({
            year,
            country,
            grossAmount: gross,
            taxAmount: tax,
            netAmount: net
          });
          
          yearGross += gross;
          yearTax += tax;
        }
        
        yearlyTotals[year] = {
          gross: yearGross,
          tax: yearTax,
          net: yearGross + yearTax
        };
      }
    }
    
    // Sort years in ascending order (2019, 2020, 2021...)
    const sortedYears = Array.from(years).sort((a, b) => a - b);
    
    return {
      rows: rows.sort((a, b) => a.year - b.year || a.country.localeCompare(b.country)),
      years: ['all', ...sortedYears],
      yearlyTotals
    };
  }, [data]);

  // Filter rows by selected year
  const filteredRows = selectedYear === 'all' 
    ? rows 
    : rows.filter(row => row.year === selectedYear);

  // Calculate totals based on filtered data
  const totals = selectedYear === 'all'
    ? Object.values(yearlyTotals).reduce((acc, curr) => ({
        gross: acc.gross + curr.gross,
        tax: acc.tax + curr.tax,
        net: acc.net + curr.net
      }), { gross: 0, tax: 0, net: 0 })
    : yearlyTotals[selectedYear] || { gross: 0, tax: 0, net: 0 };

  // Prepare chart data that responds to year filter
  const getChartData = () => {
    if (selectedYear === 'all') {
      // Show all years when no filter is applied
      return {
        labels: years.filter(year => year !== 'all'),
        datasets: [
          {
            label: 'Gross Dividends',
            data: years.filter(year => year !== 'all').map(year => yearlyTotals[year]?.gross || 0),
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          },
          {
            label: 'Tax Withheld',
            data: years.filter(year => year !== 'all').map(year => Math.abs(yearlyTotals[year]?.tax || 0)),
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }
        ]
      };
    } else {
      // Show breakdown by country when a specific year is selected
      const yearData = filteredRows;
      return {
        labels: yearData.map(row => row.country),
        datasets: [
          {
            label: 'Gross Dividends',
            data: yearData.map(row => row.grossAmount),
            backgroundColor: 'rgba(54, 162, 235, 0.6)',
            borderColor: 'rgba(54, 162, 235, 1)',
            borderWidth: 1
          },
          {
            label: 'Tax Withheld',
            data: yearData.map(row => Math.abs(row.taxAmount)),
            backgroundColor: 'rgba(255, 99, 132, 0.6)',
            borderColor: 'rgba(255, 99, 132, 1)',
            borderWidth: 1
          }
        ]
      };
    }
  };

  const chartData = getChartData();

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Dividend Summary
      </Typography>

      {/* Year Filter */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth>
            <InputLabel>Filter by Year</InputLabel>
            <Select
              value={selectedYear}
              onChange={(e) => setSelectedYear(e.target.value)}
              label="Filter by Year"
            >
              {years.map(year => (
                <MenuItem key={year} value={year}>
                  {year === 'all' ? 'All Years' : year}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </Grid>
      </Grid>

      {/* Dynamic Bar Chart */}
      <Box sx={{ height: 400, mb: 4 }}>
        <Bar 
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: selectedYear === 'all' 
                  ? 'Yearly Dividend Totals' 
                  : `Dividend Breakdown for ${selectedYear} by Country`
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const label = context.dataset.label || '';
                    const value = context.raw;
                    return `${label}: €${value.toFixed(2)}`;
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: true,
                title: {
                  display: true,
                  text: 'Amount (€)'
                }
              },
              x: {
                title: {
                  display: true,
                  text: selectedYear === 'all' ? 'Year' : 'Country'
                }
              }
            }
          }}
        />
      </Box>

      {/* Detailed Data Table */}
      <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
        {selectedYear === 'all' ? 'All Dividend Records' : `Dividend Records for ${selectedYear}`}
      </Typography>
      <TableContainer sx={{ width: '60%', margin: 'auto', mt: 2 }}> {/* Added width, margin, and top margin */}
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Year</TableCell>
              <TableCell>Country</TableCell>
              <TableCell align="right">Gross (€)</TableCell>
              <TableCell align="right">Tax (€)</TableCell>
              <TableCell align="right">Net (€)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredRows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} align="center">
                  No data available for selected filter
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredRows.map((row, index) => (
                  <TableRow key={index} hover>
                    <TableCell>{row.year}</TableCell>
                    <TableCell>{row.country}</TableCell>
                    <TableCell align="right">{row.grossAmount.toFixed(2)}</TableCell>
                    <TableCell align="right">{row.taxAmount.toFixed(2)}</TableCell>
                    <TableCell align="right">{row.netAmount.toFixed(2)}</TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
                  <TableCell colSpan={2}>Total</TableCell>
                  <TableCell align="right">{totals.gross.toFixed(2)}</TableCell>
                  <TableCell align="right">{totals.tax.toFixed(2)}</TableCell>
                  <TableCell align="right">{totals.net.toFixed(2)}</TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}
