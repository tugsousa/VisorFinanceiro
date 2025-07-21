// frontend/src/pages/UploadPage.js
import React, { useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUploadFile } from '../api/apiService';
import { MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB } from '../constants';
import { Typography, Box, Button, LinearProgress, Paper, Alert, Modal, IconButton, Link as MuiLink } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import { UploadFile as UploadFileIcon, CheckCircleOutline as CheckCircleIcon, ErrorOutline as ErrorIcon, Close as CloseIcon } from '@mui/icons-material';
import IBKRGuidePage from './IBKRGuidePage';
import DEGIROGuidePage from './DEGIROGuidePage'; // Importar o novo guia

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

const modalStyle = {
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

const UploadPage = () => {
    const { token, refreshUserDataCheck } = useAuth();
    const queryClient = useQueryClient();

    const [selectedFile, setSelectedFile] = useState(null);
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState('idle');
    const [fileError, setFileError] = useState(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const fileInputRef = useRef(null);
    
    // Estado para controlar qual guia é mostrado
    const [guideModal, setGuideModal] = useState(null); // pode ser 'degiro', 'ibkr' ou null
    const handleOpenGuide = (broker) => setGuideModal(broker);
    const handleCloseGuide = () => setGuideModal(null);

    const resetState = () => {
        setSelectedFile(null);
        setUploadProgress(0);
        setUploadStatus('idle');
        setFileError(null);
        if(fileInputRef.current) {
            fileInputRef.current.value = "";
        }
    };
    
    const handleFileSelected = useCallback(async (file) => {
        resetState();
        if (!file) return;

        const fileName = file.name.toLowerCase();
        const isCsv = fileName.endsWith('.csv');
        const isXml = fileName.endsWith('.xml');

        if (!isCsv && !isXml) {
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
        
        const brokerType = isCsv ? 'degiro' : 'ibkr';
        const formData = new FormData();
        formData.append('file', file);
        formData.append('source', brokerType);

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
            await queryClient.invalidateQueries();
            await refreshUserDataCheck();

        } catch (err) {
            setUploadStatus('error');
            setFileError(err.response?.data?.error || err.message || 'Falha no carregamento. Por favor tente de novo.');
        }
    }, [token, queryClient, refreshUserDataCheck]);

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    
    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            handleFileSelected(e.dataTransfer.files[0]);
        }
    }, [handleFileSelected]);

    const handleFileInputChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            handleFileSelected(e.target.files[0]);
        }
    };

    return (
        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: '800px', margin: 'auto' }}>
            <Typography variant="h4" component="h1" gutterBottom align="center">
                Carregar Transações
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 1 }}>
                Arraste e solte o seu ficheiro de transações abaixo para começar o processamento automático.
            </Typography>
            {/* Links para os guias */}
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
                            onChange={handleFileInputChange}
                            accept=".csv,.xml"
                        />
                        <UploadFileIcon sx={{ fontSize: 50, mb: 2 }} />
                        <Typography variant="h6">Arraste e solte o seu ficheiro aqui</Typography>
                        <Typography>ou clique para selecionar o ficheiro</Typography>
                        <Typography variant="caption" sx={{ mt: 1 }}>Tipos suportados: CSV (Degiro), XML (IBKR) | Limite: {MAX_FILE_SIZE_MB}MB</Typography>
                    </UploadDropzone>
                )}
                
                {uploadStatus === 'uploading' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>A carregar {selectedFile?.name}...</Typography>
                        <LinearProgress variant="determinate" value={uploadProgress} sx={{ height: 10, borderRadius: 5 }} />
                        <Typography variant="body1" sx={{ mt: 1 }}>{uploadProgress}%</Typography>
                    </Box>
                )}

                {uploadStatus === 'success' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <CheckCircleIcon color="success" sx={{ fontSize: 60, mb: 2 }} />
                        <Typography variant="h6" color="success.main">Carregamento com sucesso</Typography>
                        <Typography sx={{ mb: 3 }}>As tuas transações foram processadas.</Typography>
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

            {/* Modal para os guias */}
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