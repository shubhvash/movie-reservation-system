import { createApp } from './app.js';
import { config } from './config.js';
import { pool } from './db.js';

const server = createApp().listen(config.port, () => {
  console.log(`Movie reservation API listening on http://localhost:${config.port}`);
});

function shutdown() {
  server.close(() => pool.end().finally(() => process.exit(0)));
  // Idle keep-alive sockets would otherwise hold close() open indefinitely.
  server.closeIdleConnections();
  setTimeout(() => process.exit(1), 5000).unref();
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
