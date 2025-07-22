// frontend/src/pages/SettingsPage.js
import React, { useState, useContext } from 'react';
import {
  Container, Paper, Box, Typography, TextField, Button, Alert,
  CircularProgress, Grid, Divider, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { apiChangePassword, apiDeleteAccount } from '../api/apiService';
import { AuthContext } from '../context/AuthContext';
import { useNavigate } from 'react-router-dom';

function SettingsPage() {
  const { performLogout, fetchCsrfToken } = useContext(AuthContext);
  const navigate = useNavigate();

  // Change Password State
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');


  // Delete Account State
  const [deletePassword, setDeletePassword] = useState('');
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [deleteAccountErrorDialog, setDeleteAccountErrorDialog] = useState('');


  const changePasswordMutation = useMutation({
    mutationFn: (data) => apiChangePassword(data.currentPassword, data.newPassword, data.confirmNewPassword),
    onSuccess: (data) => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
      setChangePasswordError('');
      setChangePasswordSuccess(data.data.message || 'Password mudada com sucesso!');
    },
    onError: (error) => {
      setChangePasswordSuccess('');
      setChangePasswordError(error.response?.data?.error || error.message || 'Falha ao mudar a password.');
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (password) => apiDeleteAccount(password),
    onSuccess: async () => {
      setOpenDeleteConfirm(false);
      setDeletePassword(''); // Clear password field
      setDeleteAccountErrorDialog(''); // Clear dialog error
      alert('Conta eliminada com sucesso. Vai ser desconectado.'); // Notify user
      await performLogout(false, "Conta eliminada pelo usuário");
      navigate('/signin');
    },
    onError: (error) => {
      setDeleteAccountErrorDialog(error.response?.data?.error || error.message || 'Falha ao tentar eliminar a conta. A password poderá estar incorrecta.');
      // Keep dialog open to show error
    }
  });


  const handleSubmitChangePassword = async (e) => {
    e.preventDefault();
    setChangePasswordError('');
    setChangePasswordSuccess('');

    if (newPassword !== confirmNewPassword) {
      setChangePasswordError("As passwords novas não são iguais.");
      return;
    }
    if (newPassword.length < 6) {
      setChangePasswordError("A nova password precisa de ter no mínimo 6 caracteres.");
      return;
    }
    if (!currentPassword) {
      setChangePasswordError("É necessário a password atual.");
      return;
    }
    await fetchCsrfToken(true); // Ensure CSRF token is fresh
    changePasswordMutation.mutate({ currentPassword, newPassword, confirmNewPassword });
  };

  const handleOpenDeleteDialog = () => {
    setDeletePassword(''); // Clear password field when opening dialog
    setDeleteAccountErrorDialog(''); // Clear previous dialog errors
    setOpenDeleteConfirm(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteConfirm(false);
    // Don't reset mutation here, error might be shown in dialog
  };

  const handleConfirmDeleteAccount = async () => {
    setDeleteAccountErrorDialog(''); // Clear previous dialog errors
    if (!deletePassword) {
        setDeleteAccountErrorDialog("Por favor insira a sua password para confirmar a eliminação da conta.");
        return;
    }
    await fetchCsrfToken(true); // Ensure CSRF token is fresh
    deleteAccountMutation.mutate(deletePassword);
  };

  return (
    <Container maxWidth="md" sx={{ mt: {xs: 2, sm: 4}, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: {xs: 'center', sm: 'left'} }}>
        Configurações
      </Typography>

      <Box sx={{ p: { xs: 2, sm: 3 }, mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Alterar Senha
        </Typography>
        {changePasswordError && (
          <Alert severity="error" sx={{ mb: 2 }}>{changePasswordError}</Alert>
        )}
        {changePasswordSuccess && (
           <Alert severity="success" sx={{ mb: 2 }}>{changePasswordSuccess}</Alert>
        )}
        <Box component="form" onSubmit={handleSubmitChangePassword} noValidate>
          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Senha atual</Typography>
          <TextField
            required
            fullWidth
            margin="dense"
            name="currentPassword"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            disabled={changePasswordMutation.isPending}
            autoComplete="current-password"
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Nova Senha</Typography>
          <TextField
            required
            fullWidth
            margin="dense"
            name="newPassword"
           // helperText="A senha deve ter pelo menos 6 caracteres."
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            disabled={changePasswordMutation.isPending}
            autoComplete="new-password"
          />

          <Typography variant="subtitle2" sx={{ fontWeight: 500, mt: 2 }}>Confirmação da nova senha</Typography>
          <TextField
            required
            fullWidth
            margin="dense"
            name="confirmNewPassword"
            type="password"
            value={confirmNewPassword}
            onChange={(e) => setConfirmNewPassword(e.target.value)}
            disabled={changePasswordMutation.isPending}
            autoComplete="new-password"
          />
          <Button
            type="submit"
            variant="contained"
            sx={{
              mt: 3,
              mb: 2,
              textTransform: 'none',
              backgroundColor: '#3699FF',
              '&:hover': {
                backgroundColor: '#2680d6',
              },
              py: 1.5,
              px: 4
            }}
            disabled={changePasswordMutation.isPending}
          >
            {changePasswordMutation.isPending ? <CircularProgress size={24} color="inherit" /> : 'Alterar Senha'}
          </Button>
        </Box>
      </Box>

      <Divider sx={{ my: 4 }} />

      {/* Delete Account Section */}
      <Box sx={{ p: { xs: 2, sm: 3 }}}>
        <Typography variant="h6" component="h2" gutterBottom color="error.main">
          Elimine a sua conta
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Elimine permanentemente a sua conta e toda a informação associada. Esta opção não pode ser desfeita depois de realizada.
        </Typography>
        <Button
          variant="outlined"
          color="error"
          onClick={handleOpenDeleteDialog}
          disabled={deleteAccountMutation.isPending}
        >
          Eliminar a minha conta
        </Button>
      </Box>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={openDeleteConfirm} onClose={handleCloseDeleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{backgroundColor: 'error.main', color: 'white'}}>Confirmação de eliminação de conta</DialogTitle>
        <DialogContent sx={{pt: '20px !important' }}> {/* Add padding top for content */}
          <DialogContentText sx={{ mb:2 }}>
            Tem a certeza absoluta de que deseja eliminar a sua conta? Todos os seus dados serão removidos permanentemente. Esta opção não pode ser revertida.
            <br/><br/>
            Por favor insira a sua senha para confirmação.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="deletePassword"
            label="Sua senha"
            type="password"
            fullWidth
            variant="outlined" // Changed to outlined for better visibility
            value={deletePassword}
            onChange={(e) => setDeletePassword(e.target.value)}
            disabled={deleteAccountMutation.isPending}
            autoComplete="current-password"
          />
           {deleteAccountErrorDialog && (
                <Alert severity="error" sx={{ mt: 2 }}>
                    {deleteAccountErrorDialog}
                </Alert>
            )}
        </DialogContent>
        <DialogActions sx={{pb: 2, pr: 2}}>
          <Button onClick={handleCloseDeleteDialog} disabled={deleteAccountMutation.isPending} color="inherit">Cancelar</Button>
          <Button onClick={handleConfirmDeleteAccount} color="error" variant="contained" disabled={deleteAccountMutation.isPending}>
            {deleteAccountMutation.isPending ? <CircularProgress size={24} color="inherit"/> : 'Eliminar conta'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default SettingsPage;