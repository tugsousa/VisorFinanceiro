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
          question="O Rumo Claro tem algum custo?"
          answer="De momento, o Rumo Claro é totalmente gratuito. Estamos a focar-nos em construir a melhor ferramenta possível para a comunidade de investidores em Portugal."
        />
        <FaqItem
          question="Que corretoras são suportadas?"
          answer="Atualmente, suportamos os formatos de extrato de transações da DEGIRO (ficheiro .csv) e da Interactive Brokers (relatório Flex Query em .xml). Planeamos adicionar mais corretoras no futuro."
        />
        <FaqItem
          question="A taxa de câmbio usada é a oficial da Autoridade Tributária?"
          answer="Utilizamos as taxas de câmbio históricas diárias fornecidas pelo Banco Central Europeu (BCE). Embora sejam uma referência fiável, podem existir ligeiras diferenças em relação às taxas específicas usadas pela AT. A plataforma serve como um forte auxílio, mas a responsabilidade final da verificação dos valores é sua."
        />
         <FaqItem
          question="Os meus dados financeiros estão seguros?"
          answer="Sim. A sua privacidade é a nossa prioridade. Todos os seus dados são armazenados de forma segura e nunca são partilhados. Além disso, você tem controlo total para eliminar todas as suas informações da plataforma a qualquer momento."
        />
      </Box>
    </Container>
  );
};

export default FaqSection;