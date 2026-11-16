export const Alert = ({ kind = 'error', children }) =>
  children ? <div className={`alert ${kind}`} role={kind === 'error' ? 'alert' : 'status'}>{children}</div> : null;

export const Loading = () => <p className="muted">Loading…</p>;

export const Poster = ({ movie, className = '' }) =>
  movie.posterUrl ? (
    <img className={`poster ${className}`} src={movie.posterUrl} alt={`${movie.title} poster`} />
  ) : (
    <div className={`poster placeholder ${className}`} aria-hidden="true">{movie.title.slice(0, 1)}</div>
  );

export const GenreTags = ({ genres }) => (
  <div className="tags">{genres?.map((g) => <span key={g.id} className="tag">{g.name}</span>)}</div>
);

export function Field({ label, children, hint }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
      {hint && <small className="muted">{hint}</small>}
    </label>
  );
}
