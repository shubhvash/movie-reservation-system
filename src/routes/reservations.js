import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { badRequest, conflict, forbidden, notFound } from '../errors.js';
import { requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { id, idParam, pagination } from '../validation.js';

const router = Router();
router.use(requireAuth);

export const SELECT_RESERVATION = `
  SELECT r.id, r.status, r.total_cents AS "totalCents", r.created_at AS "createdAt",
         r.cancelled_at AS "cancelledAt",
         json_build_object('id', u.id, 'name', u.name, 'email', u.email) AS user,
         json_build_object('id', s.id, 'startsAt', s.starts_at, 'endsAt', s.ends_at,
                           'movie', json_build_object('id', m.id, 'title', m.title),
                           'hall', json_build_object('id', h.id, 'name', h.name)) AS showtime,
         (SELECT json_agg(json_build_object('id', se.id, 'row', se.row_label, 'number', se.seat_number)
                          ORDER BY se.row_label, se.seat_number)
          FROM reservation_seats rs JOIN seats se ON se.id = rs.seat_id
          WHERE rs.reservation_id = r.id) AS seats
  FROM reservations r
  JOIN users u ON u.id = r.user_id
  JOIN showtimes s ON s.id = r.showtime_id
  JOIN movies m ON m.id = s.movie_id
  JOIN halls h ON h.id = s.hall_id`;

async function getReservation(reservationId) {
  const { rows } = await query(`${SELECT_RESERVATION} WHERE r.id = $1`, [reservationId]);
  return rows[0];
}

const createSchema = z.object({
  showtimeId: id,
  seatIds: z
    .array(id)
    .min(1)
    .refine((a) => new Set(a).size === a.length, 'seatIds must be unique'),
});

router.post('/', validate(createSchema), async (req, res) => {
  const { showtimeId, seatIds } = req.valid.body;
  if (seatIds.length > config.maxSeatsPerReservation) {
    throw badRequest(`At most ${config.maxSeatsPerReservation} seats per reservation`);
  }

  let reservationId;
  try {
    reservationId = await withTransaction(async (client) => {
      const { rows: [showtime] } = await client.query(
        'SELECT id, hall_id, starts_at, price_cents FROM showtimes WHERE id = $1',
        [showtimeId],
      );
      if (!showtime) throw notFound('Showtime not found');
      if (showtime.starts_at <= new Date()) throw badRequest('This showtime has already started');

      const { rows: validSeats } = await client.query(
        'SELECT id FROM seats WHERE hall_id = $1 AND id = ANY($2)',
        [showtime.hall_id, seatIds],
      );
      if (validSeats.length !== seatIds.length) {
        const valid = new Set(validSeats.map((s) => s.id));
        throw badRequest('Some seats do not belong to this showtime\'s hall', {
          invalidSeatIds: seatIds.filter((s) => !valid.has(s)),
        });
      }

      // Friendly pre-check; the unique index below is the real guarantee under concurrency.
      const { rows: taken } = await client.query(
        'SELECT seat_id FROM reservation_seats WHERE showtime_id = $1 AND seat_id = ANY($2) AND active',
        [showtimeId, seatIds],
      );
      if (taken.length) {
        throw conflict('Some seats are already reserved', {
          unavailableSeatIds: taken.map((t) => t.seat_id),
        });
      }

      const { rows: [r] } = await client.query(
        `INSERT INTO reservations (user_id, showtime_id, total_cents) VALUES ($1, $2, $3) RETURNING id`,
        [req.user.id, showtimeId, showtime.price_cents * seatIds.length],
      );
      await client.query(
        `INSERT INTO reservation_seats (reservation_id, showtime_id, seat_id, price_cents)
         SELECT $1, $2, unnest($3::int[]), $4`,
        [r.id, showtimeId, seatIds, showtime.price_cents],
      );
      return r.id;
    });
  } catch (err) {
    if (err.code === '23505' && err.constraint === 'reservation_seats_one_active_per_seat') {
      throw conflict('Some seats were just reserved by someone else; please pick again');
    }
    throw err;
  }
  res.status(201).json({ reservation: await getReservation(reservationId) });
});

const listSchema = z.object({
  scope: z.enum(['upcoming', 'past', 'all']).default('upcoming'),
  includeCancelled: z.enum(['true', 'false']).default('false'),
  ...pagination,
});

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { scope, includeCancelled, limit, offset } = req.valid.query;
  const where = ['r.user_id = $1'];
  if (scope === 'upcoming') where.push('s.starts_at > now()');
  if (scope === 'past') where.push('s.starts_at <= now()');
  if (includeCancelled !== 'true') where.push(`r.status = 'confirmed'`);
  const { rows } = await query(
    `${SELECT_RESERVATION} WHERE ${where.join(' AND ')}
     ORDER BY s.starts_at ${scope === 'past' ? 'DESC' : 'ASC'}, r.id LIMIT $2 OFFSET $3`,
    [req.user.id, limit, offset],
  );
  res.json({ reservations: rows });
});

router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  const reservation = await getReservation(req.valid.params.id);
  if (!reservation) throw notFound('Reservation not found');
  if (reservation.user.id !== req.user.id && req.user.role !== 'admin') {
    throw notFound('Reservation not found');
  }
  res.json({ reservation });
});

// Cancel. Only upcoming reservations can be cancelled; seats are released immediately.
router.post('/:id/cancel', validate(idParam, 'params'), async (req, res) => {
  const reservationId = req.valid.params.id;
  await withTransaction(async (client) => {
    const { rows: [r] } = await client.query(
      `SELECT r.user_id, r.status, s.starts_at FROM reservations r
       JOIN showtimes s ON s.id = r.showtime_id WHERE r.id = $1 FOR UPDATE OF r`,
      [reservationId],
    );
    if (!r) throw notFound('Reservation not found');
    if (r.user_id !== req.user.id) {
      if (req.user.role !== 'admin') throw notFound('Reservation not found');
    }
    if (r.status === 'cancelled') throw conflict('Reservation is already cancelled');
    if (r.starts_at <= new Date()) throw forbidden('Only upcoming reservations can be cancelled');

    await client.query(
      `UPDATE reservations SET status = 'cancelled', cancelled_at = now() WHERE id = $1`,
      [reservationId],
    );
    await client.query('UPDATE reservation_seats SET active = false WHERE reservation_id = $1', [
      reservationId,
    ]);
  });
  res.json({ reservation: await getReservation(reservationId) });
});

export default router;
