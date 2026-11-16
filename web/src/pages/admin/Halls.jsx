import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { useAsync } from '../../hooks.js';
import { Alert, Field, Loading } from '../../components/ui.jsx';

export default function AdminHalls() {
  const halls = useAsync(() => api('/halls').then((d) => d.halls), []);
  const [form, setForm] = useState({ name: '', rows: 8, seatsPerRow: 12 });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const create = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await api('/halls', { method: 'POST', body: { name: form.name, rows: Number(form.rows), seatsPerRow: Number(form.seatsPerRow) } });
      setForm({ ...form, name: '' });
      halls.reload();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <h1>Halls</h1>
      <form className="card inline-form" onSubmit={create}>
        <Field label="Name"><input required value={form.name} onChange={set('name')} placeholder="Hall 3" /></Field>
        <Field label="Rows (A–Z)"><input type="number" min={1} max={26} required value={form.rows} onChange={set('rows')} /></Field>
        <Field label="Seats per row"><input type="number" min={1} max={100} required value={form.seatsPerRow} onChange={set('seatsPerRow')} /></Field>
        <button className="btn" disabled={busy}>Add hall</button>
      </form>
      <Alert>{error}</Alert>
      {halls.loading ? <Loading /> : (
        <table className="table">
          <thead><tr><th>Name</th><th className="num">Rows</th><th className="num">Seats per row</th><th className="num">Capacity</th></tr></thead>
          <tbody>
            {halls.data.map((h) => (
              <tr key={h.id}><td>{h.name}</td><td className="num">{h.rows}</td><td className="num">{h.seatsPerRow}</td><td className="num">{h.capacity}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
