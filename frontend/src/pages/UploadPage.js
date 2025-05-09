import React, { useState, useEffect } from 'react'; // Removed unused useContext
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './UploadPage.css';
import { API_ENDPOINTS, ALLOWED_FILE_TYPES, MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_MB, UI_TEXT } from '../constants'; // Added MAX_FILE_SIZE_MB
import { Typography } from '@mui/material'; // Added Typography import

const UploadPage = () => {
  const { csrfToken, fetchCsrfToken, token } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle'); // 'idle', 'uploading', 'success', 'error'
  const [error, setError] = useState(null);
  const [processedTransactions, setProcessedTransactions] = useState([]);
  const [isFetchingTransactions, setIsFetchingTransactions] = useState(false);


  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) {
        setSelectedFile(null);
        setError(null);
        return;
    }

    if (!ALLOWED_FILE_TYPES.includes(file.type)) {
      setError(`Invalid file type. Please upload a CSV file. Allowed: ${ALLOWED_FILE_TYPES.join(', ')}`); // Updated message to reflect current constant
      setSelectedFile(null);
      return;
    }

    if (file.size > MAX_FILE_SIZE_BYTES) {
      setError(`File size too large. Maximum size is ${MAX_FILE_SIZE_MB}MB.`);
      setSelectedFile(null);
      return;
    }

    setSelectedFile(file);
    setError(null);
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Please select a file first');
      return;
    }
    if (!token) {
      setError(UI_TEXT.userNotAuthenticated);
      return;
    }

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setUploadStatus('uploading');
      setUploadProgress(0);
      setError(null);

      const freshCsrfToken = csrfToken || await fetchCsrfToken();
      if (!freshCsrfToken) {
        throw new Error("CSRF token not available for upload.");
      }
      
      console.log('Authorization token for upload:', token);
      
      const response = await axios.post(API_ENDPOINTS.UPLOAD, formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-CSRF-Token': freshCsrfToken,
          'Authorization': `Bearer ${token}`,
        },
        withCredentials: true,
        onUploadProgress: (progressEvent) => {
          if (progressEvent.total) {
            const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
            setUploadProgress(progress);
          }
        },
      });

      setUploadStatus('success');
      console.log('Upload successful:', response.data);
      fetchProcessedTransactions(); // Refresh transactions list
      setSelectedFile(null); // Clear file input after successful upload
      // e.target.value = null; // This won't work as e is not available here directly
      // To reset file input visually, you might need to manage its key or use a ref
    } catch (err) {
      setUploadStatus('error');
      setError(err.response?.data?.error || err.message || 'Upload failed. Please try again.');
      console.error('Upload error:', err);
    }
  };

  const fetchProcessedTransactions = async () => {
    if (!token) return;
    setIsFetchingTransactions(true);
    setError(null);
    try {
      const currentCsrf = csrfToken || await fetchCsrfToken();
      if (!currentCsrf) {
        throw new Error("CSRF token not available for fetching transactions.");
      }
      const response = await axios.get(API_ENDPOINTS.PROCESSED_TRANSACTIONS, {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-CSRF-Token': currentCsrf
        },
        withCredentials: true
      });
      setProcessedTransactions(response.data || []);
    } catch (err) {
      console.error('Error fetching processed transactions:', err);
      setError(err.response?.data?.error || 'Failed to fetch transactions.');
      setProcessedTransactions([]); // Clear on error
    } finally {
      setIsFetchingTransactions(false);
    }
  };
 
  useEffect(() => {
    if (token) {
      fetchProcessedTransactions();
    } else {
      setProcessedTransactions([]); // Clear transactions if not logged in
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]); // Re-fetch when token changes (login/logout)

  return (
    <div className="upload-container">
      <h2>Upload Tax Documents</h2>
      <div className="upload-form">
        <input
          type="file"
          onChange={handleFileChange}
          accept={ALLOWED_FILE_TYPES.map(type => `.${type.split('/')[1]}`).join(',')} // More specific accept
          key={selectedFile ? 'file-selected' : 'no-file'} // Trick to reset input if needed
        />
        
        {selectedFile && (
          <div className="file-info">
            <p>Selected file: {selectedFile.name}</p>
            <p>Size: {(selectedFile.size / 1024).toFixed(2)} KB</p>
          </div>
        )}

        {uploadStatus === 'uploading' && (
          <div className="progress-container">
            <progress value={uploadProgress} max="100" />
            <span>{uploadProgress}%</span>
          </div>
        )}
        
        {/* Consolidate error and success messages */}
        {error && <div className="error-message">{error}</div>}
        {uploadStatus === 'success' && <div className="success-message">Upload completed successfully! Transactions updated.</div>}


        <button
          onClick={handleUpload}
          disabled={uploadStatus === 'uploading' || !selectedFile || !token}
        >
          {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {isFetchingTransactions && <p>Loading transactions...</p>}
      {!isFetchingTransactions && processedTransactions.length > 0 && (
        <div className="processed-transactions">
          <h3>Processed Transactions</h3>
          <p>These transactions have been processed and stored in the database.</p>
          <div className="transactions-table-container">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>ISIN</th>
                  <th>Type</th>
                  <th>Qty</th>
                  <th>Price</th>
                  <th>Amount</th>
                  <th>Currency</th>
                  <th>Commission</th>
                  <th>Amount EUR</th>
                  <th>Order ID</th>
                </tr>
              </thead>
              <tbody>
                {processedTransactions.map((transaction, index) => (
                  <tr key={transaction.OrderID || index}>
                    <td>{transaction.Date}</td>
                    <td>{transaction.ProductName}</td>
                    <td>{transaction.ISIN}</td>
                    <td>{transaction.OrderType}</td>
                    <td>{transaction.Quantity}</td>
                    <td>{transaction.Price?.toFixed(4)}</td>
                    <td>{transaction.Amount?.toFixed(2)}</td>
                    <td>{transaction.Currency}</td>
                    <td>{transaction.Commission?.toFixed(2)}</td>
                    <td>{transaction.AmountEUR?.toFixed(2)}</td>
                    <td>{transaction.OrderID}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
       {!isFetchingTransactions && processedTransactions.length === 0 && token && !error && (
         <Typography sx={{ textAlign: 'center', mt: 2 }}>No processed transactions found.</Typography>
       )}
    </div>
  );
};

export default UploadPage;