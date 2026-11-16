import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import { query } from '../db.js';
import { conflict, unauthorized } from '../errors.js';
import { requireAuth, signToken } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';

const router = Router();

const signupSchema = z.object({
  name: z.string().trim().min(1).max(100),
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(8).max(200),
});

const loginSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  password: z.string().min(1),
});

// Every signup is a regular user; admins are seeded or promoted by another admin.
router.post('/signup', validate(signupSchema), async (req, res) => {
  const { name, email, password } = req.valid.body;
  const hash = await bcrypt.hash(password, 10);
  const { rows } = await query(
    `INSERT INTO users (name, email, password_hash) VALUES ($1, $2, $3)
     ON CONFLICT (email) DO NOTHING
     RETURNING id, name, email, role, created_at`,
    [name, email, hash],
  );
  if (!rows[0]) throw conflict('Email is already registered');
  res.status(201).json({ user: rows[0], token: signToken(rows[0]) });
});

router.post('/login', validate(loginSchema), async (req, res) => {
  const { email, password } = req.valid.body;
  const { rows } = await query('SELECT * FROM users WHERE email = $1', [email]);
  const user = rows[0];
  if (!user || !(await bcrypt.compare(password, user.password_hash))) {
    throw unauthorized('Invalid email or password');
  }
  const { password_hash: _ignored, ...publicUser } = user;
  res.json({ user: publicUser, token: signToken(user) });
});

router.get('/me', requireAuth, (req, res) => res.json({ user: req.user }));

export default router;
