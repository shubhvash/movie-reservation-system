import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { useAuth } from './auth.jsx';
import Layout from './components/Layout.jsx';
import NowShowing from './pages/NowShowing.jsx';
import MovieDetail from './pages/MovieDetail.jsx';
import SeatSelection from './pages/SeatSelection.jsx';
import MyReservations from './pages/MyReservations.jsx';
import { Login, Signup } from './pages/AuthPages.jsx';
import AdminLayout from './pages/admin/AdminLayout.jsx';
import AdminDashboard from './pages/admin/Dashboard.jsx';
import AdminMovies from './pages/admin/Movies.jsx';
import AdminShowtimes from './pages/admin/Showtimes.jsx';
import AdminHalls from './pages/admin/Halls.jsx';
import AdminReservations from './pages/admin/Reservations.jsx';
import AdminUsers from './pages/admin/Users.jsx';

function RequireAuth({ admin = false, children }) {
  const { user, loading, isAdmin } = useAuth();
  const location = useLocation();
  if (loading) return <p className="muted">Loading…</p>;
  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (admin && !isAdmin) return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <Routes>
      <Route element={<Layout />}>
        <Route index element={<NowShowing />} />
        <Route path="movies/:id" element={<MovieDetail />} />
        <Route path="showtimes/:id" element={<RequireAuth><SeatSelection /></RequireAuth>} />
        <Route path="reservations" element={<RequireAuth><MyReservations /></RequireAuth>} />
        <Route path="login" element={<Login />} />
        <Route path="signup" element={<Signup />} />
        <Route path="admin" element={<RequireAuth admin><AdminLayout /></RequireAuth>}>
          <Route index element={<AdminDashboard />} />
          <Route path="movies" element={<AdminMovies />} />
          <Route path="showtimes" element={<AdminShowtimes />} />
          <Route path="halls" element={<AdminHalls />} />
          <Route path="reservations" element={<AdminReservations />} />
          <Route path="users" element={<AdminUsers />} />
        </Route>
        <Route path="*" element={<p>Page not found.</p>} />
      </Route>
    </Routes>
  );
}
