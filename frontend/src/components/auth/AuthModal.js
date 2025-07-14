import React from 'react';
import { Box, Paper, IconButton } from '@mui/material';
import CloseIcon from '@mui/icons-material/Close';
import { useNavigate } from 'react-router-dom';
import './Auth.css';

const AuthModal = ({ children }) => {
  const navigate = useNavigate();

  // Function to navigate to the home page
  const handleClose = () => {
    navigate('/');
  };

  return (
    // The backdrop calls handleClose when clicked
    <Box className="auth-modal-backdrop" onClick={handleClose}>
      {/* The paper stops the click from propagating up to the backdrop */}
      <Paper 
        elevation={12} 
        className="auth-modal-paper" 
        onClick={(e) => e.stopPropagation()}
      >
        <IconButton
          aria-label="close"
          onClick={handleClose}
          className="auth-modal-close-button"
        >
          <CloseIcon />
        </IconButton>
        {children}
      </Paper>
    </Box>
  );
};

export default AuthModal;