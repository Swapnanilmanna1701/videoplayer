import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import {
  LogOut,
  Upload,
  LayoutDashboard,
  Film,
  Shield,
  Activity,
} from 'lucide-react';

/**
 * Top navigation bar with role-aware links.
 */
export default function Navbar() {
  const { user, logout } = useAuth();
  const location = useLocation();

  const isActive = (path) => location.pathname === path;

  const navLink = (to, label, Icon) => (
    <Link
      to={to}
      className={`nav-link ${isActive(to) ? 'active' : ''}`}
    >
      <Icon size={18} />
      <span>{label}</span>
    </Link>
  );

  return (
    <nav className="navbar">
      <div className="navbar-inner">
        <Link to="/" className="navbar-brand">
          <Activity size={24} />
          <span>Pulse</span>
        </Link>

        <div className="nav-links">
          {navLink('/', 'Dashboard', LayoutDashboard)}
          {navLink('/videos', 'Library', Film)}
          {(user?.role === 'editor' || user?.role === 'admin') &&
            navLink('/upload', 'Upload', Upload)}
          {user?.role === 'admin' && navLink('/admin', 'Admin', Shield)}
        </div>

        <div className="nav-user">
          <div className="user-info">
            <span className="user-name">{user?.username}</span>
            <span className={`user-role role-${user?.role}`}>{user?.role}</span>
          </div>
          <button onClick={logout} className="btn-icon" title="Logout">
            <LogOut size={18} />
          </button>
        </div>
      </div>
    </nav>
  );
}
