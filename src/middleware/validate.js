import { badRequest } from '../errors.js';

/** Parse req[source] with a zod schema; replaces it with the parsed value on req.valid[source]. */
export const validate = (schema, source = 'body') => (req, _res, next) => {
  const result = schema.safeParse(req[source] ?? {});
  if (!result.success) {
    throw badRequest(
      'Validation failed',
      result.error.issues.map((i) => ({ path: i.path.join('.'), message: i.message })),
    );
  }
  req.valid = { ...req.valid, [source]: result.data };
  next();
};
