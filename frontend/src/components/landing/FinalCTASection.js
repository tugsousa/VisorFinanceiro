// frontend/src/components/landing/FinalCTASection.js
import React from 'react';
import { Box, Button, Container, Typography } from '@mui/material';
import { Link as RouterLink } from 'react-router-dom';
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

const FinalCTASection = () => {
  return (
    <Box sx={{ py: { xs: 4, md: 8 }, textAlign: 'center' }}>
      <Container maxWidth="md">
        <Typography variant="h4" component="h2" sx={{ fontWeight: 'bold', mb: 2 }}>
          Pronto para ter um RumoClaro nos teus investimentos?
        </Typography>
        <Typography variant="h6" color="text.secondary" sx={{ mb: 4 }}>
          Cria a tua conta gratuita e junta-te a outros investidores que já simplificaram a vida financeira e fiscal.
        </Typography>
        <Button
          component={RouterLink}
          to="/signup"
          variant="contained"
          size="large"
          endIcon={<ArrowForwardIcon />}
          sx={{ textTransform: 'none', fontSize: '1.1rem', py: 1.5, px: 4 }}
        >
          Criar Conta Agora
        </Button>
      </Container>
    </Box>
  );
};

export default FinalCTASection;