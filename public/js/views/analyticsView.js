// ==========================================================================
// TaskFlow Analytics & Activity Feed View
// ==========================================================================

import { api } from '../api.js';
import { state } from '../state.js';

export class AnalyticsView {
  constructor(container) {
    this.container = container;
    this.activities = [];
  }

  async render() {
    const project = state.currentProject;
    if (!project) return;

    // Fetch latest activity logs
    try {
      const res = await api.getProjectActivity(project.id);
      this.activities = res.activity || [];
    } catch (e) {
      console.warn('Could not fetch project activity:', e);
    }

    const tasks = project.tasks || [];
    const totalTasks = tasks.length;
    
    // Check completion
    const completedTasks = tasks.filter(t => {
      const col = (project.columns || []).find(c => Number(c.id) === Number(t.column_id));
      const title = col ? col.title.toLowerCase() : '';
      return title.includes('done') || title.includes('complete');
    }).length;

    const inProgressTasks = tasks.filter(t => {
      const col = (project.columns || []).find(c => Number(c.id) === Number(t.column_id));
      const title = col ? col.title.toLowerCase() : '';
      return title.includes('progress') || title.includes('review');
    }).length;

    // Check overdue
    const now = new Date();
    now.setHours(0,0,0,0);
    const overdueTasks = tasks.filter(t => {
      if (!t.due_date) return false;
      const d = new Date(t.due_date);
      d.setHours(0,0,0,0);
      return d < now;
    }).length;

    const progressPct = totalTasks > 0 ? Math.round((completedTasks / totalTasks) * 100) : 0;

    // Priorities
    const urgentCount = tasks.filter(t => t.priority === 'urgent').length;
    const highCount = tasks.filter(t => t.priority === 'high').length;
    const mediumCount = tasks.filter(t => t.priority === 'medium').length;
    const lowCount = tasks.filter(t => t.priority === 'low').length;

    this.container.innerHTML = `
      <div class="analytics-container">
        <div>
          <h2 style="font-size: 1.25rem;">Project Velocity & Metrics</h2>
          <p style="font-size: 0.8125rem; color: var(--text-secondary); margin-top: 4px;">
            Real-time delivery progress, workload distribution, and audit trail for "${this.escape(project.title)}".
          </p>
        </div>

        <!-- Metric Stat Cards -->
        <div class="stats-cards-row">
          <div class="stat-card">
            <span class="stat-label">Total Sprints Tasks</span>
            <span class="stat-number">${totalTasks}</span>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Across ${project.columns?.length || 0} stages</div>
          </div>

          <div class="stat-card">
            <span class="stat-label">Completion Velocity</span>
            <div style="display: flex; align-items: baseline; gap: 8px;">
              <span class="stat-number" style="color: #10B981;">${progressPct}%</span>
              <span style="font-size: 0.8125rem; color: var(--text-secondary);">${completedTasks}/${totalTasks} done</span>
            </div>
            <div class="checklist-progress-bar-bg" style="margin-top: 6px;">
              <div class="checklist-progress-fill" style="width: ${progressPct}%;"></div>
            </div>
          </div>

          <div class="stat-card">
            <span class="stat-label">In Progress / Active</span>
            <span class="stat-number" style="color: #38BDF8;">${inProgressTasks}</span>
            <div style="font-size: 0.75rem; color: var(--text-muted);">Tasks currently under work</div>
          </div>

          <div class="stat-card">
            <span class="stat-label">Overdue Alerts</span>
            <span class="stat-number" style="color: ${overdueTasks > 0 ? '#EF4444' : '#10B981'};">${overdueTasks}</span>
            <div style="font-size: 0.75rem; color: var(--text-muted);">${overdueTasks > 0 ? 'Requires team attention' : 'All deadlines on track'}</div>
          </div>
        </div>

        <!-- Priority Breakdown & Activity Grid -->
        <div style="display: grid; grid-template-columns: 340px 1fr; gap: 20px;">
          
          <!-- Priorities Breakdown -->
          <div style="background-color: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px; display: flex; flex-direction: column; gap: 14px;">
            <h3 style="font-size: 0.9375rem;">Priority Distribution</h3>
            
            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8125rem; margin-bottom: 4px;">
                <span style="color: #F87171; font-weight: 600;">Urgent</span>
                <span>${urgentCount}</span>
              </div>
              <div class="checklist-progress-bar-bg">
                <div style="height: 100%; background: #EF4444; width: ${totalTasks > 0 ? (urgentCount / totalTasks) * 100 : 0}%;"></div>
              </div>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8125rem; margin-bottom: 4px;">
                <span style="color: #FBBF24; font-weight: 600;">High</span>
                <span>${highCount}</span>
              </div>
              <div class="checklist-progress-bar-bg">
                <div style="height: 100%; background: #F59E0B; width: ${totalTasks > 0 ? (highCount / totalTasks) * 100 : 0}%;"></div>
              </div>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8125rem; margin-bottom: 4px;">
                <span style="color: #38BDF8; font-weight: 600;">Medium</span>
                <span>${mediumCount}</span>
              </div>
              <div class="checklist-progress-bar-bg">
                <div style="height: 100%; background: #0EA5E9; width: ${totalTasks > 0 ? (mediumCount / totalTasks) * 100 : 0}%;"></div>
              </div>
            </div>

            <div>
              <div style="display: flex; justify-content: space-between; font-size: 0.8125rem; margin-bottom: 4px;">
                <span style="color: #94A3B8; font-weight: 600;">Low</span>
                <span>${lowCount}</span>
              </div>
              <div class="checklist-progress-bar-bg">
                <div style="height: 100%; background: #64748B; width: ${totalTasks > 0 ? (lowCount / totalTasks) * 100 : 0}%;"></div>
              </div>
            </div>
          </div>

          <!-- Real-Time Activity Feed -->
          <div style="background-color: var(--bg-surface); border: 1px solid var(--border-subtle); border-radius: var(--radius-md); padding: 20px; display: flex; flex-direction: column;">
            <h3 style="font-size: 0.9375rem; margin-bottom: 14px;">Audit Trail & Live Activity Feed</h3>
            
            <div style="flex: 1; overflow-y: auto; max-height: 420px; display: flex; flex-direction: column; gap: 12px; padding-right: 6px;">
              ${this.activities.length === 0 ? `
                <div style="color: var(--text-muted); font-size: 0.875rem;">No recent activities logged yet.</div>
              ` : this.activities.map(act => `
                <div style="display: flex; gap: 12px; align-items: flex-start; padding-bottom: 10px; border-bottom: 1px solid rgba(255, 255, 255, 0.03);">
                  <span class="avatar avatar-sm" style="background-color: ${act.avatar_color || '#3b82f6'}; margin-top: 2px;">
                    ${act.user_name.split(' ').map(n=>n[0]).join('')}
                  </span>
                  <div style="flex: 1;">
                    <div style="font-size: 0.8125rem;">
                      <strong style="color: var(--text-primary);">${this.escape(act.user_name)}</strong>
                      <span style="color: var(--text-secondary); margin-left: 4px;">${this.escape(act.details)}</span>
                      ${act.task_title ? `<span style="color: var(--primary); font-weight: 500;"> ("${this.escape(act.task_title)}")</span>` : ''}
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-muted); margin-top: 2px;">
                      ${new Date(act.created_at).toLocaleString()}
                    </div>
                  </div>
                </div>
              `).join('')}
            </div>
          </div>

        </div>
      </div>
    `;
  }

  escape(str) {
    if (!str) return '';
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
}
