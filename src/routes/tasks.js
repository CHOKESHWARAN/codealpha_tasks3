const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// Helper to fetch complete task
function getFullTask(taskId) {
  const task = db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
  if (!task) return null;

  const assignees = db.query(`
    SELECT u.id, u.name, u.email, u.avatar_color, u.role
    FROM task_assignees ta
    JOIN users u ON ta.user_id = u.id
    WHERE ta.task_id = ?
  `, [taskId]);

  const labels = db.query('SELECT id, label, color FROM task_labels WHERE task_id = ?', [taskId]);
  const checklist = db.query('SELECT id, title, completed, position FROM task_checklists WHERE task_id = ? ORDER BY position ASC', [taskId]);
  const commentsCount = db.get('SELECT COUNT(*) as count FROM comments WHERE task_id = ?', [taskId]).count;
  const column = db.get('SELECT id, title FROM columns WHERE id = ?', [task.column_id]);

  return {
    ...task,
    column_title: column ? column.title : '',
    assignees,
    labels,
    checklist,
    commentsCount
  };
}

// Create Task
router.post('/', authenticateToken, (req, res) => {
  try {
    const { project_id, column_id, title, description = '', priority = 'medium', due_date = null, assignees = [], labels = [] } = req.body;
    const userId = req.user.id;

    if (!project_id || !column_id || !title || !title.trim()) {
      return res.status(400).json({ error: 'Project ID, column ID, and title are required.' });
    }

    const membership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [project_id, userId]);
    if (!membership || membership.role === 'viewer') {
      return res.status(403).json({ error: 'You do not have permission to create tasks in this project.' });
    }

    // Get max position in column
    const maxPos = db.get('SELECT MAX(position) as max_pos FROM tasks WHERE column_id = ?', [column_id]).max_pos;
    const nextPos = (maxPos !== null && maxPos !== undefined) ? maxPos + 1 : 0;

    const taskId = db.transaction(() => {
      const taskRes = db.run(
        'INSERT INTO tasks (project_id, column_id, title, description, priority, due_date, position, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [project_id, column_id, title.trim(), description.trim(), priority, due_date, nextPos, userId]
      );
      const newId = Number(taskRes.lastInsertRowid);

      // Assignees
      if (Array.isArray(assignees)) {
        assignees.forEach(assigneeId => {
          db.run('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)', [newId, assigneeId]);
          
          if (Number(assigneeId) !== Number(userId)) {
            db.run(
              'INSERT INTO notifications (user_id, actor_id, project_id, task_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
              [assigneeId, userId, project_id, newId, 'assigned', 'Assigned to Task', `${req.user.name} assigned you to "${title.trim()}".`]
            );
          }
        });
      }

      // Labels
      if (Array.isArray(labels)) {
        labels.forEach(lbl => {
          const lblName = typeof lbl === 'string' ? lbl : lbl.label;
          const lblColor = typeof lbl === 'object' && lbl.color ? lbl.color : '#64748b';
          db.run('INSERT INTO task_labels (task_id, label, color) VALUES (?, ?, ?)', [newId, lblName, lblColor]);
        });
      }

      // Log activity
      db.run('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)', [
        project_id,
        newId,
        userId,
        'created_task',
        `Created task "${title.trim()}"`
      ]);

      return newId;
    });

    const fullTask = getFullTask(taskId);

    if (req.io) {
      req.io.broadcastToProject(project_id, 'task:created', { task: fullTask, actor: { id: userId, name: req.user.name } });
      // Notify assignees via websocket
      if (Array.isArray(assignees)) {
        assignees.forEach(aId => {
          if (Number(aId) !== Number(userId)) {
            req.io.sendNotificationToUser(aId, {
              type: 'assigned',
              title: 'Assigned to Task',
              message: `${req.user.name} assigned you to "${title.trim()}".`,
              project_id,
              task_id: taskId
            });
          }
        });
      }
    }

    res.status(201).json({ task: fullTask });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ error: 'Failed to create task.' });
  }
});

// Get single task full details
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.id;
    const task = getFullTask(taskId);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    // Get comments with user profiles
    const comments = db.query(`
      SELECT c.*, u.name as user_name, u.avatar_color, u.role as user_role
      FROM comments c
      JOIN users u ON c.user_id = u.id
      WHERE c.task_id = ?
      ORDER BY c.created_at ASC
    `, [taskId]);

    // Get activity logs for this task
    const activities = db.query(`
      SELECT al.*, u.name as user_name, u.avatar_color
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      WHERE al.task_id = ?
      ORDER BY al.created_at DESC
      LIMIT 20
    `, [taskId]);

    res.json({
      task: {
        ...task,
        comments,
        activities
      }
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch task details.' });
  }
});

// Update task basic fields
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    const { title, description, priority, due_date } = req.body;

    const task = db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    db.run(`
      UPDATE tasks
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          priority = COALESCE(?, priority),
          due_date = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title ? title.trim() : null, description !== undefined ? description : null, priority || null, due_date !== undefined ? due_date : task.due_date, taskId]);

    // Activity log
    db.run('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)', [
      task.project_id,
      taskId,
      userId,
      'updated_task',
      `Updated task details`
    ]);

    const updatedTask = getFullTask(taskId);
    if (req.io) {
      req.io.broadcastToProject(task.project_id, 'task:updated', { task: updatedTask, actor: { id: userId, name: req.user.name } });
    }
    res.json({ task: updatedTask });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update task.' });
  }
});

// Move task (between columns or reordering within column)
router.put('/:id/move', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    const { column_id, position } = req.body;

    const task = db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    const oldColumnId = task.column_id;
    const newColumnId = column_id !== undefined ? Number(column_id) : oldColumnId;
    const newPos = position !== undefined ? Number(position) : task.position;

    const oldCol = db.get('SELECT title FROM columns WHERE id = ?', [oldColumnId]);
    const newCol = db.get('SELECT title FROM columns WHERE id = ?', [newColumnId]);

    db.run(
      'UPDATE tasks SET column_id = ?, position = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [newColumnId, newPos, taskId]
    );

    // If column changed, log activity and notify assignees
    if (oldColumnId !== newColumnId) {
      db.run('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)', [
        task.project_id,
        taskId,
        userId,
        'moved_task',
        `Moved from "${oldCol ? oldCol.title : 'Column'}" to "${newCol ? newCol.title : 'Column'}"`
      ]);

      // Notify assignees (except current user)
      const assignees = db.query('SELECT user_id FROM task_assignees WHERE task_id = ?', [taskId]);
      assignees.forEach(a => {
        if (Number(a.user_id) !== Number(userId)) {
          db.run(
            'INSERT INTO notifications (user_id, actor_id, project_id, task_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
            [
              a.user_id,
              userId,
              task.project_id,
              taskId,
              'status_changed',
              'Task Status Changed',
              `${req.user.name} moved "${task.title}" to ${newCol ? newCol.title : 'new column'}.`
            ]
          );
        }
      });
    }

    const updatedTask = getFullTask(taskId);

    if (req.io) {
      req.io.broadcastToProject(task.project_id, 'task:moved', {
        taskId: Number(taskId),
        column_id: newColumnId,
        position: newPos,
        task: updatedTask,
        actor: { id: userId, name: req.user.name }
      });
    }

    res.json({ task: updatedTask, moved: oldColumnId !== newColumnId });
  } catch (err) {
    console.error('Move task error:', err);
    res.status(500).json({ error: 'Failed to move task.' });
  }
});

// Delete task
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;

    const task = db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) {
      return res.status(404).json({ error: 'Task not found.' });
    }

    db.run('INSERT INTO activity_logs (project_id, user_id, action, details) VALUES (?, ?, ?, ?)', [
      task.project_id,
      userId,
      'deleted_task',
      `Deleted task "${task.title}"`
    ]);

    db.run('DELETE FROM tasks WHERE id = ?', [taskId]);
    if (req.io) {
      req.io.broadcastToProject(task.project_id, 'task:deleted', { taskId: Number(taskId), projectId: task.project_id, actor: { id: userId, name: req.user.name } });
    }
    res.json({ message: 'Task deleted successfully.', taskId: Number(taskId), projectId: task.project_id });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete task.' });
  }
});

// Assign / unassign users
router.post('/:id/assignees', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.id;
    const userId = req.user.id;
    const { user_id } = req.body;

    const task = db.get('SELECT * FROM tasks WHERE id = ?', [taskId]);
    if (!task) return res.status(404).json({ error: 'Task not found.' });

    db.run('INSERT OR IGNORE INTO task_assignees (task_id, user_id) VALUES (?, ?)', [taskId, user_id]);

    const targetUser = db.get('SELECT name FROM users WHERE id = ?', [user_id]);

    if (Number(user_id) !== Number(userId)) {
      db.run(
        'INSERT INTO notifications (user_id, actor_id, project_id, task_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?, ?)',
        [user_id, userId, task.project_id, taskId, 'assigned', 'Assigned to Task', `${req.user.name} assigned you to "${task.title}".`]
      );
    }

    db.run('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)', [
      task.project_id,
      taskId,
      userId,
      'assigned_user',
      `Assigned ${targetUser ? targetUser.name : 'user'}`
    ]);

    const updatedTask = getFullTask(taskId);
    if (req.io) {
      req.io.broadcastToProject(task.project_id, 'task:updated', { task: updatedTask, actor: { id: userId, name: req.user.name } });
    }
    res.json({ task: updatedTask });
  } catch (err) {
    res.status(500).json({ error: 'Failed to assign user.' });
  }
});

router.delete('/:id/assignees/:targetUserId', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.id;
    const targetUserId = req.params.targetUserId;
    db.run('DELETE FROM task_assignees WHERE task_id = ? AND user_id = ?', [taskId, targetUserId]);
    const updatedTask = getFullTask(taskId);
    if (req.io) {
      req.io.broadcastToProject(task.project_id, 'task:updated', { task: updatedTask, actor: { id: userId, name: req.user.name } });
    }
    res.json({ task: updatedTask });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unassign user.' });
  }
});

// Checklist item endpoints
router.post('/:id/checklist', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.id;
    const { title } = req.body;
    if (!title || !title.trim()) return res.status(400).json({ error: 'Checklist item title is required.' });

    const maxPos = db.get('SELECT MAX(position) as max_pos FROM task_checklists WHERE task_id = ?', [taskId]).max_pos;
    const nextPos = (maxPos !== null && maxPos !== undefined) ? maxPos + 1 : 0;

    const resItem = db.run(
      'INSERT INTO task_checklists (task_id, title, completed, position) VALUES (?, ?, 0, ?)',
      [taskId, title.trim(), nextPos]
    );

    const item = db.get('SELECT * FROM task_checklists WHERE id = ?', [resItem.lastInsertRowid]);
    res.status(201).json({ item });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add checklist item.' });
  }
});

router.put('/:id/checklist/:itemId', authenticateToken, (req, res) => {
  try {
    const { itemId } = req.params;
    const { completed, title } = req.body;

    db.run(
      'UPDATE task_checklists SET completed = COALESCE(?, completed), title = COALESCE(?, title) WHERE id = ?',
      [completed !== undefined ? (completed ? 1 : 0) : null, title ? title.trim() : null, itemId]
    );

    const item = db.get('SELECT * FROM task_checklists WHERE id = ?', [itemId]);
    res.json({ item });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update checklist item.' });
  }
});

router.delete('/:id/checklist/:itemId', authenticateToken, (req, res) => {
  try {
    const { itemId } = req.params;
    db.run('DELETE FROM task_checklists WHERE id = ?', [itemId]);
    res.json({ message: 'Checklist item removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete checklist item.' });
  }
});

// Labels
router.post('/:id/labels', authenticateToken, (req, res) => {
  try {
    const taskId = req.params.id;
    const { label, color = '#64748b' } = req.body;
    if (!label) return res.status(400).json({ error: 'Label text is required.' });

    const resLbl = db.run('INSERT INTO task_labels (task_id, label, color) VALUES (?, ?, ?)', [taskId, label.trim(), color]);
    const newLabel = db.get('SELECT * FROM task_labels WHERE id = ?', [resLbl.lastInsertRowid]);
    res.status(201).json({ label: newLabel });
  } catch (err) {
    res.status(500).json({ error: 'Failed to add label.' });
  }
});

router.delete('/:id/labels/:labelId', authenticateToken, (req, res) => {
  try {
    const { labelId } = req.params;
    db.run('DELETE FROM task_labels WHERE id = ?', [labelId]);
    res.json({ message: 'Label removed.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete label.' });
  }
});

module.exports = router;
