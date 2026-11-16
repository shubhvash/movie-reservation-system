import { useState } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { errorMessage } from '../api.js';
import { useAuth } from '../auth.jsx';
import { Alert, Field } from '../components/ui.jsx';

function AuthForm({ mode }) {
  const { user, login, signup } = useAuth();
  const navigate = useNavigate();
  const from = useLocation().state?.from || '/';
  const [form, setForm] = useState({ name: '', email: '', password: '' });
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const isSignup = mode === 'signup';

  if (user) return <Navigate to={from} replace />;

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async (e) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSignup) await signup(form.name, form.email, form.password);
      else await login(form.email, form.password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="auth-card card">
      <h1>{isSignup ? 'Create an account' : 'Welcome back'}</h1>
      <form onSubmit={submit} className="stack">
        {isSignup && (
          <Field label="Name"><input required value={form.name} onChange={set('name')} autoComplete="name" /></Field>
        )}
        <Field label="Email">
          <input type="email" required value={form.email} onChange={set('email')} autoComplete="email" />
        </Field>
        <Field label="Password" hint={isSignup ? 'At least 8 characters' : null}>
          <input type="password" required minLength={isSignup ? 8 : 1} value={form.password} onChange={set('password')}
            autoComplete={isSignup ? 'new-password' : 'current-password'} />
        </Field>
        <Alert>{error}</Alert>
        <button className="btn" disabled={busy}>{busy ? 'Please wait…' : isSignup ? 'Sign up' : 'Log in'}</button>
      </form>
      <p className="muted">
        {isSignup ? <>Already have an account? <Link to="/login" state={{ from }}>Log in</Link></>
          : <>New here? <Link to="/signup" state={{ from }}>Create an account</Link></>}
      </p>
    </div>
  );
}

export const Login = () => <AuthForm mode="login" />;
export const Signup = () => <AuthForm mode="signup" />;
