// ===== voiceSignalingController.js =====

const User = require('../models/User');

const voiceChatUsers = new Set();

module.exports = (io) => {
  io.on("connection", (socket) => {
    console.log("🔌 New client connected:", socket.id);

    // User joins a room
    socket.on("join-room", async (roomId) => {
      socket.join(roomId);
      // Fetch all online users from the database
      const onlineUsers = await User.find({ isOnline: true })
        .select('_id name email avatar campus batch lastSeen isOnline')
        .lean();
      // Emit the list to everyone in the room
      io.to(roomId).emit("all-users", onlineUsers);
    });

    // Handle offer
    socket.on("offer", ({ offer, to }) => {
      console.log(`📨 Offer sent from ${socket.id} to ${to}`);
      io.to(to).emit("offer", { offer, from: socket.id });
    });

    // Handle answer
    socket.on("answer", ({ answer, to }) => {
      console.log(`✅ Answer sent from ${socket.id} to ${to}`);
      io.to(to).emit("answer", { answer, from: socket.id });
    });

    // Handle ICE candidate
    socket.on("ice-candidate", ({ candidate, to }) => {
      console.log(`❄ ICE candidate sent from ${socket.id} to ${to}`);
      io.to(to).emit("ice-candidate", { candidate, from: socket.id });
    });

    socket.on('join-voice-chat', (user) => {
      voiceChatUsers.add(user.id); // or user.email, etc.
      io.emit('voice-chat-users', Array.from(voiceChatUsers));
      socket.voiceChatUserId = user.id;
    });

    socket.on('leave-voice-chat', () => {
      if (socket.voiceChatUserId) {
        voiceChatUsers.delete(socket.voiceChatUserId);
        io.emit('voice-chat-users', Array.from(voiceChatUsers));
      }
    });

    socket.on('voice-chat-users', (users) => {
      console.log('[VoiceChat] voice-chat-users event received:', users);
      setUsersInRoom(users);
    });

    // On disconnect
    socket.on("disconnect", () => {
      console.log(`🚫 User disconnected: ${socket.id}`);
      io.emit("user-disconnected", socket.id); // optional
      if (socket.voiceChatUserId) {
        voiceChatUsers.delete(socket.voiceChatUserId);
        io.emit('voice-chat-users', Array.from(voiceChatUsers));
      }
    });
  });
};



