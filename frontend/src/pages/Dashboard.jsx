import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import { videoAPI } from '../services/api';
import { Film, CheckCircle, AlertTriangle, Clock, Loader } from 'lucide-react';

/**
 * Real-time dashboard showing processing status, recent uploads,
 * and summary statistics for the current user.
 */
export default function Dashboard() {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [stats, setStats] = useState({ total: 0, processing: 0, safe: 0, flagged: 0 });
  const [processingMap, setProcessingMap] = useState({}); // videoId -> { progress, stage }

  const fetchVideos = useCallback(async () => {
    try {
      const { data } = await videoAPI.list({ limit: 50, sortBy: 'createdAt', order: 'desc' });
      setVideos(data.videos);

      // Calculate stats
      const total = data.pagination.total;
      const processing = data.videos.filter((v) => v.status === 'processing').length;
      const safe = data.videos.filter((v) => v.sensitivity === 'safe').length;
      const flagged = data.videos.filter((v) => v.sensitivity === 'flagged').length;
      setStats({ total, processing, safe, flagged });
    } catch (err) {
      console.error('Failed to fetch videos:', err);
    }
  }, []);

  /* eslint-disable react-hooks/set-state-in-effect */
  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);
  /* eslint-enable react-hooks/set-state-in-effect */

  // Socket.io real-time updates
  useSocket({
    onStart: (data) => {
      setProcessingMap((prev) => ({
        ...prev,
        [data.videoId]: { progress: 0, stage: 'Starting...' },
      }));
    },
    onProgress: (data) => {
      setProcessingMap((prev) => ({
        ...prev,
        [data.videoId]: { progress: data.progress, stage: data.stage },
      }));
      // Update video in list
      setVideos((prev) =>
        prev.map((v) =>
          v._id === data.videoId
            ? { ...v, processingProgress: data.progress }
            : v
        )
      );
    },
    onComplete: (data) => {
      setProcessingMap((prev) => {
        const copy = { ...prev };
        delete copy[data.videoId];
        return copy;
      });
      // Refresh to get final state
      fetchVideos();
    },
    onError: () => {
      fetchVideos();
    },
  });

  const processingVideos = videos.filter((v) => v.status === 'processing');

  return (
    <div className="dashboard">
      <div className="page-header">
        <h1>Dashboard</h1>
        <p>Welcome back, {user?.username}</p>
      </div>

      {/* Stats cards */}
      <div className="stats-grid">
        <div className="stat-card">
          <Film size={28} />
          <div>
            <span className="stat-value">{stats.total}</span>
            <span className="stat-label">Total Videos</span>
          </div>
        </div>
        <div className="stat-card">
          <Loader size={28} />
          <div>
            <span className="stat-value">{stats.processing}</span>
            <span className="stat-label">Processing</span>
          </div>
        </div>
        <div className="stat-card stat-safe">
          <CheckCircle size={28} />
          <div>
            <span className="stat-value">{stats.safe}</span>
            <span className="stat-label">Safe</span>
          </div>
        </div>
        <div className="stat-card stat-flagged">
          <AlertTriangle size={28} />
          <div>
            <span className="stat-value">{stats.flagged}</span>
            <span className="stat-label">Flagged</span>
          </div>
        </div>
      </div>

      {/* Active processing */}
      {processingVideos.length > 0 && (
        <div className="section">
          <h2>Processing Now</h2>
          <div className="processing-list">
            {processingVideos.map((video) => {
              const proc = processingMap[video._id];
              const progress = proc?.progress ?? video.processingProgress ?? 0;
              const stage = proc?.stage ?? 'Processing...';

              return (
                <div key={video._id} className="processing-item">
                  <div className="processing-info">
                    <strong>{video.title}</strong>
                    <span className="processing-stage">{stage}</span>
                  </div>
                  <div className="progress-bar">
                    <div
                      className="progress-bar-fill"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                  <span className="progress-text">{progress}%</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Recent uploads */}
      <div className="section">
        <h2>Recent Uploads</h2>
        {videos.length === 0 ? (
          <div className="empty-state">
            <Film size={48} />
            <p>No videos yet. Upload your first video to get started.</p>
          </div>
        ) : (
          <div className="recent-list">
            {videos.slice(0, 10).map((video) => (
              <div key={video._id} className="recent-item">
                <Film size={20} />
                <div className="recent-info">
                  <span className="recent-title">{video.title}</span>
                  <span className="recent-meta">
                    <Clock size={12} />
                    {new Date(video.createdAt).toLocaleDateString()}
                  </span>
                </div>
                <span
                  className={`badge badge-sm badge-${video.sensitivity}`}
                >
                  {video.sensitivity}
                </span>
                <span
                  className={`badge badge-sm badge-${video.status}`}
                >
                  {video.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
