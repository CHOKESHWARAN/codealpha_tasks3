const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// Get all notifications for current user
router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const notifications = db.query(`
      SELECT n.*, u.name as actor_name, u.avatar_color as actor_color, p.title as project_title, t.title as task_title
      FROM notifications n
      JOIN users u ON n.actor_id = u.id
      LEFT JOIN projects p ON n.project_id = p.id
      LEFT JOIN tasks t ON n.task_id = t.id
      WHERE n.user_id = ?
      ORDER BY n.created_at DESC
      LIMIT 100
    `, [userId]);

    const unreadCount = db.get('SELECT COUNT(*) as count FROM notifications WHERE user_id = ? AND is_read = 0', [userId]).count;

    res.json({
      notifications,
      unreadCount
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch notifications.' });
  }
});

// Mark single notification as read
router.put('/:id/read', authenticateToken, (req, res) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    db.run('UPDATE notifications SET is_read = 1 WHERE id = ? AND user_id = ?', [id, userId]);
    res.json({ message: 'Notification marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update notification.' });
  }
});

// Mark all as read
router.put('/read-all', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    db.run('UPDATE notifications SET is_read = 1 WHERE user_id = ?', [userId]);
    res.json({ message: 'All notifications marked as read.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read.' });
  }
});

// Clear all notifications
router.delete('/clear-all', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    db.run('DELETE FROM notifications WHERE user_id = ?', [userId]);
    res.json({ message: 'All notifications cleared.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear notifications.' });
  }
});

module.exports = router;
