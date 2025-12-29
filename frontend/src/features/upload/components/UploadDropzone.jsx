import React, { useState, useRef, useCallback } from 'react';
import { Box, Typography, Link as MuiLink } from '@mui/material';
import { styled } from '@mui/material/styles';
import { UploadFile as UploadFileIcon } from '@mui/icons-material';
import { MAX_FILE_SIZE_MB } from '../../../constants';

const DropzoneContainer = styled(Box)(({ theme, isDragActive }) => ({
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

const UploadDropzone = ({ onFileSelected }) => {
    const [isDragActive, setIsDragActive] = useState(false);
    const fileInputRef = useRef(null);

    const handleDragEnter = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(true); };
    const handleDragLeave = (e) => { e.preventDefault(); e.stopPropagation(); setIsDragActive(false); };
    const handleDragOver = (e) => { e.preventDefault(); e.stopPropagation(); };

    const handleDrop = useCallback((e) => {
        e.preventDefault();
        e.stopPropagation();
        setIsDragActive(false);
        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
            onFileSelected(e.dataTransfer.files[0]);
        }
    }, [onFileSelected]);

    const handleFileInputChange = (e) => {
        if (e.target.files && e.target.files.length > 0) {
            onFileSelected(e.target.files[0]);
        }
    };

    return (
        <DropzoneContainer
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
            />
            <UploadFileIcon sx={{ fontSize: 50, mb: 2 }} />
            <Typography variant="h6">Arraste e solte o seu ficheiro aqui</Typography>
            <Typography>ou clique para selecionar o ficheiro</Typography>
            <Typography variant="caption" sx={{ mt: 1 }}>
                Tipos suportados: CSV (Degiro), XML (IBKR) | Limite: {MAX_FILE_SIZE_MB}MB
                <br />
                Problemas no telemóvel? Se o ficheiro aparecer a cinzento, tente renomeá-lo para garantir que termina em .csv.
            </Typography>
        </DropzoneContainer>
    );
};

export default UploadDropzone;