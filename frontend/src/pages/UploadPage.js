// frontend/src/pages/UploadPage.js
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useProcessedTransactions } from '../hooks/useProcessedTransactions'; // Kept for refetch function
import { apiUploadFile } from '../api/apiService';
import './UploadPage.css';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, UI_TEXT } from '../constants';
import { Typography, Box, Button, LinearProgress, Paper, Alert } from '@mui/material'; // Removed Table specific imports

const UploadPage = () => {
  const { token } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [fileError, setFileError] = useState(null);
  
  // We still need the refetch function from the hook
  const { refetch: refetchProcessedTransactions } = useProcessedTransactions();

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
      refetchProcessedTransactions(); // Refetch transactions so the new page will have up-to-date data
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
          {uploadStatus === 'success' && <Alert severity="success" sx={{my:2}}>Upload completed successfully! Processed transactions can be viewed on the Transactions page.</Alert>}

          <Button
            variant="contained"
            onClick={handleUpload}
            disabled={uploadStatus === 'uploading' || !selectedFile || !token}
          >
            {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload'}
          </Button>
        </Box>
      </Paper>

      {/* The section displaying processed transactions has been removed from this page. */}
      
    </Box>
  );
};

export default UploadPage;