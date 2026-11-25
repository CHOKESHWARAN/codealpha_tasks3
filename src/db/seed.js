const bcrypt = require('bcryptjs');
const dbHelper = require('./database');

function seedDatabase(force = false) {
  const usersCount = dbHelper.get('SELECT COUNT(*) as count FROM users');
  if (usersCount.count > 0 && !force) {
    console.log('Database already contains data. Skipping seed.');
    return;
  }

  console.log('Seeding initial project management data...');

  const passwordHash = bcrypt.hashSync('password123', 10);

  dbHelper.transaction(() => {
    // Clear if force
    if (force) {
      dbHelper.exec(`
        DELETE FROM notifications;
        DELETE FROM activity_logs;
        DELETE FROM comments;
        DELETE FROM task_checklists;
        DELETE FROM task_labels;
        DELETE FROM task_assignees;
        DELETE FROM tasks;
        DELETE FROM columns;
        DELETE FROM project_members;
        DELETE FROM projects;
        DELETE FROM users;
      `);
    }

    // 1. Insert Users
    const insertUser = (name, email, color, role, bio) => {
      const res = dbHelper.run(
        'INSERT INTO users (name, email, password_hash, avatar_color, role, bio) VALUES (?, ?, ?, ?, ?, ?)',
        [name, email, passwordHash, color, role, bio]
      );
      return Number(res.lastInsertRowid);
    };

    const alexId = insertUser(
      'Alex River',
      'alex@taskflow.dev',
      '#3b82f6',
      'Team Lead & Architect',
      'Fullstack engineer passionate about collaborative real-time systems.'
    );
    const sarahId = insertUser(
      'Sarah Chen',
      'sarah@taskflow.dev',
      '#10b981',
      'Senior Frontend Engineer',
      'UI/UX and React enthusiast with a focus on accessible micro-interactions.'
    );
    const marcusId = insertUser(
      'Marcus Vance',
      'marcus@taskflow.dev',
      '#8b5cf6',
      'Backend & Cloud Engineer',
      'Distributed systems, Node.js, WebSockets, and database performance.'
    );
    const emilyId = insertUser(
      'Emily Taylor',
      'emily@taskflow.dev',
      '#f59e0b',
      'Senior Product Manager',
      'Roadmap planning, agile sprints, user stories, and delivery metrics.'
    );

    // 2. Project 1: TaskFlow Core Platform
    const p1Res = dbHelper.run(
      'INSERT INTO projects (title, description, color, icon, category, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        'TaskFlow Collaborative Platform',
        'Next-generation collaborative workspace with Kanban boards, live WebSockets, and team communication.',
        '#6366f1',
        'layout',
        'Engineering',
        alexId
      ]
    );
    const p1Id = Number(p1Res.lastInsertRowid);

    // Project 1 Members
    const addMember = (projId, userId, role) => {
      dbHelper.run('INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)', [projId, userId, role]);
    };
    addMember(p1Id, alexId, 'owner');
    addMember(p1Id, sarahId, 'admin');
    addMember(p1Id, marcusId, 'member');
    addMember(p1Id, emilyId, 'member');

    // Project 1 Columns
    const addCol = (projId, title, pos) => {
      const res = dbHelper.run('INSERT INTO columns (project_id, title, position) VALUES (?, ?, ?)', [projId, title, pos]);
      return Number(res.lastInsertRowid);
    };
    const cBacklog = addCol(p1Id, 'Backlog', 0);
    const cTodo = addCol(p1Id, 'To Do', 1);
    const cInProgress = addCol(p1Id, 'In Progress', 2);
    const cReview = addCol(p1Id, 'In Review', 3);
    const cDone = addCol(p1Id, 'Done', 4);

    // Helpers for tasks
    const addTask = (projId, colId, title, desc, priority, dueDate, pos, creatorId) => {
      const res = dbHelper.run(
        'INSERT INTO tasks (project_id, column_id, title, description, priority, due_date, position, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [projId, colId, title, desc, priority, dueDate, pos, creatorId]
      );
      return Number(res.lastInsertRowid);
    };

    const assignUser = (taskId, userId) => {
      dbHelper.run('INSERT INTO task_assignees (task_id, user_id) VALUES (?, ?)', [taskId, userId]);
    };

    const addLabel = (taskId, label, color) => {
      dbHelper.run('INSERT INTO task_labels (task_id, label, color) VALUES (?, ?, ?)', [taskId, label, color]);
    };

    const addChecklist = (taskId, title, completed, pos) => {
      dbHelper.run('INSERT INTO task_checklists (task_id, title, completed, position) VALUES (?, ?, ?, ?)', [taskId, title, completed ? 1 : 0, pos]);
    };

    const addComment = (taskId, userId, content, timeAgoMins = 0) => {
      const d = new Date(Date.now() - timeAgoMins * 60000).toISOString();
      dbHelper.run('INSERT INTO comments (task_id, user_id, content, created_at) VALUES (?, ?, ?, ?)', [taskId, userId, content, d]);
    };

    const addActivity = (projId, taskId, userId, action, details) => {
      dbHelper.run('INSERT INTO activity_logs (project_id, task_id, user_id, action, details) VALUES (?, ?, ?, ?, ?)', [projId, taskId, userId, action, details]);
    };

    // Calculate dates
    const today = new Date();
    const fmtDate = (daysAhead) => {
      const d = new Date(today);
      d.setDate(d.getDate() + daysAhead);
      return d.toISOString().split('T')[0];
    };

    // --- Task 1 (In Progress) ---
    const t1 = addTask(
      p1Id,
      cInProgress,
      'Implement WebSocket Real-Time Synchronization',
      'Connect Socket.io to sync card drag-and-drops, column edits, comments, and active presence across all team members instantaneously.',
      'urgent',
      fmtDate(1),
      0,
      alexId
    );
    assignUser(t1, marcusId);
    assignUser(t1, alexId);
    addLabel(t1, 'Backend', '#8b5cf6');
    addLabel(t1, 'WebSockets', '#06b6d4');
    addChecklist(t1, 'Configure Socket.io rooms per project', 1, 0);
    addChecklist(t1, 'Emit task:moved and task:updated events', 1, 1);
    addChecklist(t1, 'Add client-side listener and state sync', 1, 2);
    addChecklist(t1, 'Implement presence indicator for active viewers', 0, 3);
    addComment(t1, marcusId, 'Rooms logic is working cleanly! Emitting updates on project channels now.', 60);
    addComment(t1, alexId, '@marcus Great progress! Let us make sure notifications are dispatched to offline assignees too.', 30);
    addActivity(p1Id, t1, alexId, 'created_task', 'Created task');
    addActivity(p1Id, t1, marcusId, 'moved_task', 'Moved from To Do to In Progress');

    // --- Task 2 (In Progress) ---
    const t2 = addTask(
      p1Id,
      cInProgress,
      'Design Responsive Kanban Board UI',
      'Create fluid multi-column board with smooth drag & drop, customizable column headers, priority badges, and quick-add cards.',
      'high',
      fmtDate(2),
      1,
      sarahId
    );
    assignUser(t2, sarahId);
    addLabel(t2, 'Frontend', '#10b981');
    addLabel(t2, 'UI/UX', '#ec4899');
    addChecklist(t2, 'Build flexbox column layout with scroll containment', 1, 0);
    addChecklist(t2, 'Implement HTML5 drag & drop event handlers', 1, 1);
    addChecklist(t2, 'Add micro-animations for card drop and hover states', 0, 2);
    addComment(t2, sarahId, 'Added subtle shadow transitions when dragging cards across columns.', 45);
    addActivity(p1Id, t2, sarahId, 'created_task', 'Created task');

    // --- Task 3 (To Do) ---
    const t3 = addTask(
      p1Id,
      cTodo,
      'Task Detail Modal with Rich Communication',
      'Support full task inspection, checklists with interactive progress bar, assignee multi-select, and live comment thread with @mentions.',
      'high',
      fmtDate(3),
      0,
      emilyId
    );
    assignUser(t3, sarahId);
    assignUser(t3, emilyId);
    addLabel(t3, 'Frontend', '#10b981');
    addLabel(t3, 'Communication', '#f59e0b');
    addChecklist(t3, 'Modal open/close animations and backdrop blur', 1, 0);
    addChecklist(t3, 'Live comment input with Enter key submission', 1, 1);
    addChecklist(t3, 'Checklist progress bar recalculation', 0, 2);
    addActivity(p1Id, t3, emilyId, 'created_task', 'Created task');

    // --- Task 4 (To Do) ---
    const t4 = addTask(
      p1Id,
      cTodo,
      'Project Member Invitations & Role Management',
      'Enable project owners to invite registered users, assign roles (Owner, Admin, Member, Viewer), and manage permissions.',
      'medium',
      fmtDate(5),
      1,
      alexId
    );
    assignUser(t4, alexId);
    addLabel(t4, 'Security', '#ef4444');
    addLabel(t4, 'Backend', '#8b5cf6');
    addChecklist(t4, 'API endpoint for role verification', 1, 0);
    addChecklist(t4, 'Invite member modal with search/autocomplete', 0, 1);
    addActivity(p1Id, t4, alexId, 'created_task', 'Created task');

    // --- Task 5 (In Review) ---
    const t5 = addTask(
      p1Id,
      cReview,
      'JWT Authentication & Secure Password Hashing',
      'Set up user registration, login, token refresh, protected routes, and profile management with avatar color selection.',
      'urgent',
      fmtDate(-1),
      0,
      alexId
    );
    assignUser(t5, marcusId);
    addLabel(t5, 'Security', '#ef4444');
    addLabel(t5, 'Auth', '#3b82f6');
    addChecklist(t5, 'Bcrypt password hashing with salt rounds 10', 1, 0);
    addChecklist(t5, 'JWT token validation middleware', 1, 1);
    addChecklist(t5, 'Profile endpoint and user stats', 1, 2);
    addComment(t5, marcusId, 'PR is ready for review. JWT expires in 7 days, stored safely in localStorage with Authorization Bearer header.', 120);
    addComment(t5, alexId, 'Code reviewed, looks clean and meets all security standards!', 15);
    addActivity(p1Id, t5, marcusId, 'moved_task', 'Moved to In Review');

    // --- Task 6 (Done) ---
    const t6 = addTask(
      p1Id,
      cDone,
      'Database Schema & SQLite Persistence Engine',
      'Configure SQLite relational schema with foreign key cascades, WAL mode, indexed columns, and database helper utility.',
      'medium',
      fmtDate(-2),
      0,
      marcusId
    );
    assignUser(t6, marcusId);
    addLabel(t6, 'Database', '#14b8a6');
    addChecklist(t6, 'Create SQL schema tables', 1, 0);
    addChecklist(t6, 'Test foreign keys and indexes', 1, 1);
    addChecklist(t6, 'Add seed dataset for automated testing', 1, 2);
    addActivity(p1Id, t6, marcusId, 'moved_task', 'Moved to Done');

    // --- Task 7 (Backlog) ---
    const t7 = addTask(
      p1Id,
      cBacklog,
      'Export Project to CSV & JSON',
      'Allow exporting project tasks, assignees, and progress to formatted CSV or JSON files for external reporting.',
      'low',
      fmtDate(10),
      0,
      emilyId
    );
    assignUser(t7, emilyId);
    addLabel(t7, 'Feature', '#6366f1');

    // 3. Project 2: Mobile Companion App v2.0
    const p2Res = dbHelper.run(
      'INSERT INTO projects (title, description, color, icon, category, owner_id) VALUES (?, ?, ?, ?, ?, ?)',
      [
        'Mobile Companion App v2.0',
        'Cross-platform companion mobile app for on-the-go sprint management, quick task logging, and push notifications.',
        '#0ea5e9',
        'smartphone',
        'Mobile',
        emilyId
      ]
    );
    const p2Id = Number(p2Res.lastInsertRowid);
    addMember(p2Id, emilyId, 'owner');
    addMember(p2Id, alexId, 'admin');
    addMember(p2Id, sarahId, 'member');
    addMember(p2Id, marcusId, 'member');

    const p2Todo = addCol(p2Id, 'To Do', 0);
    const p2Prog = addCol(p2Id, 'In Progress', 1);
    const p2Done = addCol(p2Id, 'Done', 2);

    const t21 = addTask(p2Id, p2Prog, 'Design Mobile Navigation and Tab Bar', 'Create high-fidelity Figma components for bottom tab navigation.', 'high', fmtDate(4), 0, emilyId);
    assignUser(t21, sarahId);
    addLabel(t21, 'Design', '#ec4899');

    const t22 = addTask(p2Id, p2Todo, 'Offline Sync via Local Storage', 'Cache recently visited boards for offline browsing and sync upon reconnect.', 'medium', fmtDate(7), 0, alexId);
    assignUser(t22, marcusId);
    addLabel(t22, 'Mobile', '#0ea5e9');

    // 4. Notifications
    const addNotif = (userId, actorId, projId, taskId, type, title, msg, isRead = 0) => {
      dbHelper.run(
        'INSERT INTO notifications (user_id, actor_id, project_id, task_id, type, title, message, is_read) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [userId, actorId, projId, taskId, type, title, msg, isRead]
      );
    };

    addNotif(alexId, marcusId, p1Id, t1, 'assigned', 'Assigned to task', 'Marcus Vance assigned you to "Implement WebSocket Real-Time Synchronization"', 0);
    addNotif(alexId, sarahId, p1Id, t2, 'comment_added', 'New comment on task', 'Sarah Chen commented on "Design Responsive Kanban Board UI"', 0);
    addNotif(sarahId, alexId, p1Id, t3, 'assigned', 'Assigned to task', 'Alex River assigned you to "Task Detail Modal with Rich Communication"', 0);
    addNotif(marcusId, alexId, p1Id, t5, 'status_changed', 'Task Status Updated', 'Alex River moved "JWT Authentication & Secure Password Hashing" to In Review', 1);
  });

  console.log('Database seeded successfully with rich sample projects, users, tasks, and comments!');
}

if (require.main === module) {
  seedDatabase(true);
}

module.exports = seedDatabase;
