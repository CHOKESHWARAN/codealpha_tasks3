const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/database');

// In-memory presence tracker: projectId -> Map(socketId -> { userId, name, avatar_color })
const projectPresence = new Map();

function setupSocketHandler(io) {
  // Authentication middleware for socket connections
  io.use((socket, next) => {
    const token = socket.handshake.auth?.token || socket.handshake.query?.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    jwt.verify(token, config.JWT_SECRET, (err, decoded) => {
      if (err) {
        return next(new Error('Invalid token'));
      }
      const user = db.get('SELECT id, name, email, avatar_color, role FROM users WHERE id = ?', [decoded.id]);
      if (!user) {
        return next(new Error('User not found'));
      }
      socket.user = user;
      next();
    });
  });

  io.on('connection', (socket) => {
    const user = socket.user;
    // Join personal user room for direct notifications
    socket.join(`user:${user.id}`);

    // Track active project room for this socket
    let currentProjectId = null;

    // Join Project Board room
    socket.on('join:project', (projectId) => {
      if (!projectId) return;
      projectId = String(projectId);

      // Leave previous project room if any
      if (currentProjectId && currentProjectId !== projectId) {
        socket.leave(`project:${currentProjectId}`);
        removePresence(currentProjectId, socket.id);
        emitPresence(currentProjectId);
      }

      currentProjectId = projectId;
      socket.join(`project:${projectId}`);

      // Add to presence
      if (!projectPresence.has(projectId)) {
        projectPresence.set(projectId, new Map());
      }
      projectPresence.get(projectId).set(socket.id, {
        id: user.id,
        name: user.name,
        avatar_color: user.avatar_color,
        role: user.role
      });

      emitPresence(projectId);
    });

    // Leave Project Board room
    socket.on('leave:project', (projectId) => {
      if (!projectId) return;
      projectId = String(projectId);
      socket.leave(`project:${projectId}`);
      removePresence(projectId, socket.id);
      emitPresence(projectId);
      if (currentProjectId === projectId) currentProjectId = null;
    });

    // Broadcast card move directly for ultra-low-latency drag & drop
    socket.on('board:task_move', (payload) => {
      const { projectId, taskId, column_id, position } = payload;
      if (!projectId) return;

      // Broadcast to other peers in the project room
      socket.to(`project:${projectId}`).emit('task:moved', {
        taskId,
        column_id,
        position,
        actor: { id: user.id, name: user.name }
      });
    });

    // Handle typing indicators in task comments
    socket.on('task:typing', (payload) => {
      const { projectId, taskId, isTyping } = payload;
      if (!projectId) return;
      socket.to(`project:${projectId}`).emit('task:typing_status', {
        taskId,
        user: { id: user.id, name: user.name },
        isTyping
      });
    });

    // On disconnect
    socket.on('disconnect', () => {
      if (currentProjectId) {
        removePresence(currentProjectId, socket.id);
        emitPresence(currentProjectId);
      }
    });

    function removePresence(projId, sockId) {
      if (projectPresence.has(projId)) {
        projectPresence.get(projId).delete(sockId);
        if (projectPresence.get(projId).size === 0) {
          projectPresence.delete(projId);
        }
      }
    }

    function emitPresence(projId) {
      if (!projectPresence.has(projId)) {
        io.to(`project:${projId}`).emit('presence:update', []);
        return;
      }
      // Unique users currently active in this project
      const map = projectPresence.get(projId);
      const uniqueUsers = Array.from(
        new Map(Array.from(map.values()).map(u => [u.id, u])).values()
      );
      io.to(`project:${projId}`).emit('presence:update', uniqueUsers);
    }
  });

  // Global helper on io instance to broadcast from route handlers
  io.broadcastToProject = (projectId, event, data) => {
    io.to(`project:${projectId}`).emit(event, data);
  };

  io.sendNotificationToUser = (userId, notification) => {
    io.to(`user:${userId}`).emit('notification:new', notification);
  };

  return io;
}

module.exports = setupSocketHandler;
