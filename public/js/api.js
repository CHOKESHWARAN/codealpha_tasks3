// ==========================================================================
// TaskFlow Frontend API Client
// ==========================================================================

const API_BASE = '/api';

class ApiClient {
  constructor() {
    this.token = localStorage.getItem('taskflow_token') || null;
  }

  setToken(token) {
    this.token = token;
    if (token) {
      localStorage.setItem('taskflow_token', token);
    } else {
      localStorage.removeItem('taskflow_token');
    }
  }

  getToken() {
    return this.token;
  }

  async request(endpoint, options = {}) {
    const headers = {
      'Content-Type': 'application/json',
      ...(options.headers || {})
    };

    if (this.token) {
      headers['Authorization'] = `Bearer ${this.token}`;
    }

    const config = {
      ...options,
      headers
    };

    try {
      const response = await fetch(`${API_BASE}${endpoint}`, config);
      const data = await response.json().catch(() => null);

      if (!response.ok) {
        if (response.status === 401 && !endpoint.includes('/auth/login') && !endpoint.includes('/auth/register')) {
          this.setToken(null);
          window.dispatchEvent(new CustomEvent('auth:expired'));
        }
        throw new Error((data && data.error) || `Request failed with status ${response.status}`);
      }

      return data;
    } catch (err) {
      console.error(`API Error [${options.method || 'GET'} ${endpoint}]:`, err);
      throw err;
    }
  }

  // --- Auth Endpoints ---
  async login(email, password) {
    const data = await this.request('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password })
    });
    this.setToken(data.token);
    return data;
  }

  async register(name, email, password, role, avatar_color) {
    const data = await this.request('/auth/register', {
      method: 'POST',
      body: JSON.stringify({ name, email, password, role, avatar_color })
    });
    this.setToken(data.token);
    return data;
  }

  async getDemoUsers() {
    return await this.request('/auth/demo-users');
  }

  async getMe() {
    return await this.request('/auth/me');
  }

  async updateProfile(profileData) {
    return await this.request('/auth/profile', {
      method: 'PUT',
      body: JSON.stringify(profileData)
    });
  }

  // --- Projects Endpoints ---
  async getProjects() {
    return await this.request('/projects');
  }

  async getProject(id) {
    return await this.request(`/projects/${id}`);
  }

  async createProject(projectData) {
    return await this.request('/projects', {
      method: 'POST',
      body: JSON.stringify(projectData)
    });
  }

  async updateProject(id, projectData) {
    return await this.request(`/projects/${id}`, {
      method: 'PUT',
      body: JSON.stringify(projectData)
    });
  }

  async deleteProject(id) {
    return await this.request(`/projects/${id}`, {
      method: 'DELETE'
    });
  }

  async addProjectMember(projectId, email, role) {
    return await this.request(`/projects/${projectId}/members`, {
      method: 'POST',
      body: JSON.stringify({ email, role })
    });
  }

  async removeProjectMember(projectId, userId) {
    return await this.request(`/projects/${projectId}/members/${userId}`, {
      method: 'DELETE'
    });
  }

  async updateProjectMemberRole(projectId, userId, role) {
    return await this.request(`/projects/${projectId}/members/${userId}`, {
      method: 'PUT',
      body: JSON.stringify({ role })
    });
  }

  async getProjectActivity(projectId) {
    return await this.request(`/projects/${projectId}/activity`);
  }

  // --- Columns Endpoints ---
  async createColumn(projectId, title) {
    return await this.request('/columns', {
      method: 'POST',
      body: JSON.stringify({ project_id: projectId, title })
    });
  }

  async updateColumn(columnId, data) {
    return await this.request(`/columns/${columnId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteColumn(columnId) {
    return await this.request(`/columns/${columnId}`, {
      method: 'DELETE'
    });
  }

  // --- Tasks Endpoints ---
  async createTask(taskData) {
    return await this.request('/tasks', {
      method: 'POST',
      body: JSON.stringify(taskData)
    });
  }

  async getTask(taskId) {
    return await this.request(`/tasks/${taskId}`);
  }

  async updateTask(taskId, taskData) {
    return await this.request(`/tasks/${taskId}`, {
      method: 'PUT',
      body: JSON.stringify(taskData)
    });
  }

  async moveTask(taskId, columnId, position) {
    return await this.request(`/tasks/${taskId}/move`, {
      method: 'PUT',
      body: JSON.stringify({ column_id: columnId, position })
    });
  }

  async deleteTask(taskId) {
    return await this.request(`/tasks/${taskId}`, {
      method: 'DELETE'
    });
  }

  async assignTaskUser(taskId, userId) {
    return await this.request(`/tasks/${taskId}/assignees`, {
      method: 'POST',
      body: JSON.stringify({ user_id: userId })
    });
  }

  async unassignTaskUser(taskId, userId) {
    return await this.request(`/tasks/${taskId}/assignees/${userId}`, {
      method: 'DELETE'
    });
  }

  async addChecklistItem(taskId, title) {
    return await this.request(`/tasks/${taskId}/checklist`, {
      method: 'POST',
      body: JSON.stringify({ title })
    });
  }

  async updateChecklistItem(taskId, itemId, data) {
    return await this.request(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'PUT',
      body: JSON.stringify(data)
    });
  }

  async deleteChecklistItem(taskId, itemId) {
    return await this.request(`/tasks/${taskId}/checklist/${itemId}`, {
      method: 'DELETE'
    });
  }

  async addTaskLabel(taskId, label, color) {
    return await this.request(`/tasks/${taskId}/labels`, {
      method: 'POST',
      body: JSON.stringify({ label, color })
    });
  }

  async deleteTaskLabel(taskId, labelId) {
    return await this.request(`/tasks/${taskId}/labels/${labelId}`, {
      method: 'DELETE'
    });
  }

  // --- Comments Endpoints ---
  async addComment(taskId, content) {
    return await this.request(`/tasks/${taskId}/comments`, {
      method: 'POST',
      body: JSON.stringify({ content })
    });
  }

  async deleteComment(commentId) {
    return await this.request(`/comments/${commentId}`, {
      method: 'DELETE'
    });
  }

  // --- Notifications Endpoints ---
  async getNotifications() {
    return await this.request('/notifications');
  }

  async markNotificationRead(notifId) {
    return await this.request(`/notifications/${notifId}/read`, {
      method: 'PUT'
    });
  }

  async markAllNotificationsRead() {
    return await this.request('/notifications/read-all', {
      method: 'PUT'
    });
  }

  async clearAllNotifications() {
    return await this.request('/notifications/clear-all', {
      method: 'DELETE'
    });
  }

  // --- Users Endpoints ---
  async searchUsers(query = '') {
    return await this.request(`/users?search=${encodeURIComponent(query)}`);
  }
}

export const api = new ApiClient();
