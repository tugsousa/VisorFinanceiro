// frontend/src/pages/UploadPage.js
import React, { useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUploadFile } from '../api/apiService';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, UI_TEXT } from '../constants';
import { Typography, Box, Button, LinearProgress, Paper, Alert, Chip } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import { UploadFile as UploadFileIcon, CheckCircleOutline as CheckCircleIcon, ErrorOutline as ErrorIcon } from '@mui/icons-material';

// Create a styled component for the dropzone for cleaner code
const UploadDropzone = styled(Box)(({ theme, isDragActive }) => ({
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'center',
  justifyContent: 'center',
  padding: theme.spacing(4),
  border: `2px dashed ${isDragActive ? theme.palette.primary.main : theme.palette.divider}`,
  borderRadius: theme.shape.borderRadius,
  backgroundColor: isDragActive ? theme.palette.action.hover : theme.palette.background.default,
  color: theme.palette.text.secondary,
  transition: 'border-color 0.3s, background-color 0.3s',
  cursor: 'pointer',
  textAlign: 'center',
  minHeight: 200,
}));

const UploadPage = () => {
  const { token, refreshUserDataCheck } = useAuth();
  const queryClient = useQueryClient();
  
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // 'idle', 'uploading', 'success', 'error'
  const [fileError, setFileError] = useState(null);
  const [isDragActive, setIsDragActive] = useState(false);
  
  // Ref for the hidden file input
  const fileInputRef = useRef(null);

  const resetState = () => {
    setSelectedFile(null);
    setUploadProgress(0);
    setUploadStatus('idle');
    setFileError(null);
  };

  const handleFileValidation = useCallback((file) => {
    if (!file) return false;

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setFileError(`Tipo de ficheiro inválido. Por vafor carrega um ficheiro do tipo CSV.`);
      return false;
    }
    if (file.size > MAX_FILE_SIZE_BYTES) {
      setFileError(`O tamanho do ficheiro excede o limite de ${MAX_FILE_SIZE_MB}MB.`);
      return false;
    }
    return true;
  }, []);
  
  const handleFileChange = useCallback((files) => {
    resetState();
    const file = files?.[0];
    if (handleFileValidation(file)) {
      setSelectedFile(file);
    }
  }, [handleFileValidation]);

  // Drag and Drop Handlers
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);
    handleFileChange(e.dataTransfer.files);
  };

  const handleUpload = async () => {
    if (!selectedFile || !token) {
      setFileError(UI_TEXT.userNotAuthenticated);
      return;
    }
    
    const formData = new FormData();
    formData.append('file', selectedFile);
    
    try {
      setUploadStatus('uploading');
      setFileError(null);
      
      await apiUploadFile(formData, (progressEvent) => {
        if (progressEvent.total) {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        }
      });

      setUploadStatus('success');
      // Invalidate queries to trigger refetching of data across the app
      await queryClient.invalidateQueries();
      await refreshUserDataCheck();

    } catch (err) {
      setUploadStatus('error');
      setFileError(err.response?.data?.error || err.message || 'Falha no carregamento. Por favor tente de novo.');
    }
  };
 
  return (
    <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: '800px', margin: 'auto' }}>
      <Typography variant="h4" component="h1" gutterBottom align="center">
        Carregar Transações
      </Typography>
      <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
        Carrega o histórico de transações da tua corretora. Atualmente apenas ficheiros CSV são suportados.
      </Typography>

      <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: '1px solid', borderColor: 'divider' }}>
        
        {/* State: IDLE - Show Dropzone */}
        {uploadStatus === 'idle' && !selectedFile && (
          <UploadDropzone
            isDragActive={isDragActive}
            onDragEnter={handleDragEnter}
            onDragLeave={handleDragLeave}
            onDragOver={handleDragOver}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <input
              ref={fileInputRef}
              type="file"
              hidden
              onChange={(e) => handleFileChange(e.target.files)}
              accept={ALLOWED_FILE_TYPES.join(',')}
            />
            <UploadFileIcon sx={{ fontSize: 50, mb: 2 }} />
            <Typography variant="h6">Arrasta e solta o teu ficheiro CSV aqui</Typography>
            <Typography>ou clica para selecionar o ficheiro</Typography>
            <Typography variant="caption" sx={{ mt: 1 }}>Limite de tamanho: {MAX_FILE_SIZE_MB}MB</Typography>
          </UploadDropzone>
        )}

        {/* State: FILE SELECTED - Show preview and upload button */}
        {uploadStatus === 'idle' && selectedFile && (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Ficheiro pronto para o carregamento</Typography>
            <Chip
              icon={<UploadFileIcon />}
              label={`${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`}
              onDelete={resetState}
              color="primary"
              sx={{ p: 2, fontSize: '1rem' }}
            />
            <Box sx={{ mt: 3 }}>
              <Button variant="contained" size="large" onClick={handleUpload}>
                Carregar ficheiro
              </Button>
            </Box>
          </Box>
        )}

        {/* State: UPLOADING */}
        {uploadStatus === 'uploading' && (
          <Box sx={{ textAlign: 'center' }}>
            <Typography variant="h6" sx={{ mb: 2 }}>Carregando...</Typography>
            <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 10, borderRadius: 5 }} />
            <Typography variant="body1" sx={{ mt: 1 }}>{uploadProgress}%</Typography>
          </Box>
        )}
        
        {/* State: SUCCESS */}
        {uploadStatus === 'success' && (
          <Box sx={{ textAlign: 'center' }}>
            <CheckCircleIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h6" color="success.main">Carregamento com sucesso</Typography>
            <Typography sx={{ mb: 3 }}>As tuas transações foram processadas.</Typography>
            <Button variant="outlined" onClick={resetState}>Carrega outro ficheiro</Button>
          </Box>
        )}

        {/* State: ERROR */}
        {uploadStatus === 'error' && (
          <Box sx={{ textAlign: 'center' }}>
            <ErrorIcon color="error" sx={{ fontSize: 60, mb: 2 }} />
            <Typography variant="h6" color="error.main">Carregamento falhou</Typography>
            <Alert severity="error" sx={{ my: 2, textAlign: 'left' }}>{fileError}</Alert>
            <Button variant="outlined" onClick={resetState}>Por favor tente de novo</Button>
          </Box>
        )}
        
        {/* Universal File Error (for initial selection validation) */}
        {fileError && uploadStatus === 'idle' && (
            <Alert severity="error" sx={{ mt: 2 }}>{fileError}</Alert>
        )}
      </Paper>
    </Box>
  );
};

export default UploadPage;