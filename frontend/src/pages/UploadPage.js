import React, { useState, useEffect } from 'react';
import axios from 'axios';
import { useAuth } from '../context/AuthContext';
import './UploadPage.css';

const UploadPage = () => {
  const { csrfToken, fetchCsrfToken, token } = useAuth();
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [error, setError] = useState(null);
  const [processedTransactions, setProcessedTransactions] = useState([]);

  const allowedFileTypes = ['text/csv', 'application/vnd.ms-excel', 'application/vnd.openxmlformats-officecs.spreadsheetml.sheet'];

  const handleFileChange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    if (!allowedFileTypes.includes(file.type)) {
      setError('Invalid file type. Please upload a CSV or Excel file.');
      return;
    }

    if (file.size > 5 * 1024 * 1024) {
      setError('File size too large. Maximum size is 5MB.');
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

    const formData = new FormData();
    formData.append('file', selectedFile);

    try {
      setUploadStatus('uploading');
      setUploadProgress(0);

      // Get a fresh CSRF token before upload
      const freshToken = await fetchCsrfToken();
      console.log('Using CSRF token for upload:', freshToken);
      
      // Debug: Log the token being used for authorization
      console.log('Authorization token:', token);
      
      // Check if token is in the correct format (should be the access_token from login)
      if (!token) {
        console.error('No authorization token available. User may not be properly logged in.');
        setError('Authentication error. Please log in again.');
        setUploadStatus('error');
        return;
      }

      const response = await axios.post('http://localhost:8080/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
          'X-CSRF-Token': freshToken,
          'Authorization': `Bearer ${token}`, // Add Bearer prefix to the token
        },
        withCredentials: true, // This ensures cookies are sent with the request
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        },
      });

      setUploadStatus('success');
      console.log('Upload successful:', response.data);
      
      // Fetch processed transactions after successful upload
      fetchProcessedTransactions();
    } catch (err) {
      setUploadStatus('error');
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
      console.error('Upload error:', err);
    }
  };

  // Function to fetch processed transactions
  const fetchProcessedTransactions = async () => {
    try {
      const response = await axios.get('http://localhost:8080/api/transactions/processed', {
        headers: {
          'Authorization': `Bearer ${token}`,
          'X-CSRF-Token': csrfToken
        },
        withCredentials: true
      });
      setProcessedTransactions(response.data);
    } catch (err) {
      console.error('Error fetching processed transactions:', err);
    }
  };

  // Fetch processed transactions on component mount
  useEffect(() => {
    if (token) {
      fetchProcessedTransactions();
    }
  }, [token]);

  return (
    <div className="upload-container">
      <h2>Upload Tax Documents</h2>
      <div className="upload-form">
        <input
          type="file"
          onChange={handleFileChange}
          accept=".csv, .xls, .xlsx"
        />
        {error && <div className="error-message">{error}</div>}
        
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

        {uploadStatus === 'success' && (
          <div className="success-message">Upload completed successfully!</div>
        )}

        <button
          onClick={handleUpload}
          disabled={uploadStatus === 'uploading' || !selectedFile}
        >
          {uploadStatus === 'uploading' ? 'Uploading...' : 'Upload'}
        </button>
      </div>

      {/* Display processed transactions */}
      {processedTransactions.length > 0 && (
        <div className="processed-transactions">
          <h3>Processed Transactions</h3>
          <p>These transactions have been processed and stored in the database.</p>
          <div className="transactions-table-container">
            <table className="transactions-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Product</th>
                  <th>Type</th>
                  <th>Quantity</th>
                  <th>Amount</th>
                  <th>Currency</th>
                </tr>
              </thead>
              <tbody>
                {processedTransactions.map((transaction, index) => (
                  <tr key={index}>
                    <td>{transaction.Date}</td>
                    <td>{transaction.ProductName}</td>
                    <td>{transaction.OrderType}</td>
                    <td>{transaction.Quantity}</td>
                    <td>{transaction.Amount}</td>
                    <td>{transaction.Currency}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default UploadPage;
