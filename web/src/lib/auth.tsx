import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, setUnauthorizedHandler } from './api';
import type { CurrentUser, Role } from './types';

interface AuthValue {
  user: CurrentUser | null;
  loading: boolean;
  login: (mobileNumber: string, password: string) => Promise<CurrentUser>;
  logout: () => Promise<void>;
  refresh: () => Promise<void>;
  can: (...roles: Role[]) => boolean;
}

const AuthCtx = createContext<AuthValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [loading, setLoading] = useState(true);

  // The session lives in an HttpOnly cookie, so the only way to know whether one
  // exists is to ask the server on first paint.
  useEffect(() => {
    let alive = true;
    api.get<{ user: CurrentUser }>('/api/auth/me')
      .then((r) => { if (alive) setUser(r.user); })
      .catch(() => { /* no session — the login page handles it */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  // Any 401 from anywhere in the app clears the session.
  useEffect(() => {
    setUnauthorizedHandler(() => setUser(null));
    return () => setUnauthorizedHandler(null);
  }, []);

  const value = useMemo<AuthValue>(() => ({
    user,
    loading,
    async login(mobileNumber, password) {
      const res = await api.post<{ user: CurrentUser; redirectTo: string }>('/api/auth/login', { mobileNumber, password });
      setUser(res.user);
      return res.user;
    },
    async logout() {
      try { await api.post('/api/auth/logout'); } catch { /* clearing locally is what matters */ }
      setUser(null);
    },
    async refresh() {
      try {
        const { user: me } = await api.get<{ user: CurrentUser }>('/api/auth/me');
        setUser(me);
      } catch { /* handled by the 401 hook */ }
    },
    can: (...roles: Role[]) => !!user && roles.includes(user.role),
  }), [user, loading]);

  return <AuthCtx.Provider value={value}>{children}</AuthCtx.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthCtx);
  if (!ctx) throw new Error('useAuth must be used inside <AuthProvider>');
  return ctx;
}

export const ROLE_SHORT: Record<Role, string> = {
  A1_SUPER_ADMIN: 'A1',
  A2_SUPERVISOR: 'A2',
  A3_FIELD_AGENT: 'A3',
};

/** Landing route per role — mirrors the server's HOME_FOR map. */
export const HOME_FOR: Record<Role, string> = {
  A1_SUPER_ADMIN: '/admin/dashboard',
  A2_SUPERVISOR: '/supervisor/dashboard',
  A3_FIELD_AGENT: '/survey/booth',
};

/** Admin and supervisor share page components; these resolve the right URL. */
export function scopedPath(role: Role | undefined, page: 'dashboard' | 'voters'): string {
  if (role === 'A2_SUPERVISOR') return `/supervisor/${page}`;
  return `/admin/${page}`;
}
