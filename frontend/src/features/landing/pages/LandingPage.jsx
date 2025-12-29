// frontend/src/pages/LandingPage.js
import React from 'react';
import { Box, Divider } from '@mui/material';
import { Helmet } from 'react-helmet-async';

// Importe as novas secções que vamos criar
import HeroSection from '../components/HeroSection';
import HowItWorksSection from '../components/HowItWorksSection';
import FeaturesSection from '../components/FeaturesSection';
import TrustSection from '../components/TrustSection';
import FaqSection from '../components/FaqSection';
import FinalCTASection from '../components/FinalCTASection';

const LandingPage = () => {
  return (
    // Usamos um Box como contentor principal para as secções
    <Box sx={{ width: '100%' }}>
      <Helmet>
          <title>VisorFinanceiro | Simplifica Impostos e Gestão de Portfólio em Portugal</title>
          <meta name="description" content="O VisorFinanceiro transforma extratos de brokers (Degiro, IBKR) em relatórios fiscais e dashboards de desempenho para investidores em Portugal. Gratuito e seguro." />
          <link rel="canonical" href="https://www.visorfinanceiro.pt/" />
      </Helmet>
      <HeroSection />
      
      {/* Pode adicionar um Divider para uma separação visual, se gostar */}
      <Divider sx={{ my: 6, borderColor: 'grey.200' }} />

      <HowItWorksSection />
      
      <Divider sx={{ my: 6, borderColor: 'grey.200' }} />
      
      <FeaturesSection />
      
      <Divider sx={{ my: 6, borderColor: 'grey.200' }} />

      <TrustSection />

      <Divider sx={{ my: 6, borderColor: 'grey.200' }} />

      <FaqSection />

      <Divider sx={{ my: 6, borderColor: 'grey.200' }} />

      <FinalCTASection />
    </Box>
  );
};

export default LandingPage;