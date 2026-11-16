import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { pool } from '../src/db.js';
import { api, createFixture, createUser, inHours, resetDb } from './helpers.js';

describe('movie reservation API', () => {
  before(resetDb);
  after(() => pool.end());

  describe('auth', () => {
    test('signup creates a regular user and returns a token', async () => {
      const res = await api()
        .post('/auth/signup')
        .send({ name: 'Ann', email: 'Ann@Example.com', password: 'password123' });
      assert.equal(res.status, 201);
      assert.equal(res.body.user.role, 'user');
      assert.equal(res.body.user.email, 'ann@example.com');
      assert.equal(res.body.user.password_hash, undefined);
      const me = await api().get('/auth/me').set('Authorization', `Bearer ${res.body.token}`);
      assert.equal(me.body.user.email, 'ann@example.com');
    });

    test('duplicate email is rejected', async () => {
      const res = await api()
        .post('/auth/signup')
        .send({ name: 'Ann', email: 'ann@example.com', password: 'password123' });
      assert.equal(res.status, 409);
    });

    test('login checks password', async () => {
      assert.equal(
        (await api().post('/auth/login').send({ email: 'ann@example.com', password: 'wrongpass' })).status,
        401,
      );
      assert.equal(
        (await api().post('/auth/login').send({ email: 'ann@example.com', password: 'password123' })).status,
        200,
      );
    });

    test('validation errors and missing token', async () => {
      assert.equal((await api().post('/auth/signup').send({ email: 'x' })).status, 400);
      assert.equal((await api().get('/auth/me')).status, 401);
      assert.equal((await api().get('/auth/me').set('Authorization', 'Bearer junk')).status, 401);
    });
  });

  describe('roles', () => {
    test('regular users cannot use admin endpoints', async () => {
      const user = await createUser();
      assert.equal(
        (await api().post('/movies').set(user.auth).send({ title: 'X', durationMinutes: 90 })).status,
        403,
      );
      assert.equal((await api().get('/admin/reports').set(user.auth)).status, 403);
      assert.equal((await api().get('/users').set(user.auth)).status, 403);
    });

    test('admin can promote a user to admin', async () => {
      const admin = await createUser({ role: 'admin' });
      const user = await createUser();
      const res = await api().patch(`/users/${user.user.id}/role`).set(admin.auth).send({ role: 'admin' });
      assert.equal(res.status, 200);
      assert.equal(res.body.user.role, 'admin');
      // Takes effect on the existing token immediately.
      assert.equal((await api().get('/admin/reports').set(user.auth)).status, 200);
    });
  });

  describe('movies and showtimes', () => {
    test('admin CRUD on movies with genres', async () => {
      const admin = await createUser({ role: 'admin' });
      const genre = (await api().post('/genres').set(admin.auth).send({ name: 'Horror' })).body.genre;
      const created = await api()
        .post('/movies')
        .set(admin.auth)
        .send({
          title: 'Night Shift',
          description: 'Spooky',
          durationMinutes: 100,
          posterUrl: 'https://img.test/p.jpg',
          genreIds: [genre.id],
        });
      assert.equal(created.status, 201);
      assert.deepEqual(created.body.movie.genres, [{ id: genre.id, name: 'Horror' }]);

      const id = created.body.movie.id;
      const updated = await api()
        .patch(`/movies/${id}`)
        .set(admin.auth)
        .send({ title: 'Night Shift 2', posterUrl: null });
      assert.equal(updated.body.movie.title, 'Night Shift 2');
      assert.equal(updated.body.movie.posterUrl, null);
      assert.equal(updated.body.movie.description, 'Spooky');

      const byGenre = await api().get(`/movies?genreId=${genre.id}`);
      assert.equal(byGenre.body.movies.length, 1);

      assert.equal((await api().delete(`/movies/${id}`).set(admin.auth)).status, 204);
      assert.equal((await api().get(`/movies/${id}`)).status, 404);
    });

    test('showtimes in the same hall cannot overlap', async () => {
      const admin = await createUser({ role: 'admin' });
      const { movie, hall, showtime } = await createFixture(admin, { hours: 48 });
      const overlap = await api()
        .post('/showtimes')
        .set(admin.auth)
        .send({
          movieId: movie.id,
          hallId: hall.id,
          startsAt: inHours(48.5),
          priceCents: 1000,
        });
      assert.equal(overlap.status, 409);
      const later = await api()
        .post('/showtimes')
        .set(admin.auth)
        .send({
          movieId: movie.id,
          hallId: hall.id,
          startsAt: inHours(52),
          priceCents: 1000,
        });
      assert.equal(later.status, 201);
      assert.equal(showtime.capacity, 6);
      assert.equal(showtime.availableSeats, 6);
    });

    test('list showtimes and movies by date', async () => {
      const admin = await createUser({ role: 'admin' });
      const { showtime, movie } = await createFixture(admin, { hours: 24 * 10 });
      const date = showtime.startsAt.slice(0, 10);
      const st = await api().get(`/showtimes?date=${date}`);
      assert.ok(st.body.showtimes.some((s) => s.id === showtime.id));
      const mv = await api().get(`/movies?date=${date}`);
      assert.ok(mv.body.movies.some((m) => m.id === movie.id));
      assert.equal((await api().get('/showtimes?date=nope')).status, 400);
    });

    test('cannot schedule in the past', async () => {
      const admin = await createUser({ role: 'admin' });
      const { movie, hall } = await createFixture(admin);
      const res = await api()
        .post('/showtimes')
        .set(admin.auth)
        .send({ movieId: movie.id, hallId: hall.id, startsAt: inHours(-1), priceCents: 100 });
      assert.equal(res.status, 400);
    });
  });

  describe('reservations', () => {
    test('reserve, view seat map, list, and cancel', async () => {
      const admin = await createUser({ role: 'admin' });
      const user = await createUser();
      const { showtime, seats } = await createFixture(admin, { priceCents: 1250 });

      const res = await api()
        .post('/reservations')
        .set(user.auth)
        .send({ showtimeId: showtime.id, seatIds: [seats[0].id, seats[1].id] });
      assert.equal(res.status, 201);
      assert.equal(res.body.reservation.totalCents, 2500);
      assert.equal(res.body.reservation.seats.length, 2);

      const map = (await api().get(`/showtimes/${showtime.id}/seats`)).body;
      assert.equal(map.showtime.availableSeats, 4);
      assert.equal(map.seats.filter((s) => !s.available).length, 2);

      const mine = (await api().get('/reservations').set(user.auth)).body.reservations;
      assert.equal(mine.length, 1);

      const cancel = await api().post(`/reservations/${res.body.reservation.id}/cancel`).set(user.auth);
      assert.equal(cancel.status, 200);
      assert.equal(cancel.body.reservation.status, 'cancelled');
      assert.equal(
        (await api().post(`/reservations/${res.body.reservation.id}/cancel`).set(user.auth)).status,
        409,
      );

      // Seats are released and bookable again.
      const again = await api()
        .post('/reservations')
        .set(user.auth)
        .send({ showtimeId: showtime.id, seatIds: [seats[0].id] });
      assert.equal(again.status, 201);
      assert.equal((await api().get('/reservations').set(user.auth)).body.reservations.length, 1);
    });

    test('cannot double-book a seat', async () => {
      const admin = await createUser({ role: 'admin' });
      const [a, b] = [await createUser(), await createUser()];
      const { showtime, seats } = await createFixture(admin);
      assert.equal(
        (
          await api()
            .post('/reservations')
            .set(a.auth)
            .send({ showtimeId: showtime.id, seatIds: [seats[0].id] })
        ).status,
        201,
      );
      const res = await api()
        .post('/reservations')
        .set(b.auth)
        .send({ showtimeId: showtime.id, seatIds: [seats[0].id, seats[1].id] });
      assert.equal(res.status, 409);
      assert.deepEqual(res.body.details.unavailableSeatIds, [seats[0].id]);
      // All-or-nothing: seat 1 was not booked.
      const map = (await api().get(`/showtimes/${showtime.id}/seats`)).body;
      assert.equal(map.showtime.availableSeats, 5);
    });

    test('concurrent requests for the same seat: exactly one wins', async () => {
      const admin = await createUser({ role: 'admin' });
      const users = await Promise.all(Array.from({ length: 10 }, () => createUser()));
      const { showtime, seats } = await createFixture(admin);
      const results = await Promise.all(
        users.map((u) =>
          api()
            .post('/reservations')
            .set(u.auth)
            .send({ showtimeId: showtime.id, seatIds: [seats[2].id] }),
        ),
      );
      const statuses = results.map((r) => r.status);
      assert.equal(statuses.filter((s) => s === 201).length, 1, `got ${statuses}`);
      assert.equal(statuses.filter((s) => s === 409).length, 9);
    });

    test('rejects seats from another hall and past showtimes', async () => {
      const admin = await createUser({ role: 'admin' });
      const user = await createUser();
      const f1 = await createFixture(admin);
      const f2 = await createFixture(admin);
      const res = await api()
        .post('/reservations')
        .set(user.auth)
        .send({ showtimeId: f1.showtime.id, seatIds: [f2.seats[0].id] });
      assert.equal(res.status, 400);

      await pool.query(
        `UPDATE showtimes SET starts_at = now() - interval '1 hour', ends_at = now()
                      WHERE id = $1`,
        [f1.showtime.id],
      );
      const past = await api()
        .post('/reservations')
        .set(user.auth)
        .send({ showtimeId: f1.showtime.id, seatIds: [f1.seats[0].id] });
      assert.equal(past.status, 400);
    });

    test("users cannot see or cancel others' reservations; cannot cancel past ones", async () => {
      const admin = await createUser({ role: 'admin' });
      const [a, b] = [await createUser(), await createUser()];
      const { showtime, seats } = await createFixture(admin);
      const r = (
        await api()
          .post('/reservations')
          .set(a.auth)
          .send({ showtimeId: showtime.id, seatIds: [seats[0].id] })
      ).body.reservation;
      assert.equal((await api().get(`/reservations/${r.id}`).set(b.auth)).status, 404);
      assert.equal((await api().post(`/reservations/${r.id}/cancel`).set(b.auth)).status, 404);

      await pool.query(
        `UPDATE showtimes SET starts_at = now() - interval '1 hour', ends_at = now()
                      WHERE id = $1`,
        [showtime.id],
      );
      assert.equal((await api().post(`/reservations/${r.id}/cancel`).set(a.auth)).status, 403);
      const past = (await api().get('/reservations?scope=past').set(a.auth)).body.reservations;
      assert.equal(past.length, 1);
    });

    test('showtime with active reservations cannot change hall or be deleted', async () => {
      const admin = await createUser({ role: 'admin' });
      const user = await createUser();
      const f = await createFixture(admin);
      const other = await createFixture(admin);
      await api()
        .post('/reservations')
        .set(user.auth)
        .send({ showtimeId: f.showtime.id, seatIds: [f.seats[0].id] });
      assert.equal(
        (await api().patch(`/showtimes/${f.showtime.id}`).set(admin.auth).send({ hallId: other.hall.id }))
          .status,
        409,
      );
      assert.equal((await api().delete(`/showtimes/${f.showtime.id}`).set(admin.auth)).status, 409);
      // Price changes are fine and don't alter existing reservations.
      assert.equal(
        (await api().patch(`/showtimes/${f.showtime.id}`).set(admin.auth).send({ priceCents: 5000 })).status,
        200,
      );
    });
  });

  describe('admin reporting', () => {
    test('reports capacity, occupancy and revenue, excluding cancellations', async () => {
      await resetDb();
      const admin = await createUser({ role: 'admin' });
      const user = await createUser();
      const { showtime, seats, movie } = await createFixture(admin, {
        rows: 2,
        seatsPerRow: 5,
        priceCents: 1000,
      });
      await api()
        .post('/reservations')
        .set(user.auth)
        .send({ showtimeId: showtime.id, seatIds: [seats[0].id, seats[1].id, seats[2].id] });
      const cancelled = (
        await api()
          .post('/reservations')
          .set(user.auth)
          .send({ showtimeId: showtime.id, seatIds: [seats[3].id] })
      ).body.reservation;
      await api().post(`/reservations/${cancelled.id}/cancel`).set(user.auth);

      const report = (await api().get('/admin/reports').set(admin.auth)).body;
      assert.deepEqual(report.totals, {
        showtimes: 1,
        capacity: 10,
        seatsSold: 3,
        revenueCents: 3000,
        occupancyPct: 30,
        reservations: { confirmed: 1, cancelled: 1 },
      });
      assert.equal(report.movies[0].movieId, movie.id);
      assert.equal(report.showtimes[0].occupancyPct, 30);

      const all = (await api().get('/admin/reservations').set(admin.auth)).body.reservations;
      assert.equal(all.length, 2);
      const onlyCancelled = (await api().get('/admin/reservations?status=cancelled').set(admin.auth)).body;
      assert.equal(onlyCancelled.reservations.length, 1);
    });
  });
});
