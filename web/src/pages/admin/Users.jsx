import { useState } from 'react';
import { api, errorMessage } from '../../api.js';
import { useAuth } from '../../auth.jsx';
import { useAsync } from '../../hooks.js';
import { formatDate } from '../../format.js';
import { Alert, Loading } from '../../components/ui.jsx';

export default function AdminUsers() {
  const { user: me } = useAuth();
  const users = useAsync(() => api('/users', { query: { limit: 100 } }).then((d) => d.users), []);
  const [error, setError] = useState(null);

  const setRole = async (u, role) => {
    setError(null);
    try {
      await api(`/users/${u.id}/role`, { method: 'PATCH', body: { role } });
      users.reload();
    } catch (err) {
      setError(errorMessage(err));
    }
  };

  return (
    <>
      <h1>Users</h1>
      <Alert>{error || users.error}</Alert>
      {users.loading ? <Loading /> : (
        <table className="table">
          <thead><tr><th>Name</th><th>Email</th><th>Joined</th><th>Role</th><th></th></tr></thead>
          <tbody>
            {users.data.map((u) => (
              <tr key={u.id}>
                <td>{u.name}</td><td>{u.email}</td><td>{formatDate(u.created_at)}</td>
                <td><span className={`badge ${u.role}`}>{u.role}</span></td>
                <td>
                  {u.id !== me.id && (u.role === 'admin'
                    ? <button className="btn ghost" onClick={() => setRole(u, 'user')}>Make user</button>
                    : <button className="btn ghost" onClick={() => setRole(u, 'admin')}>Make admin</button>)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </>
  );
}
