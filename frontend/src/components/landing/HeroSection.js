// frontend/src/components/landing/HeroSection.js
import React, { useState } from 'react';
import { Box, Button, Container, Grid, Typography, Modal, IconButton } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';

// Style for the modal content, centered and without a solid background
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

const HeroSection = () => {
    // State to control the modal's visibility
    const [isModalOpen, setIsModalOpen] = useState(false);

    // Handlers to open and close the modal
    const handleOpenModal = () => setIsModalOpen(true);
    const handleCloseModal = () => setIsModalOpen(false);
    const heroImageSrc = "/dashboard-hero.png"; // Using the dashboard image for the hero section

    return (
        <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
            <Grid container spacing={4} alignItems="center">
                {/* Text Column */}
                <Grid item xs={12} md={6}>
                    <Typography
                        component="h1"
                        variant="h3"
                        sx={{ fontWeight: 'bold', mb: 2 }}
                    >
                        Simplifica os teus impostos e gere o teu portfólio com clareza.
                    </Typography>
                    <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
                        O VisorFinanceiro transforma os extratos complexos do teu broker em relatórios visuais e dados prontos a utilizar na tua declaração de IRS. Poupa tempo, evita erros e assume o controlo dos teus investimentos.
                    </Typography>
                    <Button
                        component={RouterLink}
                        to="/signup"
                        variant="contained"
                        size="large"
                        endIcon={<ArrowForwardIcon />}
                        sx={{ textTransform: 'none', fontSize: '1.1rem', py: 1.5, px: 4 }}
                    >
                        Criar Conta Gratuita
                    </Button>
                </Grid>

                {/* Image Column */}
                <Grid item xs={12} md={6}>
                    <Box
                        onClick={handleOpenModal} // Make the entire box clickable
                        sx={{
                            height: { xs: 250, md: 350 },
                            bgcolor: 'grey.200',
                            borderRadius: 2,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            border: '1px solid',
                            borderColor: 'grey.300',
                            overflow: 'hidden', // Ensures the image respects the border radius
                            cursor: 'pointer', // Indicates the image is clickable
                            '&:hover img': {
                                transform: 'scale(1.03)', // Slight zoom effect on hover
                            }
                        }}
                    >
                        <img 
                            src={heroImageSrc} 
                            alt="Dashboard do Visor Financeiro" 
                            style={{ 
                                width: '100%', 
                                height: '100%',
                                objectFit: 'cover', // Ensures the image covers the box without distortion
                                borderRadius: '8px',
                                transition: 'transform 0.3s ease-in-out',
                            }} 
                        />
                    </Box>
                </Grid>
            </Grid>

            {/* Modal for displaying the expanded image */}
            <Modal
                open={isModalOpen}
                onClose={handleCloseModal}
                aria-labelledby="hero-image-modal"
                sx={{ backdropFilter: 'blur(4px)' }}
            >
                <Box sx={imageModalStyle}>
                    <IconButton
                        aria-label="close image"
                        onClick={handleCloseModal}
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
                        src={heroImageSrc}
                        alt="Dashboard do Visor Financeiro em tamanho expandido"
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
        </Container>
    );
};

export default HeroSection;