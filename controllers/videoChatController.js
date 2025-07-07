// ===== videoChatController.js =====

const User = require('../models/User');

const videoChatUsers = new Set();
const videoWaitingQueue = [];
const videoActiveMatches = new Map(); // socket.id -> match info

module.exports = (io) => {
  io.on("connection", (socket) => {
    // User joins video chat
    socket.on("join-video-chat", (user) => {
      videoChatUsers.add(user.id);
      io.emit('video-chat-users', Array.from(videoChatUsers));
      socket.videoChatUserId = user.id;
    });

    // User leaves video chat
    socket.on("leave-video-chat", () => {
      if (socket.videoChatUserId) {
        videoChatUsers.delete(socket.videoChatUserId);
        io.emit('video-chat-users', Array.from(videoChatUsers));
      }
    });

    // --- Video Chat Random Matching ---
    socket.on('start-video-search', () => {
      if (videoActiveMatches.has(socket.id)) return;
      if (!videoWaitingQueue.includes(socket.id)) {
        videoWaitingQueue.push(socket.id);
      }
      if (videoWaitingQueue.length >= 2) {
        let idx = videoWaitingQueue.indexOf(socket.id);
        let otherIdx = (idx === 0) ? 1 : 0;
        const otherSocketId = videoWaitingQueue[otherIdx];
        const otherSocket = io.sockets.sockets.get(otherSocketId);
        if (otherSocket) {
          videoWaitingQueue.splice(Math.max(idx, otherIdx), 1);
          videoWaitingQueue.splice(Math.min(idx, otherIdx), 1);
          videoActiveMatches.set(socket.id, { peer: otherSocketId, status: 'pending' });
          videoActiveMatches.set(otherSocketId, { peer: socket.id, status: 'pending' });
          socket.emit('video-match-found', { peerId: otherSocketId, peerInfo: otherSocket.user });
          otherSocket.emit('video-match-found', { peerId: socket.id, peerInfo: socket.user });
        }
      }
    });

    socket.on('video-user-response', ({ response }) => {
      const match = videoActiveMatches.get(socket.id);
      if (!match) return;
      match.response = response;
      const peerSocket = io.sockets.sockets.get(match.peer);
      const peerMatch = videoActiveMatches.get(match.peer);
      if (peerMatch && peerMatch.response) {
        if (match.response === 'connect' && peerMatch.response === 'connect') {
          socket.emit('video-chat-start', { peerId: match.peer, peerInfo: peerSocket.user });
          peerSocket.emit('video-chat-start', { peerId: socket.id, peerInfo: socket.user });
        } else {
          socket.emit('video-chat-skip');
          peerSocket.emit('video-chat-skip');
          videoWaitingQueue.push(socket.id);
          videoWaitingQueue.push(match.peer);
        }
        videoActiveMatches.delete(socket.id);
        videoActiveMatches.delete(match.peer);
      } else {
        socket.emit('video-waiting-peer-response');
      }
    });

    // End/skip chat
    socket.on('video-chat-ended', (data) => {
      const match = videoActiveMatches.get(socket.id);
      if (match && match.peer) {
        const peerSocket = io.sockets.sockets.get(match.peer);
        if (peerSocket) {
          peerSocket.emit('video-chat-ended', { by: socket.id, name: socket.user?.name });
        }
        videoActiveMatches.delete(match.peer);
      }
      videoActiveMatches.delete(socket.id);
    });
    socket.on('video-chat-skip', () => {
      const match = videoActiveMatches.get(socket.id);
      if (match && match.peer) {
        const peerSocket = io.sockets.sockets.get(match.peer);
        if (peerSocket) {
          peerSocket.emit('video-chat-skip', { by: socket.id, name: socket.user?.name });
          videoWaitingQueue.push(match.peer);
        }
        videoActiveMatches.delete(match.peer);
      }
      videoActiveMatches.delete(socket.id);
    });

    // Clean up on disconnect
    socket.on("disconnect", () => {
      if (socket.videoChatUserId) {
        videoChatUsers.delete(socket.videoChatUserId);
        io.emit('video-chat-users', Array.from(videoChatUsers));
      }
      const idx = videoWaitingQueue.indexOf(socket.id);
      if (idx !== -1) videoWaitingQueue.splice(idx, 1);
      const match = videoActiveMatches.get(socket.id);
      if (match && match.peer) {
        const peerSocket = io.sockets.sockets.get(match.peer);
        if (peerSocket) {
          peerSocket.emit('video-chat-skip', { by: socket.id, name: socket.user?.name });
          videoWaitingQueue.push(match.peer);
        }
        videoActiveMatches.delete(match.peer);
      }
      videoActiveMatches.delete(socket.id);
    });

    // --- WebRTC Signaling ---
    socket.on("offer", ({ offer, to }) => {
      io.to(to).emit("offer", { offer, from: socket.id });
    });
    socket.on("answer", ({ answer, to }) => {
      io.to(to).emit("answer", { answer, from: socket.id });
    });
    socket.on("ice-candidate", ({ candidate, to }) => {
      io.to(to).emit("ice-candidate", { candidate, from: socket.id });
    });
  });
}; 