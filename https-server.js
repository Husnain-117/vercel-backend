const https = require('https');
const fs = require('fs');
const path = require('path');
const os = require('os');

require('dotenv').config();
const app = require('./index');

const isProduction = process.env.NODE_ENV === 'production';
const PORT = process.env.PORT || 5000;

let io;
let server;

if (isProduction) {
  // In production (Railway), use HTTP (Railway provides HTTPS at the proxy)
  const http = require('http');
  server = http.createServer(app);

  io = require('socket.io')(server, {
    cors: {
      origin: [
        "https://fast-connect-three.vercel.app",
      ],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  require('./socket')(io);
  app.set('io', io);

  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Production server running on port ${PORT}`);
  });

  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    server.close(() => process.exit(1));
  });
} else {
  // Local development: Use HTTPS server with mkcert certificates
  const certsDir = path.resolve(__dirname, '../.cert');
  const keyPath = path.join(certsDir, 'localhost-key.pem');
  const certPath = path.join(certsDir, 'localhost.pem');

  if (!fs.existsSync(keyPath) || !fs.existsSync(certPath)) {
    console.error('❌ mkcert certificates not found. To generate them, run:');
    console.error('  mkcert -install');
    console.error('  mkcert -key-file .cert/localhost-key.pem -cert-file .cert/localhost.pem localhost 127.0.0.1 ::1 192.168.1.15');
    process.exit(1);
  }

  const serverOptions = {
    key: fs.readFileSync(keyPath, 'utf8'),
    cert: fs.readFileSync(certPath, 'utf8'),
    // rejectUnauthorized: false // (optional, for dev only)
  };

  server = https.createServer(serverOptions, app);

  io = require('socket.io')(server, {
    cors: {
      origin: [
        "https://localhost:5173",
        "https://192.168.1.15:5173",
        "https://fast-connect-three.vercel.app",
      ],
      methods: ["GET", "POST"],
      credentials: true
    }
  });

  // Debug: Log all connection attempts and errors
  io.on('connection', (socket) => {
    console.log('[Socket.IO] New connection:', socket.id, 'from', socket.handshake.address, 'query:', socket.handshake.query);
    socket.on('error', (err) => {
      console.error('[Socket.IO] Socket error:', err);
    });
    socket.on('disconnect', (reason) => {
      console.log('[Socket.IO] Disconnected:', socket.id, 'reason:', reason);
    });
  });

  io.engine.on('connection_error', (err) => {
    console.error('[Socket.IO] Engine connection error:', err.req ? err.req.headers : '', err.code, err.message, err.context);
  });

  require('./socket')(io);
  app.set('io', io);

  // Get port from environment or use 5000
  const PORT = process.env.PORT || 5000;

  // Get the actual local IP address for LAN access
  function getLocalIp() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
      for (const iface of interfaces[name]) {
        if (iface.family === 'IPv4' && !iface.internal && iface.address.startsWith('192.168.')) {
          return iface.address;
        }
      }
    }
    return 'localhost';
  }
  const localIp = getLocalIp();

  // Start the server
  server.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running in ${process.env.NODE_ENV || 'development'} mode`);
    console.log(`HTTPS Server: https://localhost:${PORT}`);
    console.log(`HTTPS Server (LAN): https://${localIp}:${PORT}`);
  });

  // Handle unhandled promise rejections
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    server.close(() => process.exit(1));
  });
}
