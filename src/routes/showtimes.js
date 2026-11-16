import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { badRequest, conflict, notFound } from '../errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dateString, id, idParam, pagination } from '../validation.js';

const router = Router();

const SELECT_SHOWTIME = `
  SELECT s.id, s.starts_at AS "startsAt", s.ends_at AS "endsAt", s.price_cents AS "priceCents",
         json_build_object('id', m.id, 'title', m.title, 'durationMinutes', m.duration_minutes,
                           'posterUrl', m.poster_url) AS movie,
         json_build_object('id', h.id, 'name', h.name) AS hall,
         h.rows * h.seats_per_row AS capacity,
         h.rows * h.seats_per_row - (SELECT count(*) FROM reservation_seats rs
                                     WHERE rs.showtime_id = s.id AND rs.active)::int AS "availableSeats"
  FROM showtimes s
  JOIN movies m ON m.id = s.movie_id
  JOIN halls h ON h.id = s.hall_id`;

export async function getShowtime(showtimeId, db = { query }) {
  const { rows } = await db.query(`${SELECT_SHOWTIME} WHERE s.id = $1`, [showtimeId]);
  return rows[0];
}

const listSchema = z.object({
  date: dateString.optional(),
  movieId: id.optional(),
  hallId: id.optional(),
  // Explicit start-time window, e.g. a day in the client's own timezone.
  from: z.string().datetime({ offset: true }).optional(),
  to: z.string().datetime({ offset: true }).optional(),
  includePast: z.enum(['true', 'false']).default('false'),
  ...pagination,
});

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { date, movieId, hallId, from, to, includePast, limit, offset } = req.valid.query;
  const where = [];
  const params = [];
  const add = (sql, ...values) => {
    params.push(...values);
    where.push(sql.replace(/\$(\d)/g, (_, n) => `$${params.length - values.length + Number(n)}`));
  };
  if (date) add('(s.starts_at AT TIME ZONE $2)::date = $1::date', date, config.timezone);
  if (movieId) add('s.movie_id = $1', movieId);
  if (hallId) add('s.hall_id = $1', hallId);
  if (from) add('s.starts_at >= $1', from);
  if (to) add('s.starts_at < $1', to);
  if (includePast !== 'true') where.push('s.starts_at > now()');
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT_SHOWTIME} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY s.starts_at, s.id LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ showtimes: rows });
});

router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  const showtime = await getShowtime(req.valid.params.id);
  if (!showtime) throw notFound('Showtime not found');
  res.json({ showtime });
});

// Seat map for a showtime with availability.
router.get('/:id/seats', validate(idParam, 'params'), async (req, res) => {
  const showtime = await getShowtime(req.valid.params.id);
  if (!showtime) throw notFound('Showtime not found');
  const { rows } = await query(
    `SELECT se.id, se.row_label AS row, se.seat_number AS number,
            (rs.seat_id IS NULL) AS available
     FROM showtimes s
     JOIN seats se ON se.hall_id = s.hall_id
     LEFT JOIN reservation_seats rs
       ON rs.showtime_id = s.id AND rs.seat_id = se.id AND rs.active
     WHERE s.id = $1
     ORDER BY se.row_label, se.seat_number`,
    [showtime.id],
  );
  res.json({ showtime, seats: rows });
});

const isoDate = z.string().datetime({ offset: true }).transform((s) => new Date(s));

const createSchema = z.object({
  movieId: id,
  hallId: id,
  startsAt: isoDate,
  priceCents: z.number().int().min(0),
});

async function loadMovieDuration(db, movieId) {
  const { rows } = await db.query('SELECT duration_minutes FROM movies WHERE id = $1', [movieId]);
  if (!rows[0]) throw badRequest('movieId does not exist');
  return rows[0].duration_minutes;
}

const endFor = (startsAt, minutes) => new Date(startsAt.getTime() + minutes * 60_000);

router.post('/', requireAuth, requireAdmin, validate(createSchema), async (req, res) => {
  const { movieId, hallId, startsAt, priceCents } = req.valid.body;
  if (startsAt <= new Date()) throw badRequest('startsAt must be in the future');
  const duration = await loadMovieDuration({ query }, movieId);
  try {
    const { rows } = await query(
      `INSERT INTO showtimes (movie_id, hall_id, starts_at, ends_at, price_cents)
       VALUES ($1, $2, $3, $4, $5) RETURNING id`,
      [movieId, hallId, startsAt, endFor(startsAt, duration), priceCents],
    );
    res.status(201).json({ showtime: await getShowtime(rows[0].id) });
  } catch (err) {
    if (err.code === '23P01') throw conflict('Hall already has a showtime in that time slot');
    if (err.code === '23503') throw badRequest('hallId does not exist');
    throw err;
  }
});

const updateSchema = createSchema
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field');

router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(idParam, 'params'),
  validate(updateSchema),
  async (req, res) => {
    const showtimeId = req.valid.params.id;
    const b = req.valid.body;
    try {
      await withTransaction(async (client) => {
        const { rows } = await client.query('SELECT * FROM showtimes WHERE id = $1 FOR UPDATE', [
          showtimeId,
        ]);
        const current = rows[0];
        if (!current) throw notFound('Showtime not found');

        const changesHallOrMovie =
          (b.hallId && b.hallId !== current.hall_id) || (b.movieId && b.movieId !== current.movie_id);
        if (changesHallOrMovie) {
          const { rowCount } = await client.query(
            'SELECT 1 FROM reservation_seats WHERE showtime_id = $1 AND active LIMIT 1',
            [showtimeId],
          );
          if (rowCount) throw conflict('Cannot change hall or movie of a showtime with active reservations');
        }
        if (b.startsAt && b.startsAt <= new Date()) throw badRequest('startsAt must be in the future');

        const movieId = b.movieId ?? current.movie_id;
        const startsAt = b.startsAt ?? current.starts_at;
        const duration = await loadMovieDuration(client, movieId);
        await client.query(
          `UPDATE showtimes SET movie_id = $2, hall_id = $3, starts_at = $4, ends_at = $5, price_cents = $6
           WHERE id = $1`,
          [showtimeId, movieId, b.hallId ?? current.hall_id, startsAt, endFor(startsAt, duration),
            b.priceCents ?? current.price_cents],
        );
      });
    } catch (err) {
      if (err.code === '23P01') throw conflict('Hall already has a showtime in that time slot');
      if (err.code === '23503') throw badRequest('hallId does not exist');
      throw err;
    }
    res.json({ showtime: await getShowtime(showtimeId) });
  },
);

router.delete('/:id', requireAuth, requireAdmin, validate(idParam, 'params'), async (req, res) => {
  try {
    const { rowCount } = await query('DELETE FROM showtimes WHERE id = $1', [req.valid.params.id]);
    if (!rowCount) throw notFound('Showtime not found');
  } catch (err) {
    if (err.code === '23503') throw conflict('Showtime has reservations; it cannot be deleted');
    throw err;
  }
  res.status(204).end();
});

export default router;
