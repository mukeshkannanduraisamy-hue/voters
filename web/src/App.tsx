import { Navigate, Route, Routes, useLocation } from 'react-router-dom';
import { AuthProvider, HOME_FOR, useAuth } from './lib/auth';
import { ToastProvider } from './components/ui';
import Shell from './components/Shell';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Survey from './pages/Survey';
import Users from './pages/Users';
import CreateUser from './pages/CreateUser';
import Masters from './pages/Masters';
import Voters from './pages/Voters';
import Analytics from './pages/Analytics';
import Audit from './pages/Audit';
import Profile from './pages/Profile';
import type { Role } from './lib/types';
import { Icon } from './components/icons';

function FullPageSpinner() {
  return (
    <div style={{ minHeight: '100vh', display: 'grid', placeItems: 'center', background: 'var(--bg)' }}>
      <div className="stack" style={{ alignItems: 'center', gap: 'var(--sp-4)' }}>
        <div className="brand-mark" style={{ width: 46, height: 46 }}><Icon name="vote" size={24} /></div>
        <div className="spinner" style={{ color: 'var(--brand-500)', width: 22, height: 22 }} />
        <div className="t-sm t-muted">Loading your workspace…</div>
      </div>
    </div>
  );
}

/**
 * Blocks unauthenticated access and enforces RBAC. A user who lands on a page
 * their role cannot use is redirected to their own home rather than shown an
 * error, which matches how the server routes them after login.
 */
function Guard({ roles, children }: { roles?: Role[]; children: React.ReactNode }) {
  const { user, loading } = useAuth();
  const loc = useLocation();

  if (loading) return <FullPageSpinner />;
  if (!user) return <Navigate to="/login" state={{ from: loc.pathname }} replace />;
  if (roles && !roles.includes(user.role)) return <Navigate to={HOME_FOR[user.role]} replace />;
  return <>{children}</>;
}

function HomeRedirect() {
  const { user, loading } = useAuth();
  if (loading) return <FullPageSpinner />;
  return <Navigate to={user ? HOME_FOR[user.role] : '/login'} replace />;
}

function NotFound() {
  const { user } = useAuth();
  return (
    <div style={{ minHeight: '60vh', display: 'grid', placeItems: 'center' }}>
      <div className="t-center">
        <div className="empty-icon" style={{ margin: '0 auto var(--sp-4)' }}><Icon name="search" size={24} /></div>
        <h2 style={{ fontSize: 'var(--fs-2xl)' }}>Page not found</h2>
        <p className="t-muted mt-2">The page you are looking for does not exist.</p>
        <div className="mt-5">
          <a className="btn btn-primary" href={user ? HOME_FOR[user.role] : '/login'}>
            <Icon name="arrow-left" size={16} />Back to safety
          </a>
        </div>
      </div>
    </div>
  );
}

const ALL: Role[] = ['A1_SUPER_ADMIN', 'A2_SUPERVISOR', 'A3_FIELD_AGENT'];
const ADMINS: Role[] = ['A1_SUPER_ADMIN', 'A2_SUPERVISOR'];

export default function App() {
  return (
    <AuthProvider>
      <ToastProvider>
        <Routes>
          <Route path="/login" element={<Login />} />
          <Route path="/" element={<HomeRedirect />} />

          <Route element={<Guard roles={ALL}><Shell /></Guard>}>
            {/* dashboards — one component, scoped by the caller's role */}
            <Route path="/admin/dashboard"      element={<Guard roles={['A1_SUPER_ADMIN']}><Dashboard /></Guard>} />
            <Route path="/supervisor/dashboard" element={<Guard roles={['A2_SUPERVISOR']}><Dashboard /></Guard>} />

            {/* voter directory — same component, server-scoped */}
            <Route path="/admin/voters"      element={<Guard roles={['A1_SUPER_ADMIN']}><Voters /></Guard>} />
            <Route path="/supervisor/voters" element={<Guard roles={['A2_SUPERVISOR']}><Voters /></Guard>} />

            {/* field survey */}
            <Route path="/survey/booth" element={<Guard roles={['A3_FIELD_AGENT']}><Survey /></Guard>} />

            {/* administration */}
            <Route path="/admin/users"        element={<Guard roles={ADMINS}><Users /></Guard>} />
            <Route path="/admin/users/create" element={<Guard roles={ADMINS}><CreateUser /></Guard>} />
            <Route path="/admin/masters"      element={<Guard roles={['A1_SUPER_ADMIN']}><Masters /></Guard>} />
            <Route path="/admin/audit"        element={<Guard roles={['A1_SUPER_ADMIN']}><Audit /></Guard>} />
            <Route path="/analytics"          element={<Guard roles={ADMINS}><Analytics /></Guard>} />

            <Route path="/profile" element={<Guard roles={ALL}><Profile /></Guard>} />

            <Route path="*" element={<NotFound />} />
          </Route>
        </Routes>
      </ToastProvider>
    </AuthProvider>
  );
}
