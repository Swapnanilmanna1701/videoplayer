import { useEffect, useRef, useState } from 'react';
import { X, Settings, Loader } from 'lucide-react';
import { videoAPI } from '../services/api';

/**
 * Modal video player component with adaptive quality selection.
 * Uses the streaming endpoint for video playback with range request support.
 * Fetches available quality variants and allows users to switch between them.
 */
export default function VideoPlayer({ video, streamUrl, onClose }) {
  const videoRef = useRef(null);
  const modalRef = useRef(null);
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState('original');
  const [currentStreamUrl, setCurrentStreamUrl] = useState(streamUrl);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [loadingQualities, setLoadingQualities] = useState(true);
  const [compressionStatus, setCompressionStatus] = useState('pending');

  // Fetch available quality variants
  useEffect(() => {
    const fetchQualities = async () => {
      try {
        const { data } = await videoAPI.getQualities(video._id);
        setQualities(data.qualities || []);
        setCompressionStatus(data.compressionStatus || 'pending');

        // Auto-select best quality based on connection
        if (data.qualities?.length > 1) {
          autoSelectQuality(data.qualities);
        }
      } catch {
        // Fallback: just use original quality
        setQualities([{ quality: 'original', label: 'Original' }]);
      } finally {
        setLoadingQualities(false);
      }
    };

    fetchQualities();
  }, [video._id]);

  /**
   * Auto-select the best quality based on network conditions.
   * Uses the Network Information API when available.
   */
  const autoSelectQuality = (availableQualities) => {
    const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;

    let targetQuality = 'original';

    if (connection) {
      const effectiveType = connection.effectiveType;
      switch (effectiveType) {
        case 'slow-2g':
        case '2g':
          targetQuality = '360p';
          break;
        case '3g':
          targetQuality = '480p';
          break;
        case '4g':
        default:
          targetQuality = '720p';
          break;
      }
    } else {
      // Default to 720p when Network API is unavailable
      targetQuality = '720p';
    }

    // Find the closest available quality
    const available = availableQualities.map((q) => q.quality);
    if (available.includes(targetQuality)) {
      handleQualityChange(targetQuality);
    } else if (available.includes('720p')) {
      handleQualityChange('720p');
    }
  };

  // Close on Escape key
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on outside click
  const handleBackdropClick = (e) => {
    if (e.target === modalRef.current) {
      onClose();
    }
  };

  // Close quality menu on outside click
  useEffect(() => {
    const handleClick = () => setShowQualityMenu(false);
    if (showQualityMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [showQualityMenu]);

  /**
   * Switch video quality while preserving playback position.
   */
  const handleQualityChange = (quality) => {
    const videoEl = videoRef.current;
    const currentTime = videoEl?.currentTime || 0;
    const isPaused = videoEl?.paused;

    setSelectedQuality(quality);
    const newUrl = videoAPI.streamUrl(video._id, quality);
    setCurrentStreamUrl(newUrl);
    setShowQualityMenu(false);

    // Resume playback at the same position after source change
    if (videoEl) {
      videoEl.addEventListener(
        'loadeddata',
        () => {
          videoEl.currentTime = currentTime;
          if (!isPaused) videoEl.play();
        },
        { once: true }
      );
    }
  };

  const formatSize = (bytes) => {
    if (!bytes) return '';
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  return (
    <div className="modal-overlay" ref={modalRef} onClick={handleBackdropClick}>
      <div className="modal-content video-player-modal">
        <div className="modal-header">
          <h2>{video.title}</h2>
          <div className="modal-header-actions">
            {/* Quality selector */}
            {qualities.length > 1 && (
              <div className="quality-selector">
                <button
                  className="btn-icon quality-btn"
                  onClick={(e) => {
                    e.stopPropagation();
                    setShowQualityMenu(!showQualityMenu);
                  }}
                  title="Video Quality"
                >
                  <Settings size={18} />
                  <span className="quality-current">{selectedQuality}</span>
                </button>
                {showQualityMenu && (
                  <div className="quality-menu" onClick={(e) => e.stopPropagation()}>
                    <div className="quality-menu-header">Quality</div>
                    {qualities.map((q) => (
                      <button
                        key={q.quality}
                        className={`quality-option ${selectedQuality === q.quality ? 'active' : ''}`}
                        onClick={() => handleQualityChange(q.quality)}
                      >
                        <span className="quality-label">{q.label}</span>
                        {q.resolution && (
                          <span className="quality-resolution">{q.resolution}</span>
                        )}
                        {q.size > 0 && (
                          <span className="quality-size">{formatSize(q.size)}</span>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
            {loadingQualities && <Loader size={16} className="spin" />}
            <button className="btn-icon" onClick={onClose}>
              <X size={20} />
            </button>
          </div>
        </div>
        <div className="video-player-container">
          <video
            ref={videoRef}
            controls
            autoPlay
            className="video-element"
            src={currentStreamUrl}
          >
            Your browser does not support the video element.
          </video>
        </div>
        <div className="video-player-info">
          {video.description && <p>{video.description}</p>}
          <div className="video-meta">
            <span>Category: {video.category}</span>
            <span>Sensitivity: {video.sensitivity}</span>
            {video.sensitivityDetails?.score !== undefined && (
              <span>Score: {video.sensitivityDetails.score}</span>
            )}
            {compressionStatus === 'completed' && (
              <span className="compression-badge">Optimised</span>
            )}
            {compressionStatus === 'compressing' && (
              <span className="compression-badge compressing">Compressing...</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
