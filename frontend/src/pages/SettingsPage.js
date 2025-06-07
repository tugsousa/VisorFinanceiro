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
      setChangePasswordSuccess(data.data.message || 'Password changed successfully!');
    },
    onError: (error) => {
      setChangePasswordSuccess('');
      setChangePasswordError(error.response?.data?.error || error.message || 'Failed to change password.');
    }
  });

  const deleteAccountMutation = useMutation({
    mutationFn: (password) => apiDeleteAccount(password),
    onSuccess: async () => {
      setOpenDeleteConfirm(false);
      setDeletePassword(''); // Clear password field
      setDeleteAccountErrorDialog(''); // Clear dialog error
      alert('Account deleted successfully. You will be logged out.'); // Notify user
      await performLogout(false, "Account deleted by user");
      navigate('/signin');
    },
    onError: (error) => {
      setDeleteAccountErrorDialog(error.response?.data?.error || error.message || 'Failed to delete account. Password may be incorrect.');
      // Keep dialog open to show error
    }
  });


  const handleSubmitChangePassword = async (e) => {
    e.preventDefault();
    setChangePasswordError('');
    setChangePasswordSuccess('');

    if (newPassword !== confirmNewPassword) {
      setChangePasswordError("New passwords do not match.");
      return;
    }
    if (newPassword.length < 6) {
      setChangePasswordError("New password must be at least 6 characters long.");
      return;
    }
    if (!currentPassword) {
      setChangePasswordError("Current password is required.");
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
        setDeleteAccountErrorDialog("Please enter your password to confirm account deletion.");
        return;
    }
    await fetchCsrfToken(true); // Ensure CSRF token is fresh
    deleteAccountMutation.mutate(deletePassword);
  };

  return (
    <Container maxWidth="md" sx={{ mt: {xs: 2, sm: 4}, mb: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom sx={{ textAlign: {xs: 'center', sm: 'left'} }}>
        Account Settings
      </Typography>

      {/* Change Password Section */}
      <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, mb: 4 }}>
        <Typography variant="h6" component="h2" gutterBottom>
          Change Password
        </Typography>
        {changePasswordError && (
          <Alert severity="error" sx={{ mb: 2 }}>{changePasswordError}</Alert>
        )}
        {changePasswordSuccess && (
           <Alert severity="success" sx={{ mb: 2 }}>{changePasswordSuccess}</Alert>
        )}
        <Box component="form" onSubmit={handleSubmitChangePassword} noValidate>
          <Grid container spacing={2}>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                name="currentPassword"
                label="Current Password"
                type="password"
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                autoComplete="current-password"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                name="newPassword"
                label="New Password (min. 6 characters)"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                autoComplete="new-password"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                required
                fullWidth
                name="confirmNewPassword"
                label="Confirm New Password"
                type="password"
                value={confirmNewPassword}
                onChange={(e) => setConfirmNewPassword(e.target.value)}
                disabled={changePasswordMutation.isPending}
                autoComplete="new-password"
              />
            </Grid>
          </Grid>
          <Button
            type="submit"
            variant="contained"
            sx={{ mt: 3, mb: 2 }}
            disabled={changePasswordMutation.isPending}
          >
            {changePasswordMutation.isPending ? <CircularProgress size={24} color="inherit" /> : 'Change Password'}
          </Button>
        </Box>
      </Paper>

      <Divider sx={{ my: 4 }} />

      {/* Delete Account Section */}
      <Paper elevation={2} sx={{ p: { xs: 2, sm: 3 }, borderColor: 'error.main', borderWidth: 1, borderStyle: 'solid' }}>
        <Typography variant="h6" component="h2" gutterBottom color="error.main">
          Danger Zone: Delete Account
        </Typography>
        <Typography variant="body2" sx={{ mb: 2 }}>
          Permanently delete your account and all associated data. This action cannot be undone.
        </Typography>
        <Button
          variant="outlined"
          color="error"
          onClick={handleOpenDeleteDialog}
          disabled={deleteAccountMutation.isPending}
        >
          Delete My Account
        </Button>
      </Paper>

      {/* Delete Account Confirmation Dialog */}
      <Dialog open={openDeleteConfirm} onClose={handleCloseDeleteDialog} maxWidth="xs" fullWidth>
        <DialogTitle sx={{backgroundColor: 'error.main', color: 'white'}}>Confirm Account Deletion</DialogTitle>
        <DialogContent sx={{pt: '20px !important' }}> {/* Add padding top for content */}
          <DialogContentText sx={{ mb:2 }}>
            Are you absolutely sure you want to delete your account? All your data will be permanently removed. This action cannot be undone.
            <br/><br/>
            Please enter your password to confirm.
          </DialogContentText>
          <TextField
            autoFocus
            margin="dense"
            id="deletePassword"
            label="Your Password"
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
          <Button onClick={handleCloseDeleteDialog} disabled={deleteAccountMutation.isPending} color="inherit">Cancel</Button>
          <Button onClick={handleConfirmDeleteAccount} color="error" variant="contained" disabled={deleteAccountMutation.isPending}>
            {deleteAccountMutation.isPending ? <CircularProgress size={24} color="inherit"/> : 'Delete Account'}
          </Button>
        </DialogActions>
      </Dialog>
    </Container>
  );
}

export default SettingsPage;