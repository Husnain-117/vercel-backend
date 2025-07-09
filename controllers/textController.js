const Message = require('../models/Message');
const User = require('../models/User');

// Send a new message (Global chat - no receiver)
exports.sendMessage = async (req, res) => {
  try {
    const { text } = req.body;
    const senderId = req.user._id;

    if (!text || !senderId) {
      return res.status(400).json({ success: false, message: 'Missing message or sender' });
    }

    // Create and save the new message (global chat - no receiver needed)
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

// Send a message to a specific user
exports.sendMessageToUser = async (req, res) => {
  try {
    console.log('sendMessageToUser called with body:', req.body);
    console.log('User from request:', req.user);
    
    const { text, receiverId } = req.body;
    const senderId = req.user._id;

    if (!text || !senderId || !receiverId) {
      return res.status(400).json({ 
        success: false, 
        message: 'Missing required fields: text, sender, or receiver' 
      });
    }

    // Validate that receiver exists
    const receiver = await User.findById(receiverId);
    if (!receiver) {
      return res.status(404).json({ 
        success: false, 
        message: 'Receiver not found' 
      });
    }

    // Create and save the new message
    const newMessage = new Message({
      text,
      sender: senderId,
      receiver: receiverId,
      timestamp: new Date()
    });

    await newMessage.save();

    // Populate user data for both sender and receiver
    const populatedMessage = await Message.findById(newMessage._id)
      .populate('sender', 'name email avatar')
      .populate('receiver', 'name email avatar')
      .lean();

    // Log the message for debugging
    console.log('New direct message created:', populatedMessage);

    // Emit to all connected clients including sender and receiver
    if (req.io) {
      console.log('Emitting new_direct_message event');
      req.io.emit('new_direct_message', populatedMessage);
    } else {
      console.warn('Socket.io instance not available - message will not be broadcast in real-time');
    }

    // Send success response with the populated message
    res.json({ 
      success: true, 
      message: populatedMessage 
    });

  } catch (err) {
    console.error('Error sending direct message:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to send direct message',
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

// Get all messages (Global chat only - messages without receiver)
exports.getMessages = async (req, res) => {
  try {
    const messages = await Message.find({ receiver: { $exists: false } }) // Only global chat messages
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

// Get messages between two specific users
exports.getMessagesBetweenUsers = async (req, res) => {
  try {
    const { userId1, userId2 } = req.params;
    const currentUserId = req.user._id;

    console.log('Debug - Current user ID:', currentUserId.toString());
    console.log('Debug - User ID 1:', userId1);
    console.log('Debug - User ID 2:', userId2);
    console.log('Debug - Current user matches ID1:', currentUserId.toString() === userId1);
    console.log('Debug - Current user matches ID2:', currentUserId.toString() === userId2);

    // Ensure the current user is one of the participants
    if (currentUserId.toString() !== userId1 && currentUserId.toString() !== userId2) {
      return res.status(403).json({ 
        success: false, 
        message: 'You can only view conversations you are part of',
        debug: {
          currentUserId: currentUserId.toString(),
          userId1,
          userId2
        }
      });
    }

    const messages = await Message.find({
      $or: [
        { sender: userId1, receiver: userId2 },
        { sender: userId2, receiver: userId1 }
      ]
    })
      .populate('sender', 'name email avatar')
      .populate('receiver', 'name email avatar')
      .sort({ timestamp: 1 }) // oldest first
      .lean();

    res.json({ success: true, messages });
  } catch (err) {
    console.error('Error fetching messages between users:', err);
    res.status(500).json({ 
      success: false, 
      message: 'Failed to fetch messages between users',
      error: err.message 
    });
  }
};

// Get all users who have direct messaged the current user (sent or received) with all messages
exports.getInbox = async (req, res) => {
  try {
    const currentUserId = req.user._id;

    // Find all unique user IDs who have sent or received messages with the current user
    const conversations = await Message.aggregate([
      {
        $match: {
          $or: [
            { sender: currentUserId },
            { receiver: currentUserId }
          ],
          receiver: { $exists: true, $ne: null } // Only direct messages
        }
      },
      {
        $project: {
          otherUser: {
            $cond: [
              { $eq: ["$sender", currentUserId] },
              "$receiver",
              "$sender"
            ]
          },
          _id: 1
        }
      },
      {
        $group: {
          _id: "$otherUser"
        }
      }
    ]);

    const userIds = conversations.map(c => c._id);
    const users = await User.find({ _id: { $in: userIds } }, "_id name email avatar");

    // Get all messages for each conversation
    const inboxData = await Promise.all(
      conversations.map(async (conv) => {
        const user = users.find(u => u._id.toString() === conv._id.toString());
        
        // Get all messages between current user and this user
        const messages = await Message.find({
          $or: [
            { sender: currentUserId, receiver: conv._id },
            { sender: conv._id, receiver: currentUserId }
          ],
          receiver: { $exists: true, $ne: null }
        })
          .populate('sender', 'name email avatar')
          .populate('receiver', 'name email avatar')
          .sort({ timestamp: 1 }) // oldest first
          .lean();

        return {
          user: user || { _id: conv._id, name: "Unknown User", email: "", avatar: "" },
          messages: messages
        };
      })
    );

    res.json({ success: true, conversations: inboxData });
  } catch (err) {
    console.error('Error fetching inbox:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch inbox',
      error: err.message
    });
  }
};

// Get all messages between current user and a specific user (conversation history)
exports.getConversation = async (req, res) => {
  try {
    const currentUserId = req.user._id;
    const { userId } = req.params;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }

    // Get all messages between the two users
    const messages = await Message.find({
      $or: [
        { sender: currentUserId, receiver: userId },
        { sender: userId, receiver: currentUserId }
      ],
      receiver: { $exists: true, $ne: null } // Only direct messages
    })
      .populate('sender', 'name email avatar')
      .populate('receiver', 'name email avatar')
      .sort({ timestamp: 1 }) // oldest first
      .lean();

    // Get the other user's profile info
    const otherUser = await User.findById(userId, 'name email avatar');

    res.json({
      success: true,
      messages,
      otherUser: otherUser || { _id: userId, name: "Unknown User", email: "", avatar: "" }
    });
  } catch (err) {
    console.error('Error fetching conversation:', err);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch conversation',
      error: err.message
    });
  }
};