import { Router } from 'express';
import { z } from 'zod';
import { query } from '../db.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { id, pagination } from '../validation.js';
import { SELECT_RESERVATION } from './reservations.js';

const router = Router();
router.use(requireAuth, requireAdmin);

const isoDate = z.string().datetime({ offset: true });

const reservationsSchema = z.object({
  showtimeId: id.optional(),
  movieId: id.optional(),
  userId: id.optional(),
  status: z.enum(['confirmed', 'cancelled']).optional(),
  from: isoDate.optional(), // showtime start range
  to: isoDate.optional(),
  ...pagination,
});

router.get('/reservations', validate(reservationsSchema, 'query'), async (req, res) => {
  const { showtimeId, movieId, userId, status, from, to, limit, offset } = req.valid.query;
  const where = [];
  const params = [];
  const add = (sql, v) => {
    params.push(v);
    where.push(sql.replace('?', `$${params.length}`));
  };
  if (showtimeId) add('s.id = ?', showtimeId);
  if (movieId) add('m.id = ?', movieId);
  if (userId) add('u.id = ?', userId);
  if (status) add('r.status = ?', status);
  if (from) add('s.starts_at >= ?', from);
  if (to) add('s.starts_at < ?', to);
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT_RESERVATION} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     ORDER BY s.starts_at DESC, r.id DESC LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ reservations: rows });
});

const reportSchema = z.object({ from: isoDate.optional(), to: isoDate.optional(), movieId: id.optional() });

// Capacity, occupancy and revenue — overall, per movie and per showtime.
// Revenue counts only confirmed (non-cancelled) seats.
router.get('/reports', validate(reportSchema, 'query'), async (req, res) => {
  const { from, to, movieId } = req.valid.query;
  const { rows: showtimes } = await query(
    `SELECT s.id AS "showtimeId", s.starts_at AS "startsAt",
            m.id AS "movieId", m.title AS "movieTitle", h.name AS hall,
            h.rows * h.seats_per_row AS capacity,
            count(rs.seat_id)::int AS "seatsSold",
            COALESCE(sum(rs.price_cents), 0)::int AS "revenueCents"
     FROM showtimes s
     JOIN movies m ON m.id = s.movie_id
     JOIN halls h ON h.id = s.hall_id
     LEFT JOIN reservation_seats rs ON rs.showtime_id = s.id AND rs.active
     WHERE ($1::timestamptz IS NULL OR s.starts_at >= $1)
       AND ($2::timestamptz IS NULL OR s.starts_at < $2)
       AND ($3::int IS NULL OR m.id = $3)
     GROUP BY s.id, m.id, h.id
     ORDER BY s.starts_at`,
    [from ?? null, to ?? null, movieId ?? null],
  );

  const pct = (sold, cap) => (cap ? Math.round((sold / cap) * 10000) / 100 : 0);
  const byMovie = new Map();
  const totals = { showtimes: 0, capacity: 0, seatsSold: 0, revenueCents: 0 };
  for (const s of showtimes) {
    s.occupancyPct = pct(s.seatsSold, s.capacity);
    const mv = byMovie.get(s.movieId) ?? {
      movieId: s.movieId, movieTitle: s.movieTitle, showtimes: 0, capacity: 0, seatsSold: 0, revenueCents: 0,
    };
    for (const agg of [mv, totals]) {
      agg.showtimes += 1;
      agg.capacity += s.capacity;
      agg.seatsSold += s.seatsSold;
      agg.revenueCents += s.revenueCents;
    }
    byMovie.set(s.movieId, mv);
  }
  const movies = [...byMovie.values()]
    .map((m) => ({ ...m, occupancyPct: pct(m.seatsSold, m.capacity) }))
    .sort((a, b) => b.revenueCents - a.revenueCents);

  const { rows: [counts] } = await query(
    `SELECT count(*) FILTER (WHERE r.status = 'confirmed')::int AS confirmed,
            count(*) FILTER (WHERE r.status = 'cancelled')::int AS cancelled
     FROM reservations r JOIN showtimes s ON s.id = r.showtime_id
     WHERE ($1::timestamptz IS NULL OR s.starts_at >= $1)
       AND ($2::timestamptz IS NULL OR s.starts_at < $2)
       AND ($3::int IS NULL OR s.movie_id = $3)`,
    [from ?? null, to ?? null, movieId ?? null],
  );

  res.json({
    totals: { ...totals, occupancyPct: pct(totals.seatsSold, totals.capacity), reservations: counts },
    movies,
    showtimes,
  });
});

export default router;
