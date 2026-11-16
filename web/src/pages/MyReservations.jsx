import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import { useAsync } from '../hooks.js';
import { formatDateTime, formatMoney } from '../format.js';
import { Alert, Loading } from '../components/ui.jsx';

const TABS = [
  { key: 'upcoming', label: 'Upcoming', query: { scope: 'upcoming' } },
  { key: 'past', label: 'Past', query: { scope: 'past' } },
  { key: 'all', label: 'All (incl. cancelled)', query: { scope: 'all', includeCancelled: 'true' } },
];

export default function MyReservations() {
  const [tab, setTab] = useState('upcoming');
  const [actionError, setActionError] = useState(null);
  const justBooked = useLocation().state?.booked;
  const current = TABS.find((t) => t.key === tab);
  const { data, error, loading, reload } = useAsync(
    () => api('/reservations', { query: { ...current.query, limit: 100 } }).then((d) => d.reservations),
    [tab],
  );

  const cancel = async (r) => {
    if (!window.confirm(`Cancel your ${r.seats.length} seat(s) for ${r.showtime.movie.title}?`)) return;
    setActionError(null);
    try {
      await api(`/reservations/${r.id}/cancel`, { method: 'POST' });
      reload();
    } catch (err) {
      setActionError(errorMessage(err));
    }
  };

  return (
    <>
      <h1>My tickets</h1>
      {justBooked && <Alert kind="success">Booking confirmed! Enjoy the show.</Alert>}
      <div className="tabs">
        {TABS.map((t) => (
          <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)}>{t.label}</button>
        ))}
      </div>
      <Alert>{error || actionError}</Alert>
      {loading ? <Loading /> : data.length === 0 ? (
        <p className="empty">No reservations here. <Link to="/">Find a movie →</Link></p>
      ) : (
        <div className="ticket-list">
          {data.map((r) => {
            const upcoming = new Date(r.showtime.startsAt) > new Date();
            return (
              <article key={r.id} className={`card ticket ${r.status}`}>
                <div>
                  <h2>{r.showtime.movie.title}</h2>
                  <p>{formatDateTime(r.showtime.startsAt)} · {r.showtime.hall.name}</p>
                  <p className="muted">Seats {r.seats.map((s) => `${s.row}${s.number}`).join(', ')} · {formatMoney(r.totalCents)}</p>
                </div>
                <div className="ticket-side">
                  <span className={`badge ${r.status}`}>{r.status}</span>
                  <small className="muted">#{r.id}</small>
                  {r.status === 'confirmed' && upcoming && (
                    <button className="btn ghost danger" onClick={() => cancel(r)}>Cancel</button>
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </>
  );
}
