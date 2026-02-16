import { useState, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { videoAPI } from '../services/api';
import { Upload as UploadIcon, Film, X } from 'lucide-react';
import toast from 'react-hot-toast';

/**
 * Video upload page with drag-and-drop support,
 * file validation, and real-time upload progress.
 */
export default function Upload() {
  const [file, setFile] = useState(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('uncategorised');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploading, setUploading] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const fileInputRef = useRef(null);
  const navigate = useNavigate();

  const ALLOWED_TYPES = [
    'video/mp4', 'video/mpeg', 'video/quicktime',
    'video/x-msvideo', 'video/x-matroska', 'video/webm', 'video/ogg',
  ];

  const handleFileSelect = (selectedFile) => {
    if (!selectedFile) return;

    if (!ALLOWED_TYPES.includes(selectedFile.type)) {
      toast.error('Invalid file type. Please upload a video file.');
      return;
    }

    if (selectedFile.size > 500 * 1024 * 1024) {
      toast.error('File too large. Maximum size is 500MB.');
      return;
    }

    setFile(selectedFile);
    if (!title) {
      // Auto-fill title from filename (without extension)
      setTitle(selectedFile.name.replace(/\.[^/.]+$/, ''));
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragActive(false);
    const droppedFile = e.dataTransfer.files[0];
    handleFileSelect(droppedFile);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setDragActive(true);
  };

  const handleDragLeave = () => {
    setDragActive(false);
  };

  const formatSize = (bytes) => {
    if (bytes >= 1073741824) return `${(bytes / 1073741824).toFixed(1)} GB`;
    if (bytes >= 1048576) return `${(bytes / 1048576).toFixed(1)} MB`;
    return `${(bytes / 1024).toFixed(1)} KB`;
  };

  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!file) {
      toast.error('Please select a video file.');
      return;
    }
    if (!title.trim()) {
      toast.error('Please provide a video title.');
      return;
    }

    const formData = new FormData();
    formData.append('video', file);
    formData.append('title', title.trim());
    formData.append('description', description.trim());
    formData.append('category', category.trim());

    setUploading(true);
    setUploadProgress(0);

    try {
      await videoAPI.upload(formData, (percent) => {
        setUploadProgress(percent);
      });

      toast.success('Video uploaded! Processing has started.');
      navigate('/');
    } catch (err) {
      toast.error(err.response?.data?.error || 'Upload failed.');
    } finally {
      setUploading(false);
    }
  };

  const clearFile = () => {
    setFile(null);
    setUploadProgress(0);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  return (
    <div className="upload-page">
      <div className="page-header">
        <h1>Upload Video</h1>
        <p>Upload a video for sensitivity analysis and streaming</p>
      </div>

      <form onSubmit={handleSubmit} className="upload-form">
        {/* Drop zone */}
        {!file ? (
          <div
            className={`drop-zone ${dragActive ? 'drag-active' : ''}`}
            onDrop={handleDrop}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onClick={() => fileInputRef.current?.click()}
          >
            <UploadIcon size={48} />
            <p>Drag & drop your video here, or click to browse</p>
            <span className="drop-zone-hint">
              MP4, MPEG, MOV, AVI, MKV, WebM, OGG - Max 500MB
            </span>
            <input
              ref={fileInputRef}
              type="file"
              accept="video/*"
              onChange={(e) => handleFileSelect(e.target.files[0])}
              hidden
            />
          </div>
        ) : (
          <div className="file-preview">
            <Film size={32} />
            <div className="file-info">
              <strong>{file.name}</strong>
              <span>{formatSize(file.size)}</span>
            </div>
            {!uploading && (
              <button type="button" className="btn-icon" onClick={clearFile}>
                <X size={18} />
              </button>
            )}
          </div>
        )}

        {/* Upload progress */}
        {uploading && (
          <div className="upload-progress-section">
            <div className="progress-bar">
              <div
                className="progress-bar-fill"
                style={{ width: `${uploadProgress}%` }}
              />
            </div>
            <span className="progress-text">
              {uploadProgress < 100 ? `Uploading... ${uploadProgress}%` : 'Processing...'}
            </span>
          </div>
        )}

        {/* Metadata fields */}
        <div className="form-group">
          <label htmlFor="title">Title *</label>
          <input
            id="title"
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Video title"
            maxLength={200}
            required
            disabled={uploading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="description">Description</label>
          <textarea
            id="description"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Optional description"
            rows={3}
            maxLength={2000}
            disabled={uploading}
          />
        </div>

        <div className="form-group">
          <label htmlFor="category">Category</label>
          <input
            id="category"
            type="text"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            placeholder="e.g. tutorial, vlog, presentation"
            disabled={uploading}
          />
        </div>

        <button
          type="submit"
          className="btn btn-primary btn-block"
          disabled={!file || uploading}
        >
          {uploading ? 'Uploading...' : 'Upload & Process'}
        </button>
      </form>
    </div>
  );
}
