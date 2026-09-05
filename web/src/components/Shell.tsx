import { useEffect, useRef, useState } from 'react';
import { NavLink, Outlet, useLocation, useNavigate } from 'react-router-dom';
import { useAuth, scopedPath } from '../lib/auth';
import { Icon, type IconName } from './icons';
import { Button, initials, fmt } from './ui';
import type { Role } from '../lib/types';

/* =========================== viewport simulator ========================== */
type Viewport = 'desktop' | 'tablet' | 'mobile';

const VIEWPORTS: { id: Viewport; label: string; icon: IconName; width: number | null; tone: string }[] = [
  { id: 'desktop', label: 'Desktop', icon: 'monitor', width: null, tone: 'blue' },
  { id: 'tablet', label: 'Tablet', icon: 'tablet', width: 768, tone: 'blue' },
  { id: 'mobile', label: 'Mobile Ready', icon: 'smartphone', width: 384, tone: 'emerald' },
];

function useViewport() {
  const [viewport, setViewport] = useState<Viewport>(() => {
    try {
      const saved = localStorage.getItem('vms.viewport');
      if (saved === 'tablet' || saved === 'mobile') return saved;
    } catch { /* private mode */ }
    return 'desktop';
  });
  useEffect(() => {
    try { localStorage.setItem('vms.viewport', viewport); } catch { /* private mode */ }
  }, [viewport]);
  return { viewport, setViewport };
}

/* ================================= theme ================================= */
function useTheme() {
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try {
      const saved = localStorage.getItem('vms.theme');
      if (saved === 'light' || saved === 'dark') return saved;
    } catch { /* private mode */ }
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
    try { localStorage.setItem('vms.theme', theme); } catch { /* private mode */ }
  }, [theme]);
  return { theme, toggle: () => setTheme((t) => (t === 'dark' ? 'light' : 'dark')) };
}

/* ============================== navigation =============================== */
interface NavEntry { to: string; label: string; icon: IconName; roles: Role[]; section: string }

function navFor(role: Role): NavEntry[] {
  const all: NavEntry[] = [
    { to: '/admin/dashboard',      label: 'Dashboard',      icon: 'dashboard', roles: ['A1_SUPER_ADMIN'], section: 'Overview' },
    { to: '/supervisor/dashboard', label: 'Dashboard',      icon: 'dashboard', roles: ['A2_SUPERVISOR'],  section: 'Overview' },
    { to: '/analytics',            label: 'Analytics',      icon: 'chart',     roles: ['A1_SUPER_ADMIN', 'A2_SUPERVISOR'], section: 'Overview' },

    { to: '/survey/booth',         label: 'Field Survey',     icon: 'clipboard', roles: ['A3_FIELD_AGENT'], section: 'Field Work' },

    { to: '/admin/voters',         label: 'Voters Directory', icon: 'list',    roles: ['A1_SUPER_ADMIN'], section: 'Electoral Roll' },
    { to: '/supervisor/voters',    label: 'Voters Directory', icon: 'list',    roles: ['A2_SUPERVISOR'],  section: 'Electoral Roll' },

    { to: '/admin/users/create',   label: 'Create User',    icon: 'user-plus', roles: ['A1_SUPER_ADMIN', 'A2_SUPERVISOR'], section: 'Administration' },
    { to: '/admin/users',          label: 'User List',      icon: 'users',     roles: ['A1_SUPER_ADMIN', 'A2_SUPERVISOR'], section: 'Administration' },
    { to: '/admin/masters',        label: 'Master Data',    icon: 'database',  roles: ['A1_SUPER_ADMIN'], section: 'Administration' },
    { to: '/admin/audit',          label: 'Activity Log',   icon: 'activity',  roles: ['A1_SUPER_ADMIN'], section: 'Administration' },

    { to: '/profile',              label: 'My Profile',     icon: 'user',      roles: ['A1_SUPER_ADMIN', 'A2_SUPERVISOR', 'A3_FIELD_AGENT'], section: 'Account' },
  ];
  return all.filter((n) => n.roles.includes(role));
}

/* ================================ shell ================================== */
export default function Shell() {
  const { user, logout } = useAuth();
  const nav = useNavigate();
  const loc = useLocation();
  const { theme, toggle } = useTheme();
  const { viewport, setViewport } = useViewport();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  // Close the drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); setMenuOpen(false); }, [loc.pathname]);

  // The quick-options menu closes on outside click and on Escape.
  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKey);
    };
  }, [menuOpen]);

  if (!user) return null;

  const entries = navFor(user.role);
  const sections = [...new Set(entries.map((e) => e.section))];
  const current = entries.find((e) => e.to === loc.pathname);
  const frameWidth = VIEWPORTS.find((v) => v.id === viewport)?.width ?? null;

  const signOut = async () => {
    await logout();
    nav('/login', { replace: true });
  };

  const scopeLine = user.isGlobal
    ? 'All 318 booths'
    : `${user.partCount} booth${user.partCount === 1 ? '' : 's'} assigned`;
  const scopeDetail = user.isGlobal
    ? 'Unrestricted access'
    : [...new Set(user.jurisdictions.map((j) => j.local_body_name_ta))].slice(0, 2).join(', ')
      + (new Set(user.jurisdictions.map((j) => j.local_body_name_ta)).size > 2 ? ' +more' : '');

  return (
    <div className="app">
      {drawerOpen && <div className="scrim" onClick={() => setDrawerOpen(false)} />}

      {/* ------------------------- sidebar ------------------------- */}
      <aside className={`sidebar ${drawerOpen ? 'open' : ''}`}>
        <div className="sidebar-brand">
          <div className="brand-mark"><Icon name="vote" size={20} /></div>
          <div className="brand-text">
            <div className="brand-title">VMS Admin</div>
            <div className="brand-sub ta">வாக்காளர் போர்டல்</div>
          </div>
        </div>

        <div className="sidebar-scope">
          <div className="sidebar-scope-label">Jurisdiction</div>
          <div className="sidebar-scope-value">{scopeLine}</div>
          <div className="t-xs ta" style={{ color: 'var(--sidebar-text)', opacity: 0.72, marginTop: 2 }}>
            {scopeDetail}
          </div>
        </div>

        <nav className="nav">
          {sections.map((section) => (
            <div key={section}>
              <div className="nav-section">{section}</div>
              {entries.filter((e) => e.section === section).map((e) => (
                <NavLink key={e.to} to={e.to} end className={({ isActive }) => `nav-item ${isActive ? 'active' : ''}`}>
                  <Icon name={e.icon} size={17} />
                  {e.label}
                </NavLink>
              ))}
            </div>
          ))}
        </nav>

        <div className="sidebar-foot">
          <NavLink to="/profile" className="user-chip">
            <div className="avatar">{initials(user.fullName ?? user.mobileNumber)}</div>
            <div style={{ minWidth: 0 }}>
              <div className="user-chip-name t-truncate">{user.fullName ?? user.mobileNumber}</div>
              <div className="user-chip-role">{user.roleLabel}</div>
            </div>
          </NavLink>
          <Button variant="danger-soft" icon="logout" block className="mt-2" onClick={() => void signOut()}>
            Sign Out
          </Button>
        </div>
      </aside>

      {/* --------------------------- main --------------------------- */}
      <div className="main">
        <header className="header">
          <button className="icon-btn menu-toggle" onClick={() => setDrawerOpen(true)} aria-label="Open menu">
            <Icon name="menu" size={18} />
          </button>

          <div style={{ minWidth: 0 }}>
            <div className="header-title">{current?.label ?? 'Voter Survey Portal'}</div>
            <div className="header-sub t-truncate">
              {user.roleLabel} · {user.mobileNumber}
            </div>
          </div>

          {/* ---- device viewport simulator ---- */}
          <div className="viewport-switch" role="group" aria-label="Preview device size">
            {VIEWPORTS.map((v) => (
              <button
                key={v.id}
                type="button"
                className={`viewport-btn ${viewport === v.id ? `on tone-${v.tone}` : ''}`}
                aria-pressed={viewport === v.id}
                onClick={() => setViewport(v.id)}
                title={`Preview at ${v.label}`}
              >
                <Icon name={v.icon} size={15} />
                <span className="viewport-label">{v.label}</span>
              </button>
            ))}
          </div>

          <div className="header-actions">
            <button
              className="icon-btn"
              onClick={toggle}
              aria-label={`Switch to ${theme === 'dark' ? 'light' : 'dark'} theme`}
              title="Toggle theme"
            >
              <Icon name={theme === 'dark' ? 'sun' : 'moon'} size={17} />
            </button>

            {/* ---- quick options menu ---- */}
            <div className="quick-menu" ref={menuRef}>
              <button
                className="quick-trigger"
                onClick={() => setMenuOpen((o) => !o)}
                aria-expanded={menuOpen}
                aria-haspopup="menu"
              >
                <span className="avatar" style={{ width: 28, height: 28, flex: '0 0 28px', fontSize: 11 }}>
                  {initials(user.fullName ?? user.mobileNumber)}
                </span>
                <span className="quick-trigger-text t-truncate">+91 {user.mobileNumber}</span>
                <Icon name="chevron-down" size={14} />
              </button>

              {menuOpen && (
                <div className="quick-panel" role="menu">
                  <div className="quick-head">
                    <div className="avatar" style={{ width: 40, height: 40, flex: '0 0 40px' }}>
                      {initials(user.fullName ?? user.mobileNumber)}
                    </div>
                    <div style={{ minWidth: 0 }}>
                      <div className="t-semi t-truncate">{user.fullName ?? 'Unnamed user'}</div>
                      <div className="t-xs t-muted mono">+91 {user.mobileNumber}</div>
                      <div className="t-xs ta" style={{ color: 'var(--brand-600)' }}>{user.roleLabelTa}</div>
                    </div>
                  </div>

                  <div className="quick-stats">
                    <div>
                      <strong className="tabnum">{user.isGlobal ? '318' : fmt(user.partCount ?? 0)}</strong>
                      <span>Booths</span>
                    </div>
                    <div>
                      <strong className="tabnum">{user.isGlobal ? 'All' : fmt(user.votersInScope)}</strong>
                      <span>Electors</span>
                    </div>
                    <div>
                      <strong>{user.isActive ? 'Active' : 'Disabled'}</strong>
                      <span>Status</span>
                    </div>
                  </div>

                  <div className="quick-links">
                    {user.role !== 'A3_FIELD_AGENT' && (
                      <>
                        <NavLink className="quick-link" to={scopedPath(user.role, 'dashboard')} role="menuitem">
                          <Icon name="dashboard" size={15} />Dashboard
                        </NavLink>
                        <NavLink className="quick-link" to={scopedPath(user.role, 'voters')} role="menuitem">
                          <Icon name="list" size={15} />Voters Directory
                        </NavLink>
                        <NavLink className="quick-link" to="/admin/users" role="menuitem">
                          <Icon name="users" size={15} />User Accounts
                        </NavLink>
                      </>
                    )}
                    {user.role === 'A1_SUPER_ADMIN' && (
                      <NavLink className="quick-link" to="/admin/masters" role="menuitem">
                        <Icon name="database" size={15} />Master Data
                      </NavLink>
                    )}
                    {user.role === 'A3_FIELD_AGENT' && (
                      <NavLink className="quick-link" to="/survey/booth" role="menuitem">
                        <Icon name="clipboard" size={15} />Field Survey
                      </NavLink>
                    )}
                    <NavLink className="quick-link" to="/profile" role="menuitem">
                      <Icon name="user" size={15} />My Profile
                    </NavLink>
                  </div>

                  <button className="quick-signout" onClick={() => void signOut()} role="menuitem">
                    <Icon name="logout" size={15} />Sign Out
                  </button>
                </div>
              )}
            </div>
          </div>
        </header>

        <main className={`content ${frameWidth ? 'framed' : ''}`}>
          {frameWidth ? (
            <div className="device-frame" style={{ width: frameWidth }} data-device={viewport}>
              <div className="device-bezel">
                <span className="device-name">
                  {viewport === 'mobile' ? 'Mobile Ready · 384px' : 'Tablet · 768px'}
                </span>
              </div>
              <div className="device-screen">
                <Outlet />
              </div>
            </div>
          ) : (
            <Outlet />
          )}
        </main>
      </div>
    </div>
  );
}
