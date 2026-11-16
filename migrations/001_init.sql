CREATE EXTENSION IF NOT EXISTS btree_gist;

CREATE TABLE users (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL DEFAULT 'user' CHECK (role IN ('user', 'admin')),
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE genres (
  id   SERIAL PRIMARY KEY,
  name TEXT NOT NULL UNIQUE
);

CREATE TABLE movies (
  id               SERIAL PRIMARY KEY,
  title            TEXT NOT NULL,
  description      TEXT NOT NULL DEFAULT '',
  poster_url       TEXT,
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes > 0),
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE movie_genres (
  movie_id INTEGER NOT NULL REFERENCES movies(id) ON DELETE CASCADE,
  genre_id INTEGER NOT NULL REFERENCES genres(id) ON DELETE CASCADE,
  PRIMARY KEY (movie_id, genre_id)
);

-- A physical auditorium with a fixed seat map.
CREATE TABLE halls (
  id            SERIAL PRIMARY KEY,
  name          TEXT NOT NULL UNIQUE,
  rows          INTEGER NOT NULL CHECK (rows BETWEEN 1 AND 26),
  seats_per_row INTEGER NOT NULL CHECK (seats_per_row BETWEEN 1 AND 100)
);

CREATE TABLE seats (
  id          SERIAL PRIMARY KEY,
  hall_id     INTEGER NOT NULL REFERENCES halls(id) ON DELETE CASCADE,
  row_label   TEXT NOT NULL,
  seat_number INTEGER NOT NULL,
  UNIQUE (hall_id, row_label, seat_number)
);

CREATE TABLE showtimes (
  id          SERIAL PRIMARY KEY,
  movie_id    INTEGER NOT NULL REFERENCES movies(id) ON DELETE RESTRICT,
  hall_id     INTEGER NOT NULL REFERENCES halls(id) ON DELETE RESTRICT,
  starts_at   TIMESTAMPTZ NOT NULL,
  ends_at     TIMESTAMPTZ NOT NULL,
  price_cents INTEGER NOT NULL CHECK (price_cents >= 0),
  CHECK (ends_at > starts_at),
  -- A hall can't run two showtimes at once.
  CONSTRAINT showtimes_no_overlap EXCLUDE USING gist (
    hall_id WITH =,
    tstzrange(starts_at, ends_at) WITH &&
  )
);
CREATE INDEX showtimes_starts_at_idx ON showtimes (starts_at);
CREATE INDEX showtimes_movie_idx ON showtimes (movie_id);

CREATE TABLE reservations (
  id           SERIAL PRIMARY KEY,
  user_id      INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  showtime_id  INTEGER NOT NULL REFERENCES showtimes(id) ON DELETE RESTRICT,
  status       TEXT NOT NULL DEFAULT 'confirmed' CHECK (status IN ('confirmed', 'cancelled')),
  total_cents  INTEGER NOT NULL CHECK (total_cents >= 0),
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  cancelled_at TIMESTAMPTZ
);
CREATE INDEX reservations_user_idx ON reservations (user_id);
CREATE INDEX reservations_showtime_idx ON reservations (showtime_id);

CREATE TABLE reservation_seats (
  reservation_id INTEGER NOT NULL REFERENCES reservations(id) ON DELETE CASCADE,
  showtime_id    INTEGER NOT NULL REFERENCES showtimes(id) ON DELETE RESTRICT,
  seat_id        INTEGER NOT NULL REFERENCES seats(id) ON DELETE RESTRICT,
  price_cents    INTEGER NOT NULL,
  active         BOOLEAN NOT NULL DEFAULT true,
  PRIMARY KEY (reservation_id, seat_id)
);
-- The overbooking guard: one active booking per seat per showtime,
-- enforced by the database so concurrent requests can't both succeed.
CREATE UNIQUE INDEX reservation_seats_one_active_per_seat
  ON reservation_seats (showtime_id, seat_id) WHERE active;
