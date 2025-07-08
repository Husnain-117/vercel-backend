const User = require('../models/User');
const connectionCache = require('../utils/connectioncache');
const mongoose = require('mongoose');

// Update user status to online
// Call this when user logs in or connects via socket
exports.userConnected = async (req, res) => {
  try {
    const userId = req.user?.id; // Get user ID from authenticated request
    
    if (!userId) {
      console.error('No user ID in request:', { user: req.user });
      return res.status(400).json({
        success: false,
        message: 'User ID is required'
      });
    }
    
    console.log(`[${new Date().toISOString()}] User connecting:`, { userId });
    
    // Update user status in the database
    const updatedUser = await User.findByIdAndUpdate(
      userId,
      {
        $set: {
          isOnline: true,
          lastSeen: new Date()
        }
      },
      { 
        new: true,
        upsert: false
      }
    );
    
    // Update active connections
    connectionCache.updateConnection(userId);
    
    if (!updatedUser) {
      console.error('User not found:', { userId });
      return res.status(404).json({
        success: false,
        message: 'User not found'
      });
    }
    
    console.log(`[${new Date().toISOString()}] User connected successfully:`, {
      userId: updatedUser._id,
      email: updatedUser.email,
      isOnline: updatedUser.isOnline,
      lastSeen: updatedUser.lastSeen,
      currentTime: new Date()
    });
    
    res.json({
      success: true,
      message: 'User status updated to online',
      user: {
        id: updatedUser._id,
        email: updatedUser.email,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen
      }
    });
    
  } catch (err) {
    console.error('Error updating user online status:', {
      error: err.message,
      stack: err.stack,
      userId: req.user?.id
    });
    
    res.status(500).json({
      success: false,
      message: 'Error updating online status',
      error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
    });
  }
};

// Update user status to offline
// Call this when user logs out or disconnects
exports.userDisconnected = async (req, res) => {
  try {
    const userId = req.user.id; // Get user ID from authenticated request
    
    // Update user status in the database
    const updatedUser = await User.findByIdAndUpdate(userId, {
      isOnline: false,
      lastSeen: new Date()
    }, { new: true });
    
    // Remove from active connections
    connectionCache.removeConnection(userId);
    
    console.log("User disconnected:", {
      userId,
      isOnline: updatedUser.isOnline,
      lastSeen: updatedUser.lastSeen
    });
    
    res.json({
      success: true,
      message: 'User status updated to offline',
      user: {
        id: updatedUser._id,
        isOnline: updatedUser.isOnline,
        lastSeen: updatedUser.lastSeen
      }
    });
  } catch (err) {
    console.error('Error updating user offline status:', err);
    res.status(500).json({
      success: false,
      message: 'Error updating offline status',
      error: err.message
    });
  }
};

// Get user profile
exports.getProfile = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const user = await User.findById(userId).select('-password -otp -otpExpiresAt');
    if (!user) return res.status(404).json({ message: 'User not found' });

    // Check if profile fields are set
    const profileFields = ['campus', 'batch', 'profilePhoto', 'gender', 'age', 'aboutMe', 'nickname'];
    const isProfileSet = profileFields.some(field => user[field]);

    if (!isProfileSet) {
      return res.status(200).json({ message: 'Profile not set yet' });
    }

    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Get all online users
exports.getOnlineUsers = async (req, res) => {
  try {
    const currentUserId = req.user?._id?.toString(); // Get the ID of the currently authenticated user
    const fiveMinutesAgo = Date.now() - (5 * 60 * 1000); // 5 minutes ago in milliseconds
    
    console.log(`[${new Date().toISOString()}] Fetching online users for user: ${currentUserId || 'not authenticated'}`);
    
    // Get active user IDs from the connection cache
    const activeUserIds = connectionCache.getConnectedUserIds();
    
    // If we have active connections, use them to find online users
    if (activeUserIds.length > 0) {
      console.log(`[${new Date().toISOString()}] Found ${activeUserIds.length} active connections`);
      
      // Filter out any stale connections (older than 5 minutes)
      const validUserIds = activeUserIds.filter(userId => {
        const lastSeen = connectionCache.getLastSeen(userId);
        return lastSeen && lastSeen >= fiveMinutesAgo;
      });
      
      console.log(`[${new Date().toISOString()}] Found ${validUserIds.length} valid active connections`);
      
      // Find users who are in the active connections and not the current user
      const onlineUsers = await User.find({
        _id: { $in: validUserIds, $ne: currentUserId },
        isOnline: true
      })
      .select('_id name email avatar campus batch lastSeen isOnline')
      .sort({ lastSeen: -1 }) // Most recently active first
      .lean();
      
      console.log(`Found ${onlineUsers.length} online users in database`);
      
      // Format the response
      const formattedUsers = onlineUsers.map(user => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isOnline: true, // We know they're online because they're in active connections
        lastSeen: user.lastSeen,
        campus: user.campus,
        batch: user.batch
      }));
      
      return res.json({
        success: true,
        count: formattedUsers.length,
        users: formattedUsers
      });
    }
    
    // If no active connections or no valid users found
    return res.json({
      success: true,
      count: 0,
      users: []
    });
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in getOnlineUsers:`, {
      error: error.message,
      stack: error.stack,
      currentUserId: req.user?._id?.toString(),
      timestamp: new Date().toISOString()
    });
    
    // Fallback to database if there's an error with the cache
    try {
      const onlineUsers = await User.find({
        _id: { $ne: req.user?._id },
        isOnline: true
      })
      .select('_id name email avatar campus batch lastSeen isOnline')
      .sort({ lastSeen: -1 }) // Most recently active first
      .lean();
      
      const formattedUsers = onlineUsers.map(user => ({
        _id: user._id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
        isOnline: true,
        lastSeen: user.lastSeen,
        campus: user.campus,
        batch: user.batch
      }));
      
      return res.json({
        success: true,
        count: formattedUsers.length,
        users: formattedUsers
      });
    } catch (err) {
      console.error('Error fetching online users:', {
        error: err.message,
        stack: err.stack,
        userId: req.user?._id
      });
      
      res.status(500).json({ 
        success: false,
        message: 'Failed to fetch online users',
        error: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error'
      });
    }
  }
};

// Update user profile
exports.updateProfile = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const updateFields = {};
    const allowedFields = ['name', 'campus', 'batch', 'profilePhoto', 'gender', 'age', 'aboutMe', 'nickname'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) updateFields[field] = req.body[field];
    });
    const user = await User.findByIdAndUpdate(userId, updateFields, { new: true, runValidators: true, upsert: true }).select('-password -otp -otpExpiresAt');
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Delete user profile
exports.deleteProfile = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const user = await User.findByIdAndDelete(userId);
    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json({ message: 'Profile deleted successfully' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};

// Create user profile
exports.createProfile = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    const existingUser = await User.findById(userId);
    if (!existingUser) return res.status(404).json({ message: 'User not found' });
    // If profile fields already exist, treat as already created
    if (existingUser.campus || existingUser.batch || existingUser.gender || existingUser.age || existingUser.aboutMe || existingUser.nickname || existingUser.profilePhoto) {
      return res.status(400).json({ message: 'Profile already exists' });
    }
    const allowedFields = ['name', 'campus', 'batch', 'profilePhoto', 'gender', 'age', 'aboutMe', 'nickname'];
    allowedFields.forEach(field => {
      if (req.body[field] !== undefined) existingUser[field] = req.body[field];
    });
    await existingUser.save();
    res.json(existingUser);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
}; 

exports.uploadProfilePhoto = async (req, res) => {
  try {
    const userId = req.params.userId;
    if (!userId || !mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ message: 'Invalid user ID' });
    }
    if (!req.file) return res.status(400).json({ message: 'No file uploaded' });

    // Add cache-busting query param to the photo URL
    const photoUrl = `/uploads/${req.file.filename}?v=${Date.now()}`;
    const user = await User.findByIdAndUpdate(
      userId,
      { profilePhoto: photoUrl },
      { new: true }
    ).select('-password -otp -otpExpiresAt');

    if (!user) return res.status(404).json({ message: 'User not found' });
    res.json(user);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
};