const express = require('express');
const router = express.Router();
const db = require('../db/database');
const { authenticateToken } = require('../middleware/auth');

// Get all projects for current user
router.get('/', authenticateToken, (req, res) => {
  try {
    const userId = req.user.id;
    const projects = db.query(`
      SELECT p.*, pm.role as my_role
      FROM projects p
      JOIN project_members pm ON p.id = pm.project_id
      WHERE pm.user_id = ?
      ORDER BY p.updated_at DESC
    `, [userId]);

    const enrichedProjects = projects.map(p => {
      // Get member avatars
      const members = db.query(`
        SELECT u.id, u.name, u.email, u.avatar_color, u.role as user_role, pm.role as project_role
        FROM project_members pm
        JOIN users u ON pm.user_id = u.id
        WHERE pm.project_id = ?
      `, [p.id]);

      // Get stats
      const totalTasks = db.get('SELECT COUNT(*) as count FROM tasks WHERE project_id = ?', [p.id]).count;
      
      // Look for completed column
      const completedTasks = db.get(`
        SELECT COUNT(*) as count FROM tasks t
        JOIN columns c ON t.column_id = c.id
        WHERE t.project_id = ? AND (LOWER(c.title) LIKE '%done%' OR LOWER(c.title) LIKE '%complete%')
      `, [p.id]).count;

      return {
        ...p,
        members,
        stats: {
          totalTasks,
          completedTasks,
          progress: totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0
        }
      };
    });

    res.json({ projects: enrichedProjects });
  } catch (err) {
    console.error('Projects fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch projects.' });
  }
});

// Create project
router.post('/', authenticateToken, (req, res) => {
  try {
    const { title, description = '', color = '#6366f1', icon = 'layout', category = 'General' } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ error: 'Project title is required.' });
    }

    const userId = req.user.id;

    const result = db.transaction(() => {
      const pRes = db.run(
        'INSERT INTO projects (title, description, color, icon, category, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
        [title.trim(), description.trim(), color, icon, category, userId]
      );
      const projectId = Number(pRes.lastInsertRowid);

      // Add creator as owner
      db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projectId, userId, 'owner']);

      // Add default columns
      const defaultColumns = ['To Do', 'In Progress', 'In Review', 'Done'];
      defaultColumns.forEach((colTitle, idx) => {
        db.run('INSERT INTO columns (project_id, title, position) VALUES (?, ?, ?)', [projectId, colTitle, idx]);
      });

      // Log activity
      db.run('INSERT INTO activity_logs (project_id, user_id, action, details) VALUES (?, ?, ?, ?)', [
        projectId,
        userId,
        'created_project',
        `Created project "${title.trim()}"`
      ]);

      return projectId;
    });

    const newProject = db.get('SELECT * FROM projects WHERE id = ?', [result]);
    const members = db.query(`
      SELECT u.id, u.name, u.email, u.avatar_color, u.role as user_role, pm.role as project_role
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
    `, [result]);

    res.status(201).json({
      message: 'Project created successfully',
      project: {
        ...newProject,
        my_role: 'owner',
        members,
        stats: { totalTasks: 0, completedTasks: 0, progress: 0 }
      }
    });
  } catch (err) {
    console.error('Create project error:', err);
    res.status(500).json({ error: 'Failed to create project.' });
  }
});

// Get single project details (including columns, tasks, members)
router.get('/:id', authenticateToken, (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    const membership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    if (!membership) {
      return res.status(403).json({ error: 'You do not have access to this project.' });
    }

    const project = db.get('SELECT * FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    // Members
    const members = db.query(`
      SELECT u.id, u.name, u.email, u.avatar_color, u.role as user_role, pm.role as project_role, pm.joined_at
      FROM project_members pm
      JOIN users u ON pm.user_id = u.id
      WHERE pm.project_id = ?
      ORDER BY CASE pm.role WHEN 'owner' THEN 1 WHEN 'admin' THEN 2 WHEN 'member' THEN 3 ELSE 4 END
    `, [projectId]);

    // Columns
    const columns = db.query('SELECT * FROM columns WHERE project_id = ? ORDER BY position ASC, id ASC', [projectId]);

    // Tasks
    const rawTasks = db.query('SELECT * FROM tasks WHERE project_id = ? ORDER BY position ASC, id ASC', [projectId]);

    const tasks = rawTasks.map(t => {
      // Assignees
      const assignees = db.query(`
        SELECT u.id, u.name, u.email, u.avatar_color, u.role
        FROM task_assignees ta
        JOIN users u ON ta.user_id = u.id
        WHERE ta.task_id = ?
      `, [t.id]);

      // Labels
      const labels = db.query('SELECT id, label, color FROM task_labels WHERE task_id = ?', [t.id]);

      // Checklist
      const checklist = db.query('SELECT id, title, completed, position FROM task_checklists WHERE task_id = ? ORDER BY position ASC', [t.id]);

      // Comments count
      const commentsCount = db.get('SELECT COUNT(*) as count FROM comments WHERE task_id = ?', [t.id]).count;

      return {
        ...t,
        assignees,
        labels,
        checklist,
        commentsCount
      };
    });

    res.json({
      project: {
        ...project,
        my_role: membership.role,
        members,
        columns,
        tasks
      }
    });
  } catch (err) {
    console.error('Project details fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch project details.' });
  }
});

// Update project
router.put('/:id', authenticateToken, (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const { title, description, color, category, icon } = req.body;

    const membership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return res.status(403).json({ error: 'Only project owners and admins can edit project settings.' });
    }

    db.run(`
      UPDATE projects
      SET title = COALESCE(?, title),
          description = COALESCE(?, description),
          color = COALESCE(?, color),
          category = COALESCE(?, category),
          icon = COALESCE(?, icon),
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `, [title, description, color, category, icon, projectId]);

    const updated = db.get('SELECT * FROM projects WHERE id = ?', [projectId]);
    res.json({ message: 'Project updated successfully', project: updated });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update project.' });
  }
});

// Delete project
router.delete('/:id', authenticateToken, (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;

    const project = db.get('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
    if (!project) {
      return res.status(404).json({ error: 'Project not found.' });
    }

    if (project.owner_id !== userId) {
      return res.status(403).json({ error: 'Only the project owner can delete this project.' });
    }

    db.run('DELETE FROM projects WHERE id = ?', [projectId]);
    res.json({ message: 'Project deleted successfully' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete project.' });
  }
});

// Add member to project
router.post('/:id/members', authenticateToken, (req, res) => {
  try {
    const projectId = req.params.id;
    const userId = req.user.id;
    const { email, role = 'member' } = req.body;

    if (!email) {
      return res.status(400).json({ error: 'User email is required.' });
    }

    // Check inviter permissions
    const membership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, userId]);
    if (!membership || (membership.role !== 'owner' && membership.role !== 'admin')) {
      return res.status(403).json({ error: 'Only project owners and admins can add members.' });
    }

    const targetUser = db.get('SELECT id, name, email, avatar_color, role FROM users WHERE LOWER(email) = LOWER(?)', [email.trim()]);
    if (!targetUser) {
      return res.status(404).json({ error: `No user found with email "${email}". Make sure they have registered an account.` });
    }

    const alreadyMember = db.get('SELECT id FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, targetUser.id]);
    if (alreadyMember) {
      return res.status(409).json({ error: 'This user is already a member of the project.' });
    }

    db.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projectId, targetUser.id, role]);

    const project = db.get('SELECT title FROM projects WHERE id = ?', [projectId]);

    // Send notification to invited user
    db.run(
      'INSERT INTO notifications (user_id, actor_id, project_id, type, title, message) VALUES (?, ?, ?, ?, ?, ?)',
      [targetUser.id, userId, projectId, 'project_invite', 'Added to Project', `${req.user.name} added you to project "${project.title}" as ${role}.`]
    );

    // Log activity
    db.run('INSERT INTO activity_logs (project_id, user_id, action, details) VALUES (?, ?, ?, ?)', [
      projectId,
      userId,
      'member_added',
      `Added ${targetUser.name} as ${role}`
    ]);

    const memberData = {
      ...targetUser,
      user_role: targetUser.role,
      project_role: role,
      joined_at: new Date().toISOString()
    };

    if (req.io) {
      req.io.broadcastToProject(projectId, 'project:member_added', { member: memberData });
      req.io.sendNotificationToUser(targetUser.id, {
        type: 'project_invite',
        title: 'Added to Project',
        message: `${req.user.name} added you to project "${project.title}" as ${role}.`,
        project_id: projectId
      });
    }

    res.status(201).json({
      message: `${targetUser.name} added to project!`,
      member: memberData
    });
  } catch (err) {
    console.error('Add member error:', err);
    res.status(500).json({ error: 'Failed to add member to project.' });
  }
});

// Update member role
router.put('/:id/members/:targetUserId', authenticateToken, (req, res) => {
  try {
    const projectId = req.params.id;
    const actorId = req.user.id;
    const targetUserId = req.params.targetUserId;
    const { role } = req.body;

    const actorMembership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, actorId]);
    if (!actorMembership || actorMembership.role !== 'owner') {
      return res.status(403).json({ error: 'Only the project owner can change member roles.' });
    }

    db.run('UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?', [role, projectId, targetUserId]);
    res.json({ message: 'Member role updated successfully.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update member role.' });
  }
});

// Remove member from project
router.delete('/:id/members/:targetUserId', authenticateToken, (req, res) => {
  try {
    const projectId = req.params.id;
    const actorId = req.user.id;
    const targetUserId = req.params.targetUserId;

    const actorMembership = db.get('SELECT role FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, actorId]);
    if (!actorMembership || (actorMembership.role !== 'owner' && actorMembership.role !== 'admin' && Number(actorId) !== Number(targetUserId))) {
      return res.status(403).json({ error: 'You do not have permission to remove this member.' });
    }

    // Cannot remove project owner
    const project = db.get('SELECT owner_id FROM projects WHERE id = ?', [projectId]);
    if (Number(project.owner_id) === Number(targetUserId)) {
      return res.status(400).json({ error: 'The project owner cannot be removed.' });
    }

    db.run('DELETE FROM project_members WHERE project_id = ? AND user_id = ?', [projectId, targetUserId]);
    res.json({ message: 'Member removed from project.' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to remove member.' });
  }
});

// Activity logs
router.get('/:id/activity', authenticateToken, (req, res) => {
  try {
    const projectId = req.params.id;
    const logs = db.query(`
      SELECT al.*, u.name as user_name, u.avatar_color, t.title as task_title
      FROM activity_logs al
      JOIN users u ON al.user_id = u.id
      LEFT JOIN tasks t ON al.task_id = t.id
      WHERE al.project_id = ?
      ORDER BY al.created_at DESC
      LIMIT 50
    `, [projectId]);
    res.json({ activity: logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch activity logs.' });
  }
});

module.exports = router;
