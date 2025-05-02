import React, { useContext } from 'react';
import { useNavigate } from 'react-router-dom';
import { AuthContext } from '../context/AuthContext';

function UserProfile() {
  const { user, logout } = useContext(AuthContext);
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/');
  };

  return (
    <div className="user-profile">
      <div className="user-info">
        <span className="username">{user?.username}</span>
        <button 
          className="logout-button" 
          onClick={handleLogout}
        >
          Logout
        </button>
      </div>
    </div>
  );
}

export default UserProfile;
