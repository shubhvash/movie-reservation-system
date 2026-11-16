import jwt from 'jsonwebtoken';
import { config } from '../config.js';
import { query } from '../db.js';
import { forbidden, unauthorized } from '../errors.js';

export function signToken(user) {
  return jwt.sign({ sub: String(user.id), role: user.role }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

export async function requireAuth(req, _res, next) {
  const header = req.get('authorization') || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw unauthorized();

  let payload;
  try {
    payload = jwt.verify(token, config.jwtSecret);
  } catch {
    throw unauthorized('Invalid or expired token');
  }
  // Re-read the user so role changes and deletions take effect immediately.
  const { rows } = await query('SELECT id, name, email, role FROM users WHERE id = $1', [
    Number(payload.sub),
  ]);
  if (!rows[0]) throw unauthorized('User no longer exists');
  req.user = rows[0];
  next();
}

export function requireAdmin(req, _res, next) {
  if (req.user?.role !== 'admin') throw forbidden('Admin access required');
  next();
}
