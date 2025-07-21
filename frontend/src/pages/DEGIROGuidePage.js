import React, { useState } from 'react';
import { Box, Typography, List, ListItem, ListItemText, Divider, Modal, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const GuideStep = ({ number, title, text, imageUrls, onImageClick }) => (
    <ListItem sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', my: 2 }}>
        <Box>
            <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
                {number}. {title}
            </Typography>
            <ListItemText primary={text} />
        </Box>
        {imageUrls && imageUrls.length > 0 && (
            <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mt: 2, width: '100%', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
                {imageUrls.map((url, index) => (
                    <Box
                        key={index}
                        component="img"
                        src={url}
                        alt={`Passo ${number}, imagem ${index + 1}`}
                        onClick={() => onImageClick(url)}
                        sx={{
                            maxWidth: { xs: '80%', sm: '350px' },
                            width: 'auto',
                            height: 'auto',
                            borderRadius: 1,
                            boxShadow: 3,
                            cursor: 'pointer',
                            transition: 'transform 0.2s ease-in-out',
                            '&:hover': {
                                transform: 'scale(1.03)',
                                boxShadow: 6,
                            }
                        }}
                    />
                ))}
            </Box>
        )}
    </ListItem>
);

const imageModalStyle = {
    position: 'absolute',
    top: '50%',
    left: '50%',
    transform: 'translate(-50%, -50%)',
    bgcolor: 'transparent',
    boxShadow: 24,
    outline: 'none',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
};

const DEGIROGuidePage = () => {
    const [selectedImage, setSelectedImage] = useState(null);
    const isImageModalOpen = Boolean(selectedImage);

    const handleImageClick = (imageUrl) => {
        setSelectedImage(imageUrl);
    };

    const handleCloseImageModal = () => {
        setSelectedImage(null);
    };

    return (
        <Box>
            <Typography variant="h4" component="h1" gutterBottom align="center" id="degiro-guide-title">
                Guia: Como exportar transações da Degiro
            </Typography>
            <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }} id="degiro-guide-description">
                Segue estes passos para descarregar o ficheiro de transações no formato CSV.
            </Typography>
            <Divider />

            <List>
                <GuideStep
                    number="1"
                    title="Aceder ao Resumo da Carteira"
                    text="No menu principal da tua conta Degiro, navega até à secção 'Resumo da Carteira'."
                    imageUrls={["/DEGRO_1resumocarteira.png"]}
                    onImageClick={handleImageClick}
                />
                <Divider component="li" />
                <GuideStep
                    number="2"
                    title="Selecionar Período e Exportar"
                    text="Define o intervalo de datas que queres exportar para incluir todas as tuas transações. Depois, clica no botão 'Exportar'."
                    imageUrls={["/DEGRO_2exportar.png"]}
                    onImageClick={handleImageClick}
                />
                <Divider component="li" />
                <GuideStep
                    number="3"
                    title="Escolher o Formato e Fazer Download"
                    text="Na janela que aparece, seleciona o formato 'CSV'. Clica novamente em 'Exportar' para descarregar o ficheiro para o teu computador."
                />
                <Divider component="li" />
                <GuideStep
                    number="4"
                    title="Enviar para a RumoClaro"
                    text="Boa! Agora que já tens o ficheiro CSV, volta à página de upload da RumoClaro e envia o documento que descarregaste. Vamos tratar das tuas transações por ti."
                />
            </List>

            <Modal
                open={isImageModalOpen}
                onClose={handleCloseImageModal}
                aria-labelledby="image-modal-title"
                aria-describedby="image-modal-description"
                sx={{
                    backdropFilter: 'blur(4px)',
                }}
            >
                <Box sx={imageModalStyle}>
                    <IconButton
                        aria-label="Fechar imagem"
                        onClick={handleCloseImageModal}
                        sx={{
                            position: 'absolute',
                            top: 10,
                            right: 10,
                            color: 'white',
                            backgroundColor: 'rgba(0, 0, 0, 0.5)',
                            '&:hover': {
                                backgroundColor: 'rgba(0, 0, 0, 0.8)',
                            }
                        }}
                    >
                        <CloseIcon />
                    </IconButton>
                    <img
                        src={selectedImage}
                        alt="Imagem do guia ampliada"
                        style={{
                            maxWidth: '90vw',
                            maxHeight: '90vh',
                            width: 'auto',
                            height: 'auto',
                            borderRadius: '8px',
                        }}
                    />
                </Box>
            </Modal>
        </Box>
    );
};

export default DEGIROGuidePage;