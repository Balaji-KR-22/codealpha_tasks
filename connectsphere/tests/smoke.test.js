const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.join(__dirname, '..');

test('project contains the required app entry points', () => {
  for (const file of ['package.json', '.env.example', 'database.sql', 'src/server.js', 'src/routes.js', 'src/socket.js', 'public/index.html', 'public/styles.css', 'public/app.js']) {
    assert.equal(fs.existsSync(path.join(root, file)), true, `${file} should exist`);
  }
});

test('frontend includes all required collaboration controls', () => {
  const html = fs.readFileSync(path.join(root, 'public/index.html'), 'utf8');
  for (const id of ['local-video', 'screen-toggle', 'whiteboard', 'chat-form', 'file-upload-form', 'poll-form', 'mic-toggle', 'camera-toggle', 'auth-form']) assert.ok(html.includes(`id="${id}"`), `${id} should exist`);
});

test('API uses parameterized SQL for user input', () => {
  const routes = fs.readFileSync(path.join(root, 'src/routes.js'), 'utf8');
  assert.ok(routes.includes('WHERE email = ?'));
  assert.ok(routes.includes('VALUES (?,?,?)'));
  assert.ok(!routes.includes('SELECT * FROM users WHERE email = \'${'));
});

test('sockets require JWT authentication and validate draw events', () => {
  const socket = fs.readFileSync(path.join(root, 'src/socket.js'), 'utf8');
  assert.ok(socket.includes('jwt.verify'));
  assert.ok(socket.includes('validDraw(data)'));
  assert.ok(socket.includes('validPeer(to, socket)'));
});
