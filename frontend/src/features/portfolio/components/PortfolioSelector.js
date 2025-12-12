// frontend/src/components/PortfolioSelector.js
import React, { useState } from 'react';
import { 
    Select, MenuItem, FormControl, IconButton, Tooltip, 
    Dialog, TextField, Button, DialogTitle, DialogContent, 
    DialogActions, Box, Typography, Alert, CircularProgress,
    List, ListItem, ListItemText, ListItemSecondaryAction, Divider
} from '@mui/material';
import { 
    AccountBalanceWallet as WalletIcon, 
    Settings as SettingsIcon,
    Delete as DeleteIcon,
    Add as AddIcon
} from '@mui/icons-material';
import { usePortfolio } from '../PortfolioContext';

export default function PortfolioSelector() {
    const { portfolios, activePortfolio, switchPortfolio, createPortfolio, deletePortfolio, loading } = usePortfolio();
    
    // UI States
    const [openManageModal, setOpenManageModal] = useState(false);
    const [view, setView] = useState('list'); // 'list' or 'create'
    
    // Form States
    const [newName, setNewName] = useState('');
    const [newDesc, setNewDesc] = useState('');
    const [error, setError] = useState('');
    const [isProcessing, setIsProcessing] = useState(false);

    const handleSwitch = (e) => {
        switchPortfolio(e.target.value);
    };

    const handleCreate = async () => {
        if (!newName.trim()) {
            setError("O nome é obrigatório.");
            return;
        }
        setIsProcessing(true);
        setError('');
        try {
            await createPortfolio(newName, newDesc);
            setNewName('');
            setNewDesc('');
            setView('list');
        } catch (err) {
            const backendError = err.response?.data?.error; 

            if (backendError && backendError.includes("Atingiu o limite máximo")) {
                setError(backendError); // Exibir a mensagem específica do limite
            } else {
                setError(backendError || "Erro ao criar. O nome deve ser único.");
            }
        } finally {
            setIsProcessing(false);
        }
    };

    const handleDelete = async (id) => {
        if(!window.confirm("Tem a certeza? Todos os dados deste portfólio serão apagados.")) return;
        
        setIsProcessing(true);
        try {
            await deletePortfolio(id);
        } catch (err) {
            setError(err.response?.data?.error || "Erro ao apagar.");
        } finally {
            setIsProcessing(false);
        }
    };

    const resetModal = () => {
        setOpenManageModal(false);
        setView('list');
        setError('');
        setNewName('');
    };

    if (loading && portfolios.length === 0) return null;

    return (
        <Box sx={{ display: 'flex', alignItems: 'center', bgcolor: 'rgba(0,0,0,0.04)', borderRadius: 1, p: 0.5, mr: 2 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', mx: 1, color: 'text.secondary' }}>
                <WalletIcon fontSize="small" sx={{ mr: 0.5 }} />
            </Box>
            
            {activePortfolio ? (
                <FormControl variant="standard" size="small" sx={{ minWidth: 120 }}>
                    <Select
                        value={activePortfolio.id}
                        onChange={handleSwitch}
                        disableUnderline
                        sx={{ 
                            fontSize: '0.875rem', 
                            fontWeight: 500,
                            '& .MuiSelect-select': { py: 0.5, pr: '24px !important' }
                        }}
                    >
                        {portfolios.map(p => (
                            <MenuItem key={p.id} value={p.id}>{p.name}</MenuItem>
                        ))}
                    </Select>
                </FormControl>
            ) : (
                <Typography variant="caption" sx={{ mx: 1, color: 'error.main' }}>
                    Sem Portfólio
                </Typography>
            )}

            <Tooltip title="Gerir Portfólios">
                <IconButton onClick={() => setOpenManageModal(true)} size="small" sx={{ ml: 0.5 }}>
                    <SettingsIcon fontSize="small" />
                </IconButton>
            </Tooltip>

            {/* MANAGE MODAL */}
            <Dialog open={openManageModal} onClose={resetModal} maxWidth="xs" fullWidth>
                <DialogTitle>
                    {view === 'list' ? 'Gerir Portfólios' : 'Novo Portfólio'}
                </DialogTitle>
                
                <DialogContent>
                    {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

                    {view === 'list' ? (
                        <List dense>
                            {portfolios.map((p) => (
                                <React.Fragment key={p.id}>
                                    <ListItem>
                                        <ListItemText 
                                            primary={p.name} 
                                            secondary={p.is_default ? "Padrão" : p.description} 
                                            primaryTypographyProps={{ fontWeight: activePortfolio?.id === p.id ? 'bold' : 'normal' }}
                                        />
                                        <ListItemSecondaryAction>
                                            {!p.is_default && (
                                                <IconButton edge="end" aria-label="delete" onClick={() => handleDelete(p.id)} disabled={isProcessing}>
                                                    <DeleteIcon color="error" fontSize="small" />
                                                </IconButton>
                                            )}
                                        </ListItemSecondaryAction>
                                    </ListItem>
                                    <Divider />
                                </React.Fragment>
                            ))}
                            <Box sx={{ mt: 2, display: 'flex', justifyContent: 'center' }}>
                                <Button startIcon={<AddIcon />} onClick={() => setView('create')}>
                                    Criar Novo
                                </Button>
                            </Box>
                        </List>
                    ) : (
                        <Box sx={{ mt: 1 }}>
                            <TextField 
                                autoFocus margin="dense" label="Nome" fullWidth 
                                value={newName} onChange={e => setNewName(e.target.value)} 
                                variant="outlined" size="small"
                            />
                            <TextField 
                                margin="dense" label="Descrição" fullWidth 
                                value={newDesc} onChange={e => setNewDesc(e.target.value)} 
                                variant="outlined" size="small" multiline rows={2}
                            />
                        </Box>
                    )}
                </DialogContent>
                
                <DialogActions>
                    {view === 'create' ? (
                        <>
                            <Button onClick={() => setView('list')}>Voltar</Button>
                            <Button onClick={handleCreate} variant="contained" disabled={isProcessing}>
                                {isProcessing ? <CircularProgress size={24} /> : 'Criar'}
                            </Button>
                        </>
                    ) : (
                        <Button onClick={resetModal}>Fechar</Button>
                    )}
                </DialogActions>
            </Dialog>
        </Box>
    );
}