import { useState, useEffect } from 'react';
import { adminAPI } from '../services/api';
import { Users, Film, Shield, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Admin panel for user management and system statistics.
 * Only accessible to users with admin role.
 */
export default function Admin() {
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

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
