// frontend/src/components/AddTransactionModal.js
import React, { useState, useMemo } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiAddManualTransaction } from 'features/portfolio/api/portfolioApi';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, TextField,
  Grid, CircularProgress, Alert, FormControl, InputLabel, Select, MenuItem
} from '@mui/material';

const AddTransactionModal = ({ open, onClose }) => {
  const queryClient = useQueryClient();
  const initialFormState = {
    date: '',
    source: 'Manual',
    product_name: '',
    isin: '',
    transaction_type: 'STOCK',
    transaction_subtype: '',
    buy_sell: 'BUY',
    quantity: '',
    price: '',
    commission: '',
    currency: 'EUR',
    order_id: '',
  };

  const [formData, setFormData] = useState(initialFormState);
  const [errors, setErrors] = useState({});

  const mutation = useMutation({
    mutationFn: (data) => apiAddManualTransaction(data),
    onSuccess: () => {
      queryClient.invalidateQueries(); 
      onClose(); 
    },
  });

  const subtypeOptions = useMemo(() => {
    switch (formData.transaction_type) {
      case 'OPTION':
        return [{ value: 'CALL', label: 'Call' }, { value: 'PUT', label: 'Put' }];
      case 'DIVIDEND':
        return [{ value: 'TAX', label: 'Imposto Retido na Fonte' }];
      default:
        return [];
    }
  }, [formData.transaction_type]);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setFormData(prev => {
        const newState = { ...prev, [name]: value };
        if (name === 'transaction_type') {
            newState.transaction_subtype = '';
        }
        return newState;
    });
    // Limpa o erro do campo específico ao ser alterado
    if (errors[name]) {
        setErrors(prev => ({ ...prev, [name]: undefined }));
    }
  };
  
  const validateForm = () => {
    const newErrors = {};
    const alphanumericRegex = /^[a-zA-Z0-9\s]*$/;

    const requiredFields = [
        'date', 'source', 'product_name', 'isin', 'quantity', 'price', 'commission'
    ];

    requiredFields.forEach(field => {
        if (!formData[field] || String(formData[field]).trim() === '') {
            newErrors[field] = 'Este campo é obrigatório.';
        }
    });

    // Validações de formato
    if (formData.product_name && !alphanumericRegex.test(formData.product_name)) {
        newErrors.product_name = 'Apenas letras, números e espaços são permitidos.';
    }
     if (formData.source && !alphanumericRegex.test(formData.source)) {
        newErrors.source = 'Apenas letras, números e espaços são permitidos.';
    }
    if (formData.isin && !/^[a-zA-Z0-9]*$/.test(formData.isin)) {
        newErrors.isin = 'Apenas letras e números são permitidos.';
    }
    
    // Validações numéricas
    const numericFields = ['quantity', 'price'];
    numericFields.forEach(field => {
        if (formData[field] && parseFloat(formData[field]) <= 0) {
            newErrors[field] = 'O valor deve ser maior que zero.';
        }
    });
     if (formData.commission && parseFloat(formData.commission) < 0) {
        newErrors.commission = 'O valor não pode ser negativo.';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!validateForm()) {
        return;
    }
    
    const payload = {
        ...formData,
        quantity: parseFloat(formData.quantity) || 0,
        price: parseFloat(formData.price) || 0,
        commission: parseFloat(formData.commission) || 0,
    };
    
    mutation.mutate(payload);
  };

  const handleClose = () => {
    if (!mutation.isPending) {
      setFormData(initialFormState);
      setErrors({});
      mutation.reset();
      onClose();
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} maxWidth="md" fullWidth>
      <DialogTitle>Adicionar Transação Manual</DialogTitle>
      <DialogContent>
        <Grid container spacing={2} sx={{ pt: 1 }}>
          <Grid item xs={12} sm={4}>
            <TextField name="date" label="Data" type="date" value={formData.date} onChange={handleChange} InputLabelProps={{ shrink: true }} fullWidth required error={!!errors.date} helperText={errors.date} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField name="product_name" label="Nome do Produto" value={formData.product_name} onChange={handleChange} fullWidth required error={!!errors.product_name} helperText={errors.product_name} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField name="isin" label="ISIN" value={formData.isin} onChange={handleChange} fullWidth required error={!!errors.isin} helperText={errors.isin} />
          </Grid>
          <Grid item xs={12} sm={4}>
            <FormControl fullWidth required error={!!errors.transaction_type}>
              <InputLabel>Tipo de Transação</InputLabel>
              <Select name="transaction_type" value={formData.transaction_type} label="Tipo de Transação" onChange={handleChange}>
                <MenuItem value="STOCK">Ação</MenuItem>
                <MenuItem value="OPTION">Opção</MenuItem>
                <MenuItem value="DIVIDEND">Dividendo</MenuItem>
                <MenuItem value="FEE">Taxa</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
             <FormControl fullWidth required error={!!errors.buy_sell}>
              <InputLabel>Ação</InputLabel>
              <Select name="buy_sell" value={formData.buy_sell} label="Ação" onChange={handleChange}>
                <MenuItem value="BUY">Compra</MenuItem>
                <MenuItem value="SELL">Venda</MenuItem>
              </Select>
            </FormControl>
          </Grid>
           {subtypeOptions.length > 0 && (
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth>
                <InputLabel>Subtipo</InputLabel>
                <Select name="transaction_subtype" value={formData.transaction_subtype} label="Subtipo" onChange={handleChange}>
                  <MenuItem value=""><em>Nenhum</em></MenuItem>
                  {subtypeOptions.map(opt => <MenuItem key={opt.value} value={opt.value}>{opt.label}</MenuItem>)}
                </Select>
              </FormControl>
            </Grid>
          )}
          <Grid item xs={12} sm={3}>
            <TextField name="quantity" label="Quantidade" type="number" value={formData.quantity} onChange={handleChange} fullWidth required inputProps={{ step: "any" }} error={!!errors.quantity} helperText={errors.quantity} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField name="price" label="Preço Unitário" type="number" value={formData.price} onChange={handleChange} fullWidth required inputProps={{ step: "any" }} error={!!errors.price} helperText={errors.price} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField name="commission" label="Comissão" type="number" value={formData.commission} onChange={handleChange} fullWidth required inputProps={{ step: "any" }} error={!!errors.commission} helperText={errors.commission} />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth required error={!!errors.currency}>
              <InputLabel>Moeda</InputLabel>
              <Select name="currency" value={formData.currency} label="Moeda" onChange={handleChange}>
                <MenuItem value="EUR">EUR</MenuItem>
                <MenuItem value="USD">USD</MenuItem>
                <MenuItem value="GBP">GBP</MenuItem>
                <MenuItem value="SEK">SEK</MenuItem>
                <MenuItem value="PLN">PLN</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={6}>
            <TextField name="order_id" label="ID da Ordem" value={formData.order_id} onChange={handleChange} fullWidth helperText="Opcional" />
          </Grid>
           <Grid item xs={12} sm={6}>
            <TextField name="source" label="Origem" value={formData.source} onChange={handleChange} fullWidth required error={!!errors.source} helperText={errors.source} />
          </Grid>
        </Grid>
        {mutation.isError && <Alert severity="error" sx={{ mt: 2 }}>{mutation.error.response?.data?.error || 'Ocorreu um erro ao guardar a transação.'}</Alert>}
      </DialogContent>
      <DialogActions sx={{ pb: 2, pr: 2 }}>
        <Button onClick={handleClose}>Cancelar</Button>
        <Button onClick={handleSubmit} variant="contained" disabled={mutation.isPending}>
          {mutation.isPending ? <CircularProgress size={24} /> : 'Adicionar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default AddTransactionModal;