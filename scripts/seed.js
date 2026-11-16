// Seeds an initial admin plus sample genres, movies, halls and showtimes. Idempotent.
import bcrypt from 'bcryptjs';
import { pool, withTransaction } from '../src/db.js';

const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || 'admin@example.com').toLowerCase();
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'admin12345';

const genres = ['Action', 'Comedy', 'Drama', 'Sci-Fi', 'Animation', 'Thriller'];
const movies = [
  { title: 'The Last Orbit', duration: 128, genres: ['Sci-Fi', 'Drama'],
    description: 'A stranded crew races to repair their station before it falls.' },
  { title: 'Paper Lanterns', duration: 95, genres: ['Animation', 'Comedy'],
    description: 'Two siblings follow a runaway lantern across a festival city.' },
  { title: 'Midnight Ledger', duration: 112, genres: ['Thriller', 'Drama'],
    description: 'An auditor finds one number that does not add up.' },
  { title: 'Steel Horizon', duration: 140, genres: ['Action', 'Sci-Fi'],
    description: 'A test pilot is pulled into a war she was built to stop.' },
];
const halls = [
  { name: 'Hall 1', rows: 8, seatsPerRow: 12 },
  { name: 'Hall 2', rows: 6, seatsPerRow: 10 },
];

await withTransaction(async (db) => {
  await db.query(
    `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', $1, $2, 'admin')
     ON CONFLICT (email) DO UPDATE SET role = 'admin'`,
    [ADMIN_EMAIL, await bcrypt.hash(ADMIN_PASSWORD, 10)],
  );

  for (const g of genres) await db.query('INSERT INTO genres (name) VALUES ($1) ON CONFLICT DO NOTHING', [g]);

  const { rowCount: haveMovies } = await db.query('SELECT 1 FROM movies LIMIT 1');
  if (haveMovies) return console.log('catalog already present; only admin ensured');

  const movieIds = [];
  for (const m of movies) {
    const { rows: [row] } = await db.query(
      'INSERT INTO movies (title, description, duration_minutes) VALUES ($1, $2, $3) RETURNING id',
      [m.title, m.description, m.duration],
    );
    await db.query(
      `INSERT INTO movie_genres (movie_id, genre_id) SELECT $1, id FROM genres WHERE name = ANY($2)`,
      [row.id, m.genres],
    );
    movieIds.push({ id: row.id, duration: m.duration });
  }

  const hallIds = [];
  for (const h of halls) {
    const { rows: [row] } = await db.query(
      `INSERT INTO halls (name, rows, seats_per_row) VALUES ($1, $2, $3)
       ON CONFLICT (name) DO UPDATE SET name = EXCLUDED.name RETURNING id`,
      [h.name, h.rows, h.seatsPerRow],
    );
    await db.query(
      `INSERT INTO seats (hall_id, row_label, seat_number)
       SELECT $1, chr(64 + r), s FROM generate_series(1, $2) r, generate_series(1, $3) s
       ON CONFLICT DO NOTHING`,
      [row.id, h.rows, h.seatsPerRow],
    );
    hallIds.push(row.id);
  }

  // Next 7 days: each hall runs 3 shows a day (14:00, 17:30, 21:00 UTC), rotating movies.
  let i = 0;
  for (let day = 1; day <= 7; day++) {
    for (const hallId of hallIds) {
      for (const [hh, mm] of [[14, 0], [17, 30], [21, 0]]) {
        const start = new Date();
        start.setUTCDate(start.getUTCDate() + day);
        start.setUTCHours(hh, mm, 0, 0);
        const movie = movieIds[i++ % movieIds.length];
        const end = new Date(start.getTime() + movie.duration * 60_000);
        await db.query(
          `INSERT INTO showtimes (movie_id, hall_id, starts_at, ends_at, price_cents)
           VALUES ($1, $2, $3, $4, $5)`,
          [movie.id, hallId, start, end, hh >= 21 ? 1400 : 1200],
        );
      }
    }
  }
  console.log(`seeded ${movies.length} movies, ${halls.length} halls, ${i} showtimes`);
});

console.log(`admin: ${ADMIN_EMAIL}`);
await pool.end();
