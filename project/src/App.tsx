// src/App.tsx
import React, { useState, useEffect } from 'react';
import { Toaster } from 'react-hot-toast';
import Dashboard from './components/Dashboard';
// COMMENTED OUT FOR DIRECT ACCESS - Authentication components
// import SignIn from './components/SignIn';
// import SignUp from './components/SignUp';
// import axios from 'axios';

function App() {
  // COMMENTED OUT FOR DIRECT ACCESS - Authentication state
  // const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  // const [loading, setLoading] = useState<boolean>(true);
  // const [showSignUp, setShowSignUp] = useState<boolean>(false);

  // COMMENTED OUT FOR DIRECT ACCESS - Backend URL for auth
  // const BASE_URL = 'https://everest-sentimental-dashboard-backend.onrender.com';

  // COMMENTED OUT FOR DIRECT ACCESS - Token verification on load
  // useEffect(() => {
  //   const token = localStorage.getItem('auth_token');
  //   if (token) {
  //     axios
  //       .get(`${BASE_URL}/api/verify`, {
  //         headers: { Authorization: `Bearer ${token}` }
  //       })
  //       .then((res) => {
  //         // If token is valid, mark as authenticated.
  //         setIsAuthenticated(true);
  //       })
  //       .catch(() => {
  //         // If verification fails, remove the token.
  //         localStorage.removeItem('auth_token');
  //         setIsAuthenticated(false);
  //       })
  //       .finally(() => {
  //         setLoading(false);
  //       });
  //   } else {
  //     setLoading(false);
  //   }
  // }, [BASE_URL]);

  // COMMENTED OUT FOR DIRECT ACCESS - Authentication handlers
  // const handleSignIn = (token: string) => {
  //   localStorage.setItem('auth_token', token);
  //   setIsAuthenticated(true);
  // };

  // const handleSignOut = () => {
  //   localStorage.removeItem('auth_token');
  //   setIsAuthenticated(false);
  // };

  // const handleSignUp = (token: string) => {
  //   localStorage.setItem('auth_token', token);
  //   setIsAuthenticated(true);
  //   setShowSignUp(false);
  // };

  // COMMENTED OUT FOR DIRECT ACCESS - Loading state
  // if (loading) {
  //   return <div>Loading...</div>;
  // }

  // DIRECT ACCESS - Always render Dashboard
  return (
    <>
      <Toaster position="top-right" />
      <Dashboard />
    </>
  );

  // COMMENTED OUT FOR DIRECT ACCESS - Conditional rendering based on auth
  // if (isAuthenticated) {
  //   return (
  //     <>
  //       <Toaster position="top-right" />
  //       <Dashboard onSignOut={handleSignOut} />
  //     </>
  //   );
  // }

  // return (
  //   <>
  //     <Toaster position="top-right" />
  //     {showSignUp ? (
  //       <SignUp 
  //         onSignUp={handleSignUp}
  //         onBackToSignIn={() => setShowSignUp(false)}
  //       />
  //     ) : (
  //       <SignIn 
  //         onSignIn={handleSignIn}
  //         onSignUp={() => setShowSignUp(true)}
  //       />
  //     )}
  //   </>
  // );
}

export default App;
