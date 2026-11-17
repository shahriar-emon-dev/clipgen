import React, { useState, useRef } from 'react';
import { useProjectStore } from '../../stores/projectStore.js';
import { Button } from '../common/Button.js';
import { ProgressBar } from '../common/ProgressBar.js';

interface UploadZoneProps {
  projectId: string;
}

export const UploadZone: React.FC<UploadZoneProps> = ({ projectId }) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { uploadVideo, uploading, uploadProgress, error } = useProjectStore();

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      await processFile(files[0]);
    }
  };

  const processFile = async (file: File) => {
    try {
      await uploadVideo(projectId, file);
    } catch (err) {
      // Error handled by store
    }
  };

  return (
    <div className="upload-zone-wrapper">
      <div
        className={`upload-zone ${isDragOver ? 'drag-over' : ''} ${uploading ? 'uploading' : ''}`}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          type="file"
          ref={fileInputRef}
          onChange={handleFileChange}
          accept="video/mp4,video/quicktime,video/webm,video/x-matroska,video/avi"
          style={{ display: 'none' }}
          disabled={uploading}
        />

        {uploading ? (
          <div className="upload-progress-container">
            <div className="upload-icon-anim">🚀</div>
            <h3>Uploading Video...</h3>
            <p>Inspecting video metadata and preparing analysis pipeline</p>
            <div style={{ marginTop: '16px', width: '100%', maxWidth: '400px' }}>
              <ProgressBar progress={uploadProgress} height={8} showPercent />
            </div>
          </div>
        ) : (
          <div className="upload-prompt">
            <div className="upload-icon">📹</div>
            <h3>Drop your 20–30 minute video here</h3>
            <p>Supports MP4, MOV, WebM, MKV (up to 5GB)</p>
            <Button variant="primary" style={{ marginTop: '16px' }} onClick={(e) => { e.stopPropagation(); fileInputRef.current?.click(); }}>
              Select Video File
            </Button>
          </div>
        )}
      </div>

      {error && (
        <div className="upload-error-banner">
          <span>⚠️ {error}</span>
        </div>
      )}
    </div>
  );
};
