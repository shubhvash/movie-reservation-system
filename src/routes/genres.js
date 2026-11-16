import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { notFound } from '../errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validation.js';

const router = Router();

router.get('/', async (_req, res) => {
  const { rows } = await query('SELECT id, name FROM genres ORDER BY name');
  res.json({ genres: rows });
});

router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate(z.object({ name: z.string().trim().min(1).max(50) })),
  async (req, res) => {
    const { rows } = await query('INSERT INTO genres (name) VALUES ($1) RETURNING id, name', [
      req.valid.body.name,
    ]);
    res.status(201).json({ genre: rows[0] });
  },
);

router.delete('/:id', requireAuth, requireAdmin, validate(idParam, 'params'), async (req, res) => {
  const { rowCount } = await query('DELETE FROM genres WHERE id = $1', [req.valid.params.id]);
  if (!rowCount) throw notFound('Genre not found');
  res.status(204).end();
});

export default router;
