// frontend/src/features/portfolio/pages/TransactionsList.js
import React, { useState } from 'react';
import { Typography, Box, Paper, Alert, CircularProgress, Button } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';

import { apiFetchProcessedTransactions, apiDeleteTransactions } from '../../../lib/api';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolio } from '../PortfolioContext';
import { UI_TEXT } from '../../../constants';
import { parseDateRobust } from '../../../lib/utils/dateUtils';
import DeleteTransactionsModal from '../components/DeleteTransactionsModal';
import TransactionAddModal from '../components/TransactionAddModal';

const NoRowsOverlay = () => (
  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', py: 4, color: 'text.secondary', fontSize: '0.9rem' }}>
    Não existem transações registadas.
  </Box>
);

const columns = [
    { field: 'date', headerName: 'Data', width: 110, type: 'date', valueGetter: (value) => parseDateRobust(value), valueFormatter: (value) => { if (!value) return ''; const day = String(value.getDate()).padStart(2, '0'); const month = String(value.getMonth() + 1).padStart(2, '0'); const year = value.getFullYear(); return `${day}-${month}-${year}`; } },
    { field: 'source', headerName: 'Origem', width: 90 },
    { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
    { field: 'transaction_type', headerName: 'Tipo', width: 110 },
    { field: 'transaction_subtype', headerName: 'Subtipo', width: 110 },
    { field: 'buy_sell', headerName: 'Ação', width: 90 },
    { field: 'quantity', headerName: 'Qtd.', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
    { field: 'price', headerName: 'Preço', type: 'number', width: 110, align: 'right', headerAlign: 'right', valueFormatter: (value) => typeof value === 'number' ? value.toFixed(4) : '' },
    { field: 'amount', headerName: 'Montante (Orig.)', type: 'number', width: 130, align: 'right', headerAlign: 'right', valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
    { field: 'currency', headerName: 'Moeda', width: 80 },
    { field: 'exchange_rate', headerName: 'Câmbio', type: 'number', width: 100, align: 'right', headerAlign: 'right', valueFormatter: (value) => typeof value === 'number' ? value.toFixed(4) : '' },
    { field: 'amount_eur', headerName: 'Montante (€)', type: 'number', width: 130, align: 'right', headerAlign: 'right', valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : '' },
];

const TransactionsList = () => {
  const { token, refreshUserDataCheck } = useAuth();
  const { activePortfolio } = usePortfolio(); 
  const queryClient = useQueryClient();

  const portfolioId = activePortfolio?.id;

  const { 
    data: processedTransactions = [],
    isLoading: transactionsLoading, 
    error: transactionsErrorObj,
    isError: isTransactionsError,
  } = useQuery({
    queryKey: ['processedTransactions', token, portfolioId],
    queryFn: async () => {
        if (!portfolioId) return [];
        const response = await apiFetchProcessedTransactions(portfolioId);
        return (response.data || []).map(tx => ({ ...tx, id: tx.hash_id || `${tx.date}-${tx.order_id}-${Math.random()}` }));
    },
    enabled: !!token && !!portfolioId, 
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  const deleteTransactionsMutation = useMutation({
    mutationFn: (criteria) => apiDeleteTransactions({ ...criteria, portfolio_id: portfolioId }), 
    onSuccess: () => {
      queryClient.invalidateQueries();
      refreshUserDataCheck();
      setIsDeleteModalOpen(false);
    },
    onError: (error) => {
      console.error("Error deleting transactions:", error);
    },
  });

  const handleDeleteClick = () => setIsDeleteModalOpen(true);
  const handleConfirmDelete = (criteria) => deleteTransactionsMutation.mutate(criteria);
  const handleCloseDeleteModal = () => { if (!deleteTransactionsMutation.isPending) setIsDeleteModalOpen(false); };

  const transactionsError = isTransactionsError ? (transactionsErrorObj?.message || UI_TEXT.errorLoadingData) : null;
  const deleteError = deleteTransactionsMutation.isError ? (deleteTransactionsMutation.error.response?.data?.error || deleteTransactionsMutation.error.message || "Falha a excluir as transações.") : null;

  if (transactionsError) {
    return <Alert severity="error" sx={{ my: 2, mx: { xs: 2, sm: 3 } }}>{transactionsError}</Alert>;
  }
  
  if (!activePortfolio) {
      return (
        <Box sx={{ p: 4, textAlign: 'center' }}>
            <Typography variant="h6">Selecione ou crie um portfólio para ver as transações.</Typography>
        </Box>
      );
  }

  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
        <Typography variant="h4" component="h1" gutterBottom>
          Transações: {activePortfolio.name}
        </Typography>
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button variant="contained" color="primary" startIcon={<AddCircleOutlineIcon />} onClick={() => setIsAddModalOpen(true)}>
            Adicionar Transação
          </Button>
          <Button variant="contained" color="error" onClick={handleDeleteClick} disabled={deleteTransactionsMutation.isPending || transactionsLoading}>
            {deleteTransactionsMutation.isPending ? <CircularProgress size={24} color="inherit" /> : "Eliminar Transações"}
          </Button>
        </Box>
        <Paper sx={{ width: '100%' }}>
          <DataGrid
            rows={processedTransactions}
            columns={columns}
            loading={transactionsLoading} 
            autoHeight
            initialState={{ pagination: { paginationModel: { pageSize: 10, page: 0 } }, sorting: { sortModel: [{ field: 'date', sort: 'desc' }] } }}
            pageSizeOptions={[10, 25, 50, 100]}
            disableRowSelectionOnClick
            density="compact"
            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
            slots={{ noRowsOverlay: NoRowsOverlay }}
          />
        </Paper>

      <DeleteTransactionsModal
        open={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        availableTransactions={processedTransactions}
        isDeleting={deleteTransactionsMutation.isPending}
        deleteError={deleteError}
      />
      
      {/* FIX: Use the imported variable name here */}
      <TransactionAddModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
    </Box>
  );
};

export default TransactionsList;