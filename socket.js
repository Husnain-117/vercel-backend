const User = require('./models/User');
const videoChatController = require('./controllers/videoChatController');

const setupSocket = (io) => {
  // Add middleware to handle authentication and attach user data
  io.use(async (socket, next) => {
    const userId = socket.handshake.query.userId;
    if (!userId) {
      return next(new Error('Authentication error'));
    }
    try {
      const user = await User.findById(userId);
      if (!user) {
        return next(new Error('User not found'));
      }
      socket.user = user;
      next();
    } catch (error) {
      next(error);
    }
  });

  // --- Voice Chat Matching Logic ---
  const waitingQueue = [];
  const activeMatches = new Map(); // socket.id -> match info

  io.on('connection', async (socket) => {
    console.log('[Socket.IO] New client connected:', socket.id);
    
    try {
      // Update user's online status
      await User.findByIdAndUpdate(socket.user._id, { 
        isOnline: true,
        socketId: socket.id
      });
      
      // Join a room for this user
      socket.join(`user_${socket.user._id}`);
      console.log(`[Socket.IO] User ${socket.user._id} joined room user_${socket.user._id}`);
      
      // Notify others that this user is now online
      socket.broadcast.emit('user_online', { userId: socket.user._id });
      
      // Update online users count
      const onlineUsers = await User.countDocuments({ isOnline: true });
      io.emit('online_users', onlineUsers);
      console.log('[Socket.IO] Online users count:', onlineUsers);
      
    } catch (error) {
      console.error('[Socket.IO] Error handling socket connection:', error);
    }

    // --- Random Matching ---
    socket.on('start-search', () => {
      // If already matched, ignore
      if (activeMatches.has(socket.id)) return;
      // Add to queue if not already present
      if (!waitingQueue.includes(socket.id)) {
        waitingQueue.push(socket.id);
      }
      // Try to match
      if (waitingQueue.length >= 2) {
        // Randomly pick another user (not self)
        let idx = waitingQueue.indexOf(socket.id);
        let otherIdx = (idx === 0) ? 1 : 0;
        const otherSocketId = waitingQueue[otherIdx];
        const otherSocket = io.sockets.sockets.get(otherSocketId);
        if (otherSocket) {
          // Remove both from queue
          waitingQueue.splice(Math.max(idx, otherIdx), 1);
          waitingQueue.splice(Math.min(idx, otherIdx), 1);
          // Save match info
          activeMatches.set(socket.id, { peer: otherSocketId, status: 'pending' });
          activeMatches.set(otherSocketId, { peer: socket.id, status: 'pending' });
          // Notify both
          socket.emit('match-found', { peerId: otherSocketId, peerInfo: otherSocket.user });
          otherSocket.emit('match-found', { peerId: socket.id, peerInfo: socket.user });
        }
      }
    });

    socket.on('user-response', ({ response }) => {
      const match = activeMatches.get(socket.id);
      if (!match) return;
      match.response = response;
      const peerSocket = io.sockets.sockets.get(match.peer);
      const peerMatch = activeMatches.get(match.peer);
      if (peerMatch && peerMatch.response) {
        // Both responded
        if (match.response === 'connect' && peerMatch.response === 'connect') {
          // Start chat
          socket.emit('chat-start', { peerId: match.peer, peerInfo: peerSocket.user });
          peerSocket.emit('chat-start', { peerId: socket.id, peerInfo: socket.user });
        } else {
          // At least one skipped
          socket.emit('chat-skip');
          peerSocket.emit('chat-skip');
          // Put both back in queue
          waitingQueue.push(socket.id);
          waitingQueue.push(match.peer);
        }
        // Remove match info
        activeMatches.delete(socket.id);
        activeMatches.delete(match.peer);
      } else {
        // Wait for peer's response
        socket.emit('waiting-peer-response');
      }
    });

    // Clean up on disconnect
    socket.on('disconnect', async () => {
      console.log('[Socket.IO] Client disconnected:', socket.id);
      // Remove from queue
      const idx = waitingQueue.indexOf(socket.id);
      if (idx !== -1) waitingQueue.splice(idx, 1);
      // Remove from active matches
      const match = activeMatches.get(socket.id);
      if (match && match.peer) {
        const peerSocket = io.sockets.sockets.get(match.peer);
        if (peerSocket) {
          peerSocket.emit('chat-skip');
          waitingQueue.push(match.peer);
        }
        activeMatches.delete(match.peer);
      }
      activeMatches.delete(socket.id);
      
      try {
        // Update user's online status
        await User.findByIdAndUpdate(socket.user._id, { 
          isOnline: false,
          $unset: { socketId: 1 }
        });
        
        // Notify others that this user is now offline
        socket.broadcast.emit('user_offline', { userId: socket.user._id });
        
        // Update online users count
        const onlineUsers = await User.countDocuments({ isOnline: true });
        io.emit('online_users', onlineUsers);
        console.log('[Socket.IO] Online users count after disconnect:', onlineUsers);
        
      } catch (error) {
        console.error('[Socket.IO] Error handling socket disconnection:', error);
      }
    });

    // Handle typing events
    socket.on('typing', () => {
      console.log('[Socket.IO] typing event from:', socket.user._id);
      socket.broadcast.emit('user_typing', { userId: socket.user._id });
    });

    // Handle errors
    socket.on('error', (error) => {
      console.error('[Socket.IO] Socket error:', error);
    });

    // --- Existing presence logic for user list ---
    socket.on('join-voice-chat', (user) => {
      socket.user = user;
      io.emit('voice-chat-users', Array.from(io.sockets.sockets.values()).map(s => s.user).filter(Boolean));
    });
    socket.on('leave-voice-chat', () => {
      io.emit('voice-chat-users', Array.from(io.sockets.sockets.values()).map(s => s.user).filter(Boolean));
    });

    // --- End Chat Relay ---
    socket.on('chat-ended', ({ to, name }) => {
      // Relay to the peer if exists
      const peerSocket = io.sockets.sockets.get(to);
      if (peerSocket) {
        peerSocket.emit('chat-ended', { by: socket.id, name });
      }
      // Clean up active match for both sides
      const match = activeMatches.get(socket.id);
      if (match) {
        activeMatches.delete(socket.id);
        activeMatches.delete(match.peer);
      }
      const peerMatch = activeMatches.get(to);
      if (peerMatch) {
        activeMatches.delete(to);
        activeMatches.delete(peerMatch.peer);
      }
    });

    // --- WebRTC Signaling Relay ---
    socket.on('offer', ({ offer, to }) => {
      console.log(`[WebRTC] Offer relayed from ${socket.id} to ${to}`);
      io.to(to).emit('offer', { offer, from: socket.id });
    });
    socket.on('answer', ({ answer, to }) => {
      console.log(`[WebRTC] Answer relayed from ${socket.id} to ${to}`);
      io.to(to).emit('answer', { answer, from: socket.id });
    });
    socket.on('ice-candidate', ({ candidate, to }) => {
      console.log(`[WebRTC] ICE candidate relayed from ${socket.id} to ${to}`);
      io.to(to).emit('ice-candidate', { candidate, from: socket.id });
    });
  });

  // Attach video chat controller
  videoChatController(io);
};

module.exports = setupSocket;
