// src/App.tsx
import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Dashboard from './components/Dashboard';
import SignIn from './components/SignIn';
import SignUp from './components/SignUp';
import axios from 'axios';

function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [loading, setLoading] = useState<boolean>(true);
  const [showSignUp, setShowSignUp] = useState<boolean>(false);

  // Production base URL – use an environment variable for flexibility
  const BASE_URL = 'https://everest-sentimental-dashboard-backend.onrender.com';

  // On initial load, check if token exists and verify it on the server.
  useEffect(() => {
    const token = localStorage.getItem('auth_token');
    if (token) {
      axios
        .get(`${BASE_URL}/api/verify`, {
          headers: { Authorization: `Bearer ${token}` }
        })
        .then((res) => {
          // If token is valid, mark as authenticated.
          setIsAuthenticated(true);
        })
        .catch(() => {
          // If verification fails, remove the token.
          localStorage.removeItem('auth_token');
          setIsAuthenticated(false);
        })
        .finally(() => {
          setLoading(false);
        });
    } else {
      setLoading(false);
    }
  }, [BASE_URL]);

  const handleSignIn = (token: string) => {
    localStorage.setItem('auth_token', token);
    setIsAuthenticated(true);
  };

  const handleSignOut = () => {
    localStorage.removeItem('auth_token');
    setIsAuthenticated(false);
  };

  const handleSignUp = (token: string) => {
    localStorage.setItem('auth_token', token);
    setIsAuthenticated(true);
    setShowSignUp(false);
  };

  if (loading) {
    return <div>Loading...</div>;
  }

  if (isAuthenticated) {
    return (
      <>
        <Toaster position="top-right" />
        <Dashboard onSignOut={handleSignOut} />
      </>
    );
  }

  return (
    <>
      <Toaster position="top-right" />
      {showSignUp ? (
        <SignUp 
          onSignUp={handleSignUp}
          onBackToSignIn={() => setShowSignUp(false)}
        />
      ) : (
        <SignIn 
          onSignIn={handleSignIn}
          onSignUp={() => setShowSignUp(true)}
        />
      )}
    </>
  );
}

export default App;
