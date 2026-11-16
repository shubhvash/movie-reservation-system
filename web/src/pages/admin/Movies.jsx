import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { formatDuration } from '../../format.js';
import { Alert, Field, GenreTags, Loading, Poster } from '../../components/ui.jsx';

const EMPTY = { title: '', description: '', posterUrl: '', durationMinutes: 120, genreIds: [] };

export default function AdminMovies() {
  const movies = useAsync(() => api('/movies', { query: { limit: 100 } }).then((d) => d.movies), []);
  const genres = useAsync(() => api('/genres').then((d) => d.genres), []);
  const [editing, setEditing] = useState(null); // null | 'new' | movie id
  const [form, setForm] = useState(EMPTY);
  const [newGenre, setNewGenre] = useState('');
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const open = (movie) => {
    setError(null);
    setEditing(movie ? movie.id : 'new');
    setForm(movie ? {
      title: movie.title, description: movie.description, posterUrl: movie.posterUrl || '',
      durationMinutes: movie.durationMinutes, genreIds: movie.genres.map((g) => g.id),
    } : EMPTY);
  };

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const toggleGenre = (id) => setForm({
    ...form, genreIds: form.genreIds.includes(id) ? form.genreIds.filter((g) => g !== id) : [...form.genreIds, id],
  });

  const run = async (fn) => {
    setBusy(true);
    setError(null);
    try { await fn(); } catch (err) { setError(errorMessage(err)); } finally { setBusy(false); }
  };

  const save = (e) => {
    e.preventDefault();
    run(async () => {
      const body = { ...form, durationMinutes: Number(form.durationMinutes), posterUrl: form.posterUrl.trim() || null };
      if (editing === 'new') await api('/movies', { method: 'POST', body });
      else await api(`/movies/${editing}`, { method: 'PATCH', body });
      setEditing(null);
      movies.reload();
    });
  };

  const remove = (m) => {
    if (!window.confirm(`Delete "${m.title}"?`)) return;
    run(async () => { await api(`/movies/${m.id}`, { method: 'DELETE' }); movies.reload(); });
  };

  const addGenre = () => run(async () => {
    const { genre } = await api('/genres', { method: 'POST', body: { name: newGenre } });
    setNewGenre('');
    setForm((f) => ({ ...f, genreIds: [...f.genreIds, genre.id] }));
    genres.reload();
  });

  return (
    <>
      <div className="page-head">
        <h1>Movies</h1>
        <button className="btn" onClick={() => open(null)}>+ Add movie</button>
      </div>
      <Alert>{!editing && error}</Alert>

      {editing && (
        <form className="card stack" onSubmit={save}>
          <h2>{editing === 'new' ? 'New movie' : 'Edit movie'}</h2>
          <div className="grid-2">
            <Field label="Title"><input required value={form.title} onChange={set('title')} /></Field>
            <Field label="Duration (minutes)"><input type="number" min={1} required value={form.durationMinutes} onChange={set('durationMinutes')} /></Field>
          </div>
          <Field label="Poster URL"><input type="url" placeholder="https://…" value={form.posterUrl} onChange={set('posterUrl')} /></Field>
          <Field label="Description"><textarea rows={3} value={form.description} onChange={set('description')} /></Field>
          <fieldset className="genre-picker">
            <legend>Genres</legend>
            {genres.data?.map((g) => (
              <label key={g.id} className="check">
                <input type="checkbox" checked={form.genreIds.includes(g.id)} onChange={() => toggleGenre(g.id)} /> {g.name}
              </label>
            ))}
            <span className="inline-form">
              <input placeholder="New genre" value={newGenre} onChange={(e) => setNewGenre(e.target.value)} />
              <button type="button" className="btn ghost" disabled={!newGenre.trim() || busy} onClick={addGenre}>Add</button>
            </span>
          </fieldset>
          <Alert>{error}</Alert>
          <div className="actions">
            <button className="btn" disabled={busy}>Save</button>
            <button type="button" className="btn ghost" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      )}

      {movies.loading ? <Loading /> : (
        <table className="table">
          <thead><tr><th></th><th>Title</th><th>Duration</th><th>Genres</th><th></th></tr></thead>
          <tbody>
            {movies.data.map((m) => (
              <tr key={m.id}>
                <td><Poster movie={m} className="thumb" /></td>
                <td><strong>{m.title}</strong><div className="muted small clamp">{m.description}</div></td>
                <td>{formatDuration(m.durationMinutes)}</td>
                <td><GenreTags genres={m.genres} /></td>
                <td className="actions">
                  <button className="btn ghost" onClick={() => open(m)}>Edit</button>
                  <button className="btn ghost danger" onClick={() => remove(m)}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
