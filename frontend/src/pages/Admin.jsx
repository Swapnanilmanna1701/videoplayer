import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { Users, Film, Shield, Trash2, Zap, Database, Globe, RefreshCw } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Admin panel for user management, system statistics,
 * and performance optimization metrics (cache, compression, CDN).
 * Only accessible to users with admin role.
 */
export default function Admin() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  const formatSize = (bytes) => {
    if (!bytes || bytes <= 0) return '0 B';
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${bytes} B`;
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [usersRes, statsRes] = await Promise.all([
        adminAPI.getUsers(),
        adminAPI.getStats(),
      ]);
      setUsers(usersRes.data.users);
      setStats(statsRes.data.stats);
    } catch {
      toast.error('Failed to load admin data.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  const handleRoleChange = async (userId, newRole) => {
    try {
      await adminAPI.updateRole(userId, newRole);
      toast.success(`Role updated to ${newRole}.`);
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to update role.');
    }
  };

  const handleDeleteUser = async (userId, username) => {
    if (!window.confirm(`Delete user "${username}" and all their videos?`)) return;
    try {
      await adminAPI.deleteUser(userId);
      toast.success('User deleted.');
      fetchData();
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to delete user.');
    }
  };

  const handleFlushCache = async (tier) => {
    try {
      await adminAPI.flushCache(tier);
      toast.success(tier ? `Cache tier "${tier}" flushed.` : 'All caches flushed.');
      fetchData();
    } catch {
      toast.error('Failed to flush cache.');
    }
  };

  if (loading) {
    return (
      <div className="loading-state">
        <div className="spinner" />
        <p>Loading admin panel...</p>
      </div>
    );
  }

  return (
    <div className="admin-page">
      <div className="page-header">
        <h1>
          <Shield size={28} /> Admin Panel
        </h1>
      </div>

      {/* System stats */}
      {stats && (
        <div className="stats-grid">
          <div className="stat-card">
            <Users size={28} />
            <div>
              <span className="stat-value">{stats.totalUsers}</span>
              <span className="stat-label">Total Users</span>
            </div>
          </div>
          <div className="stat-card">
            <Film size={28} />
            <div>
              <span className="stat-value">{stats.totalVideos}</span>
              <span className="stat-label">Total Videos</span>
            </div>
          </div>
          <div className="stat-card stat-safe">
            <div>
              <span className="stat-value">{stats.bySensitivity?.safe || 0}</span>
              <span className="stat-label">Safe Videos</span>
            </div>
          </div>
          <div className="stat-card stat-flagged">
            <div>
              <span className="stat-value">{stats.bySensitivity?.flagged || 0}</span>
              <span className="stat-label">Flagged Videos</span>
            </div>
          </div>
        </div>
      )}

      {/* Performance Optimization Section */}
      {stats && (
        <div className="section">
          <h2><Zap size={20} /> Performance Optimization</h2>
          <div className="optimization-grid">

            {/* Compression Stats */}
            <div className="optimization-card">
              <div className="optimization-header">
                <Zap size={20} />
                <h3>Video Compression</h3>
              </div>
              <div className="optimization-stats">
                <div className="opt-stat">
                  <span className="opt-value">{stats.compression?.totalVariants || 0}</span>
                  <span className="opt-label">Compressed Variants</span>
                </div>
                <div className="opt-stat">
                  <span className="opt-value">{stats.compression?.byStatus?.completed || 0}</span>
                  <span className="opt-label">Videos Optimised</span>
                </div>
                <div className="opt-stat">
                  <span className="opt-value">{stats.compression?.byStatus?.compressing || 0}</span>
                  <span className="opt-label">Currently Compressing</span>
                </div>
                {stats.compression?.spaceSaved > 0 && (
                  <div className="opt-stat opt-highlight">
                    <span className="opt-value">{formatSize(stats.compression.spaceSaved)}</span>
                    <span className="opt-label">Storage Efficiency Gain</span>
                  </div>
                )}
              </div>
            </div>

            {/* Cache Stats */}
            <div className="optimization-card">
              <div className="optimization-header">
                <Database size={20} />
                <h3>Response Caching</h3>
                <button
                  className="btn btn-sm btn-outline"
                  onClick={() => handleFlushCache(null)}
                  title="Flush all caches"
                >
                  <RefreshCw size={14} /> Flush All
                </button>
              </div>
              {stats.cache && (
                <div className="cache-tiers">
                  {Object.entries(stats.cache).map(([tier, data]) => (
                    <div key={tier} className="cache-tier">
                      <div className="cache-tier-info">
                        <span className="cache-tier-name">{tier}</span>
                        <span className="cache-tier-keys">{data.keys} keys</span>
                      </div>
                      <div className="cache-tier-stats">
                        <span className="cache-hits">{data.hits} hits</span>
                        <span className="cache-misses">{data.misses} misses</span>
                        <span className={`cache-rate ${data.hitRate > 50 ? 'good' : ''}`}>
                          {data.hitRate}% hit rate
                        </span>
                      </div>
                      <button
                        className="btn-icon"
                        onClick={() => handleFlushCache(tier)}
                        title={`Flush ${tier} cache`}
                      >
                        <RefreshCw size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* CDN Stats */}
            <div className="optimization-card">
              <div className="optimization-header">
                <Globe size={20} />
                <h3>CDN Integration</h3>
              </div>
              <div className="optimization-stats">
                <div className="opt-stat">
                  <span className={`opt-value ${stats.cdn?.enabled ? 'cdn-enabled' : 'cdn-disabled'}`}>
                    {stats.cdn?.enabled ? 'Active' : 'Inactive'}
                  </span>
                  <span className="opt-label">CDN Status</span>
                </div>
                <div className="opt-stat">
                  <span className="opt-value">{stats.cdn?.provider || 'None'}</span>
                  <span className="opt-label">Provider</span>
                </div>
                {stats.cdn?.enabled && (
                  <>
                    <div className="opt-stat">
                      <span className="opt-value">{stats.cdn.tokenExpiry}s</span>
                      <span className="opt-label">Token Expiry</span>
                    </div>
                    <div className="opt-stat">
                      <span className="opt-value opt-url">{stats.cdn.baseUrl}</span>
                      <span className="opt-label">Base URL</span>
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* User management table */}
      <div className="section">
        <h2>User Management</h2>
        <div className="table-container">
          <table className="data-table">
            <thead>
              <tr>
                <th>Username</th>
                <th>Email</th>
                <th>Role</th>
                <th>Organisation</th>
                <th>Joined</th>
                <th>Actions</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u._id}>
                  <td>{u.username}</td>
                  <td>{u.email}</td>
                  <td>
                    <select
                      value={u.role}
                      onChange={(e) => handleRoleChange(u._id, e.target.value)}
                      className={`role-select role-${u.role}`}
                    >
                      <option value="viewer">Viewer</option>
                      <option value="editor">Editor</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                  <td>{u.organisation}</td>
                  <td>{new Date(u.createdAt).toLocaleDateString()}</td>
                  <td>
                    <button
                      className="btn btn-sm btn-danger"
                      onClick={() => handleDeleteUser(u._id, u.username)}
                      title="Delete user"
                    >
                      <Trash2 size={14} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
