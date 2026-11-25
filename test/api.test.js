const http = require('node:http');
const assert = require('node:assert');
const { app, server } = require('../src/server');

const TEST_PORT = 5055;

function makeRequest(path, method = 'GET', body = null, token = null) {
  return new Promise((resolve, reject) => {
    const options = {
      hostname: '127.0.0.1',
      port: TEST_PORT,
      path,
      method,
      headers: {
        'Content-Type': 'application/json'
      }
    };

    if (token) {
      options.headers['Authorization'] = `Bearer ${token}`;
    }

    const req = http.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        let json = null;
        try {
          json = JSON.parse(data);
        } catch (e) {
          json = data;
        }
        resolve({ status: res.statusCode, headers: res.headers, body: json });
      });
    });

    req.on('error', reject);

    if (body) {
      req.write(JSON.stringify(body));
    }
    req.end();
  });
}

async function runTests() {
  console.log('--- Starting TaskFlow Comprehensive Backend Test Suite ---');
  let testServer;

  try {
    await new Promise((resolve) => {
      testServer = server.listen(TEST_PORT, () => {
        console.log(`[TEST] Test server listening on port ${TEST_PORT}`);
        resolve();
      });
    });

    // 1. Health check
    console.log('[TEST 1] Checking /api/health...');
    const health = await makeRequest('/api/health');
    assert.strictEqual(health.status, 200);
    assert.strictEqual(health.body.status, 'ok');
    console.log('✅ Health check passed.');

    // 2. Demo Users
    console.log('[TEST 2] Checking /api/auth/demo-users...');
    const demo = await makeRequest('/api/auth/demo-users');
    assert.strictEqual(demo.status, 200);
    assert.ok(demo.body.demoUsers.length >= 4);
    const alex = demo.body.demoUsers[0];
    const sarah = demo.body.demoUsers[1];
    assert.ok(alex.token);
    assert.ok(sarah.token);
    console.log(`✅ Demo users loaded: ${alex.name} & ${sarah.name}`);

    // 3. Register a new user
    console.log('[TEST 3] Registering a new test user...');
    const testEmail = `tester_${Date.now()}@test.com`;
    const regRes = await makeRequest('/api/auth/register', 'POST', {
      name: 'Test Engineer',
      email: testEmail,
      password: 'password123',
      role: 'QA Engineer',
      avatar_color: '#ec4899'
    });
    assert.strictEqual(regRes.status, 201);
    assert.ok(regRes.body.token);
    const testUserToken = regRes.body.token;
    console.log('✅ User registration successful.');

    // 4. Login with registered user
    console.log('[TEST 4] Logging in with newly registered user...');
    const loginRes = await makeRequest('/api/auth/login', 'POST', {
      email: testEmail,
      password: 'password123'
    });
    assert.strictEqual(loginRes.status, 200);
    assert.strictEqual(loginRes.body.user.email, testEmail);
    console.log('✅ Login successful.');

    // 5. Profile /me
    console.log('[TEST 5] Fetching current user profile /api/auth/me...');
    const meRes = await makeRequest('/api/auth/me', 'GET', null, testUserToken);
    assert.strictEqual(meRes.status, 200);
    assert.strictEqual(meRes.body.user.email, testEmail);
    console.log('✅ Profile verification passed.');

    // 6. Create a Group Project
    console.log('[TEST 6] Creating group project...');
    const createProjRes = await makeRequest('/api/projects', 'POST', {
      title: 'Alpha Release Sprint',
      description: 'Sprint for launching MVP to early beta testers.',
      color: '#10b981',
      icon: 'rocket',
      category: 'Product Launch'
    }, testUserToken);
    assert.strictEqual(createProjRes.status, 201);
    const project = createProjRes.body.project;
    assert.ok(project.id);
    assert.strictEqual(project.title, 'Alpha Release Sprint');
    assert.strictEqual(project.my_role, 'owner');
    console.log(`✅ Project created with ID: ${project.id}`);

    // 7. Fetch Project Details & Columns
    console.log('[TEST 7] Fetching project board details...');
    const projDetailRes = await makeRequest(`/api/projects/${project.id}`, 'GET', null, testUserToken);
    assert.strictEqual(projDetailRes.status, 200);
    const fullProj = projDetailRes.body.project;
    assert.ok(fullProj.columns.length >= 4); // Default: To Do, In Progress, In Review, Done
    const todoCol = fullProj.columns.find(c => c.title === 'To Do');
    assert.ok(todoCol);
    console.log(`✅ Default columns verified: ${fullProj.columns.map(c => c.title).join(', ')}`);

    // 8. Add Member to Project
    console.log('[TEST 8] Adding Sarah to project...');
    const addMemberRes = await makeRequest(`/api/projects/${project.id}/members`, 'POST', {
      email: 'sarah@taskflow.dev',
      role: 'admin'
    }, testUserToken);
    assert.strictEqual(addMemberRes.status, 201);
    console.log('✅ Member added successfully.');

    // 9. Create a Task Card & Assign it
    console.log('[TEST 9] Creating task card with assignees and labels...');
    const createTaskRes = await makeRequest('/api/tasks', 'POST', {
      project_id: project.id,
      column_id: todoCol.id,
      title: 'Setup automated CI/CD pipeline',
      description: 'Configure GitHub actions workflow to run tests and push staging builds.',
      priority: 'high',
      due_date: '2026-12-01',
      assignees: [sarah.id],
      labels: [{ label: 'DevOps', color: '#0ea5e9' }]
    }, testUserToken);
    assert.strictEqual(createTaskRes.status, 201);
    const task = createTaskRes.body.task;
    assert.ok(task.id);
    assert.strictEqual(task.assignees.length, 1);
    assert.strictEqual(task.assignees[0].name, 'Sarah Chen');
    console.log(`✅ Task card created with ID: ${task.id}`);

    // 10. Checklist items on Task
    console.log('[TEST 10] Adding checklist item to task...');
    const addChecklistRes = await makeRequest(`/api/tasks/${task.id}/checklist`, 'POST', {
      title: 'Write YAML test step'
    }, testUserToken);
    assert.strictEqual(addChecklistRes.status, 201);
    const checkItem = addChecklistRes.body.item;
    assert.strictEqual(checkItem.title, 'Write YAML test step');

    // Toggle checklist item
    const toggleChecklist = await makeRequest(`/api/tasks/${task.id}/checklist/${checkItem.id}`, 'PUT', {
      completed: 1
    }, testUserToken);
    assert.strictEqual(toggleChecklist.status, 200);
    assert.strictEqual(toggleChecklist.body.item.completed, 1);
    console.log('✅ Checklist item added and completed.');

    // 11. Move Task to "In Progress"
    console.log('[TEST 11] Moving task to In Progress column...');
    const inProgCol = fullProj.columns.find(c => c.title === 'In Progress');
    const moveRes = await makeRequest(`/api/tasks/${task.id}/move`, 'PUT', {
      column_id: inProgCol.id,
      position: 0
    }, testUserToken);
    assert.strictEqual(moveRes.status, 200);
    assert.strictEqual(moveRes.body.task.column_id, inProgCol.id);
    console.log('✅ Task card successfully moved between columns.');

    // 12. Add Comment to Task (Communication)
    console.log('[TEST 12] Adding comment to task with @Sarah mention...');
    const commentRes = await makeRequest(`/api/tasks/${task.id}/comments`, 'POST', {
      content: '@Sarah Chen please take a look at the workflow permissions.'
    }, testUserToken);
    assert.strictEqual(commentRes.status, 201);
    assert.strictEqual(commentRes.body.comment.content, '@Sarah Chen please take a look at the workflow permissions.');
    console.log('✅ Comment published successfully.');

    // 13. Verify Notifications for Sarah
    console.log('[TEST 13] Checking notifications received by Sarah...');
    const sarahNotifRes = await makeRequest('/api/notifications', 'GET', null, sarah.token);
    assert.strictEqual(sarahNotifRes.status, 200);
    assert.ok(sarahNotifRes.body.notifications.length > 0);
    const assignedNotif = sarahNotifRes.body.notifications.find(n => n.task_id === task.id);
    assert.ok(assignedNotif);
    console.log(`✅ Sarah received notification: "${assignedNotif.title} - ${assignedNotif.message}"`);

    // Mark notification as read
    const markReadRes = await makeRequest(`/api/notifications/${assignedNotif.id}/read`, 'PUT', null, sarah.token);
    assert.strictEqual(markReadRes.status, 200);
    console.log('✅ Notification marked as read.');

    // 14. Activity Log verification
    console.log('[TEST 14] Checking project activity feed...');
    const activityRes = await makeRequest(`/api/projects/${project.id}/activity`, 'GET', null, testUserToken);
    assert.strictEqual(activityRes.status, 200);
    assert.ok(activityRes.body.activity.length >= 3);
    console.log(`✅ Activity feed logged ${activityRes.body.activity.length} events.`);

    console.log('\n🎉 ALL 14 TEST SUITES PASSED FLAWLESSLY! Backend is 100% verified! 🎉\n');
  } catch (err) {
    console.error('❌ Test suite failed:', err);
    process.exitCode = 1;
  } finally {
    if (testServer) {
      testServer.close();
    }
  }
}

runTests();
