import request from 'supertest';
import bcrypt from 'bcryptjs';
import { createApp } from '../src/app.js';
import { pool } from '../src/db.js';
import { migrate } from '../scripts/migrate.js';

export const app = createApp();
export const api = () => request(app);

export async function resetDb() {
  await pool.query('DROP SCHEMA public CASCADE; CREATE SCHEMA public;');
  await migrate({ log: () => {} });
}

let n = 0;
export async function createUser({ role = 'user' } = {}) {
  const email = `user${++n}-${Date.now()}@test.dev`;
  const password = 'password123';
  if (role === 'admin') {
    await pool.query(
      `INSERT INTO users (name, email, password_hash, role) VALUES ('Admin', $1, $2, 'admin')`,
      [email, await bcrypt.hash(password, 4)],
    );
    const res = await api().post('/auth/login').send({ email, password });
    return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
  }
  const res = await api().post('/auth/signup').send({ name: 'User', email, password });
  return { ...res.body, auth: { Authorization: `Bearer ${res.body.token}` } };
}

export const inHours = (h) => new Date(Date.now() + h * 3600_000).toISOString();

/** Builds a movie + hall + showtime as admin. */
export async function createFixture(admin, { rows = 2, seatsPerRow = 3, priceCents = 1000, hours = 24 } = {}) {
  const movie = (await api().post('/movies').set(admin.auth)
    .send({ title: `Movie ${++n}`, durationMinutes: 90 })).body.movie;
  const hall = (await api().post('/halls').set(admin.auth)
    .send({ name: `Hall ${++n}`, rows, seatsPerRow })).body.hall;
  const showtime = (await api().post('/showtimes').set(admin.auth)
    .send({ movieId: movie.id, hallId: hall.id, startsAt: inHours(hours), priceCents })).body.showtime;
  const seats = (await api().get(`/showtimes/${showtime.id}/seats`)).body.seats;
  return { movie, hall, showtime, seats };
}
