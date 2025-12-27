// frontend/src/features/settings/pages/SettingsPage.js
import React, { useState, useContext } from 'react';
import {
  Container, Box, Typography, TextField, Button, Alert,
  CircularProgress, Divider, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { apiChangePassword, apiDeleteAccount } from 'features/auth/api/authApi';
import { apiSetupMfa, apiActivateMfa } from '../../admin/api/adminApi'; // Importação dos novos endpoints
import { AuthContext } from '../../auth/AuthContext';
import { useNavigate } from 'react-router-dom';

function SettingsPage() {
  const { user, performLogout, fetchCsrfToken, updateUserLocal } = useContext(AuthContext);
  const navigate = useNavigate();

  // --- States: Change Password ---
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmNewPassword, setConfirmNewPassword] = useState('');
  const [changePasswordSuccess, setChangePasswordSuccess] = useState('');
  const [changePasswordError, setChangePasswordError] = useState('');

  // --- States: Delete Account ---
  const [deletePassword, setDeletePassword] = useState('');
  const [openDeleteConfirm, setOpenDeleteConfirm] = useState(false);
  const [deleteAccountErrorDialog, setDeleteAccountErrorDialog] = useState('');

  // --- States: MFA (2FA) ---
  const [openMfaModal, setOpenMfaModal] = useState(false);
  const [mfaData, setMfaData] = useState({ secret: '', qr_code: '' });
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [isMfaLoading, setIsMfaLoading] = useState(false);

  // --- Mutations: Password & Delete ---
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
      setDeletePassword('');
      setDeleteAccountErrorDialog('');
      alert('Conta eliminada com sucesso. Vai ser desconectado.');
      await performLogout(false, "Conta eliminada pelo usuário");
      navigate('/signin');
    },
    onError: (error) => {
      setDeleteAccountErrorDialog(error.response?.data?.error || error.message || 'Falha ao tentar eliminar a conta. A password poderá estar incorrecta.');
    }
  });

  // --- Handlers: Password ---
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
    await fetchCsrfToken(true);
    changePasswordMutation.mutate({ currentPassword, newPassword, confirmNewPassword });
  };

  // --- Handlers: Delete Account ---
  const handleOpenDeleteDialog = () => {
    setDeletePassword('');
    setDeleteAccountErrorDialog('');
    setOpenDeleteConfirm(true);
  };

  const handleCloseDeleteDialog = () => {
    setOpenDeleteConfirm(false);
  };

  const handleConfirmDeleteAccount = async () => {
    setDeleteAccountErrorDialog('');
    
    if (user.auth_provider === 'local') {
      if (!deletePassword) {
        setDeleteAccountErrorDialog("Por favor insira a sua password para confirmar a eliminação da conta.");
        return;
      }
      await fetchCsrfToken(true);
      deleteAccountMutation.mutate(deletePassword);
    } else {
      await fetchCsrfToken(true);
      deleteAccountMutation.mutate('');
    }
  };

  // --- Handlers: MFA (2FA) ---
  const handleStartMfaSetup = async () => {
    setIsMfaLoading(true);
    try {
        const res = await apiSetupMfa();
        setMfaData(res.data); // Espera receber { secret, qr_code }
        setOpenMfaModal(true);
    } catch (err) {
        alert("Erro ao iniciar configuração MFA: " + (err.response?.data?.error || err.message));
    } finally {
        setIsMfaLoading(false);
    }
  };

  const handleActivateMfa = async () => {
    setMfaError('');
    if (!mfaCode || mfaCode.length !== 6) {
        setMfaError("O código deve ter 6 dígitos.");
        return;
    }
    
    setIsMfaLoading(true);
    try {
        await apiActivateMfa(mfaCode);
        
        // Atualiza o contexto local para refletir que o MFA está ativo
        if (updateUserLocal) {
            updateUserLocal({ mfa_enabled: true });
        }
        
        setOpenMfaModal(false);
        setMfaCode('');
        alert("Autenticação de dois fatores ativada com sucesso!");
    } catch (err) {
        setMfaError(err.response?.data?.error || "Código inválido ou erro ao ativar.");
    } finally {
        setIsMfaLoading(false);
    }
  };

  return (
    <Container maxWidth="md" sx={{ mt: { xs: 2, sm: 4 }, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: { xs: 'center', sm: 'left' } }}>
        Configurações
      </Typography>

      {/* --- SECÇÃO MFA (Apenas para Admins) --- */}
      {user.is_admin && (
        <>
            <Box sx={{ p: { xs: 2, sm: 3 }, mb: 4, bgcolor: 'background.paper', border: '1px solid', borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="h6" component="h2" gutterBottom display="flex" alignItems="center">
                    Segurança de Administrador (2FA)
                </Typography>
                
                {user.mfa_enabled ? (
                    <Alert severity="success" sx={{ mb: 2 }}>
                        A autenticação de dois fatores (MFA) está <strong>Ativa</strong> na sua conta.
                    </Alert>
                ) : (
                    <>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            O 2FA não está ativo. Você precisa ativá-lo para usar funcionalidades sensíveis como "Impersonate User".
                        </Alert>
                        <Button 
                            variant="contained" 
                            color="primary" 
                            onClick={handleStartMfaSetup}
                            disabled={isMfaLoading}
                        >
                            {isMfaLoading ? <CircularProgress size={24} color="inherit" /> : "Configurar 2FA agora"}
                        </Button>
                    </>
                )}
            </Box>
            <Divider sx={{ my: 4 }} />
        </>
      )}

      {/* --- SECÇÃO ALTERAR PASSWORD (Apenas contas locais) --- */}
      {user.auth_provider === 'local' && (
        <>
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
                  mt: 3, mb: 2, textTransform: 'none', backgroundColor: '#3699FF',
                  '&:hover': { backgroundColor: '#2680d6' }, py: 1.5, px: 4
                }}
                disabled={changePasswordMutation.isPending}
              >
                {changePasswordMutation.isPending ? <CircularProgress size={24} color="inherit" /> : 'Alterar Senha'}
              </Button>
            </Box>
          </Box>
          <Divider sx={{ my: 4 }} />
        </>
      )}

      {/* --- SECÇÃO ELIMINAR CONTA --- */}
      <Box sx={{ p: { xs: 2, sm: 3 } }}>
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

      {/* --- DIALOG: CONFIRMAÇÃO ELIMINAR CONTA --- */}
      <Dialog open={openDeleteConfirm} onClose={handleCloseDeleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{ backgroundColor: 'error.main', color: 'white' }}>Confirmação de eliminação de conta</DialogTitle>
        <DialogContent sx={{ pt: '20px !important' }}>
          <DialogContentText sx={{ mb: 2 }}>
            Tem a certeza absoluta de que deseja eliminar a sua conta? Todos os seus dados serão removidos permanentemente. Esta opção não pode ser revertida.
            {user.auth_provider === 'local' && (
              <>
                <br /><br />
                Por favor insira a sua senha para confirmação.
              </>
            )}
          </DialogContentText>

          {user.auth_provider === 'local' && (
            <TextField
              autoFocus
              margin="dense"
              id="deletePassword"
              label="Sua senha"
              type="password"
              fullWidth
              variant="outlined"
              value={deletePassword}
              onChange={(e) => setDeletePassword(e.target.value)}
              disabled={deleteAccountMutation.isPending}
              autoComplete="current-password"
            />
          )}

          {deleteAccountErrorDialog && (
            <Alert severity="error" sx={{ mt: 2 }}>
              {deleteAccountErrorDialog}
            </Alert>
          )}
        </DialogContent>
        <DialogActions sx={{ pb: 2, pr: 2 }}>
          <Button onClick={handleCloseDeleteDialog} disabled={deleteAccountMutation.isPending} color="inherit">Cancelar</Button>
          <Button onClick={handleConfirmDeleteAccount} color="error" variant="contained" disabled={deleteAccountMutation.isPending}>
            {deleteAccountMutation.isPending ? <CircularProgress size={24} color="inherit" /> : 'Eliminar conta'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* --- DIALOG: SETUP MFA --- */}
      <Dialog open={openMfaModal} onClose={() => setOpenMfaModal(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Configurar Autenticação de 2 Fatores</DialogTitle>
        <DialogContent sx={{ textAlign: 'center', py: 2 }}>
            <DialogContentText sx={{ mb: 2 }}>
                1. Abra a sua aplicação de autenticação (Google Authenticator, Authy, etc).<br/>
                2. Leia o QR Code abaixo.
            </DialogContentText>
            
            {mfaData.qr_code && (
                <Box sx={{ my: 2, p: 2, border: '1px solid #eee', borderRadius: 2, display: 'inline-block' }}>
                    <img 
                        src={`data:image/png;base64,${mfaData.qr_code}`} 
                        alt="QR Code MFA" 
                        style={{ width: 200, height: 200 }} 
                    />
                </Box>
            )}
            
            {mfaData.secret && (
                <Typography variant="body2" sx={{ mt: 1, mb: 2, fontFamily: 'monospace', bgcolor: 'grey.100', p: 1, borderRadius: 1 }}>
                    Código secreto (backup): {mfaData.secret}
                </Typography>
            )}

            <DialogContentText sx={{ mb: 1 }}>
                3. Insira o código de 6 dígitos gerado pela aplicação:
            </DialogContentText>
            
            <TextField
                autoFocus
                margin="dense"
                id="mfaCode"
                label="Código 2FA (6 dígitos)"
                type="text"
                fullWidth
                variant="outlined"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value)}
                inputProps={{ maxLength: 6, style: { textAlign: 'center', letterSpacing: 4, fontSize: '1.2rem' } }}
            />
            
            {mfaError && <Alert severity="error" sx={{ mt: 2 }}>{mfaError}</Alert>}
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setOpenMfaModal(false)} color="inherit">Cancelar</Button>
            <Button onClick={handleActivateMfa} variant="contained" disabled={!mfaCode || isMfaLoading}>
                {isMfaLoading ? <CircularProgress size={20} color="inherit" /> : "Confirmar e Ativar"}
            </Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
}

export default SettingsPage;