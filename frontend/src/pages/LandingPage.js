// frontend/src/pages/LandingPage.js
import React from 'react';
import { Box, Divider } from '@mui/material';

// Importe as novas secções que vamos criar
import HeroSection from '../components/landing/HeroSection';
import HowItWorksSection from '../components/landing/HowItWorksSection';
import FeaturesSection from '../components/landing/FeaturesSection';
import TrustSection from '../components/landing/TrustSection';
import FaqSection from '../components/landing/FaqSection';
import FinalCTASection from '../components/landing/FinalCTASection';

const LandingPage = () => {
  return (
    // Usamos um Box como contentor principal para as secções
    <Box sx={{ width: '100%' }}>
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