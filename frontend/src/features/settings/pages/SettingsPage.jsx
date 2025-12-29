import React, { useState, useContext } from 'react';
import {
  Container, Box, Typography, TextField, Button, Alert,
  CircularProgress, Divider, Dialog, DialogActions,
  DialogContent, DialogContentText, DialogTitle
} from '@mui/material';
import { useMutation } from '@tanstack/react-query';
import { apiChangePassword, apiDeleteAccount } from 'features/auth/api/authApi';
import { apiSetupMfa, apiActivateMfa, apiDisableMfa } from '../../admin/api/adminApi'; 
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

  // --- States: MFA (2FA) Setup ---
  const [openMfaModal, setOpenMfaModal] = useState(false);
  const [mfaData, setMfaData] = useState({ secret: '', qr_code: '' });
  const [mfaCode, setMfaCode] = useState('');
  const [mfaError, setMfaError] = useState('');
  const [isMfaLoading, setIsMfaLoading] = useState(false);

  // --- States: MFA Disable/Reset ---
  const [openDisableMfaModal, setOpenDisableMfaModal] = useState(false);
  const [mfaDisablePassword, setMfaDisablePassword] = useState('');
  const [mfaDisableError, setMfaDisableError] = useState('');
  const [isMfaDisabling, setIsMfaDisabling] = useState(false);
  
  // Regex for strong password
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[\W_]).{8,}$/;

  // --- Mutations ---
  const changePasswordMutation = useMutation({
    mutationFn: (data) => apiChangePassword(data.currentPassword, data.newPassword, data.confirmNewPassword),
    onSuccess: (data) => {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmNewPassword('');
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
      alert('Conta eliminada com sucesso.');
      await performLogout(false);
      navigate('/signin');
    },
    onError: (error) => {
      setDeleteAccountErrorDialog(error.response?.data?.error || error.message);
    }
  });

  // --- Handlers: MFA Setup ---
  const handleStartMfaSetup = async () => {
    setIsMfaLoading(true);
    try {
        const res = await apiSetupMfa();
        setMfaData(res.data);
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
        
        // Atualiza o contexto local IMEDIATAMENTE após sucesso
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

  // --- Handlers: MFA Disable/Reset ---
  const handleDisableMfa = async () => {
    setMfaDisableError('');
    setIsMfaDisabling(true);

    try {
        // Ensure CSRF token is fresh before sensitive action
        await fetchCsrfToken(true);

        // Determine payload based on auth provider
        // If Google user, password is null/ignored by backend logic for this flow, 
        // but we send what we have.
        const passwordToSend = user.auth_provider === 'local' ? mfaDisablePassword : null;

        await apiDisableMfa(passwordToSend);

        // 1. Update Local State to reflect MFA is off
        if (updateUserLocal) updateUserLocal({ mfa_enabled: false });

        // 2. Close Disable Modal & Cleanup
        setOpenDisableMfaModal(false);
        setMfaDisablePassword('');

        // 3. Immediately trigger Setup Flow to force re-secure
        await handleStartMfaSetup();

    } catch (err) {
        if (err.response?.status === 403) {
            setMfaDisableError("Password incorreta.");
        } else {
            setMfaDisableError(err.response?.data?.error || "Erro ao desativar MFA.");
        }
    } finally {
        setIsMfaDisabling(false);
    }
  };

  // --- Handlers: Password & Delete ---
  const handleSubmitChangePassword = async (e) => {
    e.preventDefault();
    setChangePasswordError('');
    setChangePasswordSuccess('');

    if (newPassword !== confirmNewPassword) return setChangePasswordError("Passwords não coincidem.");
    
    if (!passwordRegex.test(newPassword)) {
        return setChangePasswordError("A senha deve ter no mínimo 8 caracteres, 1 maiúscula, 1 minúscula, 1 número e 1 símbolo.");
    }
    
    if (!currentPassword) return setChangePasswordError("Password atual obrigatória.");
    
    await fetchCsrfToken(true);
    changePasswordMutation.mutate({ currentPassword, newPassword, confirmNewPassword });
  };

  const handleConfirmDeleteAccount = async () => {
    setDeleteAccountErrorDialog('');
    await fetchCsrfToken(true);
    deleteAccountMutation.mutate(user.auth_provider === 'local' ? deletePassword : '');
  };

  return (
    <Container maxWidth="md" sx={{ mt: { xs: 2, sm: 4 }, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>Configurações</Typography>

      {/* --- SECÇÃO MFA (Admins) --- */}
      {user.is_admin && (
        <>
            <Box sx={{ p: 3, mb: 4, bgcolor: 'background.paper', border: 1, borderColor: 'divider', borderRadius: 1 }}>
                <Typography variant="h6" gutterBottom>Segurança de Administrador (2FA)</Typography>
                
                {user.mfa_enabled ? (
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 2 }}>
                        <Alert severity="success" sx={{ flexGrow: 1 }}>
                            A autenticação de dois fatores (MFA) está <strong>Ativa</strong>.
                        </Alert>
                        <Button 
                            variant="outlined" 
                            color="warning" 
                            onClick={() => setOpenDisableMfaModal(true)}
                        >
                            Redefinir 2FA
                        </Button>
                    </Box>
                ) : (
                    <>
                        <Alert severity="warning" sx={{ mb: 2 }}>
                            O 2FA não está ativo. Ative-o para usar funcionalidades de segurança.
                        </Alert>
                        <Button variant="contained" onClick={handleStartMfaSetup} disabled={isMfaLoading}>
                            {isMfaLoading ? <CircularProgress size={24} /> : "Configurar 2FA agora"}
                        </Button>
                    </>
                )}
            </Box>
            <Divider sx={{ my: 4 }} />
        </>
      )}

      {/* --- Change Password (Local) --- */}
      {user.auth_provider === 'local' && (
        <Box sx={{ p: 3, mb: 4 }}>
            <Typography variant="h6" gutterBottom>Alterar Senha</Typography>
            {changePasswordError && <Alert severity="error" sx={{ mb: 2 }}>{changePasswordError}</Alert>}
            {changePasswordSuccess && <Alert severity="success" sx={{ mb: 2 }}>{changePasswordSuccess}</Alert>}
            
            <Box component="form" onSubmit={handleSubmitChangePassword}>
                <TextField label="Senha atual" type="password" fullWidth margin="dense" value={currentPassword} onChange={e => setCurrentPassword(e.target.value)} />
                <TextField label="Nova Senha" type="password" fullWidth margin="dense" value={newPassword} onChange={e => setNewPassword(e.target.value)} helperText="Min. 8 chars, 1 maiúscula, 1 minúscula, 1 número e 1 símbolo" />
                <TextField label="Confirmar Nova Senha" type="password" fullWidth margin="dense" value={confirmNewPassword} onChange={e => setConfirmNewPassword(e.target.value)} />
                <Button type="submit" variant="contained" sx={{ mt: 2 }} disabled={changePasswordMutation.isPending}>
                    Alterar Senha
                </Button>
            </Box>
            <Divider sx={{ my: 4 }} />
        </Box>
      )}

      {/* --- Delete Account --- */}
      <Box sx={{ p: 3 }}>
        <Typography variant="h6" color="error">Elimine a sua conta</Typography>
        <Button variant="outlined" color="error" onClick={() => setOpenDeleteConfirm(true)}>Eliminar conta</Button>
      </Box>

      {/* --- Dialog: Delete Account --- */}
      <Dialog open={openDeleteConfirm} onClose={() => setOpenDeleteConfirm(false)}>
        <DialogTitle>Eliminar Conta</DialogTitle>
        <DialogContent>
            <DialogContentText>Tem a certeza? Esta ação é irreversível.</DialogContentText>
            {user.auth_provider === 'local' && (
                <TextField autoFocus margin="dense" label="Sua senha" type="password" fullWidth value={deletePassword} onChange={e => setDeletePassword(e.target.value)} />
            )}
            {deleteAccountErrorDialog && <Alert severity="error" sx={{ mt: 2 }}>{deleteAccountErrorDialog}</Alert>}
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setOpenDeleteConfirm(false)}>Cancelar</Button>
            <Button onClick={handleConfirmDeleteAccount} color="error" variant="contained">Eliminar</Button>
        </DialogActions>
      </Dialog>

      {/* --- Dialog: MFA Setup --- */}
      <Dialog open={openMfaModal} onClose={() => setOpenMfaModal(false)}>
        <DialogTitle>Configurar 2FA</DialogTitle>
        <DialogContent sx={{ textAlign: 'center' }}>
            <DialogContentText>Leia o QR Code com a sua app de autenticação.</DialogContentText>
            {mfaData.qr_code && <img src={`data:image/png;base64,${mfaData.qr_code}`} alt="QR Code" style={{ width: 200 }} />}
            <Typography variant="caption" display="block" sx={{ my: 1, fontFamily: 'monospace' }}>Secret: {mfaData.secret}</Typography>
            <TextField label="Código (6 dígitos)" fullWidth margin="dense" value={mfaCode} onChange={e => setMfaCode(e.target.value)} inputProps={{ maxLength: 6, style: { textAlign: 'center' } }} />
            {mfaError && <Alert severity="error" sx={{ mt: 2 }}>{mfaError}</Alert>}
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setOpenMfaModal(false)}>Cancelar</Button>
            <Button onClick={handleActivateMfa} variant="contained" disabled={!mfaCode}>Ativar</Button>
        </DialogActions>
      </Dialog>

      {/* --- Dialog: MFA Reset/Disable Confirmation --- */}
      <Dialog open={openDisableMfaModal} onClose={() => setOpenDisableMfaModal(false)}>
        <DialogTitle>Redefinir 2FA</DialogTitle>
        <DialogContent>
            <DialogContentText sx={{ mb: 2 }}>
                Tem a certeza que deseja redefinir a sua configuração de 2FA? 
                Isto irá desativar a proteção atual e pedir-lhe para configurar um novo dispositivo imediatamente.
            </DialogContentText>
            
            {/* Show Password Input only for Local Users */}
            {user.auth_provider === 'local' && (
                <TextField 
                    autoFocus 
                    margin="dense" 
                    label="Confirme a sua senha" 
                    type="password" 
                    fullWidth 
                    value={mfaDisablePassword} 
                    onChange={e => setMfaDisablePassword(e.target.value)} 
                />
            )}
            
            {mfaDisableError && <Alert severity="error" sx={{ mt: 2 }}>{mfaDisableError}</Alert>}
        </DialogContent>
        <DialogActions>
            <Button onClick={() => setOpenDisableMfaModal(false)} disabled={isMfaDisabling}>Cancelar</Button>
            <Button 
                onClick={handleDisableMfa} 
                color="warning" 
                variant="contained" 
                disabled={isMfaDisabling || (user.auth_provider === 'local' && !mfaDisablePassword)}
            >
                {isMfaDisabling ? <CircularProgress size={24} color="inherit" /> : "Redefinir e Reconfigurar"}
            </Button>
        </DialogActions>
      </Dialog>

    </Container>
  );
}

export default SettingsPage;