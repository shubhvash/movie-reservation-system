import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, setUnauthorizedHandler, tokenStore } from './api.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(Boolean(tokenStore.get()));

  const logout = useCallback(() => {
    tokenStore.set(null);
    setUser(null);
  }, []);

  useEffect(() => {
    setUnauthorizedHandler(logout);
    if (!tokenStore.get()) return;
    api('/auth/me')
      .then((d) => setUser(d.user))
      .catch(logout)
      .finally(() => setLoading(false));
  }, [logout]);

  const value = useMemo(() => {
    const start = ({ user, token }) => {
      tokenStore.set(token);
      setUser(user);
      return user;
    };
    return {
      user,
      loading,
      isAdmin: user?.role === 'admin',
      login: (email, password) => api('/auth/login', { method: 'POST', body: { email, password } }).then(start),
      signup: (name, email, password) =>
        api('/auth/signup', { method: 'POST', body: { name, email, password } }).then(start),
      logout,
    };
  }, [user, loading, logout]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
