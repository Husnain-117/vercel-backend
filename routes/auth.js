const express = require('express');
const router = express.Router();


const authController = require('../controllers/authController');
const { authenticate } = require('../middleware/authenticate');

console.log('Initializing auth routes...');

// Test route
router.get('/test', (req, res) => {
  console.log('Test route hit');
  res.json({ message: 'Auth routes are working!' });
});

// Send OTP
router.post('/send-otp', authController.sendOTP);

// Verify OTP and complete registration
router.post('/verify-and-register', authController.verifyAndRegister);

// Login
router.post('/login', authController.login);

// Logout
router.post('/logout', authenticate, authController.logout);

// Forgot Password
router.post('/forgot-password', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

// Search users
router.get('/search-users', authController.searchUsers);

// Favorite routes
router.post('/favorites/add/:favoriteId', authenticate, authController.addFavorite);
router.delete('/favorites/remove/:favoriteId', authenticate, authController.removeFavorite);
router.get('/favorites', authenticate, authController.getFavorites);

// Delete user (keep this at the end to avoid route conflicts)
router.delete('/:userId', authController.deleteUser);

// Get all users (admin route)
router.get('/users', authController.getAllUsers);

// Get current user
router.get('/me', authenticate, authController.getMe);

console.log('Auth routes initialized');
module.exports = router;
