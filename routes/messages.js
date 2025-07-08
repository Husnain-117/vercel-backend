const express = require('express');
const router = express.Router();


const textController = require('../controllers/textController');
const { authenticate } = require('../middleware/authenticate');

router.get('/test', (req, res) => {
  res.json({ message: 'Messages route is working!' });
});

router.post('/send', authenticate, textController.sendMessage);
router.post('/send-to-user', authenticate, textController.sendMessageToUser);

router.get('/all', textController.getMessages);

// Delete all chats
router.delete('/all', authenticate, textController.deleteAllMessages);

module.exports = router; 