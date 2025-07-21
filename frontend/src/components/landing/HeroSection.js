// frontend/src/components/landing/HeroSection.js
import React from 'react';
import { Box, Button, Container, Grid, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const HeroSection = () => {
  return (
    <Container maxWidth="lg" sx={{ py: { xs: 4, md: 8 } }}>
      <Grid container spacing={4} alignItems="center">
        {/* Coluna do Texto */}
        <Grid item xs={12} md={6}>
          <Typography
            component="h1"
            variant="h3"
            sx={{ fontWeight: 'bold', mb: 2 }}
          >
            Simplifique os seus impostos e gira o seu portfólio com clareza.
          </Typography>
          <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
            O RumoClaro transforma os extratos complexos do teu Broker em relatórios visuais e dados prontos a usar na tua declaração de IRS. Poupe tempo, reduza erros e toma o controlo dos teus investimentos.
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
        
        {/* Coluna da Imagem */}
        <Grid item xs={12} md={6}>
          <Box
            sx={{
              height: { xs: 250, md: 350 },
              bgcolor: 'grey.200',
              borderRadius: 2,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              border: '1px solid',
              borderColor: 'grey.300'
            }}
          >
            <Typography color="text.secondary">
              {/* TODO: Substitua este Box por uma imagem (screenshot) apelativa do seu dashboard.
                  Exemplo: <img src="/images/dashboard-hero.png" alt="Dashboard do Rumo Claro" style={{ width: '100%', borderRadius: '8px' }} /> 
                  A imagem deve mostrar um dos gráficos principais, como o de Lucro/Prejuízo Anual. */}
              Espaço para Imagem do Dashboard
            </Typography>
          </Box>
        </Grid>
      </Grid>
    </Container>
  );
};

export default HeroSection;