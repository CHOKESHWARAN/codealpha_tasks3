// ==========================================================================
// TaskFlow Task Inspector Modal (Checklist, Assignees, Real-Time Comments)
// ==========================================================================

import { api } from '../api.js';
import { state } from '../state.js';
import { socket } from '../socket.js';

export class TaskModal {
  constructor(overlayElement, onTaskUpdated) {
    this.overlay = overlayElement;
    this.onTaskUpdated = onTaskUpdated;
    this.currentTask = null;
    this.typingTimeout = null;
    this.bindGlobalKeys();
  }

  async open(taskId) {
    try {
      const res = await api.getTask(taskId);
      this.currentTask = res.task;
      state.activeTaskModal = this.currentTask;
      this.render();
      this.overlay.classList.add('active');
    } catch (err) {
      state.showToast('Failed to open task: ' + err.message, 'danger');
    }
  }

  close() {
    this.overlay.classList.remove('active');
    this.currentTask = null;
    state.activeTaskModal = null;
  }

  bindGlobalKeys() {
    window.addEventListener('keydown', (e) => {
      if (e.key === 'Escape' && this.overlay.classList.contains('active')) {
        this.close();
      }
    });

    // Listen to real-time comment additions if modal is currently open
    socket.on('comment:added', (data) => {
      if (this.currentTask && Number(this.currentTask.id) === Number(data.taskId)) {
        if (!this.currentTask.comments) this.currentTask.comments = [];
        // Avoid duplicate if we just created it
        if (!this.currentTask.comments.some(c => Number(c.id) === Number(data.comment.id))) {
          this.currentTask.comments.push(data.comment);
          this.renderCommentsList();
        }
      }
    });

    socket.on('comment:deleted', (data) => {
      if (this.currentTask && Number(this.currentTask.id) === Number(data.taskId)) {
        this.currentTask.comments = (this.currentTask.comments || []).filter(c => Number(c.id) !== Number(data.commentId));
        this.renderCommentsList();
      }
    });

    socket.on('task:typing_status', (data) => {
      if (this.currentTask && Number(this.currentTask.id) === Number(data.taskId)) {
        const indicator = this.overlay.querySelector('#comment-typing-indicator');
        if (indicator) {
          if (data.isTyping) {
            indicator.textContent = `✍️ ${data.user.name} is typing a comment...`;
            indicator.style.display = 'block';
          } else {
            indicator.style.display = 'none';
          }
        }
      }
    });
  }

  render() {
    if (!this.currentTask) return;
    const task = this.currentTask;
    const project = state.currentProject;
    const columns = project ? project.columns || [] : [];
    const members = project ? project.members || [] : [];

    // Checklist stats
    const checklist = task.checklist || [];
    const completedCount = checklist.filter(c => c.completed).length;
    const checklistPct = checklist.length > 0 ? Math.round((completedCount / checklist.length) * 100) : 0;

    this.overlay.innerHTML = `
      <div class="modal-card modal-task-lg">
        
        <!-- Modal Top Bar -->
        <div class="modal-header">
          <div style="display: flex; align-items: center; gap: 12px; flex: 1;">
            <span class="badge badge-${task.priority || 'medium'}" id="modal-priority-badge">${task.priority || 'medium'}</span>
            <span style="font-size: 0.8125rem; color: var(--text-muted);">in stage</span>
            <select id="modal-task-col-select" class="form-select" style="width: auto; padding: 4px 8px; height: 28px; font-size: 0.8125rem;">
              ${columns.map(c => `
                <option value="${c.id}" ${Number(c.id) === Number(task.column_id) ? 'selected' : ''}>${this.escape(c.title)}</option>
              `).join('')}
            </select>
          </div>

          <div style="display: flex; align-items: center; gap: 8px;">
            <button class="btn-icon btn-sm" id="modal-delete-task-btn" title="Delete Task" style="color: var(--danger);">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
            </button>
            <button class="modal-close-btn" id="modal-close-x-btn">
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
        </div>

        <!-- Modal Content Grid -->
        <div class="modal-body" style="padding: 24px;">
          <div class="task-modal-grid">
            
            <!-- Left Main Column -->
            <div class="task-modal-main">
              
              <!-- Editable Title -->
              <div>
                <input type="text" id="modal-task-title-input" class="form-input" value="${this.escape(task.title)}" style="font-size: 1.25rem; font-weight: 700; padding: 6px 10px; background: transparent; border-color: transparent;" title="Click to edit title" />
              </div>

              <!-- Description -->
              <div class="form-group">
                <label style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Description</label>
                <textarea id="modal-task-desc-input" class="form-textarea" rows="3" placeholder="Add detailed requirements, links, or notes for this task...">${this.escape(task.description || '')}</textarea>
                <button class="btn btn-secondary btn-sm" id="save-task-desc-btn" style="align-self: flex-start; margin-top: 6px;">Save Description</button>
              </div>

              <!-- Subtasks Checklist -->
              <div class="checklist-container">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 11 12 14 22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
                    <span style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Subtasks & Checklist</span>
                  </div>
                  <span id="checklist-progress-text" style="font-size: 0.75rem; color: var(--text-muted); font-weight: 500;">
                    ${completedCount}/${checklist.length} (${checklistPct}%)
                  </span>
                </div>

                <div class="checklist-progress-bar-bg">
                  <div class="checklist-progress-fill" id="checklist-progress-fill" style="width: ${checklistPct}%;"></div>
                </div>

                <div class="checklist-items-list" id="checklist-items-list">
                  ${checklist.map(item => `
                    <div class="checklist-item-row ${item.completed ? 'completed' : ''}" data-item-id="${item.id}">
                      <input type="checkbox" class="checklist-item-cb" ${item.completed ? 'checked' : ''} data-item-id="${item.id}" />
                      <span style="flex: 1; font-size: 0.875rem;">${this.escape(item.title)}</span>
                      <button class="btn-icon btn-sm delete-checklist-item-btn" data-item-id="${item.id}" style="width: 24px; height: 24px; border: none; background: transparent; color: var(--text-muted);">
                        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                      </button>
                    </div>
                  `).join('')}
                </div>

                <div style="display: flex; gap: 8px; margin-top: 4px;">
                  <input type="text" id="new-checklist-input" class="form-input" placeholder="Add an item to check off..." style="font-size: 0.8125rem; height: 32px;" />
                  <button class="btn btn-secondary btn-sm" id="add-checklist-item-btn">Add</button>
                </div>
              </div>

              <!-- Activity & Comments Feed (Communication) -->
              <div style="border-top: 1px solid var(--border-subtle); padding-top: 16px; display: flex; flex-direction: column; gap: 12px;">
                <div style="display: flex; align-items: center; justify-content: space-between;">
                  <div style="display: flex; align-items: center; gap: 8px;">
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                    <span style="font-size: 0.875rem; font-weight: 600; color: var(--text-primary);">Comments & Communication</span>
                  </div>
                  <span style="font-size: 0.75rem; color: var(--text-muted);">Real-time stream</span>
                </div>

                <div id="comment-typing-indicator" style="font-size: 0.75rem; color: #10B981; font-style: italic; display: none;"></div>

                <div class="comments-feed" id="comments-feed-container">
                  <!-- Rendered via renderCommentsList() -->
                </div>

                <!-- Add Comment Input -->
                <div style="display: flex; flex-direction: column; gap: 6px; margin-top: 4px;">
                  <textarea id="task-comment-input" class="form-textarea" rows="2" placeholder="Write a comment or update... (use @name to mention a teammate)"></textarea>
                  <div style="display: flex; justify-content: space-between; align-items: center;">
                    <span style="font-size: 0.7rem; color: var(--text-muted);">Supports @mentions for team alerts</span>
                    <button class="btn btn-primary btn-sm" id="post-comment-btn">Post Comment</button>
                  </div>
                </div>

              </div>

            </div>

            <!-- Right Sidebar -->
            <div class="task-modal-sidebar">
              
              <!-- Priority -->
              <div class="form-group" style="margin-bottom: 0;">
                <label>Priority</label>
                <select id="sidebar-priority-select" class="form-select">
                  <option value="low" ${task.priority === 'low' ? 'selected' : ''}>Low</option>
                  <option value="medium" ${task.priority === 'medium' ? 'selected' : ''}>Medium</option>
                  <option value="high" ${task.priority === 'high' ? 'selected' : ''}>High</option>
                  <option value="urgent" ${task.priority === 'urgent' ? 'selected' : ''}>Urgent</option>
                </select>
              </div>

              <!-- Due Date -->
              <div class="form-group" style="margin-bottom: 0;">
                <label>Due Date</label>
                <input type="date" id="sidebar-due-date-input" class="form-input" value="${task.due_date || ''}" />
              </div>

              <!-- Assignees -->
              <div class="form-group" style="margin-bottom: 0;">
                <label>Assigned Members</label>
                <div style="display: flex; flex-direction: column; gap: 6px; max-height: 140px; overflow-y: auto;">
                  ${members.map(m => {
                    const isAssigned = (task.assignees || []).some(a => Number(a.id) === Number(m.id));
                    return `
                      <label style="display: flex; align-items: center; gap: 8px; font-size: 0.8125rem; cursor: pointer; padding: 4px; border-radius: var(--radius-sm); background: rgba(255,255,255,0.02);">
                        <input type="checkbox" class="sidebar-assignee-cb" data-user-id="${m.id}" ${isAssigned ? 'checked' : ''} style="accent-color: var(--primary);" />
                        <span class="avatar avatar-sm" style="background-color: ${m.avatar_color || '#3b82f6'};">
                          ${m.name.split(' ').map(n=>n[0]).join('')}
                        </span>
                        <span style="flex: 1; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">${this.escape(m.name)}</span>
                      </label>
                    `;
                  }).join('')}
                </div>
              </div>

              <!-- Labels / Tags -->
              <div class="form-group" style="margin-bottom: 0;">
                <label>Labels & Tags</label>
                <div style="display: flex; flex-wrap: wrap; gap: 4px; margin-bottom: 6px;" id="sidebar-labels-container">
                  ${(task.labels || []).map(lbl => `
                    <span class="card-label-tag" style="background-color: ${lbl.color || '#64748b'}; display: inline-flex; align-items: center; gap: 4px;">
                      ${this.escape(lbl.label)}
                      <span class="delete-label-tag" data-label-id="${lbl.id}" style="cursor: pointer; opacity: 0.8;">&times;</span>
                    </span>
                  `).join('')}
                </div>
                <div style="display: flex; gap: 4px;">
                  <input type="text" id="new-label-input" class="form-input" placeholder="Add tag (e.g. Bug)" style="font-size: 0.75rem; height: 28px;" />
                  <button class="btn btn-secondary btn-sm" id="add-label-btn" style="padding: 2px 8px; font-size: 0.75rem;">+</button>
                </div>
              </div>

              <!-- Metadata -->
              <div style="font-size: 0.7rem; color: var(--text-muted); border-top: 1px solid var(--border-subtle); padding-top: 12px; display: flex; flex-direction: column; gap: 4px;">
                <div>Created: ${new Date(task.created_at).toLocaleDateString()}</div>
                <div>ID: #${task.id}</div>
              </div>

            </div>

          </div>
        </div>

      </div>
    `;

    this.renderCommentsList();
    this.bindEvents();
  }

  renderCommentsList() {
    const container = this.overlay.querySelector('#comments-feed-container');
    if (!container) return;

    const comments = this.currentTask.comments || [];
    if (comments.length === 0) {
      container.innerHTML = `<div style="color: var(--text-muted); font-size: 0.8125rem; font-style: italic; padding: 10px 0;">No comments yet. Start the conversation!</div>`;
      return;
    }

    const currentUserId = state.currentUser ? Number(state.currentUser.id) : null;

    container.innerHTML = comments.map(c => {
      const isAuthor = Number(c.user_id) === currentUserId;
      // Highlight @mentions in text
      const formattedContent = this.escape(c.content).replace(/(@[a-zA-Z0-9_\s]+)/g, '<span style="color: #818CF8; font-weight: 600;">$1</span>');

      return `
        <div class="comment-card" data-comment-id="${c.id}">
          <span class="avatar avatar-sm" style="background-color: ${c.avatar_color || '#3b82f6'}; margin-top: 2px;">
            ${c.user_name.split(' ').map(n=>n[0]).join('')}
          </span>
          <div class="comment-content-area">
            <div class="comment-header">
              <div style="display: flex; align-items: center; gap: 6px;">
                <span class="comment-author">${this.escape(c.user_name)}</span>
                <span class="comment-time">${new Date(c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              ${isAuthor ? `
                <button class="btn-icon btn-sm delete-comment-btn" data-comment-id="${c.id}" style="width: 20px; height: 20px; border: none; background: transparent; color: var(--text-muted);" title="Delete comment">
                  <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
                </button>
              ` : ''}
            </div>
            <div class="comment-text">${formattedContent}</div>
          </div>
        </div>
      `;
    }).join('');

    // Scroll to bottom of comments
    container.scrollTop = container.scrollHeight;

    // Bind delete comment buttons
    const deleteBtns = container.querySelectorAll('.delete-comment-btn');
    deleteBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const commentId = Number(btn.dataset.commentId);
        try {
          await api.deleteComment(commentId);
          this.currentTask.comments = this.currentTask.comments.filter(c => Number(c.id) !== commentId);
          this.renderCommentsList();
          state.showToast('Comment deleted', 'info', 1500);
        } catch (err) {
          state.showToast('Failed to delete comment: ' + err.message, 'danger');
        }
      });
    });
  }

  bindEvents() {
    // Close button
    const closeBtn = this.overlay.querySelector('#modal-close-x-btn');
    if (closeBtn) closeBtn.addEventListener('click', () => this.close());

    // Title edit
    const titleInput = this.overlay.querySelector('#modal-task-title-input');
    if (titleInput) {
      titleInput.addEventListener('blur', async () => {
        const newTitle = titleInput.value.trim();
        if (newTitle && newTitle !== this.currentTask.title) {
          try {
            await api.updateTask(this.currentTask.id, { title: newTitle });
            this.currentTask.title = newTitle;
            this.notifyUpdated();
          } catch (err) {
            state.showToast('Failed to update title', 'danger');
          }
        }
      });
    }

    // Stage Column select
    const colSelect = this.overlay.querySelector('#modal-task-col-select');
    if (colSelect) {
      colSelect.addEventListener('change', async () => {
        const colId = Number(colSelect.value);
        try {
          await api.moveTask(this.currentTask.id, colId, 0);
          socket.emitTaskMove(state.currentProject.id, this.currentTask.id, colId, 0);
          this.currentTask.column_id = colId;
          this.notifyUpdated();
          state.showToast('Stage updated', 'info', 1500);
        } catch (err) {
          state.showToast('Failed to change stage: ' + err.message, 'danger');
        }
      });
    }

    // Priority select
    const prioritySelect = this.overlay.querySelector('#sidebar-priority-select');
    if (prioritySelect) {
      prioritySelect.addEventListener('change', async () => {
        const priority = prioritySelect.value;
        try {
          await api.updateTask(this.currentTask.id, { priority });
          this.currentTask.priority = priority;
          const badge = this.overlay.querySelector('#modal-priority-badge');
          if (badge) {
            badge.className = `badge badge-${priority}`;
            badge.textContent = priority;
          }
          this.notifyUpdated();
          state.showToast('Priority updated', 'info', 1500);
        } catch (err) {
          state.showToast('Failed to update priority', 'danger');
        }
      });
    }

    // Due Date input
    const dueDateInput = this.overlay.querySelector('#sidebar-due-date-input');
    if (dueDateInput) {
      dueDateInput.addEventListener('change', async () => {
        const dueDate = dueDateInput.value || null;
        try {
          await api.updateTask(this.currentTask.id, { due_date: dueDate });
          this.currentTask.due_date = dueDate;
          this.notifyUpdated();
          state.showToast('Due date updated', 'info', 1500);
        } catch (err) {
          state.showToast('Failed to update due date', 'danger');
        }
      });
    }

    // Description save
    const descInput = this.overlay.querySelector('#modal-task-desc-input');
    const saveDescBtn = this.overlay.querySelector('#save-task-desc-btn');
    if (saveDescBtn && descInput) {
      saveDescBtn.addEventListener('click', async () => {
        const desc = descInput.value;
        try {
          await api.updateTask(this.currentTask.id, { description: desc });
          this.currentTask.description = desc;
          this.notifyUpdated();
          state.showToast('Description saved!', 'success', 1500);
        } catch (err) {
          state.showToast('Failed to save description', 'danger');
        }
      });
    }

    // Checklist checkboxes
    const checkCbs = this.overlay.querySelectorAll('.checklist-item-cb');
    checkCbs.forEach(cb => {
      cb.addEventListener('change', async () => {
        const itemId = Number(cb.dataset.itemId);
        const completed = cb.checked ? 1 : 0;
        try {
          await api.updateChecklistItem(this.currentTask.id, itemId, { completed });
          const item = (this.currentTask.checklist || []).find(c => Number(c.id) === itemId);
          if (item) item.completed = completed;
          
          const row = cb.closest('.checklist-item-row');
          if (row) {
            if (completed) row.classList.add('completed');
            else row.classList.remove('completed');
          }

          // Recalculate progress
          const cl = this.currentTask.checklist || [];
          const done = cl.filter(c => c.completed).length;
          const pct = cl.length > 0 ? Math.round((done / cl.length) * 100) : 0;
          const fill = this.overlay.querySelector('#checklist-progress-fill');
          const txt = this.overlay.querySelector('#checklist-progress-text');
          if (fill) fill.style.width = `${pct}%`;
          if (txt) txt.textContent = `${done}/${cl.length} (${pct}%)`;

          this.notifyUpdated();
        } catch (err) {
          state.showToast('Failed to update item: ' + err.message, 'danger');
        }
      });
    });

    // Delete checklist item
    const deleteCheckBtns = this.overlay.querySelectorAll('.delete-checklist-item-btn');
    deleteCheckBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const itemId = Number(btn.dataset.itemId);
        try {
          await api.deleteChecklistItem(this.currentTask.id, itemId);
          this.currentTask.checklist = (this.currentTask.checklist || []).filter(c => Number(c.id) !== itemId);
          this.render();
          this.notifyUpdated();
        } catch (err) {
          state.showToast('Failed to delete item', 'danger');
        }
      });
    });

    // Add checklist item
    const addCheckBtn = this.overlay.querySelector('#add-checklist-item-btn');
    const newCheckInput = this.overlay.querySelector('#new-checklist-input');
    if (addCheckBtn && newCheckInput) {
      const handleAdd = async () => {
        const title = newCheckInput.value.trim();
        if (!title) return;
        try {
          const res = await api.addChecklistItem(this.currentTask.id, title);
          if (!this.currentTask.checklist) this.currentTask.checklist = [];
          this.currentTask.checklist.push(res.item);
          this.render();
          this.notifyUpdated();
        } catch (err) {
          state.showToast('Failed to add item', 'danger');
        }
      };
      addCheckBtn.addEventListener('click', handleAdd);
      newCheckInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAdd();
      });
    }

    // Assignees checkboxes
    const assigneeCbs = this.overlay.querySelectorAll('.sidebar-assignee-cb');
    assigneeCbs.forEach(cb => {
      cb.addEventListener('change', async () => {
        const userId = Number(cb.dataset.userId);
        try {
          if (cb.checked) {
            await api.assignTaskUser(this.currentTask.id, userId);
            const user = (state.currentProject.members || []).find(m => Number(m.id) === userId);
            if (user) {
              if (!this.currentTask.assignees) this.currentTask.assignees = [];
              this.currentTask.assignees.push(user);
            }
            state.showToast('Assignee added', 'info', 1500);
          } else {
            await api.unassignTaskUser(this.currentTask.id, userId);
            this.currentTask.assignees = (this.currentTask.assignees || []).filter(a => Number(a.id) !== userId);
            state.showToast('Assignee removed', 'info', 1500);
          }
          this.notifyUpdated();
        } catch (err) {
          cb.checked = !cb.checked;
          state.showToast('Failed to update assignee: ' + err.message, 'danger');
        }
      });
    });

    // Add label
    const addLabelBtn = this.overlay.querySelector('#add-label-btn');
    const newLabelInput = this.overlay.querySelector('#new-label-input');
    if (addLabelBtn && newLabelInput) {
      const handleAddLabel = async () => {
        const labelText = newLabelInput.value.trim();
        if (!labelText) return;
        const colors = ['#6366f1', '#10b981', '#f59e0b', '#ec4899', '#0ea5e9', '#8b5cf6'];
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        try {
          const res = await api.addTaskLabel(this.currentTask.id, labelText, randomColor);
          if (!this.currentTask.labels) this.currentTask.labels = [];
          this.currentTask.labels.push(res.label);
          this.render();
          this.notifyUpdated();
        } catch (err) {
          state.showToast('Failed to add tag', 'danger');
        }
      };
      addLabelBtn.addEventListener('click', handleAddLabel);
      newLabelInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') handleAddLabel();
      });
    }

    // Delete label tag
    const delLabelTags = this.overlay.querySelectorAll('.delete-label-tag');
    delLabelTags.forEach(tag => {
      tag.addEventListener('click', async (e) => {
        e.stopPropagation();
        const labelId = Number(tag.dataset.labelId);
        try {
          await api.deleteTaskLabel(this.currentTask.id, labelId);
          this.currentTask.labels = (this.currentTask.labels || []).filter(l => Number(l.id) !== labelId);
          this.render();
          this.notifyUpdated();
        } catch (err) {
          state.showToast('Failed to remove tag', 'danger');
        }
      });
    });

    // Comment submission & typing indicator
    const commentInput = this.overlay.querySelector('#task-comment-input');
    const postCommentBtn = this.overlay.querySelector('#post-comment-btn');

    if (commentInput) {
      commentInput.addEventListener('input', () => {
        socket.emitTyping(state.currentProject.id, this.currentTask.id, true);
        clearTimeout(this.typingTimeout);
        this.typingTimeout = setTimeout(() => {
          socket.emitTyping(state.currentProject.id, this.currentTask.id, false);
        }, 1200);
      });

      commentInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          if (postCommentBtn) postCommentBtn.click();
        }
      });
    }

    if (postCommentBtn && commentInput) {
      postCommentBtn.addEventListener('click', async () => {
        const text = commentInput.value.trim();
        if (!text) return;

        socket.emitTyping(state.currentProject.id, this.currentTask.id, false);

        try {
          const res = await api.addComment(this.currentTask.id, text);
          commentInput.value = '';

          if (!this.currentTask.comments) this.currentTask.comments = [];
          this.currentTask.comments.push(res.comment);
          this.currentTask.commentsCount = (this.currentTask.commentsCount || 0) + 1;
          this.renderCommentsList();
          this.notifyUpdated();
          state.showToast('Comment posted!', 'success', 1500);
        } catch (err) {
          state.showToast('Failed to post comment: ' + err.message, 'danger');
        }
      });
    }

    // Delete Task
    const deleteBtn = this.overlay.querySelector('#modal-delete-task-btn');
    if (deleteBtn) {
      deleteBtn.addEventListener('click', async () => {
        if (confirm(`Are you sure you want to delete task "${this.currentTask.title}"?`)) {
          try {
            await api.deleteTask(this.currentTask.id);
            if (state.currentProject && state.currentProject.tasks) {
              state.currentProject.tasks = state.currentProject.tasks.filter(t => Number(t.id) !== Number(this.currentTask.id));
            }
            this.close();
            if (this.onTaskUpdated) this.onTaskUpdated();
            state.showToast('Task deleted.', 'info');
          } catch (err) {
            state.showToast('Failed to delete task: ' + err.message, 'danger');
          }
        }
      });
    }
  }

  notifyUpdated() {
    if (state.currentProject && state.currentProject.tasks && this.currentTask) {
      const idx = state.currentProject.tasks.findIndex(t => Number(t.id) === Number(this.currentTask.id));
      if (idx !== -1) {
        state.currentProject.tasks[idx] = { ...this.currentTask };
      }
    }
    if (this.onTaskUpdated) {
      this.onTaskUpdated();
    }
  }

  escape(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
