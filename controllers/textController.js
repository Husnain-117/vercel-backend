const Message = require('../models/Message');
const User = require('../models/User');

// Send a new message
exports.sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const senderId = req.user._id;

    if (!text || !senderId) {
      return res.status(400).json({ success: false, message: 'Missing message or sender' });
    }

    // Create and save the new message
    const newMessage = new Message({
      text,
      sender: senderId,
      timestamp: new Date()
    });

    await newMessage.save();

    // Populate user data
    const populatedMessage = await Message.findById(newMessage._id)
      .populate('sender', 'name email avatar')
      .lean();

    // Log the message for debugging
    console.log('New message created:', populatedMessage);

    // Emit to all connected clients including sender
    if (req.io) {
      console.log('Emitting new_message event');
      req.io.emit('new_message', populatedMessage);
    } else {
      console.warn('Socket.io instance not available - message will not be broadcast in real-time');
    }

    // Send success response with the populated message
    res.json({ 
      success: true, 
      message: populatedMessage 
    });

  } catch (err) {
    console.error('Error sending message:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send message',
      error: err.message 
    });
  }
};

// Delete all messages
exports.deleteAllMessages = async (req, res) => {
  try {
    await Message.deleteMany({});
    res.json({ success: true, message: 'All chats deleted.' });
  } catch (err) {
    console.error('Error deleting all messages:', err);
    res.status(500).json({ success: false, message: 'Failed to delete all chats', error: err.message });
  }
};

// Get all messages
exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({})
      .populate('sender', 'name email avatar')
      .sort({ timestamp: 1 }) // oldest first
      .lean();

    res.json({ success: true, messages });
  } catch (err) {
    console.error('Error fetching messages:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch messages',
      error: err.message 
    });
  }
};