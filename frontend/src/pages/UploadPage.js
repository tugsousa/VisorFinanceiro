// frontend/src/pages/UploadPage.js
import React, { useState, useCallback, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { apiUploadFile } from '../api/apiService';
import { ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, UI_TEXT } from '../constants';
import { Typography, Box, Button, LinearProgress, Paper, Alert, Chip } from '@mui/material';
import { styled } from '@mui/material/styles';
import { useQueryClient } from '@tanstack/react-query';
import { UploadFile as UploadFileIcon, CheckCircleOutline as CheckCircleIcon, ErrorOutline as ErrorIcon, Check as CheckIcon } from '@mui/icons-material';

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
    // --- REMOVED --- No longer need selectedBroker state here.
    const [uploadProgress, setUploadProgress] = useState(0);
    const [uploadStatus, setUploadStatus] = useState('idle');
    const [fileError, setFileError] = useState(null);
    const [isDragActive, setIsDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const resetState = () => {
        setSelectedFile(null);
        setUploadProgress(0);
        setUploadStatus('idle');
        setFileError(null);
    };

    const handleFileValidation = useCallback((file) => {
        if (!file) return false;
        if (![...ALLOWED_FILE_TYPES, 'text/xml', 'application/xml'].includes(file.type)) {
            setFileError(`Tipo de ficheiro inválido. Por favor, carregue um ficheiro CSV (Degiro) ou XML (IBKR).`);
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

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };
    const handleDrop = (e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        handleFileChange(e.dataTransfer.files);
    };

    // --- MODIFIED --- handleUpload now accepts brokerType as an argument
    const handleUpload = async (brokerType) => {
        if (!selectedFile || !token) {
            setFileError(UI_TEXT.userNotAuthenticated);
            return;
        }

        const formData = new FormData();
        formData.append('file', selectedFile);
        // --- MODIFIED --- Use the brokerType argument here
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
    };

    return (
        <Box sx={{ p: { xs: 2, sm: 3 }, maxWidth: '800px', margin: 'auto' }}>
            <Typography variant="h4" component="h1" gutterBottom align="center">
                Carregar Transações
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 4 }}>
                Arraste e solte o seu ficheiro de transações abaixo para começar.
            </Typography>

            <Paper elevation={0} sx={{ p: { xs: 2, sm: 3 }, border: '1px solid', borderColor: 'divider' }}>

                {/* --- UI STATE 1: Initial Drop Zone View --- */}
                {!selectedFile && uploadStatus === 'idle' && (
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
                            accept={[...ALLOWED_FILE_TYPES, '.xml'].join(',')}
                        />
                        <UploadFileIcon sx={{ fontSize: 50, mb: 2 }} />
                        <Typography variant="h6">Arraste e solte o seu ficheiro aqui</Typography>
                        <Typography>ou clique para selecionar o ficheiro</Typography>
                        <Typography variant="caption" sx={{ mt: 1 }}>Tipos suportados: CSV (Degiro), XML (IBKR) | Limite: {MAX_FILE_SIZE_MB}MB</Typography>
                    </UploadDropzone>
                )}
                
                {fileError && uploadStatus === 'idle' && (
                    <Alert severity="error" sx={{ mt: 2 }}>{fileError}</Alert>
                )}

                {/* --- UI STATE 2: File Selected, Awaiting Broker Choice --- */}
                {selectedFile && uploadStatus === 'idle' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>Ficheiro Selecionado</Typography>
                        <Chip
                            icon={<CheckIcon />}
                            label={`${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)`}
                            color="info"
                            sx={{ p: 2, fontSize: '1rem', mb: 3 }}
                        />
                        <Typography variant="body1" sx={{ mb: 2 }}>Como devemos processar este ficheiro?</Typography>
                        <Box sx={{ display: 'flex', justifyContent: 'center', gap: 2, flexWrap: 'wrap' }}>
                            <Button variant="contained" size="large" onClick={() => handleUpload('degiro')}>
                                Processar como DEGIRO
                            </Button>
                            <Button variant="contained" size="large" onClick={() => handleUpload('ibkr')}>
                                Processar como IBKR
                            </Button>
                        </Box>
                        <Button variant="text" onClick={resetState} sx={{ mt: 3 }}>
                          Cancelar
                        </Button>
                    </Box>
                )}


                {/* --- UI STATE 3: Uploading/Success/Error --- */}
                {uploadStatus === 'uploading' && (
                    <Box sx={{ textAlign: 'center' }}>
                        <Typography variant="h6" sx={{ mb: 2 }}>A carregar...</Typography>
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
        </Box>
    );
};

export default UploadPage;