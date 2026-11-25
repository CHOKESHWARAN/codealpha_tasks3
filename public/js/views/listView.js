// ==========================================================================
// TaskFlow List View (Asana-Style Table)
// ==========================================================================

import { api } from '../api.js';
import { state } from '../state.js';
import { socket } from '../socket.js';

export class ListView {
  constructor(container, onOpenTask) {
    this.container = container;
    this.onOpenTask = onOpenTask;
  }

  render() {
    const project = state.currentProject;
    if (!project) {
      this.container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);">No project selected.</div>`;
      return;
    }

    const tasks = state.getFilteredTasks();
    const columns = project.columns || [];

    this.container.innerHTML = `
      <div class="list-view-container">
        <div style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
          <h2 style="font-size: 1.125rem;">Project Tasks (${tasks.length})</h2>
          <button class="btn btn-primary btn-sm" id="list-add-task-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
            New Task
          </button>
        </div>

        <table class="list-table">
          <thead>
            <tr>
              <th style="width: 36%;">Task Title</th>
              <th style="width: 16%;">Status</th>
              <th style="width: 14%;">Priority</th>
              <th style="width: 14%;">Assignees</th>
              <th style="width: 12%;">Due Date</th>
              <th style="width: 8%; text-align: right;">Actions</th>
            </tr>
          </thead>
          <tbody>
            ${tasks.length === 0 ? `
              <tr>
                <td colspan="6" style="text-align: center; padding: 40px; color: var(--text-muted);">
                  No tasks matching your current filters.
                </td>
              </tr>
            ` : tasks.map(task => {
              const col = columns.find(c => Number(c.id) === Number(task.column_id));
              const colTitle = col ? col.title : 'Unassigned';

              const assigneesHtml = (task.assignees || []).map(a => `
                <span class="avatar avatar-sm" style="background-color: ${a.avatar_color || '#3b82f6'};" title="${this.escape(a.name)}">
                  ${a.name.split(' ').map(n=>n[0]).join('')}
                </span>
              `).join('');

              return `
                <tr data-task-id="${task.id}" class="list-row" style="cursor: pointer;">
                  <td>
                    <div style="display: flex; align-items: center; gap: 8px;">
                      <span class="column-pill" style="background-color: ${this.getColumnColor(colTitle)};"></span>
                      <span style="font-weight: 500;">${this.escape(task.title)}</span>
                    </div>
                  </td>
                  <td>
                    <select class="form-select inline-status-select" data-task-id="${task.id}" style="padding: 4px 8px; font-size: 0.8125rem; height: 28px;">
                      ${columns.map(c => `
                        <option value="${c.id}" ${Number(c.id) === Number(task.column_id) ? 'selected' : ''}>
                          ${this.escape(c.title)}
                        </option>
                      `).join('')}
                    </select>
                  </td>
                  <td>
                    <select class="form-select inline-priority-select" data-task-id="${task.id}" style="padding: 4px 8px; font-size: 0.8125rem; height: 28px;">
                      <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                      <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                      <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
                      <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                    </select>
                  </td>
                  <td>
                    <div style="display: flex; align-items: center; gap: 4px;">
                      ${assigneesHtml || '<span style="color: var(--text-muted); font-size: 0.75rem;">None</span>'}
                    </div>
                  </td>
                  <td>
                    <span style="font-size: 0.8125rem; color: ${task.due_date ? 'var(--text-primary)' : 'var(--text-muted)'};">
                      ${task.due_date || 'No due date'}
                    </span>
                  </td>
                  <td style="text-align: right;">
                    <button class="btn btn-secondary btn-sm open-task-btn" data-task-id="${task.id}">
                      Details
                    </button>
                  </td>
                </tr>
              `;
            }).join('')}
          </tbody>
        </table>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    // Open task details on row click or button click
    const rows = this.container.querySelectorAll('.list-row');
    rows.forEach(row => {
      row.addEventListener('click', (e) => {
        if (e.target.tagName === 'SELECT' || e.target.closest('select')) return;
        const taskId = Number(row.dataset.taskId);
        if (this.onOpenTask) this.onOpenTask(taskId);
      });
    });

    const openBtns = this.container.querySelectorAll('.open-task-btn');
    openBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        const taskId = Number(btn.dataset.taskId);
        if (this.onOpenTask) this.onOpenTask(taskId);
      });
    });

    // Inline status change
    const statusSelects = this.container.querySelectorAll('.inline-status-select');
    statusSelects.forEach(select => {
      select.addEventListener('change', async (e) => {
        e.stopPropagation();
        const taskId = Number(select.dataset.taskId);
        const colId = Number(select.value);
        try {
          await api.moveTask(taskId, colId, 0);
          socket.emitTaskMove(state.currentProject.id, taskId, colId, 0);
          const task = state.currentProject.tasks.find(t => Number(t.id) === taskId);
          if (task) task.column_id = colId;
          state.showToast('Task status updated', 'info', 1500);
        } catch (err) {
          state.showToast('Failed to update status: ' + err.message, 'danger');
        }
      });
    });

    // Inline priority change
    const prioritySelects = this.container.querySelectorAll('.inline-priority-select');
    prioritySelects.forEach(select => {
      select.addEventListener('change', async (e) => {
        e.stopPropagation();
        const taskId = Number(select.dataset.taskId);
        const priority = select.value;
        try {
          await api.updateTask(taskId, { priority });
          const task = state.currentProject.tasks.find(t => Number(t.id) === taskId);
          if (task) task.priority = priority;
          state.showToast('Priority updated', 'info', 1500);
        } catch (err) {
          state.showToast('Failed to update priority: ' + err.message, 'danger');
        }
      });
    });

    // Add task button
    const addBtn = this.container.querySelector('#list-add-task-btn');
    if (addBtn) {
      addBtn.addEventListener('click', async () => {
        const title = prompt('Enter new task title:');
        if (!title || !title.trim()) return;
        const defaultCol = state.currentProject.columns[0];
        if (!defaultCol) return;

        try {
          const res = await api.createTask({
            project_id: state.currentProject.id,
            column_id: defaultCol.id,
            title: title.trim(),
            priority: 'medium'
          });
          state.currentProject.tasks.push(res.task);
          this.render();
          state.showToast('Task created!', 'success');
        } catch (err) {
          state.showToast('Failed to create task: ' + err.message, 'danger');
        }
      });
    }
  }

  getColumnColor(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('todo') || t.includes('to do')) return '#0ea5e9';
    if (t.includes('progress')) return '#f59e0b';
    if (t.includes('review')) return '#8b5cf6';
    if (t.includes('done') || t.includes('complete')) return '#10b981';
    return '#6366f1';
  }

  escape(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }
}
