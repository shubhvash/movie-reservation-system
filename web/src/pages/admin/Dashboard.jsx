import { useState } from 'react';
import { api } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { formatDateTime, formatMoney } from '../../format.js';
import { Alert, Field, Loading } from '../../components/ui.jsx';

const toIso = (d, endOfDay) => (d ? new Date(`${d}T${endOfDay ? '23:59:59.999' : '00:00:00'}`).toISOString() : undefined);

const Occupancy = ({ pct }) => (
  <div className="occ"><div className="occ-bar"><div style={{ width: `${Math.min(pct, 100)}%` }} /></div><span>{pct}%</span></div>
);

export default function Dashboard() {
  const [range, setRange] = useState({ from: '', to: '' });
  const { data, error, loading } = useAsync(
    () => api('/admin/reports', { query: { from: toIso(range.from), to: toIso(range.to, true) } }),
    [range.from, range.to],
  );

  return (
    <>
      <div className="page-head">
        <h1>Dashboard</h1>
        <div className="inline-form">
          <Field label="From"><input type="date" value={range.from} onChange={(e) => setRange({ ...range, from: e.target.value })} /></Field>
          <Field label="To"><input type="date" value={range.to} onChange={(e) => setRange({ ...range, to: e.target.value })} /></Field>
        </div>
      </div>
      <Alert>{error}</Alert>
      {loading || !data ? <Loading /> : (
        <>
          <div className="stats">
            <div className="stat"><span>Revenue</span><strong>{formatMoney(data.totals.revenueCents)}</strong></div>
            <div className="stat"><span>Seats sold</span><strong>{data.totals.seatsSold.toLocaleString()}</strong><small>of {data.totals.capacity.toLocaleString()} capacity</small></div>
            <div className="stat"><span>Occupancy</span><strong>{data.totals.occupancyPct}%</strong></div>
            <div className="stat"><span>Reservations</span><strong>{data.totals.reservations.confirmed}</strong><small>{data.totals.reservations.cancelled} cancelled</small></div>
            <div className="stat"><span>Showtimes</span><strong>{data.totals.showtimes}</strong></div>
          </div>

          <h2>By movie</h2>
          <table className="table">
            <thead><tr><th>Movie</th><th className="num">Showtimes</th><th className="num">Seats sold</th><th>Occupancy</th><th className="num">Revenue</th></tr></thead>
            <tbody>
              {data.movies.map((m) => (
                <tr key={m.movieId}>
                  <td>{m.movieTitle}</td><td className="num">{m.showtimes}</td>
                  <td className="num">{m.seatsSold} / {m.capacity}</td><td><Occupancy pct={m.occupancyPct} /></td>
                  <td className="num">{formatMoney(m.revenueCents)}</td>
                </tr>
              ))}
              {!data.movies.length && <tr><td colSpan={5} className="muted">No data in this range.</td></tr>}
            </tbody>
          </table>

          <h2>By showtime</h2>
          <table className="table">
            <thead><tr><th>When</th><th>Movie</th><th>Hall</th><th className="num">Sold</th><th>Occupancy</th><th className="num">Revenue</th></tr></thead>
            <tbody>
              {data.showtimes.map((s) => (
                <tr key={s.showtimeId}>
                  <td>{formatDateTime(s.startsAt)}</td><td>{s.movieTitle}</td><td>{s.hall}</td>
                  <td className="num">{s.seatsSold} / {s.capacity}</td><td><Occupancy pct={s.occupancyPct} /></td>
                  <td className="num">{formatMoney(s.revenueCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </>
      )}
    </>
  );
}
