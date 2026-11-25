// ==========================================================================
// TaskFlow Authentication View (Login, Register & Demo Switcher)
// ==========================================================================

import { api } from '../api.js';
import { state } from '../state.js';

export class AuthView {
  constructor(container) {
    this.container = container;
    this.mode = 'login'; // 'login' or 'register'
    this.demoUsers = [];
  }

  async init() {
    await this.fetchDemoUsers();
    this.render();
  }

  async fetchDemoUsers() {
    try {
      const res = await api.getDemoUsers();
      this.demoUsers = res.demoUsers || [];
    } catch (e) {
      console.warn('Could not load demo users:', e);
    }
  }

  render() {
    this.container.innerHTML = `
      <div class="auth-wrapper">
        <div class="auth-card">
          <div class="auth-header">
            <div style="display: flex; align-items: center; gap: 10px; font-size: 1.5rem; font-weight: 700; color: #FFF;">
              <svg width="32" height="32" viewBox="0 0 32 32" fill="none">
                <rect width="32" height="32" rx="8" fill="#4F46E5"/>
                <rect x="6" y="8" width="8" height="16" rx="2" fill="#FFFFFF" fill-opacity="0.9"/>
                <rect x="18" y="8" width="8" height="10" rx="2" fill="#A5B4FC"/>
              </svg>
              TaskFlow
            </div>
            <p style="font-size: 0.875rem; color: var(--text-secondary);">
              Collaborative Project Workspace & Real-Time Boards
            </p>
          </div>

          <!-- Auth Mode Tabs -->
          <div class="auth-tabs">
            <button class="auth-tab ${this.mode === 'login' ? 'active' : ''}" id="tab-login-btn">Log In</button>
            <button class="auth-tab ${this.mode === 'register' ? 'active' : ''}" id="tab-register-btn">Create Account</button>
          </div>

          <!-- Form Area -->
          <form id="auth-form" style="display: flex; flex-direction: column; gap: 14px;">
            ${this.mode === 'register' ? `
              <div class="form-group" style="margin-bottom: 0;">
                <label>Full Name</label>
                <input type="text" id="auth-name" class="form-input" placeholder="e.g. Alex River" required />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label>Professional Role</label>
                <input type="text" id="auth-role" class="form-input" placeholder="e.g. Lead Architect, Designer" value="Developer" />
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label>Avatar Color</label>
                <div style="display: flex; gap: 8px; margin-top: 4px;" id="color-picker-row">
                  ${['#3b82f6', '#10b981', '#8b5cf6', '#f59e0b', '#ec4899', '#0ea5e9'].map((c, i) => `
                    <label style="cursor: pointer;">
                      <input type="radio" name="avatar_color" value="${c}" ${i === 0 ? 'checked' : ''} style="display: none;" />
                      <span class="color-swatch" style="display: inline-block; width: 26px; height: 26px; border-radius: 50%; background: ${c}; border: 2px solid transparent;"></span>
                    </label>
                  `).join('')}
                </div>
              </div>
            ` : ''}

            <div class="form-group" style="margin-bottom: 0;">
              <label>Email Address</label>
              <input type="email" id="auth-email" class="form-input" placeholder="alex@taskflow.dev" required />
            </div>

            <div class="form-group" style="margin-bottom: 0;">
              <label>Password</label>
              <input type="password" id="auth-password" class="form-input" placeholder="••••••••" required />
            </div>

            <button type="submit" class="btn btn-primary" style="margin-top: 6px; width: 100%; padding: 10px;">
              ${this.mode === 'login' ? 'Sign In to Workspace' : 'Create Free Account'}
            </button>
          </form>

          <!-- 1-Click Demo Accounts -->
          <div class="demo-users-box">
            <div style="display: flex; align-items: center; justify-content: space-between;">
              <span style="font-size: 0.75rem; font-weight: 600; text-transform: uppercase; color: var(--text-muted); letter-spacing: 0.05em;">
                ⚡ 1-Click Collaborative Demo Users
              </span>
              <span style="font-size: 0.7rem; color: #10B981; font-weight: 500;">Ready to Test</span>
            </div>
            
            <div style="display: flex; flex-direction: column; gap: 6px;">
              ${this.demoUsers.map(u => `
                <button type="button" class="demo-user-btn" data-token="${u.token}" data-id="${u.id}">
                  <span class="avatar avatar-sm" style="background-color: ${u.avatar_color};">
                    ${u.name.split(' ').map(n=>n[0]).join('')}
                  </span>
                  <div style="flex: 1; min-width: 0;">
                    <div style="font-size: 0.8125rem; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis;">
                      ${u.name}
                    </div>
                    <div style="font-size: 0.7rem; color: var(--text-muted);">
                      ${u.role} (${u.email})
                    </div>
                  </div>
                  <span style="font-size: 0.7rem; color: var(--primary); font-weight: 500;">Switch →</span>
                </button>
              `).join('')}
            </div>
          </div>

        </div>
      </div>
    `;

    this.bindEvents();
  }

  bindEvents() {
    const tabLogin = this.container.querySelector('#tab-login-btn');
    const tabRegister = this.container.querySelector('#tab-register-btn');

    if (tabLogin) {
      tabLogin.addEventListener('click', () => {
        this.mode = 'login';
        this.render();
      });
    }

    if (tabRegister) {
      tabRegister.addEventListener('click', () => {
        this.mode = 'register';
        this.render();
      });
    }

    // Color picker highlight
    const colorSwatches = this.container.querySelectorAll('.color-swatch');
    const colorRadios = this.container.querySelectorAll('input[name="avatar_color"]');
    colorRadios.forEach((radio, idx) => {
      radio.addEventListener('change', () => {
        colorSwatches.forEach(s => s.style.borderColor = 'transparent');
        if (radio.checked) {
          colorSwatches[idx].style.borderColor = '#FFF';
        }
      });
      if (radio.checked && colorSwatches[idx]) {
        colorSwatches[idx].style.borderColor = '#FFF';
      }
    });

    // Form submit
    const form = this.container.querySelector('#auth-form');
    if (form) {
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const email = this.container.querySelector('#auth-email').value;
        const password = this.container.querySelector('#auth-password').value;

        try {
          if (this.mode === 'login') {
            const res = await api.login(email, password);
            state.setUser(res.user);
            state.showToast(`Welcome back, ${res.user.name}!`, 'success');
          } else {
            const name = this.container.querySelector('#auth-name').value;
            const role = this.container.querySelector('#auth-role').value;
            const checkedColor = this.container.querySelector('input[name="avatar_color"]:checked');
            const avatarColor = checkedColor ? checkedColor.value : '#3b82f6';
            
            const res = await api.register(name, email, password, role, avatarColor);
            state.setUser(res.user);
            state.showToast(`Account created! Welcome, ${res.user.name}!`, 'success');
          }
        } catch (err) {
          state.showToast(err.message, 'danger');
        }
      });
    }

    // Demo account click
    const demoBtns = this.container.querySelectorAll('.demo-user-btn');
    demoBtns.forEach(btn => {
      btn.addEventListener('click', async () => {
        const token = btn.dataset.token;
        api.setToken(token);
        try {
          const profile = await api.getMe();
          state.setUser(profile.user);
          state.showToast(`Logged in as demo user ${profile.user.name}!`, 'success');
        } catch (err) {
          state.showToast('Failed to log in as demo user.', 'danger');
        }
      });
    });
  }
}
