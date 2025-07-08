const express = require('express');
const router = express.Router();


const profileController = require('../controllers/profileController');
const multer = require('multer');
const path = require('path');
const { authenticate, updateLastSeen } = require('../middleware/authenticate');

// Apply authentication middleware to all routes
router.use(authenticate);
router.use(updateLastSeen);

// Multer setup
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    cb(null, 'uploads/');
  },
  filename: function (req, file, cb) {
    cb(null, Date.now() + path.extname(file.originalname));
  }
});
const upload = multer({ storage: storage });

// Connection status endpoints
router.post('/connect', authenticate, profileController.userConnected);
router.post('/disconnect', authenticate, profileController.userDisconnected);

// Get all online users
router.get('/online', profileController.getOnlineUsers);

// New route for photo upload
router.post('/:userId/photo', upload.single('profilePhoto'), profileController.uploadProfilePhoto);

// Existing routes...
router.get('/:userId', profileController.getProfile);
router.put('/:userId', profileController.updateProfile);
router.delete('/:userId', profileController.deleteProfile);
router.post('/:userId', profileController.createProfile);

module.exports = router;