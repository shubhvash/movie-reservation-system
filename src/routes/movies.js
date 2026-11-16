import { Router } from 'express';
import { z } from 'zod';
import { query, withTransaction } from '../db.js';
import { config } from '../config.js';
import { badRequest, notFound } from '../errors.js';
import { requireAdmin, requireAuth } from '../middleware/auth.js';
import { validate } from '../middleware/validate.js';
import { dateString, id, idParam, pagination } from '../validation.js';

const router = Router();

const movieFields = {
  title: z.string().trim().min(1).max(200),
  description: z.string().max(5000).default(''),
  posterUrl: z.string().url().nullable().optional(),
  durationMinutes: z.number().int().positive().max(1000),
  genreIds: z.array(id).max(20).default([]),
};
const createSchema = z.object(movieFields);
const updateSchema = z
  .object({
    ...movieFields,
    description: movieFields.description.optional(),
    genreIds: movieFields.genreIds.optional(),
  })
  .partial()
  .refine((o) => Object.keys(o).length > 0, 'Provide at least one field');

const listSchema = z.object({
  genreId: id.optional(),
  date: dateString.optional(), // only movies with showtimes on this date
  q: z.string().trim().min(1).optional(),
  ...pagination,
});

const SELECT_MOVIE = `
  SELECT m.id, m.title, m.description, m.poster_url AS "posterUrl",
         m.duration_minutes AS "durationMinutes", m.created_at AS "createdAt",
         COALESCE(json_agg(json_build_object('id', g.id, 'name', g.name) ORDER BY g.name)
                  FILTER (WHERE g.id IS NOT NULL), '[]') AS genres
  FROM movies m
  LEFT JOIN movie_genres mg ON mg.movie_id = m.id
  LEFT JOIN genres g ON g.id = mg.genre_id`;

async function getMovie(movieId, db = { query }) {
  const { rows } = await db.query(`${SELECT_MOVIE} WHERE m.id = $1 GROUP BY m.id`, [movieId]);
  return rows[0];
}

async function setGenres(client, movieId, genreIds) {
  await client.query('DELETE FROM movie_genres WHERE movie_id = $1', [movieId]);
  if (!genreIds.length) return;
  const unique = [...new Set(genreIds)];
  const { rowCount } = await client.query('SELECT 1 FROM genres WHERE id = ANY($1)', [unique]);
  if (rowCount !== unique.length) throw badRequest('One or more genreIds do not exist');
  await client.query(
    'INSERT INTO movie_genres (movie_id, genre_id) SELECT $1, unnest($2::int[])',
    [movieId, unique],
  );
}

router.get('/', validate(listSchema, 'query'), async (req, res) => {
  const { genreId, date, q, limit, offset } = req.valid.query;
  const where = [];
  const params = [];
  if (genreId) {
    params.push(genreId);
    where.push(`EXISTS (SELECT 1 FROM movie_genres x WHERE x.movie_id = m.id AND x.genre_id = $${params.length})`);
  }
  if (date) {
    params.push(date, config.timezone);
    where.push(`EXISTS (SELECT 1 FROM showtimes s WHERE s.movie_id = m.id
                AND (s.starts_at AT TIME ZONE $${params.length})::date = $${params.length - 1}::date)`);
  }
  if (q) {
    params.push(`%${q}%`);
    where.push(`m.title ILIKE $${params.length}`);
  }
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT_MOVIE} ${where.length ? `WHERE ${where.join(' AND ')}` : ''}
     GROUP BY m.id ORDER BY m.title LIMIT $${params.length - 1} OFFSET $${params.length}`,
    params,
  );
  res.json({ movies: rows });
});

router.get('/:id', validate(idParam, 'params'), async (req, res) => {
  const movie = await getMovie(req.valid.params.id);
  if (!movie) throw notFound('Movie not found');
  res.json({ movie });
});

router.post('/', requireAuth, requireAdmin, validate(createSchema), async (req, res) => {
  const b = req.valid.body;
  const movie = await withTransaction(async (client) => {
    const { rows } = await client.query(
      `INSERT INTO movies (title, description, poster_url, duration_minutes)
       VALUES ($1, $2, $3, $4) RETURNING id`,
      [b.title, b.description, b.posterUrl ?? null, b.durationMinutes],
    );
    await setGenres(client, rows[0].id, b.genreIds);
    return getMovie(rows[0].id, client);
  });
  res.status(201).json({ movie });
});

router.patch(
  '/:id',
  requireAuth,
  requireAdmin,
  validate(idParam, 'params'),
  validate(updateSchema),
  async (req, res) => {
    const movieId = req.valid.params.id;
    const b = req.valid.body;
    const movie = await withTransaction(async (client) => {
      const { rows } = await client.query(
        `UPDATE movies SET
           title = COALESCE($2, title),
           description = COALESCE($3, description),
           poster_url = CASE WHEN $4::boolean THEN $5 ELSE poster_url END,
           duration_minutes = COALESCE($6, duration_minutes),
           updated_at = now()
         WHERE id = $1 RETURNING id`,
        [movieId, b.title, b.description, 'posterUrl' in b, b.posterUrl ?? null, b.durationMinutes],
      );
      if (!rows[0]) throw notFound('Movie not found');
      if (b.genreIds) await setGenres(client, movieId, b.genreIds);
      return getMovie(movieId, client);
    });
    res.json({ movie });
  },
);

// Movies with showtimes can't be deleted (FK RESTRICT) -> 409, preserving reservation history.
router.delete('/:id', requireAuth, requireAdmin, validate(idParam, 'params'), async (req, res) => {
  const { rowCount } = await query('DELETE FROM movies WHERE id = $1', [req.valid.params.id]);
  if (!rowCount) throw notFound('Movie not found');
  res.status(204).end();
});

export default router;
