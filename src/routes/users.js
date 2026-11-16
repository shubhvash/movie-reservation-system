import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { badRequest, notFound } from '../errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam, pagination } from '../validation.js';

const router = Router();
router.use(requireAuth, requireAdmin);

router.get('/', validate(z.object(pagination), 'query'), async (req, res) => {
  const { limit, offset } = req.valid.query;
  const { rows } = await query(
    'SELECT id, name, email, role, created_at FROM users ORDER BY id LIMIT $1 OFFSET $2',
    [limit, offset],
  );
  res.json({ users: rows });
});

router.patch(
  '/:id/role',
  validate(idParam, 'params'),
  validate(z.object({ role: z.enum(['user', 'admin']) })),
  async (req, res) => {
    const { id } = req.valid.params;
    if (id === req.user.id && req.valid.body.role !== 'admin') {
      throw badRequest('You cannot demote yourself');
    }
    const { rows } = await query(
      'UPDATE users SET role = $1 WHERE id = $2 RETURNING id, name, email, role, created_at',
      [req.valid.body.role, id],
    );
    if (!rows[0]) throw notFound('User not found');
    res.json({ user: rows[0] });
  },
);

export default router;
