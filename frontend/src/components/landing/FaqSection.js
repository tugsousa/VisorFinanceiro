// frontend/src/components/landing/FaqSection.js
import React from 'react';
import {
  Box, Container, Typography, Accordion,
  AccordionSummary, AccordionDetails
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';

const FaqItem = ({ question, answer }) => (
  <Accordion elevation={1} sx={{ '&:before': { display: 'none' } }}>
    <AccordionSummary expandIcon={<ExpandMoreIcon />}>
      <Typography sx={{ fontWeight: 500 }}>{question}</Typography>
    </AccordionSummary>
    <AccordionDetails>
      <Typography color="text.secondary">{answer}</Typography>
    </AccordionDetails>
  </Accordion>
);

const FaqSection = () => {
  return (
    <Container maxWidth="md" sx={{ py: { xs: 4, md: 8 } }}>
      <Typography variant="h4" component="h2" align="center" sx={{ fontWeight: 'bold', mb: 4 }}>
        Perguntas Frequentes
      </Typography>
      <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
        <FaqItem
          question="O RumoClaro tem algum custo?"
          answer="De momento, o RumoClaro é totalmente gratuito. Estamos focados em construir a melhor ferramenta possível para a comunidade de investidores em Portugal."
        />
        <FaqItem
          question="Que corretoras são suportadas?"
          answer="De momento, suportamos a DEGIRO e a Interactive Brokers, mas queremos adicionar mais corretoras em breve."
        />
        <FaqItem
          question="A taxa de câmbio usada é a oficial da Autoridade Tributária?"
          answer="Usamos as taxas de câmbio históricas diárias do Banco Central Europeu (BCE). Embora sejam uma referência fiável, podem haver pequenas diferenças em relação às taxas que a AT utiliza. A plataforma é um ótimo apoio, mas a responsabilidade final de verificar os valores é tua."
        />
         <FaqItem
          question="Os meus dados financeiros estão seguros?"
          answer="Sim. A tua privacidade é a nossa prioridade. Todos os teus dados são guardados de forma segura e nunca são partilhados. Além disso, tens controlo total para eliminar todas as tuas informações da plataforma a qualquer momento."
        />
      </Box>
    </Container>
  );
};

export default FaqSection;