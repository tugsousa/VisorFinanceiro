import React, { useState } from 'react';
import { Box, Typography, List, ListItem, ListItemText, Divider, Modal, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

const GuideStep = ({ number, title, text, imageUrls, onImageClick }) => (
  <ListItem sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', my: 2 }}>
    <Box>
      <Typography variant="h6" component="div" sx={{ fontWeight: 'bold' }}>
        {number}. {title}
      </Typography>
      <ListItemText primary={text} />
    </Box>
    {imageUrls && imageUrls.length > 0 && (
      <Box sx={{ display: 'flex', flexDirection: { xs: 'column', md: 'row' }, gap: 2, mt: 2, width: '100%', justifyContent: 'flex-start', flexWrap: 'wrap' }}>
        {imageUrls.map((url, index) => (
          <Box
            key={index}
            component="img"
            src={url}
            alt={`Passo ${number}, imagem ${index + 1}`}
            onClick={() => onImageClick(url)}
            sx={{
              maxWidth: { xs: '80%', sm: '350px' },
              width: 'auto',
              height: 'auto',
              borderRadius: 1,
              boxShadow: 3,
              cursor: 'pointer',
              transition: 'transform 0.2s ease-in-out',
              '&:hover': {
                transform: 'scale(1.03)',
                boxShadow: 6,
              }
            }}
          />
        ))}
      </Box>
    )}
  </ListItem>
);

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

const IBKRGuidePage = () => {
  const [selectedImage, setSelectedImage] = useState(null);
  const isImageModalOpen = Boolean(selectedImage);

  const handleImageClick = (imageUrl) => {
    setSelectedImage(imageUrl);
  };

  const handleCloseImageModal = () => {
    setSelectedImage(null);
  };

  return (
    <Box>
      <Typography variant="h4" component="h1" gutterBottom align="center" id="ibkr-guide-title">
        Guia: Como gerar o relatório na Interactive Brokers
      </Typography>
      <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }} id="ibkr-guide-description">
        Segue estes passos para criar e descarregar o ficheiro no formato correcto.
      </Typography>
      <Divider />

      <List>
        <GuideStep
          number="1"
          title="Ir às Flex Queries"
          text="No menu principal da tua conta IBKR, vai a Performance & Reports e depois clica em Flex Queries."
          imageUrls={["/IBKR_guide_1flexqueries.png"]}
          onImageClick={handleImageClick}
        />
        <Divider component="li" />
        <GuideStep
          number="2"
          title="Criar nova query"
          text="Na secção 'Activity Flex Query', clica no botão Create (ícone de +)."
          imageUrls={["/IBKR_guide_2flexqueriesCreate.png"]}
          onImageClick={handleImageClick}
        />
        <Divider component="li" />
        <GuideStep
          number="3"
          title="Preencher os detalhes"
          text={<>
            Vai abrir uma nova janela onde podes configurar a tua query. Faz assim:
            <ul>
              <li><strong>Query Name:</strong> Dá um nome à query para a encontrares facilmente (por exemplo: "RumoClaro").</li>
              <li><strong>Sections:</strong> Adiciona estas secções: <strong>Cash Transactions</strong>, <strong>Open Positions</strong> e <strong>Trades</strong>.</li>
              <li><strong>Delivery Configuration:</strong> Escolhe <strong>Models: All</strong> e <strong>Format: XML</strong>.</li>
              <li><strong>General Configuration:</strong> Podes deixar como está.</li>
            </ul>
            Quando terminares, clica em <strong>Save</strong>.
          </>}
          imageUrls={[
            "/IBKR_guide_3deliveryconfig.png",
            "/IBKR_guide_4generalconfig.png"
          ]}
          onImageClick={handleImageClick}
        />
        <Divider component="li" />
        <GuideStep
          number="4"
          title="Correr a query e fazer download"
          text="A tua nova query vai aparecer na lista. Para gerar o relatório, clica no ícone de 'play' (▶) ao lado do nome. Na janela que aparece, escolhe o período que queres exportar e confirma que o formato está em XML. Depois, clica em Run para fazer o download do ficheiro."
          imageUrls={["/IBKR_guide_5run.png"]}
          onImageClick={handleImageClick}
        />
        <Divider component="li" />
        <GuideStep
          number="5"
          title="Enviar para a RumoClaro"
          text="Boa! Agora que já tens o ficheiro XML, volta à página de upload da RumoClaro e envia o documento que descarregaste. Vamos tratar das tuas transações por ti."
        />
      </List>

      <Modal
        open={isImageModalOpen}
        onClose={handleCloseImageModal}
        aria-labelledby="image-modal-title"
        aria-describedby="image-modal-description"
        sx={{
          backdropFilter: 'blur(4px)',
        }}
      >
        <Box sx={imageModalStyle}>
          <IconButton
            aria-label="Fechar imagem"
            onClick={handleCloseImageModal}
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
            src={selectedImage}
            alt="Imagem do guia ampliada"
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
    </Box>
  );
};

export default IBKRGuidePage;
