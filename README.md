# 🚀 TaskFlow — Collaborative Real-Time Project Management Tool

A collaborative project management platform built to model the workflows of **Trello** and **Asana**. Features group project workspaces, interactive drag-and-drop Kanban boards, structured table/list views, task card inspection, checklists, real-time comments, activity audit logs, in-app notifications, and live multi-user synchronization powered by **WebSockets (Socket.IO)**.

---

## 🌟 Key Features

### 1. 🔐 Authentication & Multi-User Support
- **JWT-based Authentication**: Secure user registration, login, and profile management with Bcrypt password hashing.
- **⚡ 1-Click Collaborative Demo Switcher**: Instant switching between 4 pre-configured demo users right from the login screen or top navigation bar, making it effortless to test real-time collaboration across multiple browser tabs/windows.

### 2. 📁 Group Projects & Team Access
- **Create & Manage Projects**: Title, description, category tags, and custom color accents.
- **Project Members & Role-Based Access**:
  - Roles: `Owner`, `Admin`, `Member`, `Viewer`.
  - Invite registered teammates by email.
  - Manage and adjust member permissions or remove members.

### 3. 📋 Kanban Board & Asana-Style List Views
- **Trello-style Kanban Board**:
  - Horizontal workflow stages ("To Do", "In Progress", "In Review", "Done", etc.).
  - HTML5 smooth Drag & Drop card movement between columns and stages.
  - Add, rename, or delete columns dynamically.
  - Quick-add cards inline directly from column footers.
- **Asana-style List / Table View**:
  - Structured view with inline stage/status dropdowns and priority pickers.
  - Search by keyword, filter by priority (`Urgent`, `High`, `Medium`, `Low`), and filter by assignee.

### 4. 📝 Task Cards & Subtask Checklists
- **Full Task Inspector Modal**:
  - Dual-column layout with inline title and description editing.
  - **Subtasks & Checklist**: Dynamic progress bar calculating completion percentage in real time.
  - **Multi-Assignee Support**: Assign tasks to multiple team members with visual avatar clusters.
  - **Due Dates**: Color-coded badges for upcoming, due today, or overdue tasks.
  - **Color-Coded Labels & Tags**: Add custom labels (e.g. `Backend`, `Frontend`, `UI/UX`, `Security`).

### 5. 💬 Task Communication & Comments
- **Real-Time Comment Stream**: Communicate directly within task cards.
- **Teammate @Mentions**: Type `@Name` to tag teammates and trigger direct notifications.
- **Live Typing Indicators**: See when a collaborator is typing a comment.

### 6. ⚡ Bonus: WebSockets & Real-Time Notifications
- **Live Board Synchronization**: When User A drags a card or creates a task, User B's board updates instantly without reloading.
- **Active Presence Bar**: View real-time online status of collaborators viewing the project board.
- **In-App Notification Center**:
  - Real-time unread badge counter.
  - Dropdown alerts for task assignments, comment mentions, and status updates.
  - Mark as read, mark all read, or clear notifications.
- **Live Toast Popups**: Real-time notifications on card movements and assignments.

---

## 🛠️ Tech Stack & Architecture

- **Backend**: Node.js, Express 5, Socket.IO 4, JSON Web Tokens (JWT), Bcrypt.js, CORS.
- **Database**: SQLite3 via Node.js Native C-engine (`node:sqlite DatabaseSync`), WAL mode, foreign key cascades, and indexed relations.
- **Frontend**: Modern ES6+ Single Page Application (SPA), CSS Variables, Flexbox/Grid, SVG icon set, HTML5 Drag & Drop API, Socket.IO Client.

---

## 👥 Seeded Demo Accounts

You can test with any of the 4 ready-to-use demo accounts (Password for all: `password123`) or click any user button in the **1-Click Demo Users** box:

| Name | Email | Role | Avatar Color |
|---|---|---|---|
| **Alex River** | `alex@taskflow.dev` | Lead Architect | Blue |
| **Sarah Chen** | `sarah@taskflow.dev` | Frontend Specialist | Green |
| **Marcus Vance** | `marcus@taskflow.dev` | Backend Engineer | Purple |
| **Emily Taylor** | `emily@taskflow.dev` | Senior Product Manager | Amber |

*(You can also register custom accounts at any time.)*

---

## 🚀 Quick Start Guide

### 1. Start the Server
```bash
npm start
```
The server will start at **http://localhost:5000**.

### 2. Run Automated Test Suite
```bash
npm test
```
Runs the 14-step integration test covering auth, project creation, task management, checklists, comments, and notification dispatches.

### 3. Re-seed Database
```bash
npm run seed
```

---

## 📡 REST API Reference

| Endpoint | Method | Description |
|---|---|---|
| `/api/auth/register` | `POST` | Create new user account |
| `/api/auth/login` | `POST` | Authenticate user & get JWT token |
| `/api/auth/me` | `GET` | Get current authenticated user profile & stats |
| `/api/auth/demo-users` | `GET` | Retrieve demo user list with fast tokens |
| `/api/projects` | `GET`, `POST` | List user projects or create new project |
| `/api/projects/:id` | `GET`, `PUT`, `DELETE` | Project details, updates, or deletion |
| `/api/projects/:id/members` | `POST` | Invite team member to project |
| `/api/projects/:id/activity` | `GET` | Retrieve project audit trail & activity logs |
| `/api/columns` | `POST` | Add column to board |
| `/api/columns/:id` | `PUT`, `DELETE` | Update column title or remove column |
| `/api/tasks` | `POST` | Create new task card with assignees & labels |
| `/api/tasks/:id` | `GET`, `PUT`, `DELETE` | Task inspection, updates, or deletion |
| `/api/tasks/:id/move` | `PUT` | Move task to another stage/column |
| `/api/tasks/:id/assignees` | `POST`, `DELETE` | Assign or unassign teammates |
| `/api/tasks/:id/checklist` | `POST` | Add subtask checklist item |
| `/api/tasks/:id/checklist/:itemId` | `PUT`, `DELETE` | Toggle checklist completion or delete item |
| `/api/tasks/:taskId/comments` | `POST` | Post comment with @mentions |
| `/api/comments/:id` | `DELETE` | Delete comment |
| `/api/notifications` | `GET`, `DELETE` | Fetch notifications or clear all |
| `/api/notifications/:id/read` | `PUT` | Mark notification as read |
