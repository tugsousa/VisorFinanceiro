// frontend/src/components/DeleteTransactionsModal.js
import React, { useState, useMemo } from 'react';
import {
  Button, Dialog, DialogActions, DialogContent, DialogTitle, RadioGroup,
  FormControlLabel, Radio, FormControl, FormLabel, Checkbox, FormGroup,
  Select, MenuItem, InputLabel, CircularProgress, Alert, Box
} from '@mui/material';

const DeleteTransactionsModal = ({ open, onClose, onConfirm, availableTransactions, isDeleting, deleteError }) => {
  const [deleteType, setDeleteType] = useState('all');
  const [selectedSources, setSelectedSources] = useState([]);
  const [selectedYear, setSelectedYear] = useState('');

  const { availableSources, availableYears } = useMemo(() => {
    if (!availableTransactions) return { availableSources: [], availableYears: [] };
    const sources = [...new Set(availableTransactions.map(tx => tx.source))];
    const years = [...new Set(availableTransactions.map(tx => tx.date.slice(6, 10)))].sort((a, b) => b.localeCompare(a));
    return { availableSources: sources, availableYears: years };
  }, [availableTransactions]);
  
  // Reset state when modal opens
  React.useEffect(() => {
    if (open) {
      setDeleteType('all');
      setSelectedSources([]);
      setSelectedYear('');
    }
  }, [open]);

  const handleSourceChange = (event) => {
    const { name, checked } = event.target;
    setSelectedSources(prev =>
      checked ? [...prev, name] : prev.filter(source => source !== name)
    );
  };

  const handleConfirmClick = () => {
    let criteria = { type: deleteType };
    if (deleteType === 'source') {
      if (selectedSources.length === 0) return;
      criteria.values = selectedSources;
    } else if (deleteType === 'year') {
      if (!selectedYear) return;
      criteria.values = [selectedYear];
    }
    onConfirm(criteria);
  };

  const isConfirmDisabled = isDeleting ||
    (deleteType === 'source' && selectedSources.length === 0) ||
    (deleteType === 'year' && !selectedYear);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>Eliminar Transações</DialogTitle>
      <DialogContent>
        <FormControl component="fieldset" fullWidth sx={{ mb: 2 }}>
          <FormLabel component="legend">Selecione o critério para eliminar os dados</FormLabel>
          <RadioGroup row value={deleteType} onChange={(e) => setDeleteType(e.target.value)}>
            <FormControlLabel value="all" control={<Radio />} label="Tudo" />
            <FormControlLabel value="source" control={<Radio />} label="Por Corretora" />
            <FormControlLabel value="year" control={<Radio />} label="Por Ano" />
          </RadioGroup>
        </FormControl>

        {deleteType === 'source' && (
          <Box>
            <FormControl component="fieldset" variant="standard" required>
              <FormLabel component="legend">Selecione as corretoras a eliminar</FormLabel>
              <FormGroup row>
                {availableSources.map(source => (
                  <FormControlLabel
                    key={source}
                    control={<Checkbox checked={selectedSources.includes(source)} onChange={handleSourceChange} name={source} />}
                    label={source.charAt(0).toUpperCase() + source.slice(1)}
                  />
                ))}
              </FormGroup>
            </FormControl>
          </Box>
        )}

        {deleteType === 'year' && (
          <Box mt={2}>
            <FormControl fullWidth required>
              <InputLabel id="year-select-label">Ano</InputLabel>
              <Select
                labelId="year-select-label"
                value={selectedYear}
                label="Ano"
                onChange={(e) => setSelectedYear(e.target.value)}
              >
                <MenuItem value=""><em>Selecione um ano</em></MenuItem>
                {availableYears.map(year => (
                  <MenuItem key={year} value={year}>{year}</MenuItem>
                ))}
              </Select>
            </FormControl>
          </Box>
        )}
        
        <Alert severity="warning" sx={{ mt: 3 }}>
          Esta ação é irreversível. Os dados selecionados serão permanentemente eliminados.
        </Alert>

        {deleteError && (
            <Alert severity="error" sx={{ mt: 2 }}>
                {deleteError}
            </Alert>
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={isDeleting}>Cancelar</Button>
        <Button
          onClick={handleConfirmClick}
          color="error"
          variant="contained"
          disabled={isConfirmDisabled}
        >
          {isDeleting ? <CircularProgress size={24} color="inherit" /> : 'Eliminar'}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default DeleteTransactionsModal;