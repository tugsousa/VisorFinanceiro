// src/features/upload/pages/UploadPage.js
import React, { useState, useCallback } from 'react';
import { useAuth } from '../../auth/AuthContext';
import { usePortfolio } from '../../portfolio/PortfolioContext';
// Update API path: go up 3 levels instead of 1
import { apiUploadFile } from '../../../lib/api'; 
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '../../../constants';
import { Typography, Box, Button, LinearProgress, Paper, Alert, Modal, IconButton, Link as MuiLink, CircularProgress } from '@mui/material';
import { useQueryClient } from '@tanstack/react-query';
import { CheckCircleOutline as CheckCircleIcon, ErrorOutline as ErrorIcon, Close as CloseIcon } from '@mui/icons-material';
import IBKRGuidePage from './IBKRGuidePage';
import DEGIROGuidePage from './DEGIROGuidePage';
import logger from '../../../lib/utils/logger';
import UploadDropzone from '../components/UploadDropzone'; // Import the new component

const modalStyle = {
  // ... (keep modalStyle as is)
  position: 'absolute',
  top: '50%',
  left: '50%',
  transform: 'translate(-50%, -50%)',
  width: { xs: '95%', md: '70%' },
  maxWidth: 900,
  bgcolor: 'background.paper',
  boxShadow: 24,
  p: 4,
  borderRadius: 2,
  maxHeight: '90vh',
  overflowY: 'auto'
};

const uploadWithRetry = async (formData, onUploadProgress) => {
    // ... (keep uploadWithRetry logic as is)
    const MAX_ATTEMPTS = 2;
    let lastError = null;

    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        try {
            logger.log(`Upload attempt ${attempt}...`);
            const response = await apiUploadFile(formData, onUploadProgress);
            return response;
        } catch (err) {
            lastError = err;
            logger.error(`Upload attempt ${attempt} failed:`, err);
            
            if (err.response && err.response.status < 500) {
                throw lastError;
            }

            if (attempt < MAX_ATTEMPTS) {
                logger.log("Waiting 1 second before retrying...");
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
        }
    }
    throw lastError;
};

const UploadPage = () => {
    const { token, refreshUserDataCheck } = useAuth();
    const { activePortfolio } = usePortfolio();
    const queryClient = useQueryClient();

    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState('idle');
    const [fileError, setFileError] = useState(null);
    // REMOVED: isDragActive, setIsDragActive, fileInputRef (handled in Dropzone now)
    
    const [guideModal, setGuideModal] = useState(null);
    const handleOpenGuide = (broker) => setGuideModal(broker);
    const handleCloseGuide = () => setGuideModal(null);

    const resetState = () => {
        setSelectedFile(null);
        setUploadProgress(0);
        setUploadStatus('idle');
        setFileError(null);
        // Note: Resetting file input is handled inside Dropzone or by remounting
    };
    
    const handleFileSelected = useCallback(async (file) => {
        resetState();
        if (!file) return;

        if (!activePortfolio) {
            setFileError('Selecione um portfólio ativo antes de carregar ficheiros.');
            setUploadStatus('error');
            return;
        }

        const fileName = file.name.toLowerCase();
        const isCsv = fileName.endsWith('.csv');
        const isXml = fileName.endsWith('.xml');
        const brokerType = isCsv ? 'degiro' : (isXml ? 'ibkr' : null);

        if (!brokerType) {
            setFileError('Tipo de ficheiro inválido. Por favor, carregue um ficheiro .csv (Degiro) ou .xml (IBKR).');
            setUploadStatus('error');
            return;
        }

        if (file.size > MAX_FILE_SIZE_BYTES) {
            setFileError(`O tamanho do ficheiro excede o limite de ${MAX_FILE_SIZE_MB}MB.`);
            setUploadStatus('error');
            return;
        }

        setSelectedFile(file);
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('source', brokerType);
        formData.append('portfolio_id', activePortfolio.id);

        try {
            setUploadStatus('uploading');
            setFileError(null);

            await uploadWithRetry(formData, (progressEvent) => {
                if (progressEvent.total) {
                    const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
                    setUploadProgress(progress);
                    if (progress === 100) {
                        setUploadStatus('processing');
                    }
                }
            });

            setUploadStatus('success');
            await queryClient.invalidateQueries();
            await refreshUserDataCheck();

        } catch (err) {
            setUploadStatus('error');
            setFileError(err.response?.data?.error || err.message || 'Falha no carregamento. Por favor tente de novo.');
        }
    }, [token, queryClient, refreshUserDataCheck, activePortfolio]);

    // REMOVED: handleDragEnter, handleDragLeave, handleDragOver, handleDrop, handleFileInputChange

    return (
        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: '800px', margin: 'auto' }}>
            {/* ... Keep Title and Description ... */}
            <Typography variant="h4" component="h1" gutterBottom align="center">
                Carregar Transações
            </Typography>
            
            {activePortfolio && (
                <Typography variant="subtitle1" align="center" color="primary" sx={{ mb: 1, fontWeight: 'bold' }}>
                    Portfólio Ativo: {activePortfolio.name}
                </Typography>
            )}

            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 1 }}>
                Arraste e solte o seu ficheiro de transações abaixo para começar o processamento automático.
            </Typography>
            <Typography align="center" sx={{ mb: 4 }}>
                Não sabes como obter o ficheiro? Segue o guia para a{' '}
                <MuiLink component="button" variant="body2" onClick={() => handleOpenGuide('degiro')}>
                    Degiro
                </MuiLink>
                {' '}ou para a{' '}
                <MuiLink component="button" variant="body2" onClick={() => handleOpenGuide('ibkr')}>
                    Interactive Brokers
                </MuiLink>
                .
            </Typography>

            <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: '1px solid', borderColor: 'divider' }}>
                {uploadStatus === 'idle' && (
                    <UploadDropzone onFileSelected={handleFileSelected} />
                )}
                
                {/* ... Keep status states (uploading, processing, success, error) same as before ... */}
                {uploadStatus === 'uploading' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>A enviar {selectedFile?.name}...</Typography>
                        <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 10, borderRadius: 5 }} />
                        <Typography variant="body1" sx={{ mt: 1 }}>{uploadProgress}%</Typography>
                    </Box>
                )}

                {uploadStatus === 'processing' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>A processar as transações...</Typography>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Isto pode demorar um momento, especialmente em ficheiros grandes.</Typography>
                        <CircularProgress />
                    </Box>
                )}

                {uploadStatus === 'success' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <CheckCircleIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
                        <Typography variant="h6" color="success.main">Carregamento com sucesso</Typography>
                        <Typography sx={{ mb: 3 }}>As tuas transações foram processadas no portfólio <strong>{activePortfolio?.name}</strong>.</Typography>
                        <Button variant="outlined" onClick={resetState}>Carregar outro ficheiro</Button>
                    </Box>
                )}

                {uploadStatus === 'error' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <ErrorIcon color="error" sx={{ fontSize: 60, mb: 2 }} />
                        <Typography variant="h6" color="error.main">Carregamento falhou</Typography>
                        <Alert severity="error" sx={{ my: 2, textAlign: 'left' }}>{fileError}</Alert>
                        <Button variant="outlined" onClick={resetState}>Tente novamente</Button>
                    </Box>
                )}
            </Paper>

            <Modal
                open={guideModal !== null}
                onClose={handleCloseGuide}
                aria-labelledby="guide-modal-title"
                aria-describedby="guide-modal-description"
            >
                <Box sx={modalStyle}>
                    <IconButton
                        aria-label="close"
                        onClick={handleCloseGuide}
                        sx={{
                            position: 'absolute',
                            right: 12,
                            top: 12,
                            color: (theme) => theme.palette.grey[500],
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                    {guideModal === 'degiro' && <DEGIROGuidePage />}
                    {guideModal === 'ibkr' && <IBKRGuidePage />}
                </Box>
            </Modal>
        </Box>
    );
};

export default UploadPage;