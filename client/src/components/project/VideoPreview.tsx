import React, { useRef, useState, useEffect } from 'react';
import type { Video } from '@shared/types.js';

interface VideoPreviewProps {
  video: Video;
  currentTime: number;
  onTimeUpdate: (time: number) => void;
  seekTime: number | null;
}

export const VideoPreview: React.FC<VideoPreviewProps> = ({
  video,
  currentTime,
  onTimeUpdate,
  seekTime,
}) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(video.duration || 0);

  useEffect(() => {
    if (seekTime !== null && videoRef.current) {
      videoRef.current.currentTime = seekTime;
    }
  }, [seekTime]);

  const togglePlay = () => {
    if (videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
      setIsPlaying(!isPlaying);
    }
  };

  const handleTimeUpdate = () => {
    if (videoRef.current) {
      onTimeUpdate(videoRef.current.currentTime);
    }
  };

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60);
    const s = Math.floor(seconds % 60);
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  const videoUrl = `/api/files/${video.projectId}/${video.filename}`;

  return (
    <div className="card video-player-card">
      <div className="video-viewport-wrapper">
        <video
          ref={videoRef}
          src={videoUrl}
          className="video-element"
          onTimeUpdate={handleTimeUpdate}
          onLoadedMetadata={() => setDuration(videoRef.current?.duration || video.duration)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onClick={togglePlay}
        />

        <div className="player-overlay-controls">
          <button className="player-play-btn" onClick={togglePlay}>
            {isPlaying ? '⏸' : '▶'}
          </button>
          <span className="player-time-label">
            {formatTime(currentTime)} / {formatTime(duration)}
          </span>
        </div>
      </div>
    </div>
  );
};
