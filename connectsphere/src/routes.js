const express = require('express');
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const multer = require('multer');
const pool = require('./db');
const { signToken, authenticate } = require('./auth');

const router = express.Router();
const uploadDir = path.join(__dirname, '..', 'uploads');
fs.mkdirSync(uploadDir, { recursive: true });
const maxUpload = Math.max(1, Number(process.env.MAX_UPLOAD_MB || 10)) * 1024 * 1024;
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, uploadDir),
  filename: (_req, file, cb) => cb(null, `${crypto.randomBytes(16).toString('hex')}${path.extname(file.originalname).toLowerCase().slice(0, 12)}`)
});
const upload = multer({
  storage,
  limits: { fileSize: maxUpload, files: 1 },
  fileFilter: (_req, file, cb) => {
    const allowed = new Set(['image/png','image/jpeg','image/gif','image/webp','application/pdf','text/plain','text/csv','application/zip','application/vnd.openxmlformats-officedocument.wordprocessingml.document','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']);
    if (!allowed.has(file.mimetype)) return cb(new Error('File type not allowed. Upload an image, PDF, text/CSV, ZIP, DOCX, or XLSX file.'));
    cb(null, true);
  }
});

router.post('/auth/register', async (req, res, next) => {
  try {
    const name = String(req.body.name || '').trim();
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    if (name.length < 2 || name.length > 80) return res.status(400).json({ error: 'Name must contain 2–80 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 190) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (password.length < 8 || password.length > 72) return res.status(400).json({ error: 'Password must be 8–72 characters.' });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.execute('INSERT INTO users (name,email,password_hash) VALUES (?,?,?)', [name, email, hash]);
    const user = { id: result.insertId, name, email };
    return res.status(201).json({ user, token: signToken(user) });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ error: 'An account with that email already exists.' });
    next(err);
  }
});

router.post('/auth/login', async (req, res, next) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const password = String(req.body.password || '');
    const [rows] = await pool.execute('SELECT id,name,email,password_hash FROM users WHERE email = ? LIMIT 1', [email]);
    if (!rows.length || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
    const user = { id: rows[0].id, name: rows[0].name, email: rows[0].email };
    res.json({ user, token: signToken(user) });
  } catch (err) { next(err); }
});

router.get('/auth/me', authenticate, (req, res) => res.json({ user: req.user }));

router.get('/rooms', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.execute(
      `SELECT r.id,r.room_code AS code,r.title,r.created_at,
       (SELECT COUNT(*) FROM messages m WHERE m.room_id=r.id) AS message_count
       FROM rooms r WHERE r.owner_id=? ORDER BY r.created_at DESC LIMIT 50`, [req.user.id]);
    res.json({ rooms: rows });
  } catch (err) { next(err); }
});

router.post('/rooms', authenticate, async (req, res, next) => {
  try {
    const title = String(req.body.title || 'Team meeting').trim().slice(0, 120) || 'Team meeting';
    const code = crypto.randomBytes(5).toString('hex').toUpperCase();
    const [result] = await pool.execute('INSERT INTO rooms (room_code,title,owner_id) VALUES (?,?,?)', [code, title, req.user.id]);
    res.status(201).json({ room: { id: result.insertId, code, title } });
  } catch (err) { next(err); }
});

async function getRoom(code) {
  const [rows] = await pool.execute('SELECT id,room_code AS code,title,owner_id FROM rooms WHERE room_code=? LIMIT 1', [String(code || '').toUpperCase()]);
  return rows[0];
}
router.get('/rooms/:code/messages', authenticate, async (req, res, next) => {
  try {
    const room = await getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Meeting room not found.' });
    const [rows] = await pool.execute(
      `SELECT m.id,m.message,m.created_at,u.id AS user_id,u.name FROM messages m JOIN users u ON u.id=m.user_id WHERE m.room_id=? ORDER BY m.created_at DESC LIMIT 100`, [room.id]);
    res.json({ messages: rows.reverse() });
  } catch (err) { next(err); }
});

router.get('/rooms/:code/files', authenticate, async (req, res, next) => {
  try {
    const room = await getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Meeting room not found.' });
    const [rows] = await pool.execute(`SELECT f.id,f.original_name AS name,f.mime_type AS mimeType,f.size_bytes AS size,f.created_at,u.name AS uploadedBy FROM shared_files f JOIN users u ON u.id=f.user_id WHERE f.room_id=? ORDER BY f.created_at DESC LIMIT 50`, [room.id]);
    res.json({ files: rows.map(f => ({ ...f, url: `/api/files/${f.id}` })) });
  } catch (err) { next(err); }
});

router.post('/rooms/:code/files', authenticate, (req, res, next) => {
  upload.single('file')(req, res, async err => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Choose a file first.' });
    try {
      const room = await getRoom(req.params.code);
      if (!room) { fs.unlink(req.file.path, () => {}); return res.status(404).json({ error: 'Meeting room not found.' }); }
      const [result] = await pool.execute('INSERT INTO shared_files (room_id,user_id,original_name,stored_name,mime_type,size_bytes) VALUES (?,?,?,?,?,?)', [room.id, req.user.id, path.basename(req.file.originalname).slice(0,255), req.file.filename, req.file.mimetype, req.file.size]);
      res.status(201).json({ file: { id: result.insertId, name: path.basename(req.file.originalname), url: `/api/files/${result.insertId}`, size: req.file.size } });
    } catch (e) { fs.unlink(req.file.path, () => {}); next(e); }
  });
});

router.get('/files/:id', authenticate, async (req, res, next) => {
  try {
    const [rows] = await pool.execute('SELECT stored_name,original_name,mime_type FROM shared_files WHERE id=? LIMIT 1', [req.params.id]);
    if (!rows.length) return res.status(404).json({ error: 'File not found.' });
    const filePath = path.join(uploadDir, path.basename(rows[0].stored_name));
    if (!fs.existsSync(filePath)) return res.status(404).json({ error: 'File is no longer available.' });
    res.download(filePath, rows[0].original_name);
  } catch (err) { next(err); }
});

router.get('/rooms/:code/history', authenticate, async (req, res, next) => {
  try {
    const room = await getRoom(req.params.code);
    if (!room) return res.status(404).json({ error: 'Meeting room not found.' });
    const [rows] = await pool.execute(`SELECT h.joined_at,h.left_at,u.name FROM meeting_history h JOIN users u ON u.id=h.user_id WHERE h.room_id=? ORDER BY h.joined_at DESC LIMIT 50`, [room.id]);
    res.json({ history: rows });
  } catch (err) { next(err); }
});

module.exports = { router, getRoom };
