const express = require('express');
const router = express.Router();
const {
  sendSignupOtp,
  verifySignupOtp,
  completeSignup,
  login,
  sendForgotPasswordOtp,
  verifyForgotPasswordOtp,
  resetPassword,
  getCurrentUser,
  logout,
  googleOAuth,
  googleOAuthCallback
} = require('../controllers/authController');
const { authenticateToken } = require('../utils/generateToken');

// Signup flow routes
router.post('/send-otp', sendSignupOtp);
router.post('/verify-otp', verifySignupOtp);
router.post('/signup', completeSignup);

// Login route
router.post('/login', login);

// Forgot password flow routes
router.post('/forgot/send-otp', sendForgotPasswordOtp);
router.post('/forgot/verify-otp', verifyForgotPasswordOtp);
router.post('/forgot/reset-password', resetPassword);

// Protected routes (require authentication)
router.get('/me', authenticateToken, getCurrentUser);
router.post('/logout', authenticateToken, logout);

// Google OAuth routes (placeholders)
router.get('/google', googleOAuth);
router.get('/google/callback', googleOAuthCallback);

module.exports = router;

