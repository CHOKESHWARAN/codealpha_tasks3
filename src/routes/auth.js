const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const config = require('../config');
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

function generateToken(user) {
  return jwt.sign(
    { id: user.id, email: user.email, name: user.name },
    config.JWT_SECRET,
    { expiresIn: config.JWT_EXPIRES_IN }
  );
}

// Register
router.post('/register', (req, res) => {
  try {
    const { name, email, password, role = 'Developer', avatar_color = '#3b82f6' } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ error: 'Name, email, and password are required.' });
    }

    if (password.length < 6) {
      return res.status(400).json({ error: 'Password must be at least 6 characters long.' });
    }

    const existing = db.get('SELECT id FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    if (existing) {
      return res.status(409).json({ error: 'Email is already registered. Please log in.' });
    }

    const passwordHash = bcrypt.hashSync(password, 10);
    const result = db.run(
      'INSERT INTO users (name, email, password_hash, avatar_color, role, bio) VALUES (?, ?, ?, ?, ?, ?)',
      [name.trim(), email.trim().toLowerCase(), passwordHash, avatar_color, role.trim(), '']
    );

    const newUser = db.get('SELECT id, name, email, avatar_color, role, bio, created_at FROM users WHERE id = ?', [result.lastInsertRowid]);
    const token = generateToken(newUser);

    res.status(201).json({
      message: 'Account created successfully',
      user: newUser,
      token
    });
  } catch (err) {
    console.error('Registration error:', err);
    res.status(500).json({ error: 'Failed to register user.' });
  }
});

// Login
router.post('/login', (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password are required.' });
    }

    const user = db.get('SELECT * FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const validPassword = bcrypt.compareSync(password, user.password_hash);
    if (!validPassword) {
      return res.status(401).json({ error: 'Invalid email or password.' });
    }

    const safeUser = {
      id: user.id,
      name: user.name,
      email: user.email,
      avatar_color: user.avatar_color,
      role: user.role,
      bio: user.bio,
      created_at: user.created_at
    };

    const token = generateToken(safeUser);

    res.json({
      message: 'Login successful',
      user: safeUser,
      token
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'Failed to log in.' });
  }
});

// Demo login switch (convenience for evaluating multi-user collaboration)
router.get('/demo-users', (req, res) => {
  try {
    const users = db.query('SELECT id, name, email, avatar_color, role, bio FROM users ORDER BY id ASC LIMIT 10');
    const demoAccounts = users.map(u => ({
      ...u,
      token: generateToken(u)
    }));
    res.json({ demoUsers: demoAccounts });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve demo users.' });
  }
});

// Get current user profile
router.get('/me', authenticateToken, (req, res) => {
  try {
    const projectsCount = db.get(
      'SELECT COUNT(DISTINCT project_id) as count FROM project_members WHERE user_id = ?',
      [req.user.id]
    ).count;

    const assignedTasksCount = db.get(
      'SELECT COUNT(DISTINCT task_id) as count FROM task_assignees WHERE user_id = ?',
      [req.user.id]
    ).count;

    const unreadNotificationsCount = db.get(
      'SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0',
      [req.user.id]
    ).count;

    res.json({
      user: {
        ...req.user,
        projectsCount,
        assignedTasksCount,
        unreadNotificationsCount
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to retrieve user profile.' });
  }
});

// Update profile
router.put('/profile', authenticateToken, (req, res) => {
  try {
    const { name, role, avatar_color, bio } = req.body;
    
    db.run(
      'UPDATE users SET name = COALESCE(?, name), role = COALESCE(?, role), avatar_color = COALESCE(?, avatar_color), bio = COALESCE(?, bio) WHERE id = ?',
      [name, role, avatar_color, bio, req.user.id]
    );

    const updated = db.get('SELECT id, name, email, avatar_color, role, bio, created_at FROM users WHERE id = ?', [req.user.id]);
    res.json({ message: 'Profile updated successfully', user: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update profile.' });
  }
});

module.exports = router;
