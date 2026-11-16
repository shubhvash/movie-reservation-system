import 'dotenv/config';

const env = process.env.NODE_ENV || 'development';

export const config = {
  env,
  port: Number(process.env.PORT || 3000),
  databaseUrl:
    env === 'test'
      ? process.env.TEST_DATABASE_URL || 'postgres://localhost:5432/movie_reservation_test'
      : process.env.DATABASE_URL || 'postgres://localhost:5432/movie_reservation',
  jwtSecret: process.env.JWT_SECRET || (env === 'production' ? null : 'dev-insecure-secret'),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '1d',
  // Timezone used to interpret "date" query params (e.g. showtimes on 2026-11-20).
  timezone: process.env.APP_TIMEZONE || 'UTC',
  maxSeatsPerReservation: Number(process.env.MAX_SEATS_PER_RESERVATION || 10),
};

if (!config.jwtSecret) throw new Error('JWT_SECRET must be set in production');
