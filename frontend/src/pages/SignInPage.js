// frontend/src/pages/SignInPage.js
import React, { useState, useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';
import '../App.css'; // Assuming this has .auth-container styles

function SignInPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false); // Local success state for feedback
  const { login, loading: authLoading } = useContext(AuthContext);
  // const navigate = useNavigate(); // Not strictly needed here as PublicRoute handles redirect

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess(false);

    try {
      await login(username, password);
      setSuccess(true); // Indicate login attempt was successful from frontend perspective
      // Navigation is handled by PublicRoute due to user state change in AuthContext
    } catch (err) {
      // Specific check for "Email not verified" message
      if (err.message && err.message.toLowerCase().includes("email not verified")) {
        setError("Your email address has not been verified. Please check your inbox for the verification link. You may need to check your spam folder.");
      } else {
        setError(err.message || 'Invalid username or password');
      }
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