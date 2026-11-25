// ==========================================================================
// TaskFlow Team Members View
// ==========================================================================

import { api } from '../api.js';
import { state } from '../state.js';

export class MembersView {
  constructor(container) {
    this.container = container;
  }

  render() {
    const project = state.currentProject;
    if (!project) return;

    const members = project.members || [];
    const isOwnerOrAdmin = project.my_role === 'owner' || project.my_role === 'admin';
    const isOwner = project.my_role === 'owner';
    const onlineIds = new Set((state.onlineMembers || []).map(m => Number(m.id)));

    this.container.innerHTML = `
      <div class="members-view-container">
        <div style="display: flex; align-items: center; justify-content: space-between;">
          <div>
            <h2 style="font-size: 1.25rem;">Project Team & Access</h2>
            <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 4px;">
              Manage team collaboration, permissions, and invite new members to "${this.escape(project.title)}".
            </p>
          </div>
          ${isOwnerOrAdmin ? `
            <button class="btn btn-primary" id="open-invite-modal-btn">
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
              Invite Member
            </button>
          ` : ''}
        </div>

        <div class="members-grid">
          ${members.map(member => {
            const isOnline = onlineIds.has(Number(member.id));
            const isSelf = Number(member.id) === Number(state.currentUser?.id);

            return `
              <div class="member-card">
                <div style="position: relative;">
                  <span class="avatar avatar-lg" style="background-color: ${member.avatar_color || '#3b82f6'};">
                    ${member.name.split(' ').map(n=>n[0]).join('')}
                  </span>
                  ${isOnline ? `
                    <span style="position: absolute; bottom: 0; right: 0; width: 12px; height: 12px; background: #10B981; border-radius: 50%; border: 2px solid var(--bg-surface);" title="Active online now"></span>
                  ` : ''}
                </div>

                <div style="flex: 1; min-width: 0;">
                  <div style="display: flex; align-items: center; gap: 6px;">
                    <span style="font-weight: 600; font-size: 0.9375rem; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${this.escape(member.name)} ${isSelf ? '<span style="font-size: 0.75rem; color: var(--text-muted);">(You)</span>' : ''}
                    </span>
                  </div>
                  <div style="font-size: 0.78125rem; color: var(--text-muted);">${this.escape(member.email)}</div>
                  <div style="font-size: 0.75rem; color: var(--primary); margin-top: 2px;">${this.escape(member.user_role || 'Developer')}</div>
                  
                  <div style="margin-top: 8px; display: flex; align-items: center; justify-content: space-between;">
                    <span class="badge" style="background-color: rgba(99, 102, 241, 0.15); color: #818CF8; border: 1px solid rgba(99, 102, 241, 0.3);">
                      ${member.project_role || 'member'}
                    </span>

                    ${(isOwner && !isSelf && member.project_role !== 'owner') ? `
                      <button class="btn btn-secondary btn-sm remove-member-btn" data-user-id="${member.id}" style="color: var(--danger); padding: 2px 6px; font-size: 0.7rem;">
                        Remove
                      </button>
                    ` : ''}
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>
      </div>

      <!-- Invite Member Modal -->
      <div class="modal-overlay" id="invite-member-modal">
        <div class="modal-card">
          <div class="modal-header">
            <h3>Invite Team Member</h3>
            <button class="modal-close-btn" id="close-invite-modal-btn">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
            </button>
          </div>
          <form id="invite-member-form">
            <div class="modal-body">
              <div class="form-group">
                <label>User Email Address</label>
                <input type="email" id="invite-email-input" class="form-input" placeholder="e.g. sarah@taskflow.dev" required />
                <span style="font-size: 0.75rem; color: var(--text-muted); margin-top: 2px;">
                  Quick tip: You can invite demo users: <code>alex@taskflow.dev</code>, <code>sarah@taskflow.dev</code>, <code>marcus@taskflow.dev</code>, <code>emily@taskflow.dev</code>
                </span>
              </div>
              <div class="form-group">
                <label>Project Role & Permission</label>
                <select id="invite-role-select" class="form-select">
                  <option value="member">Member (Can create, edit & move tasks)</option>
                  <option value="admin">Admin (Can manage columns & members)</option>
                  <option value="viewer">Viewer (Read-only access)</option>
                </select>
              </div>
            </div>
            <div class="modal-footer">
              <button type="button" class="btn btn-secondary" id="cancel-invite-modal-btn">Cancel</button>
              <button type="submit" class="btn btn-primary">Send Invitation</button>
            </div>
          </form>
        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const openBtn = this.container.querySelector('#open-invite-modal-btn');
    const modal = this.container.querySelector('#invite-member-modal');
    const closeBtn = this.container.querySelector('#close-invite-modal-btn');
    const cancelBtn = this.container.querySelector('#cancel-invite-modal-btn');
    const form = this.container.querySelector('#invite-member-form');

    if (openBtn && modal) {
      openBtn.addEventListener('click', () => modal.classList.add('active'));
    }

    const closeModal = () => modal && modal.classList.remove('active');
    if (closeBtn) closeBtn.addEventListener('click', closeModal);
    if (cancelBtn) cancelBtn.addEventListener('click', closeModal);

    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = this.container.querySelector('#invite-email-input').value.trim();
        const role = this.container.querySelector('#invite-role-select').value;
        if (!email) return;

        try {
          const res = await api.addProjectMember(state.currentProject.id, email, role);
          if (state.currentProject.members) {
            state.currentProject.members.push(res.member);
          }
          closeModal();
          this.render();
          state.showToast(res.message, 'success');
        } catch (err) {
          state.showToast(err.message, 'danger');
        }
      });
    }

    // Remove member buttons
    const removeBtns = this.container.querySelectorAll('.remove-member-btn');
    removeBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const userId = Number(btn.dataset.userId);
        if (confirm('Are you sure you want to remove this member from the project?')) {
          try {
            await api.removeProjectMember(state.currentProject.id, userId);
            state.currentProject.members = state.currentProject.members.filter(m => Number(m.id) !== userId);
            this.render();
            state.showToast('Member removed from project.', 'info');
          } catch (err) {
            state.showToast(err.message, 'danger');
          }
        }
      });
    });
  }

  escape(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
