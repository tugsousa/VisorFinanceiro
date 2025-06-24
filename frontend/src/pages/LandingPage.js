// frontend/src/pages/LandingPage.js

import React from 'react';
import { Box, Button, Container, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const LandingPage = () => {
  return (
    <Box
      sx={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        minHeight: 'calc(100vh - 128px)', // Adjust based on your Layout's AppBar height
        textAlign: 'center',
        p: 3,
      }}
    >
      <Container maxWidth="md">
        <Typography 
          variant="h2" 
          component="h1" 
          gutterBottom 
          sx={{ 
            fontWeight: 'bold', 
            color: 'primary.main',
            mb: 2,
          }}
        >
          Bem-vindo ao Rumo Claro
        </Typography>
        <Typography 
          variant="h5" 
          component="p" 
          color="text.secondary" 
          sx={{ mb: 4, maxWidth: '700px', margin: 'auto' }}
        >
          A sua ferramenta para a gestão de portfólio e simplificação de impostos.
          Rumo Claro ajuda-te a analisar as transações efetuadas e as holdings atuais.
          Vais conseguir analisar vendas de ações, dividendos e opções, e ainda obter ajuda na declaração de IRS.
          Transforme dados complexos em insights claros e tome o controlo das suas finanças.
        </Typography>
        <Button
          component={RouterLink}
          to="/signup"
          variant="contained"
          color="primary"
          size="large"
          endIcon={<ArrowForwardIcon />}
          sx={{ textTransform: 'none', fontSize: '1.1rem', py: 1.5, px: 4 }}
        >
          Começar Agora
        </Button>
      </Container>
    </Box>
  );
};

export default LandingPage;