const express = require('express');
const http = require('http');
const https = require('https');
const path = require('path');
const fs = require('fs');
const { Server } = require('socket.io');
const cors = require('cors');
const dotenv = require('dotenv');
const connectDB = require('./config/db');
const authRoutes = require('./routes/auth');
const profileRoutes = require('./routes/profile');
const messageRoutes = require('./routes/messages');
const connectionCache = require('./utils/connectioncache');
const { authenticateSocket } = require('./middleware/authenticate');
const setupSocket = require('./socket');

// Load environment variables with explicit path
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  dotenv.config({ path: envPath });
  console.log('Environment variables loaded from:', envPath);
} else {
  console.warn('Warning: .env file not found at', envPath);
  dotenv.config(); // Fallback to default .env loading
}

// Set default environment variables if not set
process.env.NODE_ENV = process.env.NODE_ENV || 'development';
process.env.PORT = process.env.PORT || '5000';
process.env.CLIENT_URL = process.env.CLIENT_URL || 'http://localhost:3000';
process.env.JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-key';
process.env.MONGODB_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/fastconnect';

// Log environment variables for debugging
console.log('Environment:');
console.log('- NODE_ENV:', process.env.NODE_ENV);
console.log('- PORT:', process.env.PORT);
console.log('- CLIENT_URL:', process.env.CLIENT_URL);
console.log('- JWT_SECRET:', process.env.JWT_SECRET ? '***' : 'Not set');
console.log('- MONGODB_URI:', process.env.MONGODB_URI ? '***' : 'Not set');

// Initialize Express app
const app = express();

// Attach io to req for all requests (before routes)
app.use((req, res, next) => {
  req.io = req.app.get('io');
  next();
});

// Define allowedOrigins at the top-level scope for reuse
const allowedOrigins = [
  /^https?:\/\/localhost(:\d+)?$/,  // All localhost ports
  /^https?:\/\/192\.168\.1\.(\d+)(:\d+)?$/  // All 192.168.1.x addresses
  // Add production domains here
];

// Define unified CORS configuration
const corsOptions = {
  origin: function(origin, callback) {
    // Allow all origins in development
    if (process.env.NODE_ENV !== 'production') {
      return callback(null, true);
    }
    // In production, restrict origins (customize as needed)
    if (!origin) return callback(null, true);
    const isAllowed = allowedOrigins.some(pattern => pattern.test(origin));
    if (isAllowed) return callback(null, true);
    return callback(new Error('Not allowed by CORS'), false);
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept', 'Origin'],
  credentials: true,
  exposedHeaders: ['Content-Length', 'X-Request-ID'],
  maxAge: 86400,
  preflightContinue: false,
  optionsSuccessStatus: 204
};

// Apply CORS middleware ONCE before any routes or custom logic
app.use(cors(corsOptions));
app.options('*', cors(corsOptions));

// Add request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl}`);
  next();
});

// Simple health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Set up connection cache on the app instance
app.set('connectionCache', connectionCache);

// Connect to database
connectDB();

// Middleware
app.use(express.json());

// Routes with error handling
const loadRoute = (path, router) => {
  try {
    app.use(path, router);
    console.log(`Route loaded: ${path}`);
  } catch (error) {
    console.error(`Failed to load route ${path}:`, error);
    process.exit(1);
  }
};

// Load routes with error handling
loadRoute('/api/auth', authRoutes);
loadRoute('/api/profile', profileRoutes);
loadRoute('/api/messages', messageRoutes);

// Serve static files
app.use('/uploads', express.static('uploads'));

// Test route
app.get("/", (req, res) => {
  res.send("FASTConnect backend running...");
});

// Export the Express app for use in https-server.js
module.exports = app;