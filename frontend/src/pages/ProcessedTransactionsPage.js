// frontend/src/pages/ProcessedTransactionsPage.js
import React, { useState } from 'react';
import { Typography, Box, Paper, Alert, CircularProgress, Button } from '@mui/material';
import { DataGrid } from '@mui/x-data-grid';
import { ptPT } from '@mui/x-data-grid/locales';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { apiFetchProcessedTransactions, apiDeleteTransactions } from '../api/apiService';
import { useAuth } from '../context/AuthContext';
import { UI_TEXT } from '../constants';
import { parseDateRobust } from '../utils/dateUtils';
import DeleteTransactionsModal from '../components/DeleteTransactionsModal';
// START OF NEW CODE
import AddTransactionModal from '../components/AddTransactionModal';
import AddCircleOutlineIcon from '@mui/icons-material/AddCircleOutline';
// END OF NEW CODE

const fetchProcessedTransactions = async () => {
  const response = await apiFetchProcessedTransactions();
  return (response.data || []).map(tx => ({ ...tx, id: tx.hash_id || `${tx.date}-${tx.order_id}-${Math.random()}` }));
};

const columns = [
    { 
      field: 'date',
      headerName: 'Data', 
      width: 110,
      type: 'date',
      valueGetter: (value) => parseDateRobust(value),
      valueFormatter: (value) => {
        if (!value) return '';
        const day = String(value.getDate()).padStart(2, '0');
        const month = String(value.getMonth() + 1).padStart(2, '0');
        const year = value.getFullYear();
        return `${day}-${month}-${year}`;
      }
    },
    { field: 'source', headerName: 'Origem', width: 90 },
    { field: 'product_name', headerName: 'Produto', flex: 1, minWidth: 200 },
    { field: 'transaction_type', headerName: 'Tipo', width: 110 },
    { field: 'transaction_subtype', headerName: 'Subtipo', width: 110 },
    { field: 'buy_sell', headerName: 'Ação', width: 90 },
    { field: 'quantity', headerName: 'Qtd.', type: 'number', width: 80, align: 'right', headerAlign: 'right' },
    { 
      field: 'price',
      headerName: 'Preço', 
      type: 'number', 
      width: 110,
      align: 'right', headerAlign: 'right',
      valueFormatter: (value) => typeof value === 'number' ? value.toFixed(4) : ''
    },
    { 
      field: 'amount',
      headerName: 'Montante (Orig.)', 
      type: 'number', 
      width: 130,
      align: 'right', headerAlign: 'right',
      valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : ''
    },
    { field: 'currency', headerName: 'Moeda', width: 80 },
    { 
      field: 'exchange_rate',
      headerName: 'Câmbio', 
      type: 'number', 
      width: 100,
      align: 'right', headerAlign: 'right',
      valueFormatter: (value) => typeof value === 'number' ? value.toFixed(4) : ''
    },
    { 
      field: 'amount_eur',
      headerName: 'Montante (€)', 
      type: 'number', 
      width: 130,
      align: 'right', headerAlign: 'right',
      valueFormatter: (value) => typeof value === 'number' ? value.toFixed(2) : ''
    },
];

const ProcessedTransactionsPage = () => {
  const { token, refreshUserDataCheck } = useAuth();
  const queryClient = useQueryClient();

  const { 
    data: processedTransactions = [],
    isLoading: transactionsLoading, 
    error: transactionsErrorObj,
    isError: isTransactionsError,
  } = useQuery({
    queryKey: ['processedTransactions', token],
    queryFn: fetchProcessedTransactions,
    enabled: !!token,
  });

  const [isDeleteModalOpen, setIsDeleteModalOpen] = useState(false);
  // START OF NEW CODE
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  // END OF NEW CODE

  const deleteTransactionsMutation = useMutation({
    mutationFn: (criteria) => apiDeleteTransactions(criteria),
    onSuccess: () => {
      queryClient.invalidateQueries();
      refreshUserDataCheck();
      setIsDeleteModalOpen(false);
    },
    onError: (error) => {
      console.error("Error deleting transactions:", error);
    },
  });

  const handleDeleteClick = () => {
    setIsDeleteModalOpen(true);
  };

  const handleConfirmDelete = (criteria) => {
    deleteTransactionsMutation.mutate(criteria);
  };

  const handleCloseDeleteModal = () => {
    if (!deleteTransactionsMutation.isPending) {
        setIsDeleteModalOpen(false);
    }
  };

  const transactionsError = isTransactionsError ? (transactionsErrorObj?.message || UI_TEXT.errorLoadingData) : null;
  const deleteError = deleteTransactionsMutation.isError ? (deleteTransactionsMutation.error.response?.data?.error || deleteTransactionsMutation.error.message || "Falha a excluir as transações.") : null;

  if (transactionsLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '200px', p: 3 }}>
        <CircularProgress />
        <Typography sx={{ ml: 2 }}>A carregar as transações...</Typography>
      </Box>
    );
  }

  if (transactionsError) {
    return <Alert severity="error" sx={{ my: 2, mx: { xs: 2, sm: 3 } }}>{transactionsError}</Alert>;
  }
  
  return (
    <Box sx={{ p: { xs: 2, sm: 3 } }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Transações Processadas
      </Typography>
      
      {processedTransactions.length > 0 && !transactionsLoading && (
        // START OF MODIFIED CODE
        <Box sx={{ mb: 2, display: 'flex', justifyContent: 'flex-end', gap: 2 }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<AddCircleOutlineIcon />}
            onClick={() => setIsAddModalOpen(true)}
          >
            Adicionar Transação
          </Button>
          <Button
            variant="contained"
            color="error"
            onClick={handleDeleteClick}
            disabled={deleteTransactionsMutation.isPending || transactionsLoading}
          >
            {deleteTransactionsMutation.isPending ? <CircularProgress size={24} color="inherit" /> : "Eliminar Transações"}
          </Button>
        </Box>
        // END OF MODIFIED CODE
      )}

      {processedTransactions.length > 0 ? (
        <Paper sx={{ width: '100%' }}>
          <DataGrid
            rows={processedTransactions}
            columns={columns}
            autoHeight
            initialState={{
              pagination: {
                paginationModel: { pageSize: 10, page: 0 },
              },
              sorting: {
                sortModel: [{ field: 'date', sort: 'desc' }],
              },
            }}
            pageSizeOptions={[10, 25, 50, 100]}
            disableRowSelectionOnClick
            density="compact"
            localeText={ptPT.components.MuiDataGrid.defaultProps.localeText}
          />
        </Paper>
      ) : (
        <Typography sx={{ textAlign: 'center', mt: 4, fontStyle: 'italic', color: 'text.secondary' }}>
          {transactionsLoading ? "A carregar..." : "Nenhuma transação processada encontrada."}
        </Typography>
      )}

      <DeleteTransactionsModal
        open={isDeleteModalOpen}
        onClose={handleCloseDeleteModal}
        onConfirm={handleConfirmDelete}
        availableTransactions={processedTransactions}
        isDeleting={deleteTransactionsMutation.isPending}
        deleteError={deleteError}
      />
      
      {/* START OF NEW CODE */}
      <AddTransactionModal
        open={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
      />
      {/* END OF NEW CODE */}
    </Box>
  );
};

export default ProcessedTransactionsPage;