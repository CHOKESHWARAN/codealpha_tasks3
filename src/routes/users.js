const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// Search / list users
router.get('/', authenticateToken, (req, res) => {
  try {
    const { search = '' } = req.query;
    let users;
    if (search.trim()) {
      users = db.query(
        'SELECT id, name, email, avatar_color, role, bio FROM users WHERE LOWER(name) LIKE ? OR LOWER(email) LIKE ? ORDER BY name ASC LIMIT 20',
        [`%${search.trim().toLowerCase()}%`, `%${search.trim().toLowerCase()}%`]
      );
    } else {
      users = db.query('SELECT id, name, email, avatar_color, role, bio FROM users ORDER BY name ASC LIMIT 50');
    }
    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Failed to search users.' });
  }
});

// Get user profile
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const user = db.get('SELECT id, name, email, avatar_color, role, bio, created_at FROM users WHERE id = ?', [req.params.id]);
    if (!user) {
      return res.status(404).json({ error: 'User not found.' });
    }
    res.json({ user });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch user.' });
  }
});

module.exports = router;
