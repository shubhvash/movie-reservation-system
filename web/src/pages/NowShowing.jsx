import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { dayRange, dayStart, formatDuration, formatMoney, formatTime } from '../format.js';
import { Alert, GenreTags, Loading, Poster } from '../components/ui.jsx';

const DAYS = 7;

export default function NowShowing() {
  const [dayOffset, setDayOffset] = useState(0);
  const [genreId, setGenreId] = useState('');
  const day = dayStart(dayOffset);

  const genres = useAsync(() => api('/genres').then((d) => d.genres), []);
  const showtimes = useAsync(
    () => api('/showtimes', { query: { ...dayRange(day), limit: 100 } }).then((d) => d.showtimes),
    [dayOffset],
  );
  const movies = useAsync(
    () => api('/movies', { query: { genreId, limit: 100 } }).then((d) => d.movies),
    [genreId],
  );

  // Group the day's showtimes under their movie, keeping only movies that match the genre filter.
  const listing = useMemo(() => {
    if (!showtimes.data || !movies.data) return [];
    const byId = new Map(movies.data.map((m) => [m.id, { movie: m, showtimes: [] }]));
    for (const s of showtimes.data) byId.get(s.movie.id)?.showtimes.push(s);
    return [...byId.values()].filter((x) => x.showtimes.length);
  }, [showtimes.data, movies.data]);

  return (
    <>
      <div className="page-head">
        <h1>Now showing</h1>
        <select value={genreId} onChange={(e) => setGenreId(e.target.value)} aria-label="Filter by genre">
          <option value="">All genres</option>
          {genres.data?.map((g) => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>

      <div className="day-strip" role="tablist">
        {Array.from({ length: DAYS }, (_, i) => {
          const d = dayStart(i);
          return (
            <button key={i} role="tab" aria-selected={i === dayOffset}
              className={`day ${i === dayOffset ? 'active' : ''}`} onClick={() => setDayOffset(i)}>
              <span>{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : d.toLocaleDateString(undefined, { weekday: 'short' })}</span>
              <strong>{d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</strong>
            </button>
          );
        })}
      </div>

      <Alert>{showtimes.error || movies.error}</Alert>
      {showtimes.loading || movies.loading ? <Loading /> : listing.length === 0 ? (
        <p className="empty">No showtimes {genreId ? 'for this genre ' : ''}on this day.</p>
      ) : (
        <div className="movie-list">
          {listing.map(({ movie, showtimes }) => (
            <article key={movie.id} className="card movie-row">
              <Link to={`/movies/${movie.id}`}><Poster movie={movie} /></Link>
              <div className="movie-info">
                <h2><Link to={`/movies/${movie.id}`}>{movie.title}</Link></h2>
                <p className="muted">{formatDuration(movie.durationMinutes)}</p>
                <GenreTags genres={movie.genres} />
                <p className="desc">{movie.description}</p>
                <div className="showtime-chips">
                  {showtimes.map((s) => (
                    <Link key={s.id} to={`/showtimes/${s.id}`}
                      className={`chip ${s.availableSeats === 0 ? 'soldout' : ''}`}
                      title={`${s.hall.name} · ${formatMoney(s.priceCents)} · ${s.availableSeats} seats left`}>
                      <strong>{formatTime(s.startsAt)}</strong>
                      <small>{s.availableSeats === 0 ? 'Sold out' : `${s.hall.name} · ${s.availableSeats} left`}</small>
                    </Link>
                  ))}
                </div>
              </div>
            </article>
          ))}
        </div>
      )}
    </>
  );
}
