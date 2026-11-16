import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { formatDateTime, formatMoney } from '../../format.js';
import { Alert, Loading } from '../../components/ui.jsx';

export default function AdminReservations() {
  const [filters, setFilters] = useState({ status: '', movieId: '' });
  const [actionError, setActionError] = useState(null);
  const movies = useAsync(() => api('/movies', { query: { limit: 100 } }).then((d) => d.movies), []);
  const list = useAsync(
    () => api('/admin/reservations', { query: { ...filters, limit: 100 } }).then((d) => d.reservations),
    [filters.status, filters.movieId],
  );
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  const cancel = async (r) => {
    if (!window.confirm(`Cancel reservation #${r.id} for ${r.user.name}?`)) return;
    setActionError(null);
    try {
      await api(`/reservations/${r.id}/cancel`, { method: 'POST' });
      list.reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <>
      <h1>Reservations</h1>
      <div className="inline-form filters">
        <select value={filters.movieId} onChange={set('movieId')} aria-label="Filter by movie">
          <option value="">All movies</option>
          {movies.data?.map((m) => <option key={m.id} value={m.id}>{m.title}</option>)}
        </select>
        <select value={filters.status} onChange={set('status')} aria-label="Filter by status">
          <option value="">Any status</option>
          <option value="confirmed">Confirmed</option>
          <option value="cancelled">Cancelled</option>
        </select>
      </div>
      <Alert>{list.error || actionError}</Alert>
      {list.loading ? <Loading /> : (
        <table className="table">
          <thead><tr><th>#</th><th>Customer</th><th>Movie</th><th>Showtime</th><th>Seats</th><th className="num">Total</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {list.data.map((r) => (
              <tr key={r.id}>
                <td>{r.id}</td>
                <td>{r.user.name}<div className="muted small">{r.user.email}</div></td>
                <td>{r.showtime.movie.title}</td>
                <td>{formatDateTime(r.showtime.startsAt)}<div className="muted small">{r.showtime.hall.name}</div></td>
                <td>{r.seats.map((s) => `${s.row}${s.number}`).join(', ')}</td>
                <td className="num">{formatMoney(r.totalCents)}</td>
                <td><span className={`badge ${r.status}`}>{r.status}</span></td>
                <td>
                  {r.status === 'confirmed' && new Date(r.showtime.startsAt) > new Date() && (
                    <button className="btn ghost danger" onClick={() => cancel(r)}>Cancel</button>
                  )}
                </td>
              </tr>
            ))}
            {!list.data.length && <tr><td colSpan={8} className="muted">No reservations.</td></tr>}
          </tbody>
        </table>
      )}
    </>
  );
}
