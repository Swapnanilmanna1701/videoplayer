import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';

/**
 * Modal video player component.
 * Uses the streaming endpoint for video playback with range request support.
 */
export default function VideoPlayer({ video, streamUrl, onClose }) {
  const videoRef = useRef(null);
  const modalRef = useRef(null);

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

  return (
    <div className="modal-overlay" ref={modalRef} onClick={handleBackdropClick}>
      <div className="modal-content video-player-modal">
        <div className="modal-header">
          <h2>{video.title}</h2>
          <button className="btn-icon" onClick={onClose}>
            <X size={20} />
          </button>
        </div>
        <div className="video-player-container">
          <video
            ref={videoRef}
            controls
            autoPlay
            className="video-element"
            src={streamUrl}
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
          </div>
        </div>
      </div>
    </div>
  );
}
