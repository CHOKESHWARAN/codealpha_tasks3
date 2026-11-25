const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// Add comment to task
router.post('/tasks/:taskId/comments', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.taskId;
    const userId = req.user.id;
    const { content } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({ error: 'Comment content cannot be empty.' });
    }

    const task = db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const result = db.run(
      'INSERT INTO comments (task_id, user_id, content) VALUES (?, ?, ?)',
      [taskId, userId, content.trim()]
    );
    const commentId = Number(result.lastInsertRowid);

    // Activity log
    db.run('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)', [
      task.project_id,
      taskId,
      userId,
      'commented',
      `Commented on "${task.title}"`
    ]);

    // Check for @mentions or notify task assignees
    const assignees = db.query('SELECT user_id FROM task_assignees WHERE task_id = ?', [taskId]);
    
    // Parse mentions: @John Doe or @username
    const allUsers = db.query('SELECT id, name FROM users');
    const mentionedUserIds = new Set();
    allUsers.forEach(u => {
      const mentionPattern = new RegExp(`@${u.name.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`, 'i');
      if (mentionPattern.test(content) && u.id !== userId) {
        mentionedUserIds.add(u.id);
        db.run(
          'INSERT INTO notifications (user_id, actor_id, project_id, task_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [u.id, userId, task.project_id, taskId, 'mentioned', 'Mentioned in Comment', `${req.user.name} mentioned you in a comment on "${task.title}".`]
        );
      }
    });

    // Notify other assignees if not mentioned
    assignees.forEach(a => {
      if (Number(a.user_id) !== Number(userId) && !mentionedUserIds.has(a.user_id)) {
        db.run(
          'INSERT INTO notifications (user_id, actor_id, project_id, task_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
          [a.user_id, userId, task.project_id, taskId, 'comment_added', 'New Comment', `${req.user.name} commented on "${task.title}".`]
        );
      }
    });

    const newComment = db.get(`
      SELECT c.*, u.name as user_name, u.avatar_color, u.role as user_role
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.id = ?
    `, [commentId]);

    if (req.io) {
      req.io.broadcastToProject(task.project_id, 'comment:added', {
        taskId: Number(taskId),
        comment: newComment,
        actor: { id: userId, name: req.user.name }
      });

      // Also send notification event to assignees/mentioned users
      mentionedUserIds.forEach(mId => {
        req.io.sendNotificationToUser(mId, {
          type: 'mentioned',
          title: 'Mentioned in Comment',
          message: `${req.user.name} mentioned you in a comment on "${task.title}".`,
          project_id: task.project_id,
          task_id: taskId
        });
      });
    }

    res.status(201).json({
      comment: newComment,
      projectId: task.project_id
    });
  } catch (err) {
    console.error('Comment add error:', err);
    res.status(500).json({ error: 'Failed to add comment.' });
  }
});

// Delete comment
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const commentId = req.params.id;
    const userId = req.user.id;

    const comment = db.get('SELECT c.*, t.project_id FROM comments c JOIN tasks t ON c.task_id = t.id WHERE c.id = ?', [commentId]);
    if (!comment) {
      return res.status(404).json({ error: 'Comment not found.' });
    }

    if (Number(comment.user_id) !== Number(userId)) {
      // Check if project owner/admin
      const membership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [comment.project_id, userId]);
      if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
        return res.status(403).json({ error: 'You do not have permission to delete this comment.' });
      }
    }

    db.run('DELETE FROM comments WHERE id = ?', [commentId]);
    if (req.io) {
      req.io.broadcastToProject(comment.project_id, 'comment:deleted', {
        taskId: Number(comment.task_id),
        commentId: Number(commentId),
        actor: { id: userId, name: req.user.name }
      });
    }
    res.json({ message: 'Comment deleted successfully.', commentId: Number(commentId), taskId: comment.task_id, projectId: comment.project_id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete comment.' });
  }
});

module.exports = router;
