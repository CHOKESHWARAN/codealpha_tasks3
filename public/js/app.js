// ==========================================================================
// TaskFlow Main Application Controller
// ==========================================================================

import { api } from './api.js';
import { state } from './state.js';
import { socket } from './socket.js';

import { AuthView } from './views/authView.js';
import { BoardView } from './views/boardView.js';
import { ListView } from './views/listView.js';
import { MembersView } from './views/membersView.js';
import { AnalyticsView } from './views/analyticsView.js';
import { TaskModal } from './views/taskModal.js';

class App {
  constructor() {
    this.appRoot = document.getElementById('app');
    this.taskModal = null;
    this.views = {};
    this.demoUsers = [];
  }

  async init() {
    // Check authentication
    const token = api.getToken();
    if (!token) {
      this.renderAuth();
      return;
    }

    try {
      const res = await api.getMe();
      state.setUser(res.user);
      await this.loadApp();
    } catch (err) {
      console.warn('Session expired or invalid token:', err);
      api.setToken(null);
      this.renderAuth();
    }

    // Handle session expiration
    window.addEventListener('auth:expired', () => {
      socket.disconnect();
      this.renderAuth();
    });
  }

  renderAuth() {
    const authView = new AuthView(this.appRoot);
    authView.init();

    state.subscribe('user:change', (user) => {
      if (user) {
        this.loadApp();
      }
    });
  }

  async loadApp() {
    // Connect WebSocket
    socket.connect();
    this.wireSocketEvents();

    // Fetch Demo Users for Quick Switcher
    try {
      const demoRes = await api.getDemoUsers();
      this.demoUsers = demoRes.demoUsers || [];
    } catch (e) {}

    // Fetch Projects
    try {
      const pRes = await api.getProjects();
      state.setProjects(pRes.projects || []);

      if (pRes.projects && pRes.projects.length > 0) {
        await this.selectProject(pRes.projects[0].id);
      } else {
        this.renderShell();
        this.renderEmptyProjects();
      }
    } catch (err) {
      state.showToast('Failed to load projects: ' + err.message, 'danger');
    }

    // Fetch Notifications
    this.loadNotifications();
  }

  async selectProject(projectId) {
    try {
      const res = await api.getProject(projectId);
      state.setCurrentProject(res.project);
      socket.joinProject(projectId);

      this.renderShell();
      this.renderActiveView();
    } catch (err) {
      state.showToast('Failed to load project: ' + err.message, 'danger');
    }
  }

  async loadNotifications() {
    try {
      const res = await api.getNotifications();
      state.setNotifications(res.notifications, res.unreadCount);
    } catch (e) {}
  }

  wireSocketEvents() {
    // 1. Presence
    socket.on('presence:update', (users) => {
      state.setOnlineMembers(users);
      this.renderPresenceBar();
    });

    // 2. Direct notifications
    socket.on('notification:new', (notif) => {
      state.showToast(`🔔 ${notif.title}: ${notif.message}`, 'info', 5000);
      this.loadNotifications();
    });

    // 3. Task events
    socket.on('task:created', (data) => {
      if (state.currentProject && Number(state.currentProject.id) === Number(data.task.project_id)) {
        if (!state.currentProject.tasks.some(t => Number(t.id) === Number(data.task.id))) {
          state.currentProject.tasks.push(data.task);
          this.refreshCurrentView();
          if (data.actor && Number(data.actor.id) !== Number(state.currentUser?.id)) {
            state.showToast(`${data.actor.name} created task "${data.task.title}"`, 'info', 3000);
          }
        }
      }
    });

    socket.on('task:moved', (data) => {
      if (state.currentProject) {
        const t = state.currentProject.tasks.find(x => Number(x.id) === Number(data.taskId));
        if (t) {
          t.column_id = Number(data.column_id);
          this.refreshCurrentView();
          if (data.actor && Number(data.actor.id) !== Number(state.currentUser?.id)) {
            state.showToast(`${data.actor.name} moved a task`, 'info', 2000);
          }
        }
      }
    });

    socket.on('task:updated', (data) => {
      if (state.currentProject) {
        const idx = state.currentProject.tasks.findIndex(x => Number(x.id) === Number(data.task.id));
        if (idx !== -1) {
          state.currentProject.tasks[idx] = data.task;
          this.refreshCurrentView();
        }
      }
    });

    socket.on('task:deleted', (data) => {
      if (state.currentProject) {
        state.currentProject.tasks = state.currentProject.tasks.filter(x => Number(x.id) !== Number(data.taskId));
        this.refreshCurrentView();
        if (data.actor && Number(data.actor.id) !== Number(state.currentUser?.id)) {
          state.showToast(`${data.actor.name} deleted a task`, 'info', 2000);
        }
      }
    });

    // 4. Column events
    socket.on('column:created', (data) => {
      if (state.currentProject && data.column) {
        if (!state.currentProject.columns.some(c => Number(c.id) === Number(data.column.id))) {
          state.currentProject.columns.push(data.column);
          this.refreshCurrentView();
        }
      }
    });

    socket.on('column:updated', (data) => {
      if (state.currentProject && data.column) {
        const idx = state.currentProject.columns.findIndex(c => Number(c.id) === Number(data.column.id));
        if (idx !== -1) {
          state.currentProject.columns[idx] = data.column;
          this.refreshCurrentView();
        }
      }
    });

    socket.on('column:deleted', (data) => {
      if (state.currentProject) {
        state.currentProject.columns = state.currentProject.columns.filter(c => Number(c.id) !== Number(data.columnId));
        this.refreshCurrentView();
      }
    });
  }

  renderShell() {
    const user = state.currentUser;
    const project = state.currentProject;
    const projects = state.projects || [];

    this.appRoot.innerHTML = `
      <!-- Top Navbar -->
      <nav class="top-navbar">
        
        <!-- Left Brand & Project Dropdown -->
        <div class="brand-section">
          <div class="brand-logo">
            <svg width="26" height="26" viewBox="0 0 32 32" fill="none">
              <rect width="32" height="32" rx="8" fill="#4F46E5"/>
              <rect x="6" y="8" width="8" height="16" rx="2" fill="#FFFFFF" fill-opacity="0.9"/>
              <rect x="18" y="8" width="8" height="10" rx="2" fill="#A5B4FC"/>
            </svg>
            TaskFlow
          </div>

          <!-- Project Selector -->
          <div class="project-dropdown-wrapper">
            <select id="project-switcher-select" class="form-select" style="font-weight: 600; font-size: 0.875rem; height: 34px; padding: 4px 12px; background-color: var(--bg-surface-elevated); border-color: var(--border-default);">
              ${projects.map(p => `
                <option value="${p.id}" ${project && Number(p.id) === Number(project.id) ? 'selected' : ''}>
                  📁 ${this.escape(p.title)}
                </option>
              `).join('')}
            </select>
          </div>

          <button class="btn btn-secondary btn-sm" id="nav-new-project-btn" title="Create New Group Project">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Project
          </button>
        </div>

        <!-- Center View Navigation Tabs -->
        <div class="view-nav-tabs">
          <button class="view-nav-tab ${state.activeView === 'board' ? 'active' : ''}" data-view="board">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/></svg>
            Kanban Board
          </button>
          <button class="view-nav-tab ${state.activeView === 'list' ? 'active' : ''}" data-view="list">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="8" y1="6" x2="21" y2="6"/><line x1="8" y1="12" x2="21" y2="12"/><line x1="8" y1="18" x2="21" y2="18"/><line x1="3" y1="6" x2="3.01" y2="6"/><line x1="3" y1="12" x2="3.01" y2="12"/><line x1="3" y1="18" x2="3.01" y2="18"/></svg>
            List View
          </button>
          <button class="view-nav-tab ${state.activeView === 'members' ? 'active' : ''}" data-view="members">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>
            Team (${project?.members?.length || 0})
          </button>
          <button class="view-nav-tab ${state.activeView === 'analytics' ? 'active' : ''}" data-view="analytics">
            <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Analytics
          </button>
        </div>

        <!-- Right Controls -->
        <div class="nav-actions">
          
          <!-- Live Online Presence Cluster -->
          <div class="presence-cluster" id="presence-cluster-container" title="Teammates currently active on this board">
            <!-- Rendered via renderPresenceBar() -->
          </div>

          <!-- Quick 1-Click Demo Switcher -->
          <div style="position: relative;">
            <select id="quick-demo-switcher-select" class="form-select" style="font-size: 0.75rem; height: 32px; padding: 2px 8px; background-color: var(--bg-surface-elevated); border-color: rgba(99, 102, 241, 0.4); color: #818CF8;" title="1-Click Switch Account for Multi-User Testing">
              <option value="" disabled selected>⚡ Switch Demo User</option>
              ${this.demoUsers.map(d => `
                <option value="${d.token}">
                  ${d.name} (${d.role})
                </option>
              `).join('')}
            </select>
          </div>

          <!-- Notification Bell -->
          <div class="bell-wrapper">
            <button class="btn-icon" id="notif-bell-btn" title="Notifications">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
            </button>
            <span class="notif-badge-pill" id="notif-badge-counter" style="display: none;">0</span>

            <!-- Notifications Dropdown -->
            <div class="notification-dropdown" id="notif-dropdown-menu">
              <div class="notif-header">
                <span style="font-weight: 600; font-size: 0.875rem;">Notifications</span>
                <div style="display: flex; gap: 8px;">
                  <button id="mark-all-notif-btn" style="background: none; border: none; color: var(--primary); font-size: 0.75rem; cursor: pointer;">Mark Read</button>
                  <button id="clear-all-notif-btn" style="background: none; border: none; color: var(--text-muted); font-size: 0.75rem; cursor: pointer;">Clear</button>
                </div>
              </div>
              <div class="notif-list" id="notif-items-list">
                <!-- Rendered dynamically -->
              </div>
            </div>
          </div>

          <!-- Current User Profile & Logout -->
          <div style="display: flex; align-items: center; gap: 8px;">
            <span class="avatar" style="background-color: ${user?.avatar_color || '#3b82f6'};" title="${user?.name} (${user?.email})">
              ${user ? user.name.split(' ').map(n=>n[0]).join('') : 'U'}
            </span>
            <button class="btn btn-secondary btn-sm" id="logout-btn" title="Sign Out">
              Logout
            </button>
          </div>

        </div>

      </nav>

      <!-- Project Subbar (Filters, Search & Project Title) -->
      <div class="project-subbar">
        <div class="project-meta-info">
          <div class="project-title">
            <span class="project-color-badge" style="background-color: ${project?.color || '#6366f1'}; width: 12px; height: 12px;"></span>
            <span>${this.escape(project?.title || 'Project Board')}</span>
          </div>
          <span class="badge" style="background-color: rgba(255, 255, 255, 0.05); color: var(--text-secondary);">
            ${project?.category || 'General'}
          </span>
          <span style="font-size: 0.8125rem; color: var(--text-muted);">
            Role: <strong>${project?.my_role || 'member'}</strong>
          </span>
        </div>

        <!-- Filter Controls -->
        <div class="project-filters">
          <!-- Search -->
          <div class="filter-search">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
            <input type="text" id="filter-search-input" class="form-input" placeholder="Search tasks..." value="${this.escape(state.searchQuery)}" />
          </div>

          <!-- Priority Filter -->
          <select id="filter-priority-select" class="form-select" style="width: auto; height: 32px; font-size: 0.8125rem;">
            <option value="all">All Priorities</option>
            <option value="urgent" ${state.filterPriority === 'urgent' ? 'selected' : ''}>Urgent</option>
            <option value="high" ${state.filterPriority === 'high' ? 'selected' : ''}>High</option>
            <option value="medium" ${state.filterPriority === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="low" ${state.filterPriority === 'low' ? 'selected' : ''}>Low</option>
          </select>

          <!-- Assignee Filter -->
          <select id="filter-assignee-select" class="form-select" style="width: auto; height: 32px; font-size: 0.8125rem;">
            <option value="all">All Assignees</option>
            ${(project?.members || []).map(m => `
              <option value="${m.id}" ${String(state.filterAssignee) === String(m.id) ? 'selected' : ''}>${this.escape(m.name)}</option>
            `).join('')}
          </select>
        </div>
      </div>

      <!-- Main Dynamic Content Area -->
      <main class="main-content" id="main-view-container"></main>

      <!-- Task Inspector Modal Overlay -->
      <div class="modal-overlay" id="task-modal-overlay"></div>

      <!-- Create Project Modal Overlay -->
      <div class="modal-overlay" id="create-project-modal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Create New Group Project</h3>
            <button class="modal-close-btn" id="close-create-proj-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <form id="create-project-form">
            <div class="modal-body">
              <div class="form-group">
                <label>Project Name</label>
                <input type="text" id="new-proj-title" class="form-input" placeholder="e.g. Q4 Growth Sprint" required />
              </div>
              <div class="form-group">
                <label>Description</label>
                <textarea id="new-proj-desc" class="form-textarea" rows="2" placeholder="Describe the goal of this collaborative workspace..."></textarea>
              </div>
              <div class="form-group">
                <label>Category</label>
                <select id="new-proj-category" class="form-select">
                  <option value="Engineering">Engineering</option>
                  <option value="Product Design">Product Design</option>
                  <option value="Marketing">Marketing</option>
                  <option value="Operations">Operations</option>
                  <option value="General">General</option>
                </select>
              </div>
              <div class="form-group">
                <label>Color Accent</label>
                <div style="display: flex; gap: 8px;">
                  ${['#6366f1', '#0ea5e9', '#10b981', '#f59e0b', '#ec4899', '#8b5cf6'].map((c, i) => `
                    <label style="cursor: pointer;">
                      <input type="radio" name="proj_color" value="${c}" ${i === 0 ? 'checked' : ''} style="display: none;" />
                      <span class="color-swatch" style="display: inline-block; width: 28px; height: 28px; border-radius: 50%; background: ${c}; border: 2px solid transparent;"></span>
                    </label>
                  `).join('')}
                </div>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancel-create-proj-btn">Cancel</button>
              <button type="submit" class="btn btn-primary">Create Project</button>
            </div>
          </form>
        </div>
      </div>

      <!-- Toast Container -->
      <div class="toast-container" id="toast-container"></div>
    `;

    // Instantiate TaskModal
    const modalOverlay = document.getElementById('task-modal-overlay');
    this.taskModal = new TaskModal(modalOverlay, () => {
      this.refreshCurrentView();
    });

    this.bindShellEvents();
    this.renderPresenceBar();
    this.updateNotificationBadge();
  }

  renderPresenceBar() {
    const container = document.getElementById('presence-cluster-container');
    if (!container) return;

    const members = state.onlineMembers || [];
    if (members.length === 0) {
      container.innerHTML = '';
      return;
    }

    container.innerHTML = `
      <div style="display: flex; align-items: center; gap: 6px; font-size: 0.75rem; color: #10B981;">
        <span style="width: 8px; height: 8px; border-radius: 50%; background: #10B981; animation: pulse 2s infinite;"></span>
        <span style="font-weight: 500;">Online:</span>
      </div>
      <div class="presence-avatars">
        ${members.map(m => `
          <span class="presence-avatar" style="background-color: ${m.avatar_color || '#3b82f6'};" title="${this.escape(m.name)} (active now)">
            ${m.name.split(' ').map(n=>n[0]).join('')}
          </span>
        `).join('')}
      </div>
    `;
  }

  updateNotificationBadge() {
    const badge = document.getElementById('notif-badge-counter');
    if (!badge) return;

    const unread = state.unreadNotifCount;
    if (unread > 0) {
      badge.textContent = unread > 9 ? '9+' : unread;
      badge.style.display = 'block';
    } else {
      badge.style.display = 'none';
    }
  }

  renderNotificationsDropdown() {
    const list = document.getElementById('notif-items-list');
    if (!list) return;

    const notifs = state.notifications || [];
    if (notifs.length === 0) {
      list.innerHTML = `<div style="padding: 24px; text-align: center; color: var(--text-muted); font-size: 0.8125rem;">No notifications.</div>`;
      return;
    }

    list.innerHTML = notifs.map(n => `
      <div class="notif-item ${!n.is_read ? 'unread' : ''}" data-id="${n.id}">
        <span class="avatar avatar-sm" style="background-color: ${n.actor_color || '#6366f1'}; margin-top: 2px;">
          ${n.actor_name ? n.actor_name.split(' ').map(x=>x[0]).join('') : 'TF'}
        </span>
        <div style="flex: 1; min-width: 0;">
          <div class="notif-title">${this.escape(n.title)}</div>
          <div class="notif-desc">${this.escape(n.message)}</div>
          <div class="notif-time">${new Date(n.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</div>
        </div>
      </div>
    `).join('');

    // Click on notification to mark read
    list.querySelectorAll('.notif-item').forEach(item => {
      item.addEventListener('click', async () => {
        const id = item.dataset.id;
        try {
          await api.markNotificationRead(id);
          const found = state.notifications.find(n => String(n.id) === String(id));
          if (found && !found.is_read) {
            found.is_read = 1;
            state.unreadNotifCount = Math.max(0, state.unreadNotifCount - 1);
            this.updateNotificationBadge();
            item.classList.remove('unread');
          }
        } catch (e) {}
      });
    });
  }

  renderActiveView() {
    const container = document.getElementById('main-view-container');
    if (!container) return;

    const onOpenTask = (taskId) => {
      if (this.taskModal) this.taskModal.open(taskId);
    };

    switch (state.activeView) {
      case 'board':
        this.views.board = new BoardView(container, onOpenTask);
        this.views.board.render();
        break;
      case 'list':
        this.views.list = new ListView(container, onOpenTask);
        this.views.list.render();
        break;
      case 'members':
        this.views.members = new MembersView(container);
        this.views.members.render();
        break;
      case 'analytics':
        this.views.analytics = new AnalyticsView(container);
        this.views.analytics.render();
        break;
    }
  }

  refreshCurrentView() {
    this.renderActiveView();
  }

  bindShellEvents() {
    // Project Switcher select
    const projSelect = document.getElementById('project-switcher-select');
    if (projSelect) {
      projSelect.addEventListener('change', (e) => {
        this.selectProject(e.target.value);
      });
    }

    // View Navigation Tabs
    const viewTabs = document.querySelectorAll('.view-nav-tab');
    viewTabs.forEach(tab => {
      tab.addEventListener('click', () => {
        viewTabs.forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        const view = tab.dataset.view;
        state.setView(view);
        this.renderActiveView();
      });
    });

    // Filters
    const searchInput = document.getElementById('filter-search-input');
    if (searchInput) {
      searchInput.addEventListener('input', (e) => {
        state.setFilter('search', e.target.value);
        this.refreshCurrentView();
      });
    }

    const priorityFilter = document.getElementById('filter-priority-select');
    if (priorityFilter) {
      priorityFilter.addEventListener('change', (e) => {
        state.setFilter('priority', e.target.value);
        this.refreshCurrentView();
      });
    }

    const assigneeFilter = document.getElementById('filter-assignee-select');
    if (assigneeFilter) {
      assigneeFilter.addEventListener('change', (e) => {
        state.setFilter('assignee', e.target.value);
        this.refreshCurrentView();
      });
    }

    // Quick 1-Click Demo Switcher
    const demoSwitcher = document.getElementById('quick-demo-switcher-select');
    if (demoSwitcher) {
      demoSwitcher.addEventListener('change', async (e) => {
        const token = e.target.value;
        if (!token) return;
        api.setToken(token);
        try {
          const profile = await api.getMe();
          state.setUser(profile.user);
          socket.connect();
          await this.loadApp();
          state.showToast(`Switched account to ${profile.user.name}!`, 'success');
        } catch (err) {
          state.showToast('Failed to switch user.', 'danger');
        }
      });
    }

    // Notifications Dropdown toggle
    const bellBtn = document.getElementById('notif-bell-btn');
    const notifDropdown = document.getElementById('notif-dropdown-menu');
    if (bellBtn && notifDropdown) {
      bellBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        notifDropdown.classList.toggle('active');
        if (notifDropdown.classList.contains('active')) {
          this.renderNotificationsDropdown();
        }
      });

      document.addEventListener('click', (e) => {
        if (!notifDropdown.contains(e.target) && !bellBtn.contains(e.target)) {
          notifDropdown.classList.remove('active');
        }
      });
    }

    // Mark all notifications read
    const markAllBtn = document.getElementById('mark-all-notif-btn');
    if (markAllBtn) {
      markAllBtn.addEventListener('click', async () => {
        try {
          await api.markAllNotificationsRead();
          state.notifications.forEach(n => n.is_read = 1);
          state.unreadNotifCount = 0;
          this.updateNotificationBadge();
          this.renderNotificationsDropdown();
        } catch (e) {}
      });
    }

    // Clear all notifications
    const clearAllBtn = document.getElementById('clear-all-notif-btn');
    if (clearAllBtn) {
      clearAllBtn.addEventListener('click', async () => {
        try {
          await api.clearAllNotifications();
          state.notifications = [];
          state.unreadNotifCount = 0;
          this.updateNotificationBadge();
          this.renderNotificationsDropdown();
        } catch (e) {}
      });
    }

    // Create Project Modal
    const newProjBtn = document.getElementById('nav-new-project-btn');
    const projModal = document.getElementById('create-project-modal');
    const closeProjBtn = document.getElementById('close-create-proj-btn');
    const cancelProjBtn = document.getElementById('cancel-create-proj-btn');
    const projForm = document.getElementById('create-project-form');

    if (newProjBtn && projModal) {
      newProjBtn.addEventListener('click', () => projModal.classList.add('active'));
    }

    const closeProjModal = () => projModal && projModal.classList.remove('active');
    if (closeProjBtn) closeProjBtn.addEventListener('click', closeProjModal);
    if (cancelProjBtn) cancelProjBtn.addEventListener('click', closeProjModal);

    if (projForm) {
      projForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const title = document.getElementById('new-proj-title').value.trim();
        const description = document.getElementById('new-proj-desc').value.trim();
        const category = document.getElementById('new-proj-category').value;
        const colorRadio = document.querySelector('input[name="proj_color"]:checked');
        const color = colorRadio ? colorRadio.value : '#6366f1';

        try {
          const res = await api.createProject({ title, description, category, color });
          state.projects.unshift(res.project);
          closeProjModal();
          await this.selectProject(res.project.id);
          state.showToast(`Project "${title}" created!`, 'success');
        } catch (err) {
          state.showToast(err.message, 'danger');
        }
      });
    }

    // Logout
    const logoutBtn = document.getElementById('logout-btn');
    if (logoutBtn) {
      logoutBtn.addEventListener('click', () => {
        api.setToken(null);
        socket.disconnect();
        state.setUser(null);
        this.renderAuth();
        state.showToast('Logged out successfully', 'info');
      });
    }
  }

  renderEmptyProjects() {
    const container = document.getElementById('main-view-container');
    if (!container) return;
    container.innerHTML = `
      <div style="flex: 1; display: flex; flex-direction: column; align-items: center; justify-content: center; padding: 40px; text-align: center;">
        <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="var(--primary)" stroke-width="1.5"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <h3 style="margin-top: 16px;">No Projects Found</h3>
        <p style="color: var(--text-secondary); max-width: 400px; margin-top: 6px; font-size: 0.875rem;">
          You don't have any active projects yet. Create a group project to start tracking tasks and collaborating.
        </p>
        <button class="btn btn-primary" id="empty-create-proj-btn" style="margin-top: 16px;">
          Create Your First Project
        </button>
      </div>
    `;

    const btn = document.getElementById('empty-create-proj-btn');
    const modal = document.getElementById('create-project-modal');
    if (btn && modal) {
      btn.addEventListener('click', () => modal.classList.add('active'));
    }
  }

  escape(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}

// Start Application on DOM Ready
document.addEventListener('DOMContentLoaded', () => {
  const app = new App();
  app.init();
});
