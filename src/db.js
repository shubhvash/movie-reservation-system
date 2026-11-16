import pg from 'pg';
import { config } from './config.js';

export const pool = new pg.Pool({
  connectionString: config.databaseUrl,
  // Keep timestamps rendered inside json_build_object consistent (UTC) regardless of server locale.
  options: '-c TimeZone=UTC',
});

export const query = (text, params) => pool.query(text, params);

/** Run fn inside a transaction, passing it a dedicated client. */
export async function withTransaction(fn) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}
