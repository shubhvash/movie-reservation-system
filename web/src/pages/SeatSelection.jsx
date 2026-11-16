import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import { useAsync } from '../hooks.js';
import { formatDateTime, formatMoney } from '../format.js';
import { Alert, Loading } from '../components/ui.jsx';

const MAX_SEATS = 10;

export default function SeatSelection() {
  const { id } = useParams();
  const navigate = useNavigate();
  const { data, error, loading, reload } = useAsync(() => api(`/showtimes/${id}/seats`), [id]);
  const [selected, setSelected] = useState(new Set());
  const [bookError, setBookError] = useState(null);
  const [busy, setBusy] = useState(false);

  const rows = useMemo(() => {
    const m = new Map();
    for (const s of data?.seats || []) m.set(s.row, [...(m.get(s.row) || []), s]);
    return [...m.entries()];
  }, [data]);

  if (loading && !data) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  const { showtime } = data;
  const started = new Date(showtime.startsAt) <= new Date();
  const seatById = new Map(data.seats.map((s) => [s.id, s]));
  const selectedSeats = [...selected].map((sid) => seatById.get(sid)).filter(Boolean);

  const toggle = (seat) => {
    if (!seat.available || started) return;
    const next = new Set(selected);
    if (next.has(seat.id)) next.delete(seat.id);
    else if (next.size < MAX_SEATS) next.add(seat.id);
    setSelected(next);
  };

  const book = async () => {
    setBusy(true);
    setBookError(null);
    try {
      await api('/reservations', { method: 'POST', body: { showtimeId: showtime.id, seatIds: [...selected] } });
      navigate('/reservations', { state: { booked: true } });
    } catch (err) {
      setBookError(errorMessage(err));
      if (err.status === 409) {
        // Someone grabbed a seat; drop it from the selection and refresh the map.
        const taken = new Set(err.body?.details?.unavailableSeatIds || []);
        setSelected(new Set([...selected].filter((s) => !taken.has(s))));
        reload();
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="seat-page">
      <div>
        <p><Link to={`/movies/${showtime.movie.id}`}>← {showtime.movie.title}</Link></p>
        <h1>Choose your seats</h1>
        <p className="muted">{formatDateTime(showtime.startsAt)} · {showtime.hall.name} · {formatMoney(showtime.priceCents)} per seat</p>

        <div className="screen">SCREEN</div>
        <div className="seat-map" role="grid" aria-label="Seat map">
          {rows.map(([row, seats]) => (
            <div key={row} className="seat-row" role="row">
              <span className="row-label">{row}</span>
              {seats.map((s) => {
                const isSel = selected.has(s.id);
                return (
                  <button key={s.id} role="gridcell" type="button"
                    className={`seat ${!s.available ? 'taken' : isSel ? 'selected' : ''}`}
                    disabled={!s.available || started}
                    aria-pressed={isSel}
                    aria-label={`Seat ${s.row}${s.number}${s.available ? '' : ' (taken)'}`}
                    onClick={() => toggle(s)}>
                    {s.number}
                  </button>
                );
              })}
              <span className="row-label">{row}</span>
            </div>
          ))}
        </div>
        <div className="legend">
          <span><i className="seat" /> Available</span>
          <span><i className="seat selected" /> Selected</span>
          <span><i className="seat taken" /> Taken</span>
        </div>
      </div>

      <aside className="card summary">
        <h2>Summary</h2>
        {started ? <Alert>This showtime has already started.</Alert> : selectedSeats.length === 0 ? (
          <p className="muted">Select up to {MAX_SEATS} seats.</p>
        ) : (
          <>
            <p>
              <strong>{selectedSeats.length}</strong> seat{selectedSeats.length > 1 ? 's' : ''}:{' '}
              {selectedSeats.map((s) => `${s.row}${s.number}`).join(', ')}
            </p>
            <p className="total">{formatMoney(selectedSeats.length * showtime.priceCents)}</p>
          </>
        )}
        <Alert>{bookError}</Alert>
        <button className="btn block" disabled={!selectedSeats.length || busy || started} onClick={book}>
          {busy ? 'Booking…' : 'Confirm booking'}
        </button>
        <p className="muted small">{showtime.availableSeats} of {showtime.capacity} seats available</p>
      </aside>
    </div>
  );
}
