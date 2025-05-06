import React, { useState } from 'react';
import axios from 'axios';

const UploadPage = () => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('idle');
  const [error, setError] = useState(null);

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

      const response = await axios.post('http://localhost:8080/api/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
        onUploadProgress: (progressEvent) => {
          const progress = Math.round((progressEvent.loaded * 100) / progressEvent.total);
          setUploadProgress(progress);
        },
      });

      setUploadStatus('success');
      console.log('Upload successful:', response.data);
    } catch (err) {
      setUploadStatus('error');
      setError(err.response?.data?.message || 'Upload failed. Please try again.');
      console.error('Upload error:', err);
    }
  };

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
    </div>
  );
};

export default UploadPage;
