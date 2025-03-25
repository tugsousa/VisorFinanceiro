import { useState } from 'react';
import {
  Box,
  Typography,
  Button,
  CircularProgress,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  Alert,
  AlertTitle,
  Divider,
  Link,
  List,
  ListItem,
  ListItemText
} from '@mui/material';
import { Upload as UploadIcon, CloudUpload as CloudUploadIcon, Help as HelpIcon } from '@mui/icons-material';
import axios from 'axios';
import { useNavigate } from 'react-router-dom';
import Papa from 'papaparse';

export default function UploadPage() {
  const [file, setFile] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [previewData, setPreviewData] = useState([]);
  const navigate = useNavigate();

  const handleFileChange = (e) => {
    const selectedFile = e.target.files[0];
    setError(null);
    setSuccess(null);
    
    if (!selectedFile) return;

    // Basic validation
    const isValidCSV = selectedFile.name.endsWith('.csv') || 
                      ['text/csv', 'application/vnd.ms-excel'].includes(selectedFile.type);
    
    if (!isValidCSV) {
      setError({
        title: 'Invalid File Type',
        message: 'Please upload a valid CSV file with .csv extension'
      });
      return;
    }
    
    if (selectedFile.size > 10 * 1024 * 1024) {
      setError({
        title: 'File Too Large',
        message: 'Maximum file size is 10MB'
      });
      return;
    }

    setFile(selectedFile);
    previewCsv(selectedFile);
  };

  const previewCsv = (file) => {
    Papa.parse(file, {
      header: true,
      preview: 5,
      skipEmptyLines: true,
      complete: (results) => {
        if (results.data.length > 0) {
          setPreviewData(results.data);
        } else {
          setError({
            title: 'Empty CSV',
            message: 'The CSV file appears to be empty or improperly formatted'
          });
        }
      },
      error: (error) => {
        setError({
          title: 'CSV Parse Error',
          message: 'Could not read CSV file. Please ensure it is properly formatted.'
        });
      }
    });
  };

  const removeFile = () => {
    setFile(null);
    setPreviewData([]);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!file) {
      setError({
        title: 'No File Selected',
        message: 'Please select a CSV file to upload'
      });
      return;
    }

    setIsLoading(true);
    setError(null);
    setSuccess(null);
    setUploadProgress(0);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const response = await axios.post('http://localhost:8080/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const percentCompleted = Math.round(
            (progressEvent.loaded * 100) / progressEvent.total
          );
          setUploadProgress(percentCompleted);
        }
      });

      setSuccess({
        title: 'Upload Successful',
        message: 'Processing your transactions...'
      });
      
      setTimeout(() => {
        navigate('/dashboard', { state: { data: response.data } });
      }, 1500);
    } catch (err) {
      let errorMessage = 'Upload failed. Please try again.';
      
      if (err.response) {
        // Handle different error statuses
        switch (err.response.status) {
          case 400:
            errorMessage = err.response.data?.message || 
              'Invalid CSV format. Please check your file matches Degiro\'s export format.';
            break;
          case 413:
            errorMessage = 'File too large. Maximum upload size is 10MB.';
            break;
          default:
            errorMessage = `Server error (${err.response.status}). Please try again later.`;
        }
      } else if (err.request) {
        errorMessage = 'Network error. Please check your connection.';
      }
      
      setError({
        title: 'Upload Error',
        message: errorMessage
      });
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Box sx={{ maxWidth: 800, mx: 'auto', mt: 4, p: 3 }}>
      <Typography variant="h4" gutterBottom>
        Import Transactions
      </Typography>
      
      <Typography variant="body1" color="text.secondary" gutterBottom>
        Upload your Degiro transaction history CSV to analyze your portfolio.
      </Typography>
      
      <Alert severity="info" icon={<HelpIcon />} sx={{ mb: 3 }}>
        <AlertTitle>Export Instructions</AlertTitle>
        <List dense sx={{ py: 0 }}>
          <ListItem sx={{ py: 0 }}>
            <ListItemText primary="1. Log in to Degiro and go to Account → Transactions" />
          </ListItem>
          <ListItem sx={{ py: 0 }}>
            <ListItemText primary="2. Select date range and click Export" />
          </ListItem>
          <ListItem sx={{ py: 0 }}>
            <ListItemText primary="3. Upload the downloaded CSV file below" />
          </ListItem>
        </List>
        <Link href="https://www.degiro.com" target="_blank" underline="hover" sx={{ mt: 1 }}>
          Degiro Help Center
        </Link>
      </Alert>
      
      <Divider sx={{ my: 3 }} />
      
      {error && (
        <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>
          <AlertTitle>{error.title}</AlertTitle>
          {error.message}
        </Alert>
      )}
      
      {success && (
        <Alert severity="success" sx={{ mb: 3 }}>
          <AlertTitle>{success.title}</AlertTitle>
          {success.message}
        </Alert>
      )}

      <Paper variant="outlined" sx={{ p: 3, mb: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            style={{ display: 'none' }}
            id="file-upload"
            disabled={isLoading}
          />
          <label htmlFor="file-upload">
            <Button
              variant="contained"
              component="span"
              startIcon={<UploadIcon />}
              disabled={isLoading}
            >
              Choose File
            </Button>
          </label>
          <Typography variant="body2" color="text.secondary">
            {file ? file.name : 'No file selected'}
          </Typography>
          {file && (
            <Button
              variant="text"
              color="error"
              onClick={removeFile}
              disabled={isLoading}
            >
              Remove
            </Button>
          )}
        </Box>
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Maximum file size: 10MB (.csv only)
        </Typography>
      </Paper>

      {previewData.length > 0 && (
        <Box sx={{ mb: 3 }}>
          <Typography variant="subtitle1" gutterBottom>
            File Preview (first 5 rows):
          </Typography>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 300 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow>
                  {Object.keys(previewData[0]).map((key) => (
                    <TableCell key={key} sx={{ fontWeight: 'bold', bgcolor: 'background.paper' }}>
                      {key}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {previewData.map((row, i) => (
                  <TableRow key={i} hover>
                    {Object.values(row).map((value, j) => (
                      <TableCell key={j} sx={{ 
                        whiteSpace: 'nowrap',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        maxWidth: 200
                      }}>
                        {value || '-'}
                      </TableCell>
                    ))}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        </Box>
      )}

      {file && (
        <Box sx={{ display: 'flex', justifyContent: 'flex-end' }}>
          <Button
            variant="contained"
            color="primary"
            onClick={handleSubmit}
            disabled={isLoading}
            startIcon={isLoading ? null : <CloudUploadIcon />}
            sx={{ minWidth: 180 }}
          >
            {isLoading ? (
              <>
                <CircularProgress size={20} sx={{ mr: 1 }} />
                {uploadProgress}%
              </>
            ) : (
              'Upload & Process'
            )}
          </Button>
        </Box>
      )}

      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Chip 
          label="Degiro CSV Format"
          color="primary"
          variant="outlined"
          sx={{ mb: 1 }}
        />
        <Typography variant="body2" color="text.secondary">
          Ensure your CSV includes: Date, Product, ISIN, Quantity, Price
        </Typography>
      </Box>
    </Box>
  );
}