// ==========================================================================
// TaskFlow Central Reactive State Store
// ==========================================================================

class StateStore {
  constructor() {
    this.currentUser = null;
    this.projects = [];
    this.currentProject = null;
    this.activeView = 'board'; // 'board' | 'list' | 'members' | 'analytics'
    this.notifications = [];
    this.unreadNotifCount = 0;
    this.onlineMembers = [];
    
    // Filters
    this.searchQuery = '';
    this.filterPriority = 'all';
    this.filterAssignee = 'all';

    // Active opened task in modal
    this.activeTaskModal = null;

    this.subscribers = new Map();
  }

  setUser(user) {
    this.currentUser = user;
    this.emit('user:change', user);
  }

  setProjects(projects) {
    this.projects = projects;
    this.emit('projects:change', projects);
  }

  setCurrentProject(project) {
    this.currentProject = project;
    this.emit('project:change', project);
  }

  setView(viewName) {
    this.activeView = viewName;
    this.emit('view:change', viewName);
  }

  setNotifications(notifications, unreadCount) {
    this.notifications = notifications;
    this.unreadNotifCount = unreadCount !== undefined ? unreadCount : notifications.filter(n => !n.is_read).length;
    this.emit('notifications:change', { notifications: this.notifications, unreadCount: this.unreadNotifCount });
  }

  setOnlineMembers(members) {
    this.onlineMembers = members || [];
    this.emit('presence:change', this.onlineMembers);
  }

  setFilter(type, value) {
    if (type === 'search') this.searchQuery = value.toLowerCase().trim();
    if (type === 'priority') this.filterPriority = value;
    if (type === 'assignee') this.filterAssignee = value;
    this.emit('filter:change', { search: this.searchQuery, priority: this.filterPriority, assignee: this.filterAssignee });
  }

  getFilteredTasks() {
    if (!this.currentProject || !this.currentProject.tasks) return [];
    return this.currentProject.tasks.filter(t => {
      // Search
      if (this.searchQuery) {
        const matchTitle = t.title.toLowerCase().includes(this.searchQuery);
        const matchDesc = (t.description || '').toLowerCase().includes(this.searchQuery);
        if (!matchTitle && !matchDesc) return false;
      }
      // Priority
      if (this.filterPriority !== 'all' && t.priority !== this.filterPriority) {
        return false;
      }
      // Assignee
      if (this.filterAssignee !== 'all') {
        const isAssigned = t.assignees && t.assignees.some(a => String(a.id) === String(this.filterAssignee));
        if (!isAssigned) return false;
      }
      return true;
    });
  }

  // Pub/Sub
  subscribe(event, callback) {
    if (!this.subscribers.has(event)) {
      this.subscribers.set(event, new Set());
    }
    this.subscribers.get(event).add(callback);
    return () => this.subscribers.get(event).delete(callback);
  }

  emit(event, data) {
    if (this.subscribers.has(event)) {
      this.subscribers.get(event).forEach(cb => {
        try {
          cb(data);
        } catch (e) {
          console.error(`Error in state listener for "${event}":`, e);
        }
      });
    }
  }

  // Toast Notification System
  showToast(message, type = 'info', duration = 4000) {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    
    let iconSvg = '';
    if (type === 'success') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#10B981" stroke-width="2.5"><polyline points="20 6 9 17 4 12"/></svg>`;
    } else if (type === 'danger') {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#EF4444" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>`;
    } else {
      iconSvg = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#6366F1" stroke-width="2.5"><circle cx="12" cy="12" r="10"/><line x1="12" y1="16" x2="12" y2="12"/><line x1="12" y1="8" x2="12.01" y2="8"/></svg>`;
    }

    toast.innerHTML = `
      ${iconSvg}
      <div style="flex: 1; font-weight: 500;">${message}</div>
    `;

    container.appendChild(toast);

    setTimeout(() => {
      toast.style.opacity = '0';
      toast.style.transform = 'translateX(100%)';
      setTimeout(() => toast.remove(), 250);
    }, duration);
  }
}

export const state = new StateStore();
