// frontend/src/pages/SignInPage.js
import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom'; // Keep useNavigate for other potential uses if any
import { AuthContext } from '../context/AuthContext';
import '../App.css';

function SignInPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);
  const { login, loading: authLoading } = useContext(AuthContext); // Get authLoading for disabling form
  // const navigate = useNavigate(); // No longer strictly needed for post-login redirect here

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    try {
      await login(username, password);
      // If login is successful, AuthContext updates user state.
      // PublicRoute will then see 'user' is populated and redirect to '/dashboard'.
      setSuccess(true); // For local feedback on the SignInPage
      // No explicit navigation here. Let AuthContext and routing handle it.
    } catch (err) {
      setError(err.message || 'Invalid username or password');
      console.error('Login error on SignInPage:', err);
    }
  };

  return (
    <div className="auth-container">
      <h2>Sign In</h2>
      {error && <div className="error-message">{error}</div>}
      {success && !error && <div className="success-message">Login successful! Redirecting...</div>}
      <form onSubmit={handleSubmit}>
        <div className="form-group">
          <label htmlFor="username">Username</label>
          <input
            id="username"
            type="text"
            value={username}
            onChange={(e) => setUsername(e.target.value)}
            required
            disabled={authLoading}
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
            disabled={authLoading}
          />
        </div>
        <button type="submit" className="auth-button" disabled={authLoading}>
          {authLoading ? 'Signing In...' : 'Sign In'}
        </button>
      </form>
      <p className="auth-switch">
        Don't have an account? <a href="/signup">Sign up</a>
      </p>
    </div>
  );
}

export default SignInPage;