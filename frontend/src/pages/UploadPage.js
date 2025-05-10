// frontend/src/pages/UploadPage.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProcessedTransactions } from '../hooks/useProcessedTransactions';
import { apiUploadFile } from '../api/apiService';
import './UploadPage.css';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, UI_TEXT } from '../constants';
import { Typography, Box, Button, LinearProgress, Paper, Alert, TableContainer, Table, TableHead, TableRow, TableCell, TableBody } from '@mui/material';

const UploadPage = () => {
  const { token } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [fileError, setFileError] = useState(null);
  
  const { 
    transactions: processedTransactions, 
    loading: transactionsLoading, 
    error: transactionsError,
    refetch: refetchProcessedTransactions 
  } = useProcessedTransactions();

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
        setSelectedFile(null);
        setFileError(null);
        return;
    }
    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setFileError(`Invalid file type. Please upload a CSV file. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`);
      setSelectedFile(null);
      return;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`File size too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      setSelectedFile(null);
      return;
    }
    setSelectedFile(file);
    setFileError(null);
    setUploadStatus('idle');
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setFileError('Please select a file first');
      return;
    }
    if (!token) {
      setFileError(UI_TEXT.userNotAuthenticated);
      return;
    }
    const formData = new FormData();
    formData.append('file', selectedFile);
    try {
      setUploadStatus('uploading');
      setUploadProgress(0);
      setFileError(null);
      
      const response = await apiUploadFile(formData, (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      setUploadStatus('success');
      console.log('Upload successful:', response.data);
      refetchProcessedTransactions();
      setSelectedFile(null); 
      const fileInput = document.getElementById('file-input-upload-page');
      if (fileInput) fileInput.value = '';
    } catch (err) {
      setUploadStatus('error');
      setFileError(err.response?.data?.error || err.message || 'Upload failed. Please try again.');
      console.error('Upload error:', err);
    }
  };
 
  return (
    <Box className="upload-container" sx={{ p: {xs: 2, sm: 3} }}>
      <Typography variant="h4" component="h1" gutterBottom>Upload Tax Documents</Typography>
      <Paper elevation={3} sx={{ p: {xs: 2, sm: 3}, mb: 3 }}>
        <Box component="form" noValidate autoComplete="off" className="upload-form">
          <input
            id="file-input-upload-page"
            type="file"
            onChange={handleFileChange}
            accept={ALLOWED_FILE_TYPES.map(type => `.${type.split('/')[1]}`).join(',')}
            style={{ display: 'block', marginBottom: '16px', width: '100%', padding: '8px', boxSizing: 'border-box' }}
          />
          
          {selectedFile && (
            <Box className="file-info" sx={{my: 2, p:1, bgcolor: 'grey.100', borderRadius:1}}>
              <Typography variant="body2">Selected file: {selectedFile.name}</Typography>
              <Typography variant="body2">Size: {(selectedFile.size / 1024).toFixed(2)} KB</Typography>
            </Box>
          )}

          {uploadStatus === 'uploading' && (
            <Box className="progress-container" sx={{ my: 2 }}>
              <LinearProgress variant="determinate" value={uploadProgress} />
              <Typography variant="caption" display="block" align="center">{uploadProgress}%</Typography>
            </Box>
          )}
          
          {fileError && <Alert severity="error" sx={{my:2}}>{fileError}</Alert>}
          {uploadStatus === 'success' && <Alert severity="success" sx={{my:2}}>Upload completed successfully! Transactions updated.</Alert>}

          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={uploadStatus === 'uploading' || !selectedFile || !token}
          >
            {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload'}
          </Button>
        </Box>
      </Paper>

      {transactionsLoading && <Typography sx={{my:2, textAlign: 'center'}}>Loading transactions...</Typography>}
      {transactionsError && <Alert severity="error" sx={{my:2}}>{transactionsError}</Alert>}
      
      {!transactionsLoading && !transactionsError && processedTransactions.length > 0 && (
        <Paper elevation={3} sx={{p:{xs:1, sm:2}}} className="processed-transactions">
          <Typography variant="h5" component="h3" gutterBottom>Processed Transactions</Typography>
          <Typography variant="body2" sx={{mb:1}}>These transactions have been processed and stored in the database.</Typography>
          <TableContainer component={Paper} className="transactions-table-container">
            <Table stickyHeader size="small" aria-label="processed transactions table">
              <TableHead>
                <TableRow>
                  <TableCell>Date</TableCell>
                  <TableCell>Product</TableCell>
                  <TableCell>ISIN</TableCell>
                  <TableCell>Type</TableCell>
                  <TableCell align="right">Qty</TableCell>
                  <TableCell align="right">Price</TableCell>
                  <TableCell align="right">Amount</TableCell>
                  <TableCell>Currency</TableCell>
                  <TableCell align="right">Commission</TableCell>
                  <TableCell align="right">Amount EUR</TableCell>
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
        </Paper>
      )}
       {!transactionsLoading && !transactionsError && processedTransactions.length === 0 && token && (
         <Typography sx={{ textAlign: 'center', mt: 2 }}>No processed transactions found.</Typography>
       )}
    </Box>
  );
};

export default UploadPage;