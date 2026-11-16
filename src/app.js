import express from 'express';
import authRoutes from './routes/auth.js';
import userRoutes from './routes/users.js';
import genreRoutes from './routes/genres.js';
import movieRoutes from './routes/movies.js';
import hallRoutes from './routes/halls.js';
import showtimeRoutes from './routes/showtimes.js';
import reservationRoutes from './routes/reservations.js';
import adminRoutes from './routes/admin.js';
import { errorHandler } from './middleware/errorHandler.js';

export function createApp() {
  const app = express();
  app.use(express.json({ limit: '100kb' }));

  app.get('/health', (_req, res) => res.json({ status: 'ok' }));
  app.use('/auth', authRoutes);
  app.use('/users', userRoutes);
  app.use('/genres', genreRoutes);
  app.use('/movies', movieRoutes);
  app.use('/halls', hallRoutes);
  app.use('/showtimes', showtimeRoutes);
  app.use('/reservations', reservationRoutes);
  app.use('/admin', adminRoutes);

  app.use((_req, res) => res.status(404).json({ error: 'Route not found' }));
  app.use(errorHandler);
  return app;
}
