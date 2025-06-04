// frontend/src/pages/SignUpPage.js
import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../App.css'; // Assuming this has .auth-container, .form-group, .auth-button, .error-message, .success-message

function SignUpPage() {
  const [username, setUsername] = useState('');
  const [email, setEmail] = useState(''); // New state for email
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const { register, loading: authLoading } = useContext(AuthContext);
  const navigate = useNavigate(); // Kept for potential future use, though not strictly needed now

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccessMessage('');

    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }
    if (!email.trim()) {
        setError('Email is required.');
        return;
    }
    // Basic email format check (more robust validation can be added)
    if (!/\S+@\S+\.\S+/.test(email)) {
        setError('Please enter a valid email address.');
        return;
    }
    if (password.length < 6) {
        setError('Password must be at least 6 characters long.');
        return;
    }


    try {
      const result = await register(username, email, password); // Pass email
      setSuccessMessage(result.message || 'Registration submitted. Please check your email to verify your account.');
      // Form is disabled via `authLoading || !!successMessage` on inputs/button
    } catch (err) {
      setError(err.message || 'Registration failed. Please try again.');
    }
  };

  return (
    <div className="auth-container">
      <h2>Sign Up</h2>
      {error && <div className="error-message">{error}</div>}
      {successMessage && <div className="success-message">{successMessage}</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={authLoading || !!successMessage}
          />
        </div>
        <div className="form-group">
          <label htmlFor="email">Email</label>
          <input
            id="email"
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            disabled={authLoading || !!successMessage}
          />
        </div>
        <div className="form-group">
          <label htmlFor="password">Password</label>
          <input
            id="password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength="6"
            disabled={authLoading || !!successMessage}
          />
        </div>
        <div className="form-group">
          <label htmlFor="confirmPassword">Confirm Password</label>
          <input
            id="confirmPassword"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength="6"
            disabled={authLoading || !!successMessage}
          />
        </div>
        <button type="submit" className="auth-button" disabled={authLoading || !!successMessage}>
          {authLoading ? 'Signing Up...' : 'Sign Up'}
        </button>
      </form>
      <p className="auth-switch">
        Already have an account? <a href="/signin">Sign In</a>
      </p>
    </div>
  );
}

export default SignUpPage;