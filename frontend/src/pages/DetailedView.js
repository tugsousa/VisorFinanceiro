// src/pages/DetailedView.js
import { useLocation } from 'react-router-dom';
import { Box, Typography, Tabs, Tab, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Paper } from '@mui/material';
import { useState } from 'react';

export default function DetailedView() {
  const location = useLocation();
  const data = location.state?.data;
  const [activeTab, setActiveTab] = useState(0);

  if (!data) {
    return <div>No data available</div>;
  }

  const handleTabChange = (event, newValue) => {
    setActiveTab(newValue);
  };

  return (
    <Box sx={{ mt: 2 }}>
      <Typography variant="h4" gutterBottom>
        Detailed Data
      </Typography>
      
      <Tabs value={activeTab} onChange={handleTabChange} sx={{ mb: 3 }}>
        <Tab label="Dividends" />
        <Tab label="Sales" />
        <Tab label="Remaining Purchases" />
      </Tabs>
      
      {activeTab === 0 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Date</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell>Description</TableCell>
                <TableCell>Amount</TableCell>
                <TableCell>Tax</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.dividendResult.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{row.Date}</TableCell>
                  <TableCell>{row.Symbol}</TableCell>
                  <TableCell>{row.Description}</TableCell>
                  <TableCell>{row.Amount}</TableCell>
                  <TableCell>{row.Tax}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {activeTab === 1 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Sale Date</TableCell>
                <TableCell>Symbol</TableCell>
                <TableCell>Quantity</TableCell>
                <TableCell>Proceeds</TableCell>
                <TableCell>Cost Basis</TableCell>
                <TableCell>Gain/Loss</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.saleDetails.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{row.SaleDate}</TableCell>
                  <TableCell>{row.Symbol}</TableCell>
                  <TableCell>{row.Quantity}</TableCell>
                  <TableCell>{row.Proceeds}</TableCell>
                  <TableCell>{row.CostBasis}</TableCell>
                  <TableCell>{row.GainLoss}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
      
      {activeTab === 2 && (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Symbol</TableCell>
                <TableCell>Purchase Date</TableCell>
                <TableCell>Quantity</TableCell>
                <TableCell>Cost Basis</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.remainingPurchases.map((row, index) => (
                <TableRow key={index}>
                  <TableCell>{row.Symbol}</TableCell>
                  <TableCell>{row.PurchaseDate}</TableCell>
                  <TableCell>{row.Quantity}</TableCell>
                  <TableCell>{row.CostBasis}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Box>
  );
}