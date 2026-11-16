import { Link, useParams } from 'react-router-dom';
import { api } from '../api.js';
import { useAsync } from '../hooks.js';
import { formatDate, formatDuration, formatMoney, formatTime } from '../format.js';
import { Alert, GenreTags, Loading, Poster } from '../components/ui.jsx';

export default function MovieDetail() {
  const { id } = useParams();
  const { data, error, loading } = useAsync(
    () => Promise.all([
      api(`/movies/${id}`),
      api('/showtimes', { query: { movieId: id, limit: 100 } }),
    ]).then(([m, s]) => ({ movie: m.movie, showtimes: s.showtimes })),
    [id],
  );
  if (loading) return <Loading />;
  if (error) return <Alert>{error}</Alert>;
  const { movie, showtimes } = data;

  const byDay = new Map();
  for (const s of showtimes) {
    const key = new Date(s.startsAt).toDateString();
    byDay.set(key, [...(byDay.get(key) || []), s]);
  }

  return (
    <div className="movie-detail">
      <Poster movie={movie} className="large" />
      <div>
        <h1>{movie.title}</h1>
        <p className="muted">{formatDuration(movie.durationMinutes)}</p>
        <GenreTags genres={movie.genres} />
        <p className="desc">{movie.description}</p>
        <h2>Showtimes</h2>
        {byDay.size === 0 && <p className="empty">No upcoming showtimes.</p>}
        {[...byDay.values()].map((list) => (
          <section key={list[0].startsAt} className="day-group">
            <h3>{formatDate(list[0].startsAt)}</h3>
            <div className="showtime-chips">
              {list.map((s) => (
                <Link key={s.id} to={`/showtimes/${s.id}`} className={`chip ${s.availableSeats === 0 ? 'soldout' : ''}`}>
                  <strong>{formatTime(s.startsAt)}</strong>
                  <small>{s.hall.name} · {formatMoney(s.priceCents)}</small>
                </Link>
              ))}
            </div>
          </section>
        ))}
      </div>
    </div>
  );
}
