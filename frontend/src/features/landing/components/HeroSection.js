// frontend/src/features/landing/components/HeroSection.js
import React, { useState } from 'react';
import { Box, Button, Container, Grid, Typography, Modal, IconButton } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';
import CloseIcon from '@mui/icons-material/Close';

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
  const [isModalOpen, setIsModalOpen] = useState(false);
  const handleOpenModal = () => setIsModalOpen(true);
  const handleCloseModal = () => setIsModalOpen(false);

  const heroImageSrc = "/dashboard-hero.png"; 

  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
      <Grid container spacing={4} alignItems="center">
        {/* Left Content */}
        <Grid item xs={12} md={6}>
          <Typography
            component="h1"
            variant="h3"
            sx={{ fontWeight: 'bold', mb: 2 }}
          >
            Simplifica os teus impostos e gere o teu portfólio com clareza.
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
            O VisorFinanceiro transforma as transações do teu broker em dashboards claros, métricas essenciais e análises detalhadas da tua carteira. Acompanha desempenho, dividendos, ações, opções e custos — tudo num só lugar.
          </Typography>
          <Button
            component={RouterLink}
            to="/signup"
            variant="contained"
            size="large"
            endIcon={<ArrowForwardIcon />}
            sx={{
              textTransform: 'none',
              fontSize: '1.1rem',
              py: 1.5,
              px: 4
            }}
          >
            Criar Conta Gratuita
          </Button>
        </Grid>

        {/* Right Image */}
        <Grid item xs={12} md={6}>
          <Box
            onClick={handleOpenModal}
            sx={{
              height: { xs: 250, md: 350 },
              bgcolor: 'grey.200',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid',
              borderColor: 'grey.300',
              overflow: 'hidden',
              cursor: 'pointer',
              '&:hover img': {
                transform: 'scale(1.03)',
              }
            }}
          >
            <img
              src={heroImageSrc}
              alt="Dashboard do VisorFinanceiro"
              style={{
                width: '100%',
                height: '100%',
                objectFit: 'cover',
                borderRadius: '8px',
                transition: 'transform 0.3s ease-in-out',
              }}
            />
          </Box>
        </Grid>
      </Grid>

      {/* Image Modal */}
      <Modal
        open={isModalOpen}
        onClose={handleCloseModal}
        aria-labelledby="hero-image-modal"
        sx={{
          backdropFilter: 'blur(4px)'
        }}
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