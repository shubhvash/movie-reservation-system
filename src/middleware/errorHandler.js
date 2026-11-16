import { HttpError } from '../errors.js';

// Map Postgres constraint violations to sensible HTTP responses.
const PG_ERRORS = {
  '23505': [409, 'Resource already exists'], // unique_violation
  '23P01': [409, 'Conflicts with an existing record'], // exclusion_violation
  '23503': [409, 'Referenced resource is missing or still in use'], // foreign_key_violation
  '23514': [400, 'Value violates a constraint'], // check_violation
  '22P02': [400, 'Invalid input'], // invalid_text_representation
};

export function errorHandler(err, _req, res, _next) {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details });
  }
  if (err.type === 'entity.parse.failed') {
    return res.status(400).json({ error: 'Malformed JSON body' });
  }
  const mapped = PG_ERRORS[err.code];
  if (mapped) return res.status(mapped[0]).json({ error: mapped[1], constraint: err.constraint });

  console.error(err);
  res.status(500).json({ error: 'Internal server error' });
}
