import React, { useState } from 'react';
import { Box, Typography, List, ListItem, ListItemText, Divider, Modal, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';

// The GuideStep component is updated to handle layout and image clicks.
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
            onClick={() => onImageClick(url)} // Triggers the modal
            sx={{
              maxWidth: { xs: '80%', sm: '350px' },
              width: 'auto',
              height: 'auto',
              borderRadius: 1,
              boxShadow: 3,
              cursor: 'pointer', // Indicates it's clickable
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

// Style for the image modal container
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
  // State to manage which image is currently expanded in the modal
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
        Guia: Gerar Relatório na Interactive Brokers (IBKR)
      </Typography>
      <Typography variant="body1" color="text.secondary" align="center" sx={{ mb: 3 }} id="ibkr-guide-description">
        Para carregar as suas transações na RumoClaro, siga estes passos para criar e descarregar o ficheiro "Flex Query" no formato correto.
      </Typography>
      <Divider />

      <List>
        <GuideStep
          number="1"
          title="Aceder às Flex Queries"
          text="No menu principal da sua conta IBKR, navegue até Performance & Reports e depois clique em Flex Queries."
          imageUrls={["/IBKR_guide_1flexqueries.png"]}
          onImageClick={handleImageClick}
        />
        <Divider component="li" />
        <GuideStep
          number="2"
          title="Criar uma Nova Query"
          text="Na secção 'Activity Flex Query', clique no botão Create (ícone de +)."
          imageUrls={["/IBKR_guide_2flexqueriesCreate.png"]}
          onImageClick={handleImageClick}
        />
        <Divider component="li" />
        <GuideStep
          number="3"
          title="Configurar a Query"
          text={<>
            Abrirá uma nova janela para configurar a sua query. Siga estes pontos:
            <ul>
                <li><strong>Query Name:</strong> Dê um nome à sua query para a poder identificar facilmente (ex: "RumoClaro").</li>
                <li><strong>Sections:</strong> Clique para adicionar secções: <strong>Cash Transactions</strong>, <strong>Open Positions</strong>, e <strong>Trades</strong>.</li>
                <li><strong>Delivery Configuration:</strong> Configure para ter <strong>Models: All</strong> e <strong>Format: XML</strong>.</li>
                <li><strong>General Configuration:</strong> Pode deixar os valores por defeito, como mostrado na imagem (ex: Date Format: yyyyMMdd).</li>
            </ul>
            Depois de configurar, clique em <strong>Save</strong>.
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
          title="Executar a Query e Descarregar"
          text="A sua nova query aparecerá na lista. Para gerar o relatório, clique no ícone de 'play' (▶) ao lado do nome. Na janela que aparece, selecione o Período (Period) que deseja exportar e confirme que o Formato (Format) está como XML. Clique em Run para descarregar o ficheiro."
          imageUrls={["/IBKR_guide_5run.png"]}
          onImageClick={handleImageClick}
        />
        <Divider component="li" />
        <GuideStep
          number="5"
          title="Carregar na RumoClaro"
          text="Excelente! Agora que tem o seu ficheiro XML, regresse à página de Upload na RumoClaro e carregue o documento que acabou de descarregar para que possamos processar as suas transações."
        />
      </List>

      {/* The Modal for viewing the clicked image */}
      <Modal
        open={isImageModalOpen}
        onClose={handleCloseImageModal}
        aria-labelledby="image-modal-title"
        aria-describedby="image-modal-description"
        sx={{
            // Add a backdrop filter for a nicer effect
            backdropFilter: 'blur(4px)',
        }}
      >
        <Box sx={imageModalStyle}>
           <IconButton
              aria-label="close image"
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
            alt="Expanded guide step"
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