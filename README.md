# Movie Reservation System

**Stack:** Node.js (18+), Express 5, PostgreSQL 16, JWT auth, Zod validation, `node:test` + Supertest.

## Features

- **Auth & roles** — signup/login with JWT. New users are `user`s. The seed script creates the first `admin`, and admins can promote other users.
- **Movies** — admins create, update and delete movies (title, description, poster URL, duration, genres). Anyone can browse them, filtered by genre, title search, or "has showtimes on date X".
- **Halls & seats** — creating a hall generates its seat map (rows A–Z × seats 1–N).
- **Showtimes** — admins schedule a movie in a hall. The end time comes from the movie's duration, and the database **rejects overlapping showtimes in the same hall**.
- **Reservations** — users view a showtime's seat map, reserve one or more seats in a single all-or-nothing booking, list upcoming or past reservations, and cancel upcoming ones. Cancelled seats are freed right away.
- **No overbooking** — a partial unique index on `(showtime_id, seat_id) WHERE active` lets only one active booking hold a seat. The database enforces this, so it holds up under concurrent requests (see the race test).
- **Admin reporting** — all reservations, with filters; capacity, seats sold, occupancy % and revenue, overall, per movie and per showtime.

## Getting started

```bash
cp .env.example .env            # adjust DATABASE_URL / JWT_SECRET
docker compose up -d            # or use a local Postgres: createdb movie_reservation movie_reservation_test
npm install
npm run migrate
npm run seed                    # admin@example.com / admin12345 + sample movies, halls, 7 days of showtimes
npm run dev                     # http://localhost:3000
npm test                        # runs against TEST_DATABASE_URL (wiped on each run)
```

With docker compose, set `DATABASE_URL=postgres://postgres:postgres@localhost:5432/movie_reservation` (and the matching test URL).

## Frontend (`web/`)

A React app (Vite + React Router, plain CSS) for both customers and admins.

```bash
cd web && npm install && npm run dev   # http://localhost:5173, proxies /api -> localhost:3000
```

- **Customers:** browse showtimes by day (in the browser's timezone) and genre, open a movie's page, pick seats on a live seat map, book, and view or cancel tickets.
- **Admins** (`/admin`): revenue, occupancy and capacity dashboard with a date filter; manage movies (with genres and posters), showtimes, halls, reservations and user roles.
- To point at a different API, set `API_URL` for the dev proxy, or `VITE_API_URL` for a production build (the API must then allow CORS).

## Data model

```
users ─< reservations >─ showtimes >─ movies >─< genres
              │              │
              └─< reservation_seats >─ seats >─ halls
```

- `showtimes` has an `EXCLUDE USING gist` constraint, so showtimes in the same hall can't overlap in time.
- `reservation_seats` stores the price paid per seat, so changing a showtime's price doesn't change past revenue.
- Cancellation sets `reservations.status = 'cancelled'` and `reservation_seats.active = false`. History is kept, and the seat becomes bookable again.

## API

Send `Authorization: Bearer <token>` on authenticated routes. 🔒 = needs login, 👑 = needs admin. Money is in integer cents. Timestamps are ISO-8601. `date` params are `YYYY-MM-DD`, read in `APP_TIMEZONE`.

| Method | Path | Description |
|---|---|---|
| POST | `/auth/signup` | `{name, email, password}` → `{user, token}` |
| POST | `/auth/login` | `{email, password}` → `{user, token}` |
| GET | `/auth/me` 🔒 | Current user |
| GET | `/users` 👑 | List users |
| PATCH | `/users/:id/role` 👑 | `{role: "admin" \| "user"}` |
| GET | `/genres` | List genres |
| POST / DELETE | `/genres`, `/genres/:id` 👑 | `{name}` |
| GET | `/movies?genreId=&date=&q=&limit=&offset=` | Browse movies |
| GET | `/movies/:id` | Movie details |
| POST | `/movies` 👑 | `{title, description?, posterUrl?, durationMinutes, genreIds?}` |
| PATCH / DELETE | `/movies/:id` 👑 | Partial update / delete (409 if it has showtimes) |
| GET / POST | `/halls` (POST 👑) | `{name, rows, seatsPerRow}` |
| GET | `/showtimes?date=&movieId=&hallId=&includePast=` | Showtimes with `availableSeats` |
| GET | `/showtimes/:id/seats` | Seat map with `available` flags |
| POST | `/showtimes` 👑 | `{movieId, hallId, startsAt, priceCents}` (409 on overlap) |
| PATCH / DELETE | `/showtimes/:id` 👑 | Can't change hall/movie or delete once it has reservations |
| POST | `/reservations` 🔒 | `{showtimeId, seatIds: [..]}` → 409 if any seat is taken |
| GET | `/reservations?scope=upcoming\|past\|all&includeCancelled=` 🔒 | My reservations |
| GET | `/reservations/:id` 🔒 | Owner or admin |
| POST | `/reservations/:id/cancel` 🔒 | Upcoming only |
| GET | `/admin/reservations?showtimeId=&movieId=&userId=&status=&from=&to=` 👑 | All reservations |
| GET | `/admin/reports?from=&to=&movieId=` 👑 | Capacity / occupancy / revenue |

Errors look like `{ "error": "message", "details": ... }`, with status 400, 401, 403, 404 or 409.

### Example

```bash
TOKEN=$(curl -s -XPOST localhost:3000/auth/signup -H 'content-type: application/json' \
  -d '{"name":"Ann","email":"ann@example.com","password":"password123"}' | jq -r .token)
curl -s "localhost:3000/showtimes?date=$(date -u -v+1d +%F)" | jq '.showtimes[] | {id, movie: .movie.title, startsAt, availableSeats}'
curl -s localhost:3000/showtimes/1/seats | jq '[.seats[] | select(.available)][:3]'
curl -s -XPOST localhost:3000/reservations -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' -d '{"showtimeId":1,"seatIds":[1,2]}' | jq
```
