import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import { useAuth } from '../auth.jsx';

export default function Layout() {
  const { user, isAdmin, logout } = useAuth();
  const navigate = useNavigate();
  return (
    <>
      <header className="topbar">
        <div className="container topbar-inner">
          <Link to="/" className="brand">🎬 CineBook</Link>
          <nav>
            <NavLink to="/" end>Now showing</NavLink>
            {user && <NavLink to="/reservations">My tickets</NavLink>}
            {isAdmin && <NavLink to="/admin">Admin</NavLink>}
          </nav>
          <div className="topbar-user">
            {user ? (
              <>
                <span className="muted">{user.name}</span>
                <button className="btn ghost" onClick={() => { logout(); navigate('/'); }}>Log out</button>
              </>
            ) : (
              <>
                <Link to="/login" className="btn ghost">Log in</Link>
                <Link to="/signup" className="btn">Sign up</Link>
              </>
            )}
          </div>
        </div>
      </header>
      <main className="container">
        <Outlet />
      </main>
    </>
  );
}
