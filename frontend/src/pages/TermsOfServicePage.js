import React from 'react';
import { Container, Box, Typography, List, ListItem, ListItemText, Link } from '@mui/material';

const TermsOfServicePage = () => {
  return (
    <Container maxWidth="md" sx={{ py: 4 }}>
      <Typography variant="h4" component="h1" gutterBottom>
        Termos de Serviço
      </Typography>
      <Typography variant="subtitle2" color="text.secondary" gutterBottom>
        Última atualização: 14 de Julho de 2025
      </Typography>

      <Box sx={{ my: 3 }}>
        <Typography variant="body1" paragraph>
          Por favor, leia estes Termos de Serviço ("Termos") cuidadosamente antes de usar o website Rumo Claro (o "Serviço") operado por nós.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>1. Aceitação dos Termos</Typography>
        <Typography variant="body1" paragraph>
          Ao aceder e utilizar o nosso Serviço, você concorda em estar vinculado por estes Termos. Se não concordar com qualquer parte dos termos, não poderá aceder ao Serviço.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>2. Descrição do Serviço</Typography>
        <Typography variant="body1" paragraph>
          O Rumo Claro é uma plataforma que permite aos utilizadores carregar e processar ficheiros de transações financeiras para análise de portefólio e para gerar resumos que podem auxiliar no preenchimento de declarações fiscais. O Serviço é uma ferramenta de cálculo e visualização de dados.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>3. Contas de Utilizador</Typography>
        <Typography variant="body1" paragraph>
          Ao criar uma conta connosco, você garante que a informação que fornece é exata, completa e atual. É responsável por manter a confidencialidade da sua senha e por todas as atividades que ocorram na sua conta. Concorda em notificar-nos imediatamente sobre qualquer uso não autorizado da sua conta.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>4. Propriedade Intelectual</Typography>
        <Typography variant="body1" paragraph>
          O Serviço e todo o seu conteúdo original (excluindo os dados fornecidos por si), características e funcionalidades são e continuarão a ser propriedade exclusiva do Rumo Claro e dos seus licenciadores.
        </Typography>
        <Typography variant="body1" paragraph>
          Os dados financeiros que carrega para o Serviço permanecem sua propriedade. Concede-nos uma licença limitada para processar esses dados com o único propósito de lhe fornecer o Serviço.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>5. Isenção de Responsabilidade e Limitação de Responsabilidade</Typography>
        <Typography variant="body1" paragraph>
          O Serviço é fornecido "COMO ESTÁ" e "CONFORME DISPONÍVEL". O uso do Serviço é por sua conta e risco. Não garantimos que os cálculos, dados ou informações apresentados pelo Serviço sejam exatos, completos, fiáveis ou atuais.
        </Typography>
        <Typography variant="body1" paragraph sx={{ fontWeight: 'bold', my: 2 }}>
          AVISO FINANCEIRO IMPORTANTE: O Rumo Claro é uma ferramenta para fins informativos e não constitui aconselhamento financeiro, de investimento ou fiscal. Em nenhuma circunstância o Rumo Claro ou os seus proprietários serão responsáveis por quaisquer perdas ou danos, diretos ou indiretos, resultantes do uso ou da confiança na informação fornecida. Você é o único responsável pelas suas decisões financeiras e fiscais. Consulte sempre um profissional qualificado para a sua situação específica.
        </Typography>
        <Typography variant="body1" paragraph>
          Em nenhuma circunstância o Rumo Claro será responsável por quaisquer danos indiretos, incidentais, especiais, consequenciais ou punitivos, incluindo, sem limitação, perda de lucros, dados, ou outras perdas intangíveis, resultantes do seu acesso ou uso ou incapacidade de aceder ou usar o Serviço.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>6. Rescisão</Typography>
        <Typography variant="body1" paragraph>
          Pode eliminar a sua conta a qualquer momento através da página de Configurações, o que resultará na eliminação permanente de todos os seus dados.
        </Typography>
        <Typography variant="body1" paragraph>
          Reservamo-nos o direito de suspender ou eliminar a sua conta imediatamente, sem aviso prévio ou responsabilidade, por qualquer motivo, incluindo, sem limitação, se violar os Termos.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>7. Lei Aplicável</Typography>
        <Typography variant="body1" paragraph>
          Estes Termos serão regidos e interpretados de acordo com as leis de Portugal, sem consideração com o seu conflito de disposições legais.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>8. Alterações aos Termos</Typography>
        <Typography variant="body1" paragraph>
          Reservamo-nos o direito, a nosso exclusivo critério, de modificar ou substituir estes Termos a qualquer momento. Se uma revisão for material, tentaremos fornecer um aviso com pelo menos 30 dias de antecedência antes de quaisquer novos termos entrarem em vigor. O que constitui uma alteração material será determinado a nosso exclusivo critério.
        </Typography>

        <Typography variant="h6" component="h2" sx={{ mt: 4 }} gutterBottom>9. Contacte-nos</Typography>
        <Typography variant="body1" paragraph>
          Se tiver alguma questão sobre estes Termos, por favor contacte-nos através de: <Link href="mailto:seu-email-de-suporte@rumoclaro.pt">seu-email-de-suporte@rumoclaro.pt</Link>.
        </Typography>
      </Box>
    </Container>
  );
};

export default TermsOfServicePage;