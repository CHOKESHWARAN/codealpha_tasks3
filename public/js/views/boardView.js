// ==========================================================================
// TaskFlow Kanban Board View (Trello-Style Drag & Drop)
// ==========================================================================

import { api } from '../api.js';
import { state } from '../state.js';
import { socket } from '../socket.js';

export class BoardView {
  constructor(container, onOpenTask) {
    this.container = container;
    this.onOpenTask = onOpenTask;
    this.draggedTaskId = null;
  }

  render() {
    const project = state.currentProject;
    if (!project) {
      this.container.innerHTML = `<div style="padding: 40px; text-align: center; color: var(--text-muted);">No project selected.</div>`;
      return;
    }

    const filteredTasks = state.getFilteredTasks();
    const columns = project.columns || [];

    // Map tasks by column_id
    const tasksByCol = {};
    columns.forEach(c => { tasksByCol[c.id] = []; });
    filteredTasks.forEach(t => {
      if (tasksByCol[t.column_id]) {
        tasksByCol[t.column_id].push(t);
      }
    });

    let columnsHtml = columns.map(col => {
      const colTasks = tasksByCol[col.id] || [];
      return `
        <div class="kanban-column" data-col-id="${col.id}">
          <!-- Column Header -->
          <div class="column-header">
            <div class="column-header-left">
              <span class="column-pill" style="background-color: ${this.getColumnColor(col.title)};"></span>
              <span class="column-title" data-col-id="${col.id}" title="Click to rename">${this.escape(col.title)}</span>
              <span class="column-count-badge">${colTasks.length}</span>
            </div>
            <div class="column-header-actions">
              <button class="btn-icon btn-sm col-options-btn" data-col-id="${col.id}" title="Column options">
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/></svg>
              </button>
            </div>
          </div>

          <!-- Cards List -->
          <div class="column-cards-list" data-col-id="${col.id}">
            ${colTasks.map(task => this.renderCard(task)).join('')}
          </div>

          <!-- Column Footer -->
          <div class="column-footer" data-col-id="${col.id}">
            <div class="quick-add-form" style="display: none;" id="quick-add-${col.id}">
              <input type="text" class="form-input quick-task-input" placeholder="Task title..." style="margin-bottom: 6px; font-size: 0.8125rem;" />
              <div style="display: flex; gap: 6px;">
                <button class="btn btn-primary btn-sm confirm-add-task-btn" data-col-id="${col.id}">Add Card</button>
                <button class="btn btn-secondary btn-sm cancel-add-task-btn" data-col-id="${col.id}">Cancel</button>
              </div>
            </div>
            <button class="quick-add-btn trigger-quick-add-btn" data-col-id="${col.id}">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Add Card
            </button>
          </div>
        </div>
      `;
    }).join('');

    // Add Column Button
    columnsHtml += `
      <div class="add-column-card">
        <div id="add-col-form" style="display: none; flex-direction: column; gap: 8px;">
          <input type="text" id="new-col-title-input" class="form-input" placeholder="Column name (e.g. QA, Deployed)" />
          <div style="display: flex; gap: 6px;">
            <button class="btn btn-primary btn-sm" id="confirm-add-col-btn">Create Column</button>
            <button class="btn btn-secondary btn-sm" id="cancel-add-col-btn">Cancel</button>
          </div>
        </div>
        <button class="btn btn-secondary" id="trigger-add-col-btn" style="border-style: dashed;">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
          Add New Column
        </button>
      </div>
    `;

    this.container.innerHTML = `<div class="board-container">${columnsHtml}</div>`;
    this.bindEvents();
  }

  renderCard(task) {
    // Priority badge
    const priority = task.priority || 'medium';
    
    // Labels
    const labelsHtml = (task.labels || []).map(lbl => `
      <span class="card-label-tag" style="background-color: ${lbl.color || '#64748b'};">${this.escape(lbl.label)}</span>
    `).join('');

    // Checklist progress
    let checklistHtml = '';
    if (task.checklist && task.checklist.length > 0) {
      const completed = task.checklist.filter(c => c.completed).length;
      checklistHtml = `
        <span class="meta-item checklist" title="Subtasks">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
          ${completed}/${task.checklist.length}
        </span>
      `;
    }

    // Comments count
    let commentsHtml = '';
    if (task.commentsCount && task.commentsCount > 0) {
      commentsHtml = `
        <span class="meta-item comments" title="Comments">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
          ${task.commentsCount}
        </span>
      `;
    }

    // Due date
    let dueDateHtml = '';
    if (task.due_date) {
      const now = new Date();
      now.setHours(0,0,0,0);
      const due = new Date(task.due_date);
      due.setHours(0,0,0,0);
      const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));

      let dueClass = '';
      let dueText = task.due_date;
      if (diffDays < 0) {
        dueClass = 'overdue';
        dueText = `${Math.abs(diffDays)}d overdue`;
      } else if (diffDays === 0) {
        dueClass = 'due-soon';
        dueText = 'Today';
      } else if (diffDays === 1) {
        dueClass = 'due-soon';
        dueText = 'Tomorrow';
      }

      dueDateHtml = `
        <span class="meta-item due-date ${dueClass}" title="Due date: ${task.due_date}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          ${dueText}
        </span>
      `;
    }

    // Assignees stack
    const assigneesHtml = (task.assignees || []).map(a => `
      <span class="avatar avatar-sm" style="background-color: ${a.avatar_color || '#3b82f6'};" title="${this.escape(a.name)}">
        ${a.name.split(' ').map(n=>n[0]).join('')}
      </span>
    `).join('');

    return `
      <div class="task-card" draggable="true" data-task-id="${task.id}" data-col-id="${task.column_id}">
        <div class="card-header-row">
          <div class="card-labels">${labelsHtml}</div>
          <span class="badge badge-${priority}">${priority}</span>
        </div>

        <div class="card-title">${this.escape(task.title)}</div>

        <div class="card-footer-row">
          <div class="card-meta-indicators">
            ${dueDateHtml}
            ${checklistHtml}
            ${commentsHtml}
          </div>
          <div class="card-assignees-stack">
            ${assigneesHtml}
          </div>
        </div>
      </div>
    `;
  }

  bindEvents() {
    // 1. Task Card Click -> Open Inspector Modal
    const cards = this.container.querySelectorAll('.task-card');
    cards.forEach(card => {
      card.addEventListener('click', (e) => {
        // Prevent click if we were dragging
        if (card.classList.contains('is-dragging')) return;
        const taskId = Number(card.dataset.taskId);
        if (this.onOpenTask) this.onOpenTask(taskId);
      });

      // Drag events
      card.addEventListener('dragstart', (e) => {
        this.draggedTaskId = Number(card.dataset.taskId);
        card.classList.add('is-dragging');
        e.dataTransfer.effectAllowed = 'move';
        e.dataTransfer.setData('text/plain', this.draggedTaskId);
      });

      card.addEventListener('dragend', () => {
        card.classList.remove('is-dragging');
        this.draggedTaskId = null;
        this.container.querySelectorAll('.kanban-column').forEach(c => c.classList.remove('drag-over'));
      });
    });

    // 2. Drag & Drop over Columns
    const columns = this.container.querySelectorAll('.kanban-column');
    columns.forEach(col => {
      const colId = Number(col.dataset.colId);
      const cardsList = col.querySelector('.column-cards-list');

      col.addEventListener('dragover', (e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        col.classList.add('drag-over');
      });

      col.addEventListener('dragleave', (e) => {
        if (!col.contains(e.relatedTarget)) {
          col.classList.remove('drag-over');
        }
      });

      col.addEventListener('drop', async (e) => {
        e.preventDefault();
        col.classList.remove('drag-over');
        const taskId = this.draggedTaskId || Number(e.dataTransfer.getData('text/plain'));
        if (!taskId) return;

        const currentProject = state.currentProject;
        if (!currentProject) return;

        const task = (currentProject.tasks || []).find(t => Number(t.id) === Number(taskId));
        if (!task) return;

        if (Number(task.column_id) === Number(colId)) {
          return; // same column, no-op
        }

        // Optimistic update
        const oldColId = task.column_id;
        task.column_id = colId;
        this.render();

        try {
          // Backend API call
          await api.moveTask(taskId, colId, 0);
          
          // Socket.io emit
          socket.emitTaskMove(currentProject.id, taskId, colId, 0);

          state.showToast(`Task moved!`, 'info', 2000);
        } catch (err) {
          // Rollback if failed
          task.column_id = oldColId;
          this.render();
          state.showToast('Failed to move task: ' + err.message, 'danger');
        }
      });
    });

    // 3. Quick Add Task in Column
    const triggerAddBtns = this.container.querySelectorAll('.trigger-quick-add-btn');
    triggerAddBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const colId = btn.dataset.colId;
        const form = this.container.querySelector(`#quick-add-${colId}`);
        if (form) {
          btn.style.display = 'none';
          form.style.display = 'block';
          const input = form.querySelector('.quick-task-input');
          input.focus();
        }
      });
    });

    const cancelAddBtns = this.container.querySelectorAll('.cancel-add-task-btn');
    cancelAddBtns.forEach(btn => {
      btn.addEventListener('click', () => {
        const colId = btn.dataset.colId;
        const form = this.container.querySelector(`#quick-add-${colId}`);
        const trigger = this.container.querySelector(`.trigger-quick-add-btn[data-col-id="${colId}"]`);
        if (form && trigger) {
          form.style.display = 'none';
          trigger.style.display = 'flex';
          form.querySelector('.quick-task-input').value = '';
        }
      });
    });

    const confirmAddBtns = this.container.querySelectorAll('.confirm-add-task-btn');
    confirmAddBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const colId = Number(btn.dataset.colId);
        const form = this.container.querySelector(`#quick-add-${colId}`);
        const input = form.querySelector('.quick-task-input');
        const title = input.value.trim();
        if (!title) return;

        try {
          const res = await api.createTask({
            project_id: state.currentProject.id,
            column_id: colId,
            title,
            priority: 'medium'
          });

          // Add to state
          if (state.currentProject.tasks) {
            state.currentProject.tasks.push(res.task);
          }
          this.render();
          state.showToast(`Task created!`, 'success');
        } catch (err) {
          state.showToast('Failed to create task: ' + err.message, 'danger');
        }
      });
    });

    // Enter key inside quick task input
    const quickInputs = this.container.querySelectorAll('.quick-task-input');
    quickInputs.forEach(input => {
      input.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
          const form = input.closest('.quick-add-form');
          const confirmBtn = form.querySelector('.confirm-add-task-btn');
          if (confirmBtn) confirmBtn.click();
        }
      });
    });

    // 4. Add Column Button
    const triggerAddCol = this.container.querySelector('#trigger-add-col-btn');
    const formAddCol = this.container.querySelector('#add-col-form');
    const inputColTitle = this.container.querySelector('#new-col-title-input');
    const confirmAddCol = this.container.querySelector('#confirm-add-col-btn');
    const cancelAddCol = this.container.querySelector('#cancel-add-col-btn');

    if (triggerAddCol && formAddCol) {
      triggerAddCol.addEventListener('click', () => {
        triggerAddCol.style.display = 'none';
        formAddCol.style.display = 'flex';
        inputColTitle.focus();
      });

      cancelAddCol.addEventListener('click', () => {
        formAddCol.style.display = 'none';
        triggerAddCol.style.display = 'flex';
        inputColTitle.value = '';
      });

      confirmAddCol.addEventListener('click', async () => {
        const title = inputColTitle.value.trim();
        if (!title) return;

        try {
          const res = await api.createColumn(state.currentProject.id, title);
          if (state.currentProject.columns) {
            state.currentProject.columns.push(res.column);
          }
          this.render();
          state.showToast(`Column "${title}" created!`, 'success');
        } catch (err) {
          state.showToast('Failed to add column: ' + err.message, 'danger');
        }
      });
    }

    // 5. Column Options (Rename / Delete)
    const colOptionsBtns = this.container.querySelectorAll('.col-options-btn');
    colOptionsBtns.forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const colId = Number(btn.dataset.colId);
        const col = state.currentProject.columns.find(c => Number(c.id) === colId);
        if (!col) return;

        const action = prompt(`Column: "${col.title}"\nType new name to rename, or type "DELETE" to remove this column:`, col.title);
        if (action === null) return;

        if (action.trim().toUpperCase() === 'DELETE') {
          if (confirm(`Are you sure you want to delete column "${col.title}"? Tasks will be relocated or removed.`)) {
            try {
              await api.deleteColumn(colId);
              state.currentProject.columns = state.currentProject.columns.filter(c => Number(c.id) !== colId);
              this.render();
              state.showToast(`Column removed.`, 'info');
            } catch (err) {
              state.showToast('Failed to delete column: ' + err.message, 'danger');
            }
          }
        } else if (action.trim() && action.trim() !== col.title) {
          try {
            const res = await api.updateColumn(colId, { title: action.trim() });
            col.title = res.column.title;
            this.render();
            state.showToast(`Column renamed.`, 'success');
          } catch (err) {
            state.showToast('Failed to rename column: ' + err.message, 'danger');
          }
        }
      });
    });
  }

  getColumnColor(title) {
    const t = (title || '').toLowerCase();
    if (t.includes('todo') || t.includes('to do')) return '#0ea5e9';
    if (t.includes('progress')) return '#f59e0b';
    if (t.includes('review')) return '#8b5cf6';
    if (t.includes('done') || t.includes('complete')) return '#10b981';
    if (t.includes('backlog')) return '#64748b';
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
