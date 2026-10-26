const jwt = require('jsonwebtoken');

function signToken(user) {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) throw new Error('JWT_SECRET must be set to at least 32 characters. Copy .env.example to .env and change it.');
  return jwt.sign({ sub: String(user.id), name: user.name, email: user.email }, secret, { expiresIn: process.env.JWT_EXPIRES_IN || '8h' });
}

function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'Please sign in to continue.' });
  try {
    const payload = jwt.verify(token, process.env.JWT_SECRET);
    req.user = { id: Number(payload.sub), name: payload.name, email: payload.email };
    next();
  } catch {
    return res.status(401).json({ error: 'Your session is invalid or expired. Please sign in again.' });
  }
}

module.exports = { signToken, authenticate };
