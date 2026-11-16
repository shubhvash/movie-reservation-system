import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { formatDateTime, formatMoney, localInputToIso } from '../../format.js';
import { Alert, Field, Loading } from '../../components/ui.jsx';

// datetime-local value for an ISO timestamp, in the browser's timezone.
const toLocalInput = (iso) => {
  const d = new Date(iso);
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 16);
};

const EMPTY = { movieId: '', hallId: '', startsAt: '', price: '12.00' };

export default function AdminShowtimes() {
  const [filters, setFilters] = useState({ movieId: '', includePast: false });
  const showtimes = useAsync(
    () => api('/showtimes', { query: { movieId: filters.movieId, includePast: String(filters.includePast), limit: 100 } })
      .then((d) => d.showtimes),
    [filters.movieId, filters.includePast],
  );
  const options = useAsync(
    () => Promise.all([api('/movies', { query: { limit: 100 } }), api('/halls')])
      .then(([m, h]) => ({ movies: m.movies, halls: h.halls })),
    [],
  );
  const [editing, setEditing] = useState(null); // null | 'new' | id
  const [form, setForm] = useState(EMPTY);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = (s) => {
    setError(null);
    setEditing(s ? s.id : 'new');
    setForm(s ? {
      movieId: String(s.movie.id), hallId: String(s.hall.id), startsAt: toLocalInput(s.startsAt),
      price: (s.priceCents / 100).toFixed(2),
    } : EMPTY);
  };
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const body = {
        movieId: Number(form.movieId), hallId: Number(form.hallId),
        startsAt: localInputToIso(form.startsAt), priceCents: Math.round(Number(form.price) * 100),
      };
      if (editing === 'new') await api('/showtimes', { method: 'POST', body });
      else await api(`/showtimes/${editing}`, { method: 'PATCH', body });
      setEditing(null);
      showtimes.reload();
    });
  };

  const remove = (s) => {
    if (!window.confirm(`Delete the ${formatDateTime(s.startsAt)} showing of "${s.movie.title}"?`)) return;
    run(async () => { await api(`/showtimes/${s.id}`, { method: 'DELETE' }); showtimes.reload(); });
  };

  const movies = options.data?.movies || [];
  const halls = options.data?.halls || [];

  return (
    <>
      <div className="page-head">
        <h1>Showtimes</h1>
        <button className="btn" onClick={() => open(null)} disabled={!movies.length || !halls.length}>+ Schedule showtime</button>
      </div>
      <Alert>{!editing && error}</Alert>

      {editing && (
        <form className="card stack" onSubmit={save}>
          <h2>{editing === 'new' ? 'Schedule a showtime' : 'Edit showtime'}</h2>
          <div className="grid-2">
            <Field label="Movie">
              <select required value={form.movieId} onChange={set('movieId')}>
                <option value="">Select…</option>
                {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
              </select>
            </Field>
            <Field label="Hall">
              <select required value={form.hallId} onChange={set('hallId')}>
                <option value="">Select…</option>
                {halls.map((h) => <option key={h.id} value={h.id}>{h.name} ({h.capacity} seats)</option>)}
              </select>
            </Field>
            <Field label="Starts at" hint="End time is computed from the movie's duration">
              <input type="datetime-local" required value={form.startsAt} onChange={set('startsAt')} />
            </Field>
            <Field label="Price per seat ($)">
              <input type="number" min="0" step="0.01" required value={form.price} onChange={set('price')} />
            </Field>
          </div>
          <Alert>{error}</Alert>
          <div className="actions">
            <button className="btn" disabled={busy}>Save</button>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      <div className="inline-form filters">
        <select value={filters.movieId} onChange={(e) => setFilters({ ...filters, movieId: e.target.value })} aria-label="Filter by movie">
          <option value="">All movies</option>
          {movies.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <label className="check">
          <input type="checkbox" checked={filters.includePast} onChange={(e) => setFilters({ ...filters, includePast: e.target.checked })} /> Include past
        </label>
      </div>

      {showtimes.loading ? <Loading /> : (
        <table className="table">
          <thead><tr><th>When</th><th>Movie</th><th>Hall</th><th className="num">Price</th><th className="num">Available</th><th></th></tr></thead>
          <tbody>
            {showtimes.data.map((s) => (
              <tr key={s.id}>
                <td>{formatDateTime(s.startsAt)}</td>
                <td><Link to={`/showtimes/${s.id}`}>{s.movie.title}</Link></td>
                <td>{s.hall.name}</td>
                <td className="num">{formatMoney(s.priceCents)}</td>
                <td className="num">{s.availableSeats} / {s.capacity}</td>
                <td className="actions">
                  <button className="btn ghost" onClick={() => open(s)}>Edit</button>
                  <button className="btn ghost danger" onClick={() => remove(s)}>Delete</button>
                </td>
              </tr>
            ))}
            {!showtimes.data.length && <tr><td colSpan={6} className="muted">No showtimes.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
