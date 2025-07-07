const jwt = require('jsonwebtoken');
const User = require('../models/User');

// Import the connection cache utility
const connectionCache = require('../utils/connectioncache');
const { connections: activeConnections } = connectionCache;

// Clean up old connections periodically
const cleanupInterval = setInterval(() => {
  try {
    const now = Date.now();
    const fiveMinutesAgo = now - (5 * 60 * 1000);
    let removedCount = 0;
    
    // Get all user connections
    const userIds = connectionCache.getConnectedUserIds();
    
    for (const userId of userIds) {
      const lastSeen = connectionCache.getLastSeen(userId);
      
      if (lastSeen && lastSeen < fiveMinutesAgo) {
        console.log(`[${new Date().toISOString()}] Removing inactive connection: ${userId}`);
        
        // Update user status in the database
        User.findByIdAndUpdate(userId, {
          isOnline: false,
          lastSeen: new Date(lastSeen)
        }).catch(err => {
          console.error(`[${new Date().toISOString()}] Error updating user status during cleanup:`, {
            userId,
            error: err.message
          });
        });
        
        // Remove from active connections
        connectionCache.removeConnection(userId);
        removedCount++;
      }
    }
    
    if (removedCount > 0) {
      console.log(`[${new Date().toISOString()}] Cleaned up ${removedCount} inactive connections`);
    }
  } catch (error) {
    console.error(`[${new Date().toISOString()}] Error in connection cleanup:`, error);
  }
}, 5 * 60 * 1000); // Run every 5 minutes

// Clean up the interval when the process exits
process.on('SIGTERM', () => {
  clearInterval(cleanupInterval);
});
process.on('SIGINT', () => {
  clearInterval(cleanupInterval);
  process.exit(0);
});

// Authentication middleware for HTTP requests
exports.authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided' 
      });
    }
    
    const token = authHeader.split(' ')[1];
    if (!token) {
      return res.status(401).json({ 
        success: false,
        message: 'No token provided' 
      });
    }

    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
    
    // Find user in database
    const user = await User.findById(decoded.id)
      .select('-password -otp -otpExpiresAt -__v');
      
    if (!user) {
      console.error('User not found for token:', { userId: decoded.id });
      return res.status(401).json({ 
        success: false,
        message: 'User not found' 
      });
    }
    
    // Update user's last seen time in the database
    const now = new Date();
    user.lastSeen = now;
    user.isOnline = true; // Mark as online since they're making authenticated requests
    
    // Save the updated user
    await user.save();
    
    // Update active connections
    connectionCache.updateConnection(user._id.toString());
    
    // Attach user to request
    req.user = user.toObject();
    next();
  } catch (error) {
    console.error('Authentication error:', {
      error: error.message,
      stack: error.stack,
      timestamp: new Date().toISOString()
    });
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({ 
        success: false,
        message: 'Invalid token' 
      });
    }
    
    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({ 
        success: false,
        message: 'Token expired' 
      });
    }
    
    res.status(500).json({ 
      success: false,
      message: 'Authentication failed',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
};

// Middleware to update last seen time for authenticated users
exports.updateLastSeen = async (req, res, next) => {
  if (!req.user) return next();
  
  try {
    const now = new Date();
    const userId = req.user._id.toString();
    
    // Update last seen in active connections
    connectionCache.updateConnection(userId);
    
    // Update last seen in database (debounced to avoid too many updates)
    if (!this.lastDbUpdate || (now - this.lastDbUpdate) > 60000) { // Update at most once per minute
      await User.findByIdAndUpdate(userId, {
        lastSeen: now,
        isOnline: true
      });
      this.lastDbUpdate = now;
    }
    
    next();
  } catch (error) {
    console.error('Error in updateLastSeen:', {
      error: error.message,
      stack: error.stack,
      userId: req.user?._id,
      timestamp: new Date().toISOString()
    });
    next(); // Don't fail the request for last seen update errors
  }
};

/**
 * WebSocket authentication middleware
 * Verifies the JWT token and attaches the user to the socket
 */
exports.authenticateSocket = async (socket, next) => {
  try {
    // Get token from either auth object or authorization header
    const token = socket.handshake.auth.token || 
                 (socket.handshake.headers.authorization || '').split(' ')[1];
    
    if (!token) {
      console.error(`[${new Date().toISOString()}] No token provided for WebSocket connection`);
      return next(new Error('Authentication error: No token provided'));
    }
    
    // Verify token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (!decoded || !decoded.id) {
      throw new Error('Invalid token: Missing user ID');
    }
    
    // Find user in database
    const user = await User.findById(decoded.id)
      .select('_id name email isOnline lastSeen')
      .lean();
    
    if (!user) {
      throw new Error('User not found');
    }
    
    // Attach user to socket for later use
    socket.user = user;
    
    // Update user's online status and last seen
    await User.findByIdAndUpdate(user._id, {
      $set: {
        isOnline: true,
        lastSeen: new Date()
      }
    });
    
    // Update connection cache
    connectionCache.updateConnection(user._id.toString());
    
    console.log(`[${new Date().toISOString()}] WebSocket authenticated:`, {
      userId: user._id,
      email: user.email,
      socketId: socket.id
    });
    
    next();
  } catch (error) {
    console.error(`[${new Date().toISOString()}] WebSocket authentication error:`, {
      error: error.message,
      token: token ? 'provided' : 'missing',
      socketId: socket.id,
      timestamp: new Date().toISOString(),
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    });
    
    // Send error to client before disconnecting
    if (socket.connected) {
      socket.emit('authentication_error', {
        success: false,
        message: 'Authentication failed',
        error: process.env.NODE_ENV === 'development' ? error.message : 'Invalid token'
      });
    }
    
    // Disconnect the socket
    next(new Error('Authentication error: Invalid or expired token'));
  }
};

// Get active connections
exports.getActiveConnections = () => {
  return activeConnections;
};