import { NavLink, Outlet } from 'react-router-dom';

const LINKS = [
  ['/admin', 'Dashboard', true],
  ['/admin/movies', 'Movies'],
  ['/admin/showtimes', 'Showtimes'],
  ['/admin/halls', 'Halls'],
  ['/admin/reservations', 'Reservations'],
  ['/admin/users', 'Users'],
];

export default function AdminLayout() {
  return (
    <div className="admin">
      <nav className="admin-nav">
        {LINKS.map(([to, label, end]) => <NavLink key={to} to={to} end={end}>{label}</NavLink>)}
      </nav>
      <section className="admin-body"><Outlet /></section>
    </div>
  );
}
