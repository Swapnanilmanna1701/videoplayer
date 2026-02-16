import { useState, useEffect, useCallback } from 'react';
import { videoAPI } from '../services/api';
import { useAuth } from '../hooks/useAuth';
import { useSocket } from '../hooks/useSocket';
import VideoCard from '../components/VideoCard';
import VideoPlayer from '../components/VideoPlayer';
import { Search, Filter, ChevronLeft, ChevronRight } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Video library page with filtering, search, pagination,
 * and integrated video playback.
 */
export default function VideoLibrary() {
  const { user } = useAuth();
  const [videos, setVideos] = useState([]);
  const [pagination, setPagination] = useState({ page: 1, pages: 1, total: 0 });
  const [filters, setFilters] = useState({
    sensitivity: 'all',
    status: 'all',
    category: '',
    search: '',
    sortBy: 'createdAt',
    order: 'desc',
  });
  const [playingVideo, setPlayingVideo] = useState(null);
  const [loading, setLoading] = useState(true);

  const canEdit = user?.role === 'editor' || user?.role === 'admin';

  const fetchVideos = useCallback(async (page = 1) => {
    setLoading(true);
    try {
      const params = { page, limit: 12 };
      if (filters.sensitivity !== 'all') params.sensitivity = filters.sensitivity;
      if (filters.status !== 'all') params.status = filters.status;
      if (filters.category) params.category = filters.category;
      if (filters.search) params.search = filters.search;
      params.sortBy = filters.sortBy;
      params.order = filters.order;

      const { data } = await videoAPI.list(params);
      setVideos(data.videos);
      setPagination(data.pagination);
    } catch {
      toast.error('Failed to load videos.');
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    fetchVideos();
  }, [fetchVideos]);

  // Real-time updates for processing videos
  useSocket({
    onProgress: (data) => {
      setVideos((prev) =>
        prev.map((v) =>
          v._id === data.videoId
            ? { ...v, processingProgress: data.progress }
            : v
        )
      );
    },
    onComplete: () => {
      fetchVideos(pagination.page);
    },
    onError: () => {
      fetchVideos(pagination.page);
    },
  });

  const handleDelete = async (videoId) => {
    if (!window.confirm('Delete this video permanently?')) return;
    try {
      await videoAPI.delete(videoId);
      toast.success('Video deleted.');
      fetchVideos(pagination.page);
    } catch {
      toast.error('Failed to delete video.');
    }
  };

  const handleReprocess = async (videoId) => {
    try {
      await videoAPI.reprocess(videoId);
      toast.success('Reprocessing started.');
      fetchVideos(pagination.page);
    } catch (err) {
      toast.error(err.response?.data?.error || 'Failed to reprocess.');
    }
  };

  const handlePlay = (video) => {
    setPlayingVideo(video);
  };

  const getStreamUrl = (video) => {
    const token = localStorage.getItem('pulse_token');
    return `http://localhost:5000/api/videos/${video._id}/stream?token=${token}`;
  };

  return (
    <div className="library-page">
      <div className="page-header">
        <h1>Video Library</h1>
        <span className="video-count">{pagination.total} videos</span>
      </div>

      {/* Filters */}
      <div className="filters-bar">
        <div className="search-box">
          <Search size={18} />
          <input
            type="text"
            placeholder="Search videos..."
            value={filters.search}
            onChange={(e) => setFilters((f) => ({ ...f, search: e.target.value }))}
          />
        </div>

        <div className="filter-group">
          <Filter size={16} />
          <select
            value={filters.sensitivity}
            onChange={(e) => setFilters((f) => ({ ...f, sensitivity: e.target.value }))}
          >
            <option value="all">All Sensitivity</option>
            <option value="safe">Safe</option>
            <option value="flagged">Flagged</option>
            <option value="pending">Pending</option>
          </select>

          <select
            value={filters.status}
            onChange={(e) => setFilters((f) => ({ ...f, status: e.target.value }))}
          >
            <option value="all">All Status</option>
            <option value="processing">Processing</option>
            <option value="completed">Completed</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={filters.sortBy}
            onChange={(e) => setFilters((f) => ({ ...f, sortBy: e.target.value }))}
          >
            <option value="createdAt">Date</option>
            <option value="title">Title</option>
            <option value="size">Size</option>
          </select>

          <select
            value={filters.order}
            onChange={(e) => setFilters((f) => ({ ...f, order: e.target.value }))}
          >
            <option value="desc">Newest</option>
            <option value="asc">Oldest</option>
          </select>
        </div>
      </div>

      {/* Video grid */}
      {loading ? (
        <div className="loading-state">
          <div className="spinner" />
          <p>Loading videos...</p>
        </div>
      ) : videos.length === 0 ? (
        <div className="empty-state">
          <p>No videos found matching your filters.</p>
        </div>
      ) : (
        <div className="video-grid">
          {videos.map((video) => (
            <VideoCard
              key={video._id}
              video={video}
              onPlay={handlePlay}
              onDelete={handleDelete}
              onReprocess={handleReprocess}
              canEdit={canEdit}
            />
          ))}
        </div>
      )}

      {/* Pagination */}
      {pagination.pages > 1 && (
        <div className="pagination">
          <button
            className="btn btn-sm btn-outline"
            disabled={pagination.page <= 1}
            onClick={() => fetchVideos(pagination.page - 1)}
          >
            <ChevronLeft size={16} /> Previous
          </button>
          <span className="page-info">
            Page {pagination.page} of {pagination.pages}
          </span>
          <button
            className="btn btn-sm btn-outline"
            disabled={pagination.page >= pagination.pages}
            onClick={() => fetchVideos(pagination.page + 1)}
          >
            Next <ChevronRight size={16} />
          </button>
        </div>
      )}

      {/* Video player modal */}
      {playingVideo && (
        <VideoPlayer
          video={playingVideo}
          streamUrl={getStreamUrl(playingVideo)}
          onClose={() => setPlayingVideo(null)}
        />
      )}
    </div>
  );
}
