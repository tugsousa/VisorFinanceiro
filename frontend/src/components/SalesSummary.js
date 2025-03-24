import React, { useState } from 'react';
import { 
  Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Box, Select, MenuItem, FormControl, InputLabel,
  Grid, Tabs, Tab
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, 
  Title, Tooltip, Legend } from 'chart.js';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
);

export default function SalesSummary({ data }) {
  const [selectedYear, setSelectedYear] = useState('all');
  const [viewMode, setViewMode] = useState('yearly'); // 'yearly' or 'all'

  // Process and group sales data by ISIN and year
  const { processedSales, years, isinGroups, yearlyIsinGroups } = React.useMemo(() => {
    const processedSales = [];
    const years = new Set();
    const isinGroups = {};
    const yearlyIsinGroups = {};

    const parseDate = (dateStr) => {
      if (!dateStr || dateStr.trim() === '') {
        console.warn('Empty date string encountered');
        return new Date(NaN);
      }
      
      // Handle both DD-MM-YYYY and YYYY-MM-DD formats
      const parts = dateStr.includes('-') 
        ? dateStr.split('-')
        : dateStr.split('/');
      
      if (parts.length === 3) {
        // If format is DD-MM-YYYY
        if (parts[0].length === 2 && parts[2].length === 4) {
          return new Date(`${parts[2]}-${parts[1]}-${parts[0]}`);
        }
        // If format is YYYY-MM-DD
        return new Date(dateStr);
      }
      
      console.warn('Unrecognized date format:', dateStr);
      return new Date(NaN);
    };

    if (data) {
      console.log('Processing sales data. Total records:', data.length);
      let validCount = 0;
      let invalidCount = 0;

      data.forEach((sale, index) => {
        try {
          console.groupCollapsed(`Processing sale #${index + 1}: ${sale.ProductName}`);
          console.log('Raw sale data:', sale);

          if (!sale.SaleDate) {
            console.warn('Missing SaleDate', sale);
            invalidCount++;
            console.groupEnd();
            return;
          }

          const saleDate = parseDate(sale.SaleDate);
          console.log(`Parsed "${sale.SaleDate}" as:`, saleDate);

          if (isNaN(saleDate.getTime())) {
            console.warn('Invalid sale date:', sale.SaleDate, 'Parsed as:', saleDate);
            invalidCount++;
            console.groupEnd();
            return;
          }

          const year = saleDate.getFullYear().toString();
          years.add(year);

          const revenue = sale.Delta || 0;
          const commission = sale.Commission ? -Math.abs(sale.Commission) : 0;
          const netProfit = revenue + commission;

          console.log('Calculated values:', {
            revenue,
            commission,
            netProfit
          });

          const saleRecord = {
            year,
            ISIN: sale.ISIN,
            ProductName: sale.ProductName,
            revenue,
            commission,
            netProfit,
            saleDate: saleDate.toISOString().split('T')[0],
            originalData: sale
          };

          processedSales.push(saleRecord);

          // Group by ISIN (all years)
          if (!isinGroups[sale.ISIN]) {
            isinGroups[sale.ISIN] = {
              ISIN: sale.ISIN,
              ProductName: sale.ProductName,
              totalRevenue: 0,
              totalCommission: 0,
              totalNetProfit: 0,
              transactions: []
            };
          }

          isinGroups[sale.ISIN].totalRevenue += revenue;
          isinGroups[sale.ISIN].totalCommission += commission;
          isinGroups[sale.ISIN].totalNetProfit += netProfit;
          isinGroups[sale.ISIN].transactions.push(saleRecord);

          // Group by year and ISIN
          if (!yearlyIsinGroups[year]) {
            yearlyIsinGroups[year] = {};
          }
          
          if (!yearlyIsinGroups[year][sale.ISIN]) {
            yearlyIsinGroups[year][sale.ISIN] = {
              ISIN: sale.ISIN,
              ProductName: sale.ProductName,
              totalRevenue: 0,
              totalCommission: 0,
              totalNetProfit: 0,
              transactions: []
            };
          }

          yearlyIsinGroups[year][sale.ISIN].totalRevenue += revenue;
          yearlyIsinGroups[year][sale.ISIN].totalCommission += commission;
          yearlyIsinGroups[year][sale.ISIN].totalNetProfit += netProfit;
          yearlyIsinGroups[year][sale.ISIN].transactions.push(saleRecord);

          validCount++;
          console.groupEnd();
        } catch (error) {
          console.error(`Error processing sale #${index + 1}:`, error, sale);
          invalidCount++;
          console.groupEnd();
        }
      });

      console.log(`Data processing complete. Valid: ${validCount}, Invalid: ${invalidCount}`);
    }

    console.log('Processed sales:', processedSales);
    console.log('ISIN groups:', isinGroups);
    console.log('Yearly ISIN groups:', yearlyIsinGroups);

    return {
      processedSales,
      years: ['all', ...Array.from(years).sort((a, b) => a - b)],
      isinGroups,
      yearlyIsinGroups
    };
  }, [data]);

  // Filter sales by selected year
  const filteredSales = selectedYear === 'all' 
    ? processedSales 
    : processedSales.filter(sale => sale.year === selectedYear);

  // Calculate totals
  const totals = filteredSales.reduce((acc, sale) => ({
    revenue: acc.revenue + sale.revenue,
    commission: acc.commission + sale.commission,
    netProfit: acc.netProfit + sale.netProfit,
  }), { revenue: 0, commission: 0, netProfit: 0 });

  // Prepare chart data based on view mode
  const getChartData = () => {
    if (viewMode === 'yearly' && selectedYear !== 'all') {
      // Show ISINs for selected year only
      const yearData = yearlyIsinGroups[selectedYear] || {};
      return {
        labels: Object.keys(yearData).map(isin => {
          const group = yearData[isin];
          return `${isin} (${group.ProductName})`;
        }),
        datasets: [{
          label: `Net Profit/Loss by ISIN for ${selectedYear} (€)`,
          data: Object.values(yearData).map(group => group.totalNetProfit),
          backgroundColor: (ctx) => {
            const value = ctx.raw;
            return value >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)';
          },
          borderColor: (ctx) => {
            const value = ctx.raw;
            return value >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)';
          },
          borderWidth: 1
        }]
      };
    } else {
      // Show all ISINs with their totals
      return {
        labels: Object.keys(isinGroups).map(isin => {
          const group = isinGroups[isin];
          return `${isin} (${group.ProductName})`;
        }),
        datasets: [{
          label: 'Net Profit/Loss by ISIN (All Years) (€)',
          data: Object.values(isinGroups).map(group => group.totalNetProfit),
          backgroundColor: (ctx) => {
            const value = ctx.raw;
            return value >= 0 ? 'rgba(75, 192, 192, 0.6)' : 'rgba(255, 99, 132, 0.6)';
          },
          borderColor: (ctx) => {
            const value = ctx.raw;
            return value >= 0 ? 'rgba(75, 192, 192, 1)' : 'rgba(255, 99, 132, 1)';
          },
          borderWidth: 1
        }]
      };
    }
  };

  const chartData = getChartData();

  // Get grouped data for table display
  const getGroupedTableData = () => {
    if (selectedYear === 'all') {
      // Group by year and ISIN for all years
      return Object.entries(yearlyIsinGroups).flatMap(([year, isins]) => 
        Object.values(isins).map(group => ({
          year,
          ISIN: group.ISIN,
          ProductName: group.ProductName,
          revenue: group.totalRevenue,
          commission: group.totalCommission,
          netProfit: group.totalNetProfit
        }))
      ).sort((a, b) => a.year.localeCompare(b.year) || a.ISIN.localeCompare(b.ISIN));
    } else {
      // Group by ISIN for selected year
      return Object.values(yearlyIsinGroups[selectedYear] || {}).map(group => ({
        year: selectedYear,
        ISIN: group.ISIN,
        ProductName: group.ProductName,
        revenue: group.totalRevenue,
        commission: group.totalCommission,
        netProfit: group.totalNetProfit
      }));
    }
  };

  const groupedTableData = getGroupedTableData();

  return (
    <Paper elevation={3} sx={{ p: 3, mb: 3 }}>
      <Typography variant="h5" gutterBottom sx={{ mb: 3 }}>
        Sales Summary
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

      {/* Summary Cards */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="subtitle2">Total Revenue</Typography>
            <Typography variant="h5" color={totals.revenue >= 0 ? 'success.main' : 'error.main'}>
              €{totals.revenue.toFixed(2)}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="subtitle2">Total Commission</Typography>
            <Typography variant="h5" color="error.main">
              €{totals.commission.toFixed(2)}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="subtitle2">Net Profit/Loss</Typography>
            <Typography variant="h5" color={totals.netProfit >= 0 ? 'success.main' : 'error.main'}>
              €{totals.netProfit.toFixed(2)}
            </Typography>
          </Paper>
        </Grid>
      </Grid>

      {/* Chart View Toggle */}
      <Box sx={{ mb: 3 }}>
        <Tabs 
          value={viewMode} 
          onChange={(e, newValue) => setViewMode(newValue)}
          centered
        >
          <Tab label="Yearly View" value="yearly" disabled={selectedYear === 'all'} />
          <Tab label="All Years View" value="all" />
        </Tabs>
      </Box>

      {/* ISIN Grouped Chart */}
      <Box sx={{ height: 400, mb: 4 }}>
        <Bar 
          data={chartData}
          options={{
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
              title: {
                display: true,
                text: chartData.datasets[0].label
              },
              tooltip: {
                callbacks: {
                  label: (context) => {
                    const isin = context.label.split(' ')[0];
                    let group;
                    
                    if (viewMode === 'yearly' && selectedYear !== 'all') {
                      group = yearlyIsinGroups[selectedYear]?.[isin];
                    } else {
                      group = isinGroups[isin];
                    }
                    
                    return [
                      `Product: ${group?.ProductName || 'N/A'}`,
                      `Net: €${context.raw.toFixed(2)}`,
                      `Revenue: €${group?.totalRevenue.toFixed(2) || '0.00'}`,
                      `Commission: €${group?.totalCommission.toFixed(2) || '0.00'}`
                    ];
                  }
                }
              }
            },
            scales: {
              y: {
                beginAtZero: false,
                title: {
                  display: true,
                  text: 'Amount (€)'
                }
              }
            }
          }}
        />
      </Box>

      {/* Grouped Sales Records Table */}
      <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
        {selectedYear === 'all' ? 'Sales Summary by Year and ISIN' : `Sales Summary for ${selectedYear} by ISIN`}
      </Typography>
      <TableContainer>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell>Year</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>ISIN</TableCell>
              <TableCell align="right">Revenue (€)</TableCell>
              <TableCell align="right">Commission (€)</TableCell>
              <TableCell align="right">Net Profit/Loss (€)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {groupedTableData.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} align="center">
                  No sales data available for selected filter
                </TableCell>
              </TableRow>
            ) : (
              <>
                {groupedTableData.map((group, index) => (
                  <TableRow key={index} hover>
                    <TableCell>{group.year}</TableCell>
                    <TableCell>{group.ProductName}</TableCell>
                    <TableCell>{group.ISIN}</TableCell>
                    <TableCell 
                      align="right"
                      sx={{ color: group.revenue >= 0 ? 'success.main' : 'error.main' }}
                    >
                      {group.revenue.toFixed(2)}
                    </TableCell>
                    <TableCell align="right" sx={{ color: 'error.main' }}>
                      {group.commission.toFixed(2)}
                    </TableCell>
                    <TableCell 
                      align="right"
                      sx={{ color: group.netProfit >= 0 ? 'success.main' : 'error.main' }}
                    >
                      {group.netProfit.toFixed(2)}
                    </TableCell>
                  </TableRow>
                ))}
                <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
                  <TableCell colSpan={3}>Total</TableCell>
                  <TableCell 
                    align="right"
                    sx={{ color: totals.revenue >= 0 ? 'success.main' : 'error.main' }}
                  >
                    {totals.revenue.toFixed(2)}
                  </TableCell>
                  <TableCell align="right" sx={{ color: 'error.main' }}>
                    {totals.commission.toFixed(2)}
                  </TableCell>
                  <TableCell 
                    align="right"
                    sx={{ color: totals.netProfit >= 0 ? 'success.main' : 'error.main' }}
                  >
                    {totals.netProfit.toFixed(2)}
                  </TableCell>
                </TableRow>
              </>
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Paper>
  );
}