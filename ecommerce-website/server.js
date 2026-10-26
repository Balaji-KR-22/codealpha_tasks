require('dotenv').config();
const express = require('express');
const session = require('express-session');
const bcrypt = require('bcryptjs');
const mysql = require('mysql2/promise');
const path = require('path');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost', port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'root', password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'novacart_db', waitForConnections: true,
  connectionLimit: 10, decimalNumbers: true
});

app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(session({
  name: 'novacart.sid', secret: process.env.SESSION_SECRET || 'change-this-development-secret',
  resave: false, saveUninitialized: false,
  cookie: { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production', maxAge: 1000 * 60 * 60 * 8 }
}));
app.use(express.static(path.join(__dirname, 'public')));

const safeUser = user => ({ id: user.id, name: user.name, email: user.email });
const requireAuth = (req, res, next) => req.session.user ? next() : res.status(401).json({ error: 'Please log in to continue.' });
const clean = value => typeof value === 'string' ? value.trim() : '';

app.get('/api/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ ok: true, database: 'connected' }); }
  catch (err) { res.status(500).json({ ok: false, error: 'Database connection failed. Check your .env and MySQL service.' }); }
});

app.get('/api/products', async (req, res, next) => {
  try {
    const search = `%${clean(req.query.search)}%`;
    const category = clean(req.query.category);
    let sql = 'SELECT id,name,category,description,price,image_url,badge,stock FROM products WHERE (name LIKE ? OR description LIKE ? OR category LIKE ?)';
    const params = [search, search, search];
    if (category && category !== 'All') { sql += ' AND category = ?'; params.push(category); }
    sql += ' ORDER BY id';
    const [rows] = await pool.query(sql, params); res.json(rows);
  } catch (e) { next(e); }
});

app.get('/api/products/:id', async (req, res, next) => {
  try {
    const [rows] = await pool.query('SELECT id,name,category,description,price,image_url,badge,stock FROM products WHERE id=?', [Number(req.params.id)]);
    if (!rows.length) return res.status(404).json({ error: 'Product not found.' });
    res.json(rows[0]);
  } catch (e) { next(e); }
});

app.get('/api/me', (req, res) => res.json({ user: req.session.user || null }));
app.post('/api/register', async (req, res, next) => {
  try {
    const name = clean(req.body.name), email = clean(req.body.email).toLowerCase(), password = req.body.password;
    if (name.length < 2 || name.length > 100) return res.status(400).json({ error: 'Enter a name between 2 and 100 characters.' });
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return res.status(400).json({ error: 'Enter a valid email address.' });
    if (typeof password !== 'string' || password.length < 8) return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    const [existing] = await pool.query('SELECT id FROM users WHERE email=?', [email]);
    if (existing.length) return res.status(409).json({ error: 'An account with this email already exists.' });
    const hash = await bcrypt.hash(password, 12);
    const [result] = await pool.query('INSERT INTO users(name,email,password_hash) VALUES(?,?,?)', [name, email, hash]);
    req.session.user = { id: result.insertId, name, email };
    res.status(201).json({ user: req.session.user, message: 'Account created successfully.' });
  } catch (e) { next(e); }
});
app.post('/api/login', async (req, res, next) => {
  try {
    const email = clean(req.body.email).toLowerCase(), password = req.body.password;
    const [rows] = await pool.query('SELECT id,name,email,password_hash FROM users WHERE email=?', [email]);
    if (!rows.length || typeof password !== 'string' || !(await bcrypt.compare(password, rows[0].password_hash))) return res.status(401).json({ error: 'Incorrect email or password.' });
    req.session.regenerate(err => {
      if (err) return next(err);
      req.session.user = safeUser(rows[0]);
      req.session.save(err2 => err2 ? next(err2) : res.json({ user: req.session.user, message: 'Welcome back!' }));
    });
  } catch (e) { next(e); }
});
app.post('/api/logout', (req, res, next) => {
  req.session.destroy(err => { if (err) return next(err); res.clearCookie('novacart.sid'); res.json({ message: 'You have been logged out.' }); });
});

app.get('/api/orders', requireAuth, async (req, res, next) => {
  try {
    const [orders] = await pool.query('SELECT id,total,status,full_name,address,city,postal_code,phone,created_at FROM orders WHERE user_id=? ORDER BY created_at DESC', [req.session.user.id]);
    for (const order of orders) {
      const [items] = await pool.query('SELECT product_name,unit_price,quantity FROM order_items WHERE order_id=?', [order.id]);
      order.items = items;
    }
    res.json(orders);
  } catch (e) { next(e); }
});
app.post('/api/orders', requireAuth, async (req, res, next) => {
  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const fields = ['fullName', 'address', 'city', 'postalCode', 'phone'];
  const values = fields.map(f => clean(req.body[f]));
  if (!items.length || items.length > 50) return res.status(400).json({ error: 'Your cart is empty or too large.' });
  if (values.some(v => !v) || values.some(v => v.length > 255)) return res.status(400).json({ error: 'Complete all delivery details.' });
  const quantities = new Map();
  for (const item of items) {
    const id = Number(item.id), qty = Number(item.quantity);
    if (!Number.isInteger(id) || id < 1 || !Number.isInteger(qty) || qty < 1 || qty > 20) return res.status(400).json({ error: 'Invalid product or quantity.' });
    quantities.set(id, (quantities.get(id) || 0) + qty);
  }
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const verified = [];
    for (const [id, qty] of quantities) {
      const [rows] = await conn.query('SELECT id,name,price,stock FROM products WHERE id=? FOR UPDATE', [id]);
      if (!rows.length) throw Object.assign(new Error('A product in your cart no longer exists.'), { status: 400 });
      if (rows[0].stock < qty) throw Object.assign(new Error(`Not enough stock for ${rows[0].name}. Available: ${rows[0].stock}.`), { status: 409 });
      verified.push({ ...rows[0], quantity: qty });
    }
    const total = verified.reduce((sum, p) => sum + Number(p.price) * p.quantity, 0);
    const [orderResult] = await conn.query('INSERT INTO orders(user_id,total,full_name,address,city,postal_code,phone) VALUES(?,?,?,?,?,?,?)', [req.session.user.id, total.toFixed(2), ...values]);
    for (const p of verified) {
      await conn.query('INSERT INTO order_items(order_id,product_id,product_name,unit_price,quantity) VALUES(?,?,?,?,?)', [orderResult.insertId, p.id, p.name, p.price, p.quantity]);
      await conn.query('UPDATE products SET stock=stock-? WHERE id=?', [p.quantity, p.id]);
    }
    await conn.commit();
    res.status(201).json({ message: 'Order placed successfully!', orderId: orderResult.insertId, total: Number(total.toFixed(2)) });
  } catch (e) { await conn.rollback(); next(e); }
  finally { conn.release(); }
});

app.post('/api/feedback', async (req, res, next) => {
  try {
    const name = clean(req.body.name), email = clean(req.body.email).toLowerCase(), message = clean(req.body.message), rating = Number(req.body.rating);
    if (name.length < 2 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || !Number.isInteger(rating) || rating < 1 || rating > 5 || message.length < 5 || message.length > 2000) return res.status(400).json({ error: 'Please enter your name, valid email, a 1–5 star rating and feedback (at least 5 characters).' });
    await pool.query('INSERT INTO feedback(user_id,name,email,rating,message) VALUES(?,?,?,?,?)', [req.session.user?.id || null, name, email, rating, message]);
    res.status(201).json({ message: 'Thanks for sharing your feedback!' });
  } catch (e) { next(e); }
});

app.get('*', (_req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.use((err, _req, res, _next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? 'Something went wrong. Check the server terminal for details.' : err.message });
});

(async () => {
  try { await pool.query('SELECT 1'); console.log('MySQL connected.'); }
  catch (e) { console.error('Could not connect to MySQL:', e.message); }
  app.listen(PORT, () => console.log(`NovaCart is running at http://localhost:${PORT}`));
})();
