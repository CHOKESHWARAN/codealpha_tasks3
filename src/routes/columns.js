const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// Add column
router.post('/', authenticateToken, (req, res) => {
  try {
    const { project_id, title } = req.body;
    const userId = req.user.id;

    if (!project_id || !title || !title.trim()) {
      return res.status(400).json({ error: 'Project ID and column title are required.' });
    }

    const membership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [project_id, userId]);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin' && membership.role !== 'member')) {
      return res.status(403).json({ error: 'You do not have permission to add columns to this project.' });
    }

    const maxPos = db.get('SELECT MAX(position) as max_pos FROM columns WHERE project_id = ?', [project_id]).max_pos;
    const nextPos = (maxPos !== null && maxPos !== undefined) ? maxPos + 1 : 0;

    const result = db.run(
      'INSERT INTO columns (project_id, title, position) VALUES (?, ?, ?)',
      [project_id, title.trim(), nextPos]
    );

    const newColumn = db.get('SELECT * FROM columns WHERE id = ?', [result.lastInsertRowid]);
    if (req.io) {
      req.io.broadcastToProject(project_id, 'column:created', { column: newColumn });
    }
    res.status(201).json({ column: newColumn });
  } catch (err) {
    console.error('Add column error:', err);
    res.status(500).json({ error: 'Failed to add column.' });
  }
});

// Update column title or position
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const colId = req.params.id;
    const { title, position } = req.body;
    const userId = req.user.id;

    const column = db.get('SELECT * FROM columns WHERE id = ?', [colId]);
    if (!column) {
      return res.status(404).json({ error: 'Column not found.' });
    }

    const membership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [column.project_id, userId]);
    if (!membership || membership.role === 'viewer') {
      return res.status(403).json({ error: 'Permission denied.' });
    }

    db.run(
      'UPDATE columns SET title = COALESCE(?, title), position = COALESCE(?, position) WHERE id = ?',
      [title ? title.trim() : null, position !== undefined ? position : null, colId]
    );

    const updated = db.get('SELECT * FROM columns WHERE id = ?', [colId]);
    if (req.io) {
      req.io.broadcastToProject(column.project_id, 'column:updated', { column: updated });
    }
    res.json({ column: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update column.' });
  }
});

// Delete column
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const colId = req.params.id;
    const userId = req.user.id;

    const column = db.get('SELECT * FROM columns WHERE id = ?', [colId]);
    if (!column) {
      return res.status(404).json({ error: 'Column not found.' });
    }

    const membership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [column.project_id, userId]);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return res.status(403).json({ error: 'Only owners and admins can delete columns.' });
    }

    // Check if column has tasks
    const tasksCount = db.get('SELECT COUNT(*) as count FROM tasks WHERE column_id = ?', [colId]).count;
    if (tasksCount > 0) {
      // Find fallback column
      const fallbackCol = db.get('SELECT id FROM columns WHERE project_id = ? AND id != ? ORDER BY position ASC LIMIT 1', [column.project_id, colId]);
      if (fallbackCol) {
        // Move tasks to fallback column
        db.run('UPDATE tasks SET column_id = ? WHERE column_id = ?', [fallbackCol.id, colId]);
      } else {
        // No other columns, delete tasks
        db.run('DELETE FROM tasks WHERE column_id = ?', [colId]);
      }
    }

    db.run('DELETE FROM columns WHERE id = ?', [colId]);
    if (req.io) {
      req.io.broadcastToProject(column.project_id, 'column:deleted', { columnId: Number(colId) });
    }
    res.json({ message: 'Column deleted successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete column.' });
  }
});

module.exports = router;
