// frontend/src/pages/ProcessedTransactionsPage.js
import React, { useState } from 'react'; // Added useState
import { Typography, Box, Paper, Alert, TableContainer, Table, TableHead, TableRow, TableCell, TableBody, CircularProgress } from '@mui/material';
import { Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle } from '@mui/material'; // Added Dialog components
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'; // Added useMutation, useQueryClient
import { apiFetchProcessedTransactions, apiDeleteAllTransactions } from '../api/apiService'; // Added apiDeleteAllTransactions
import { useAuth } from '../context/AuthContext';
import { UI_TEXT } from '../constants';

const fetchProcessedTransactions = async () => {
  const response = await apiFetchProcessedTransactions();
  return response.data || []; // Ensure it returns an array
};

const ProcessedTransactionsPage = () => {
  const { token, refreshUserDataCheck } = useAuth(); // Get refreshUserDataCheck
  const queryClient = useQueryClient(); // Get queryClient

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

  const [showDeleteConfirmDialog, setShowDeleteConfirmDialog] = useState(false);

  const deleteTransactionsMutation = useMutation({
    mutationFn: apiDeleteAllTransactions,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['processedTransactions', token] });
      refreshUserDataCheck(); // Update hasInitialData in AuthContext
      // Potentially invalidate other queries if they depend on transactions
      queryClient.invalidateQueries({ queryKey: ['realizedGainsData', token] });
      queryClient.invalidateQueries({ queryKey: ['taxReportData', token] });
      // TODO: Add a success snackbar or alert here
      setShowDeleteConfirmDialog(false); // Close dialog on success
    },
    onError: (error) => {
      // TODO: Add an error snackbar or alert here
      console.error("Error deleting transactions:", error);
      setShowDeleteConfirmDialog(false); // Close dialog on error
    },
  });

  const handleDeleteAllClick = () => {
    setShowDeleteConfirmDialog(true);
  };

  const handleConfirmDeleteAll = () => {
    deleteTransactionsMutation.mutate();
  };

  const handleCloseDeleteConfirmDialog = () => {
    setShowDeleteConfirmDialog(false);
  };

  const transactionsError = isTransactionsError ? (transactionsErrorObj?.message || UI_TEXT.errorLoadingData) : null;

  if (transactionsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', p: 3 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>Loading transactions...</Typography>
      </Box>
    );
  }

  // This error is for fetching, mutation will have its own error handling (e.g. snackbar)
  if (transactionsError && !deleteTransactionsMutation.isPending) {
    return <Alert severity="error" sx={{ my: 2, mx: { xs: 2, sm: 3 } }}>{transactionsError}</Alert>;
  }
  
  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Transações Processadas
      </Typography>
      
      {processedTransactions.length > 0 && !transactionsLoading && (
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteAllClick}
            disabled={deleteTransactionsMutation.isPending || transactionsLoading}
          >
            {deleteTransactionsMutation.isPending ? <CircularProgress size={24} color="inherit" /> : "Eliminar todas as transações"}
          </Button>
        </Box>
      )}

      {(processedTransactions.length > 0 || deleteTransactionsMutation.isPending || transactionsLoading) ? (
        <Box sx={{ p: { xs: 1, sm: 2 } }}>
          <TableContainer component={Paper} sx={{ maxHeight: '70vh' }}>
            <Table stickyHeader size="small" aria-label="processed transactions table">
              <TableHead>
                <TableRow>
                  <TableCell>Data</TableCell>
                  <TableCell>Produto</TableCell>
                  <TableCell>ISIN</TableCell>
                  <TableCell>TipoOperação</TableCell>
                  <TableCell align="right">Quantidade</TableCell>
                  <TableCell align="right">Preço</TableCell>
                  <TableCell align="right">Montante</TableCell>
                  <TableCell>Moeda</TableCell>
                  <TableCell align="right">Comissão</TableCell>
                  <TableCell align="right">Montante em EUR</TableCell>
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
        </Box>
      ) : (
        <Typography sx={{ textAlign: 'center', mt: 2 }}>
          Nenhuma transação processada encontrada.
        </Typography>
      )}

      <Dialog
        open={showDeleteConfirmDialog}
        onClose={handleCloseDeleteConfirmDialog}
        aria-labelledby="alert-dialog-title"
        aria-describedby="alert-dialog-description"
      >
        <DialogTitle id="alert-dialog-title">{"Confirmar exclusão"}</DialogTitle>
        <DialogContent>
          <DialogContentText id="alert-dialog-description">
            Tem a certeza de que deseja excluir todas as transações processadas? Esta ação não pode ser revertida.
          </DialogContentText>
          {deleteTransactionsMutation.isError && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteTransactionsMutation.error.response?.data?.error || deleteTransactionsMutation.error.message || "Falha a excluir as transações."}
            </Alert>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseDeleteConfirmDialog} color="primary" disabled={deleteTransactionsMutation.isPending}>
            Cancelar
          </Button>
          <Button onClick={handleConfirmDeleteAll} color="error" autoFocus disabled={deleteTransactionsMutation.isPending}>
            {deleteTransactionsMutation.isPending ? <CircularProgress size={24} /> : "Excluir tudo"}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default ProcessedTransactionsPage;