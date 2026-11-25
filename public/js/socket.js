// ==========================================================================
// TaskFlow Real-Time WebSocket Manager (Socket.IO)
// ==========================================================================

import { api } from './api.js';

class SocketManager {
  constructor() {
    this.socket = null;
    this.connected = false;
    this.currentProjectId = null;
    this.listeners = new Map();
  }

  connect() {
    const token = api.getToken();
    if (!token) return;

    if (this.socket) {
      this.socket.disconnect();
    }

    // Connect to same origin
    this.socket = io({
      auth: { token },
      transports: ['websocket', 'polling']
    });

    this.socket.on('connect', () => {
      this.connected = true;
      console.log('⚡ Connected to TaskFlow WebSocket server!');
      
      if (this.currentProjectId) {
        this.joinProject(this.currentProjectId);
      }
    });

    this.socket.on('disconnect', () => {
      this.connected = false;
      console.log('⚡ Disconnected from WebSocket server.');
    });

    this.socket.on('connect_error', (err) => {
      console.warn('Socket connection error:', err.message);
    });

    // Wire Real-Time Broadcast Events
    const events = [
      'task:created',
      'task:updated',
      'task:moved',
      'task:deleted',
      'column:created',
      'column:updated',
      'column:deleted',
      'comment:added',
      'comment:deleted',
      'project:member_added',
      'presence:update',
      'notification:new',
      'task:typing_status'
    ];

    events.forEach(eventName => {
      this.socket.on(eventName, (data) => {
        this.dispatch(eventName, data);
      });
    });
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
      this.connected = false;
    }
  }

  joinProject(projectId) {
    this.currentProjectId = projectId;
    if (this.socket && this.connected) {
      this.socket.emit('join:project', projectId);
    }
  }

  leaveProject(projectId) {
    if (this.socket && this.connected) {
      this.socket.emit('leave:project', projectId);
    }
    if (this.currentProjectId === projectId) {
      this.currentProjectId = null;
    }
  }

  emitTaskMove(projectId, taskId, column_id, position) {
    if (this.socket && this.connected) {
      this.socket.emit('board:task_move', { projectId, taskId, column_id, position });
    }
  }

  emitTyping(projectId, taskId, isTyping) {
    if (this.socket && this.connected) {
      this.socket.emit('task:typing', { projectId, taskId, isTyping });
    }
  }

  on(event, callback) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event).add(callback);
    return () => this.off(event, callback);
  }

  off(event, callback) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).delete(callback);
    }
  }

  dispatch(event, data) {
    if (this.listeners.has(event)) {
      this.listeners.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in socket listener for "${event}":`, e);
        }
      });
    }
  }
}

export const socket = new SocketManager();
