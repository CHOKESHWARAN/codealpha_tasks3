const http = require('node:http');
const path = require('node:path');
const express = require('express');
const cors = require('cors');
const { Server } = require('socket.io');

const config = require('./config');
const db = require('./db/database');
const seedDatabase = require('./db/seed');
const setupSocketHandler = require('./sockets/socketHandler');

// Seed database if empty
seedDatabase(false);

const app = express();
const server = http.createServer(app);

// Initialize Socket.io
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE']
  }
});

// Configure Socket.io event routing
setupSocketHandler(io);

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Attach io to req for route handlers to emit events
app.use((req, res, next) => {
  req.io = io;
  next();
});

// API Routes
app.use('/api/auth', require('./routes/auth'));
app.use('/api/projects', require('./routes/projects'));
app.use('/api/columns', require('./routes/columns'));
app.use('/api/tasks', require('./routes/tasks'));
app.use('/api', require('./routes/comments')); // includes /api/tasks/:taskId/comments and /api/comments/:id
app.use('/api/notifications', require('./routes/notifications'));
app.use('/api/users', require('./routes/users'));

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Serve static frontend assets
app.use(express.static(path.join(__dirname, '../public')));

// Catch-all SPA fallback for non-API routes
app.use((req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API route not found' });
  }
  res.sendFile(path.join(__dirname, '../public/index.html'));
});

// Start Server
if (require.main === module) {
  server.listen(config.PORT, () => {
    console.log(`=======================================================`);
    console.log(`🚀 TaskFlow Collaborative Project Manager is LIVE!`);
    console.log(`📍 Web App URL:   http://localhost:${config.PORT}`);
    console.log(`⚡ WebSocket URL:  ws://localhost:${config.PORT}`);
    console.log(`📡 Health Check:  http://localhost:${config.PORT}/api/health`);
    console.log(`=======================================================`);
  });
}

module.exports = { app, server, io };
