import React, { useState } from 'react';
import { 
  Typography, Paper, Table, TableBody, TableCell, TableContainer, 
  TableHead, TableRow, Box, Select, MenuItem, FormControl, InputLabel,
  Grid, Collapse, IconButton
} from '@mui/material';
import { Bar } from 'react-chartjs-2';
import { Chart as ChartJS, CategoryScale, LinearScale, BarElement, 
  Title, Tooltip, Legend } from 'chart.js';
import KeyboardArrowDownIcon from '@mui/icons-material/KeyboardArrowDown';
import KeyboardArrowUpIcon from '@mui/icons-material/KeyboardArrowUp';

ChartJS.register(
  CategoryScale, LinearScale, BarElement, Title, Tooltip, Legend
);

export default function SalesSummary({ data }) {
  const [selectedYear, setSelectedYear] = useState('all');
  const [expandedGroups, setExpandedGroups] = useState({});

  // Process sales data and group by year and ISIN
  const { processedSales, years, yearlySummaries } = React.useMemo(() => {
    const processedSales = [];
    const years = new Set();
    const yearlySummaries = {};
    const groupedSales = {};

    if (data) {
      // First pass to group by year and ISIN
      data.forEach(sale => {
        try {
          // Fix for NaN year - ensure SaleDate is valid
          const saleDate = new Date(sale.SaleDate);
          if (isNaN(saleDate.getTime())) {
            console.warn('Invalid sale date:', sale.SaleDate);
            return;
          }

          const year = saleDate.getFullYear().toString();
          years.add(year);
          const key = `${year}_${sale.ISIN}`;

          if (!groupedSales[key]) {
            groupedSales[key] = {
              year,
              ISIN: sale.ISIN,
              ProductName: sale.ProductName,
              totalQuantity: 0,
              totalSales: 0,
              totalProfit: 0,
              transactions: []
            };
          }

          const profit = sale.Delta || 0;
          const saleValue = sale.SaleAmountEUR || 0;

          groupedSales[key].totalQuantity += sale.Quantity || 0;
          groupedSales[key].totalSales += saleValue;
          groupedSales[key].totalProfit += profit;
          groupedSales[key].transactions.push({
            ...sale,
            profit,
            saleDate: saleDate.toISOString().split('T')[0] // Format as YYYY-MM-DD
          });
        } catch (error) {
          console.error('Error processing sale:', sale, error);
        }
      });

      // Convert grouped sales to array and calculate yearly summaries
      Object.values(groupedSales).forEach(group => {
        processedSales.push(group);

        if (!yearlySummaries[group.year]) {
          yearlySummaries[group.year] = {
            totalSales: 0,
            totalQuantity: 0,
            totalProfit: 0,
            products: new Set()
          };
        }

        yearlySummaries[group.year].totalSales += group.totalSales;
        yearlySummaries[group.year].totalQuantity += group.totalQuantity;
        yearlySummaries[group.year].totalProfit += group.totalProfit;
        yearlySummaries[group.year].products.add(group.ProductName);
      });
    }

    // Sort years in ascending order
    const sortedYears = Array.from(years).sort((a, b) => a - b);

    return {
      processedSales: processedSales.sort((a, b) => b.year - a.year || a.ISIN.localeCompare(b.ISIN)),
      years: ['all', ...sortedYears],
      yearlySummaries
    };
  }, [data]);

  // Toggle group expansion
  const toggleGroup = (key) => {
    setExpandedGroups(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  // Filter sales by selected year
  const filteredSales = selectedYear === 'all' 
    ? processedSales 
    : processedSales.filter(sale => sale.year === selectedYear);

  // Calculate totals based on filtered data
  const totals = selectedYear === 'all'
    ? Object.values(yearlySummaries).reduce((acc, curr) => ({
        totalSales: acc.totalSales + curr.totalSales,
        totalQuantity: acc.totalQuantity + curr.totalQuantity,
        totalProfit: acc.totalProfit + curr.totalProfit,
        uniqueProducts: new Set([...acc.uniqueProducts, ...curr.products])
      }), { 
        totalSales: 0, 
        totalQuantity: 0, 
        totalProfit: 0,
        uniqueProducts: new Set()
      })
    : {
        ...yearlySummaries[selectedYear],
        uniqueProducts: yearlySummaries[selectedYear]?.products || new Set()
      } || { 
        totalSales: 0, 
        totalQuantity: 0, 
        totalProfit: 0,
        uniqueProducts: new Set()
      };

  // Prepare chart data
  const getChartData = () => {
    if (selectedYear === 'all') {
      // Show yearly overview when no filter is applied
      return {
        labels: years.filter(year => year !== 'all'),
        datasets: [
          {
            label: 'Total Sales (€)',
            data: years.filter(year => year !== 'all').map(year => yearlySummaries[year]?.totalSales || 0),
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          },
          {
            label: 'Total Profit (€)',
            data: years.filter(year => year !== 'all').map(year => yearlySummaries[year]?.totalProfit || 0),
            backgroundColor: 'rgba(153, 102, 255, 0.6)',
            borderColor: 'rgba(153, 102, 255, 1)',
            borderWidth: 1
          }
        ]
      };
    } else {
      // Show product breakdown when a specific year is selected
      const productSales = {};
      filteredSales.forEach(group => {
        productSales[group.ProductName] = {
          total: group.totalSales,
          profit: group.totalProfit
        };
      });

      const productNames = Object.keys(productSales);
      
      return {
        labels: productNames,
        datasets: [
          {
            label: 'Sales Amount (€)',
            data: productNames.map(name => productSales[name].total),
            backgroundColor: 'rgba(75, 192, 192, 0.6)',
            borderColor: 'rgba(75, 192, 192, 1)',
            borderWidth: 1
          },
          {
            label: 'Profit (€)',
            data: productNames.map(name => productSales[name].profit),
            backgroundColor: 'rgba(153, 102, 255, 0.6)',
            borderColor: 'rgba(153, 102, 255, 1)',
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
            <Typography variant="subtitle2">Total Sales</Typography>
            <Typography variant="h5">€{totals.totalSales.toFixed(2)}</Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="subtitle2">Total Profit</Typography>
            <Typography variant="h5" color={totals.totalProfit >= 0 ? 'success.main' : 'error.main'}>
              €{totals.totalProfit.toFixed(2)}
            </Typography>
          </Paper>
        </Grid>
        <Grid item xs={12} md={4}>
          <Paper elevation={2} sx={{ p: 2 }}>
            <Typography variant="subtitle2">Unique Products</Typography>
            <Typography variant="h5">{totals.uniqueProducts.size}</Typography>
          </Paper>
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
                  ? 'Yearly Sales Overview' 
                  : `Product Sales for ${selectedYear}`
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
                beginAtZero: false,
                title: {
                  display: true,
                  text: 'Amount (€)'
                }
              },
              x: {
                title: {
                  display: true,
                  text: selectedYear === 'all' ? 'Year' : 'Product'
                }
              }
            }
          }}
        />
      </Box>

      {/* Grouped Sales Table */}
      <Typography variant="h6" gutterBottom sx={{ mt: 4 }}>
        {selectedYear === 'all' ? 'All Sales Records' : `Sales Records for ${selectedYear}`}
      </Typography>
      <TableContainer>
        <Table size="small" stickyHeader>
          <TableHead>
            <TableRow>
              <TableCell></TableCell>
              <TableCell>Year</TableCell>
              <TableCell>Product</TableCell>
              <TableCell>ISIN</TableCell>
              <TableCell align="right">Quantity</TableCell>
              <TableCell align="right">Total Sales (€)</TableCell>
              <TableCell align="right">Total Profit (€)</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {filteredSales.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center">
                  No sales data available for selected filter
                </TableCell>
              </TableRow>
            ) : (
              <>
                {filteredSales.map((group, index) => {
                  const groupKey = `${group.year}_${group.ISIN}`;
                  const isExpanded = expandedGroups[groupKey];
                  
                  return (
                    <React.Fragment key={groupKey}>
                      <TableRow hover>
                        <TableCell>
                          <IconButton
                            size="small"
                            onClick={() => toggleGroup(groupKey)}
                          >
                            {isExpanded ? <KeyboardArrowUpIcon /> : <KeyboardArrowDownIcon />}
                          </IconButton>
                        </TableCell>
                        <TableCell>{group.year}</TableCell>
                        <TableCell>{group.ProductName}</TableCell>
                        <TableCell>{group.ISIN}</TableCell>
                        <TableCell align="right">{group.totalQuantity}</TableCell>
                        <TableCell align="right">{group.totalSales.toFixed(2)}</TableCell>
                        <TableCell 
                          align="right" 
                          sx={{ color: group.totalProfit >= 0 ? 'success.main' : 'error.main' }}
                        >
                          {group.totalProfit.toFixed(2)}
                        </TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell style={{ paddingBottom: 0, paddingTop: 0 }} colSpan={7}>
                          <Collapse in={isExpanded} timeout="auto" unmountOnExit>
                            <Box sx={{ margin: 1 }}>
                              <Typography variant="subtitle2" gutterBottom>
                                Transaction Details
                              </Typography>
                              <Table size="small">
                                <TableHead>
                                  <TableRow>
                                    <TableCell>Date</TableCell>
                                    <TableCell align="right">Quantity</TableCell>
                                    <TableCell align="right">Price (€)</TableCell>
                                    <TableCell align="right">Amount (€)</TableCell>
                                    <TableCell align="right">Profit (€)</TableCell>
                                  </TableRow>
                                </TableHead>
                                <TableBody>
                                  {group.transactions.map((txn, txnIndex) => (
                                    <TableRow key={txnIndex}>
                                      <TableCell>{txn.saleDate}</TableCell>
                                      <TableCell align="right">{txn.Quantity}</TableCell>
                                      <TableCell align="right">{txn.SalePrice?.toFixed(2)}</TableCell>
                                      <TableCell align="right">{txn.SaleAmountEUR?.toFixed(2)}</TableCell>
                                      <TableCell 
                                        align="right"
                                        sx={{ color: txn.profit >= 0 ? 'success.main' : 'error.main' }}
                                      >
                                        {txn.profit.toFixed(2)}
                                      </TableCell>
                                    </TableRow>
                                  ))}
                                </TableBody>
                              </Table>
                            </Box>
                          </Collapse>
                        </TableCell>
                      </TableRow>
                    </React.Fragment>
                  );
                })}
                <TableRow sx={{ '& td': { fontWeight: 'bold' } }}>
                  <TableCell colSpan={4}>Total</TableCell>
                  <TableCell align="right">{filteredSales.reduce((sum, group) => sum + group.totalQuantity, 0)}</TableCell>
                  <TableCell align="right">{filteredSales.reduce((sum, group) => sum + group.totalSales, 0).toFixed(2)}</TableCell>
                  <TableCell 
                    align="right" 
                    sx={{ color: totals.totalProfit >= 0 ? 'success.main' : 'error.main' }}
                  >
                    {filteredSales.reduce((sum, group) => sum + group.totalProfit, 0).toFixed(2)}
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