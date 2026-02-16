import { Film, Clock, CheckCircle, AlertTriangle, Loader, Trash2, RotateCw } from 'lucide-react';

/**
 * Displays a single video with its metadata, processing status,
 * and sensitivity result. Provides action buttons based on status.
 */
export default function VideoCard({ video, onPlay, onDelete, onReprocess, canEdit }) {
  const formatSize = (bytes) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const formatDate = (dateStr) => {
    return new Date(dateStr).toLocaleDateString('en-GB', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  };

  const statusConfig = {
    uploading: { icon: Loader, color: 'var(--color-info)', label: 'Uploading' },
    processing: { icon: Loader, color: 'var(--color-warning)', label: 'Processing' },
    completed: { icon: CheckCircle, color: 'var(--color-success)', label: 'Completed' },
    failed: { icon: AlertTriangle, color: 'var(--color-danger)', label: 'Failed' },
  };

  const sensitivityConfig = {
    safe: { color: 'var(--color-success)', label: 'Safe' },
    flagged: { color: 'var(--color-danger)', label: 'Flagged' },
    pending: { color: 'var(--color-muted)', label: 'Pending' },
  };

  const status = statusConfig[video.status] || statusConfig.processing;
  const sensitivity = sensitivityConfig[video.sensitivity] || sensitivityConfig.pending;
  const StatusIcon = status.icon;

  return (
    <div className="video-card">
      <div className="video-card-thumbnail" onClick={() => video.status === 'completed' && onPlay?.(video)}>
        <Film size={40} />
        {video.status === 'processing' && (
          <div className="processing-overlay">
            <div className="progress-bar-mini">
              <div
                className="progress-bar-fill"
                style={{ width: `${video.processingProgress || 0}%` }}
              />
            </div>
            <span>{video.processingProgress || 0}%</span>
          </div>
        )}
        {video.status === 'completed' && (
          <div className="play-overlay">
            <span>Play</span>
          </div>
        )}
      </div>

      <div className="video-card-body">
        <h3 className="video-title" title={video.title}>{video.title}</h3>
        {video.description && (
          <p className="video-description">{video.description}</p>
        )}

        <div className="video-meta">
          <span className="meta-item">
            <Clock size={14} />
            {formatDate(video.createdAt)}
          </span>
          <span className="meta-item">{formatSize(video.size)}</span>
          <span className="meta-item">{video.category}</span>
        </div>

        <div className="video-badges">
          <span className="badge" style={{ background: status.color }}>
            <StatusIcon size={12} className={video.status === 'processing' ? 'spin' : ''} />
            {status.label}
          </span>
          <span className="badge" style={{ background: sensitivity.color }}>
            {sensitivity.label}
          </span>
        </div>

        {canEdit && (
          <div className="video-actions">
            {video.status === 'completed' && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => onReprocess?.(video._id)}
                title="Reprocess"
              >
                <RotateCw size={14} />
              </button>
            )}
            {video.status === 'failed' && (
              <button
                className="btn btn-sm btn-outline"
                onClick={() => onReprocess?.(video._id)}
                title="Retry"
              >
                <RotateCw size={14} />
              </button>
            )}
            <button
              className="btn btn-sm btn-danger"
              onClick={() => onDelete?.(video._id)}
              title="Delete"
            >
              <Trash2 size={14} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
