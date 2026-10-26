const jwt = require('jsonwebtoken');
const pool = require('./db');
const { getRoom } = require('./routes');

function setupSockets(io) {
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth && socket.handshake.auth.token;
      if (!token) return next(new Error('Authentication required'));
      const payload = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = { id: Number(payload.sub), name: payload.name, email: payload.email };
      next();
    } catch { next(new Error('Invalid or expired session')); }
  });

  io.on('connection', socket => {
    socket.on('room:join', async ({ code } = {}, callback = () => {}) => {
      try {
        const room = await getRoom(code);
        if (!room) return callback({ error: 'Meeting room not found.' });
        const roomName = `meeting:${room.code}`;
        const peers = [...(io.sockets.adapter.rooms.get(roomName) || [])]
          .map(id => io.sockets.sockets.get(id)).filter(s => s && s.id !== socket.id)
          .map(s => ({ socketId: s.id, user: s.user }));
        socket.data.roomId = room.id;
        socket.data.roomCode = room.code;
        socket.join(roomName);
        const [history] = await pool.execute('INSERT INTO meeting_history (room_id,user_id) VALUES (?,?)', [room.id, socket.user.id]);
        socket.data.historyId = history.insertId;
        callback({ room: { code: room.code, title: room.title }, peers });
        socket.to(roomName).emit('peer:joined', { socketId: socket.id, user: socket.user });
      } catch (err) { callback({ error: 'Could not join this meeting.' }); }
    });

    socket.on('webrtc:offer', ({ to, offer } = {}) => { if (validPeer(to, socket)) io.to(to).emit('webrtc:offer', { from: socket.id, user: socket.user, offer }); });
    socket.on('webrtc:answer', ({ to, answer } = {}) => { if (validPeer(to, socket)) io.to(to).emit('webrtc:answer', { from: socket.id, answer }); });
    socket.on('webrtc:ice', ({ to, candidate } = {}) => { if (validPeer(to, socket)) io.to(to).emit('webrtc:ice', { from: socket.id, candidate }); });

    socket.on('chat:send', async ({ message } = {}) => {
      if (!socket.data.roomId || typeof message !== 'string') return;
      const clean = message.trim().slice(0, 2000);
      if (!clean) return;
      try {
        const [result] = await pool.execute('INSERT INTO messages (room_id,user_id,message) VALUES (?,?,?)', [socket.data.roomId, socket.user.id, clean]);
        const payload = { id: result.insertId, message: clean, user: socket.user, createdAt: new Date().toISOString() };
        io.to(`meeting:${socket.data.roomCode}`).emit('chat:message', payload);
      } catch { socket.emit('app:error', { message: 'Message could not be saved.' }); }
    });

    socket.on('whiteboard:draw', data => { if (socket.data.roomCode && validDraw(data)) socket.to(`meeting:${socket.data.roomCode}`).emit('whiteboard:draw', data); });
    socket.on('whiteboard:clear', () => { if (socket.data.roomCode) socket.to(`meeting:${socket.data.roomCode}`).emit('whiteboard:clear'); });
    socket.on('reaction:send', ({ emoji } = {}) => { if (socket.data.roomCode && ['👏','👍','❤️','😂','🎉','💡'].includes(emoji)) io.to(`meeting:${socket.data.roomCode}`).emit('reaction:show', { emoji, name: socket.user.name }); });
    socket.on('hand:raise', ({ raised } = {}) => { if (socket.data.roomCode) io.to(`meeting:${socket.data.roomCode}`).emit('hand:status', { userId: socket.user.id, name: socket.user.name, raised: Boolean(raised) }); });
    socket.on('poll:create', ({ question, options } = {}) => {
      if (!socket.data.roomCode || typeof question !== 'string' || !Array.isArray(options)) return;
      const q = question.trim().slice(0, 240), opts = options.map(x => String(x).trim().slice(0, 100)).filter(Boolean).slice(0, 6);
      if (q && opts.length >= 2) io.to(`meeting:${socket.data.roomCode}`).emit('poll:created', { id: `${Date.now()}-${socket.id}`, question: q, options: opts, by: socket.user.name, votes: {} });
    });
    socket.on('poll:vote', ({ pollId, optionIndex } = {}) => { if (socket.data.roomCode && typeof pollId === 'string' && Number.isInteger(optionIndex) && optionIndex >= 0 && optionIndex < 6) io.to(`meeting:${socket.data.roomCode}`).emit('poll:vote', { pollId, optionIndex, userId: socket.user.id, name: socket.user.name }); });

    socket.on('disconnect', async () => {
      if (socket.data.roomCode) socket.to(`meeting:${socket.data.roomCode}`).emit('peer:left', { socketId: socket.id, user: socket.user });
      if (socket.data.historyId) { try { await pool.execute('UPDATE meeting_history SET left_at=CURRENT_TIMESTAMP WHERE id=?', [socket.data.historyId]); } catch {} }
    });
  });
}
function validPeer(to, socket) {
  if (typeof to !== 'string' || !socket.data.roomCode) return false;
  const room = `meeting:${socket.data.roomCode}`;
  return ioRoomHas(to, room, socket);
}
function ioRoomHas(to, room, socket) {
  const target = socket.nsp.sockets.get(to);
  return Boolean(target && target.data.roomCode === socket.data.roomCode && target.rooms.has(room));
}
function validDraw(d) {
  return d && ['start','move','end'].includes(d.type) && [d.x,d.y,d.px,d.py].every(n => Number.isFinite(n) && n >= 0 && n <= 1) && typeof d.color === 'string' && /^#[0-9a-fA-F]{6}$/.test(d.color) && Number.isFinite(d.width) && d.width >= 1 && d.width <= 20;
}
module.exports = setupSockets;
