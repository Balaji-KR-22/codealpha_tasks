require('dotenv').config();
const path = require('path');
const http = require('http');
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const { Server } = require('socket.io');
const pool = require('./db');
const { router } = require('./routes');
const setupSockets = require('./socket');

const app = express();
const server = http.createServer(app);
const port = Number(process.env.PORT || 3000);
const origin = process.env.CLIENT_ORIGIN || `http://localhost:${port}`;
app.disable('x-powered-by');
app.use(helmet({ contentSecurityPolicy: false, crossOriginEmbedderPolicy: false }));
app.use(cors({ origin, credentials: false }));
app.use(express.json({ limit: '100kb' }));
app.use('/api/auth', rateLimit({ windowMs: 15 * 60 * 1000, limit: 60, standardHeaders: 'draft-7', legacyHeaders: false }));
app.use('/api', (req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', router);
app.use(express.static(path.join(__dirname, '..', 'public')));
app.get('/health', async (_req, res) => {
  try { await pool.query('SELECT 1'); res.json({ status: 'ok', database: 'connected' }); }
  catch { res.status(503).json({ status: 'degraded', database: 'unavailable' }); }
});
app.get('*', (_req, res) => res.sendFile(path.join(__dirname, '..', 'public', 'index.html')));
app.use((err, _req, res, _next) => {
  console.error(err && err.message ? err.message : err);
  if (res.headersSent) return;
  res.status(500).json({ error: process.env.NODE_ENV === 'production' ? 'Unexpected server error.' : (err.message || 'Unexpected server error.') });
});

const io = new Server(server, { cors: { origin, methods: ['GET','POST'] }, maxHttpBufferSize: 1e6 });
setupSockets(io);

async function start() {
  if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32) {
    console.error('Startup blocked: set JWT_SECRET to a random secret of at least 32 characters in .env');
    process.exitCode = 1;
    return;
  }
  try {
    await pool.query('SELECT 1');
    server.listen(port, () => console.log(`ConnectSphere running at http://localhost:${port}`));
  } catch (err) {
    console.error('Database connection failed. Check MySQL and your .env settings.', err.message);
    process.exitCode = 1;
  }
}
if (require.main === module) start();
module.exports = { app, server, start };
