// frontend/src/pages/ProcessedTransactionsPage.js
import React from 'react';
import { Typography, Box, Paper, Alert, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress } from '@mui/material';
import { useQuery } from '@tanstack/react-query';
import { apiFetchProcessedTransactions } from '../api/apiService';
import { useAuth } from '../context/AuthContext';
import { UI_TEXT } from '../constants';

const fetchProcessedTransactions = async () => {
  const response = await apiFetchProcessedTransactions();
  return response.data || []; // Ensure it returns an array
};

const ProcessedTransactionsPage = () => {
  const { token } = useAuth();
  const { 
    data: processedTransactions = [], // Default to empty array
    isLoading: transactionsLoading, 
    error: transactionsErrorObj, // Rename to avoid conflict with potential error string
    isError: isTransactionsError,
    // refetch // React Query handles refetching via queryClient.invalidateQueries
  } = useQuery({
    queryKey: ['processedTransactions', token],
    queryFn: fetchProcessedTransactions,
    enabled: !!token,
  });

  const transactionsError = isTransactionsError ? (transactionsErrorObj?.message || UI_TEXT.errorLoadingData) : null;

  if (transactionsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', p: 3 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading transactions...</Typography>
      </Box>
    );
  }

  if (transactionsError) {
    return <Alert severity="error" sx={{ my: 2, mx: { xs: 2, sm: 3 } }}>{transactionsError}</Alert>;
  }
  
  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Processed Transactions
      </Typography>
      
      {processedTransactions.length > 0 ? (
        <Paper elevation={3} sx={{ p: { xs: 1, sm: 2 } }}>
          <Typography variant="body2" sx={{ mb: 1 }}>
            These are all the transactions processed and stored in the database.
          </Typography>
          <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
            <Table stickyHeader size="small" aria-label="processed transactions table">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell>ISIN</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell align="right">Commission</TableCell>
                  <TableCell align="right">Amount EUR</TableCell>
                  <TableCell>Order ID</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {processedTransactions.map((transaction) => (
                  <TableRow hover key={transaction.id || transaction.OrderID}>
                    <TableCell>{transaction.Date || ''}</TableCell>
                    <TableCell>{transaction.ProductName || ''}</TableCell>
                    <TableCell>{transaction.ISIN || ''}</TableCell>
                    <TableCell>{transaction.OrderType || ''}</TableCell>
                    <TableCell align="right">{transaction.Quantity}</TableCell>
                    <TableCell align="right">{transaction.Price?.toFixed(4) || '0.0000'}</TableCell>
                    <TableCell align="right">{transaction.Amount?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>{transaction.Currency || ''}</TableCell>
                    <TableCell align="right">{transaction.Commission?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell align="right">{transaction.AmountEUR?.toFixed(2) || '0.00'}</TableCell>
                    <TableCell>{transaction.OrderID || ''}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      ) : (
        <Typography sx={{ textAlign: 'center', mt: 2 }}>
          No processed transactions found.
        </Typography>
      )}
    </Box>
  );
};

export default ProcessedTransactionsPage;