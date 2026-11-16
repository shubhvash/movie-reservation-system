import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { notFound } from '../errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { idParam } from '../validation.js';

const router = Router();

const SELECT_HALL = `
  SELECT h.id, h.name, h.rows, h.seats_per_row AS "seatsPerRow", h.rows * h.seats_per_row AS capacity
  FROM halls h`;

router.get('/', async (_req, res) => {
  const { rows } = await query(`${SELECT_HALL} ORDER BY h.name`);
  res.json({ halls: rows });
});

router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  const { rows } = await query(`${SELECT_HALL} WHERE h.id = $1`, [req.valid.params.id]);
  if (!rows[0]) throw notFound('Hall not found');
  res.json({ hall: rows[0] });
});

// Creating a hall generates its seat map: rows A..Z, seats 1..N.
router.post(
  '/',
  requireAuth,
  requireAdmin,
  validate(
    z.object({
      name: z.string().trim().min(1).max(100),
      rows: z.number().int().min(1).max(26),
      seatsPerRow: z.number().int().min(1).max(100),
    }),
  ),
  async (req, res) => {
    const { name, rows, seatsPerRow } = req.valid.body;
    const hall = await withTransaction(async (client) => {
      const { rows: [h] } = await client.query(
        'INSERT INTO halls (name, rows, seats_per_row) VALUES ($1, $2, $3) RETURNING id',
        [name, rows, seatsPerRow],
      );
      await client.query(
        `INSERT INTO seats (hall_id, row_label, seat_number)
         SELECT $1, chr(64 + r), s FROM generate_series(1, $2) r, generate_series(1, $3) s`,
        [h.id, rows, seatsPerRow],
      );
      const { rows: [full] } = await client.query(`${SELECT_HALL} WHERE h.id = $1`, [h.id]);
      return full;
    });
    res.status(201).json({ hall });
  },
);

export default router;
