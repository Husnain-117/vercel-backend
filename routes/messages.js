const express = require('express');
const router = express.Router();
const textController = require('../controllers/textController');
const { authenticate } = require('../middleware/authenticate');

router.get('/test', (req, res) => {
  res.json({ message: 'Messages route is working!' });
});

router.post('/send', authenticate, textController.sendMessage);

// Send message to specific user
router.post('/send-to-user', authenticate, textController.sendMessageToUser);

// Get messages between two users
router.get('/between/:userId1/:userId2', authenticate, textController.getMessagesBetweenUsers);

router.get('/all', textController.getMessages);

// Delete all chats
router.delete('/all', authenticate, textController.deleteAllMessages);

module.exports = router; 