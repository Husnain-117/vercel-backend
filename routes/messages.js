const express = require('express');
const router = express.Router();

// CORS middleware for Vercel serverless
router.use((req, res, next) => {
  res.header("Access-Control-Allow-Origin", "https://fast-connect-three.vercel.app");
  res.header("Access-Control-Allow-Credentials", "true");
  res.header("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.header("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Requested-With, Accept, Origin");
  if (req.method === "OPTIONS") {
    res.sendStatus(204);
  } else {
    next();
  }
});
const textController = require('../controllers/textController');
const { authenticate } = require('../middleware/authenticate');

router.get('/test', (req, res) => {
  res.json({ message: 'Messages route is working!' });
});

router.post('/send', authenticate, textController.sendMessage);

router.get('/all', textController.getMessages);

// Delete all chats
router.delete('/all', authenticate, textController.deleteAllMessages);

module.exports = router; 