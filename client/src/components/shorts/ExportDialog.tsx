import React from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import type { Short } from '@shared/types.js';
import { api } from '../../services/api.js';

interface ExportDialogProps {
  short: Short | null;
  isOpen: boolean;
  onClose: () => void;
}

export const ExportDialog: React.FC<ExportDialogProps> = ({ short, isOpen, onClose }) => {
  if (!short) return null;

  const downloadUrl = api.getDownloadUrl(short.id);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Export & Download Short">
      <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
        <div style={{ background: 'var(--bg-tertiary)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Resolution</span>
            <span style={{ fontWeight: 700 }}>1080 × 1920 (9:16 Vertical)</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Duration</span>
            <span style={{ fontWeight: 700 }}>{Math.round(short.duration)} seconds</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Captions</span>
            <span style={{ fontWeight: 700 }}>{short.captionsEnabled ? 'Embedded Subtitles' : 'None'}</span>
          </div>
          <div style={{ display: 'flex', justifyContent: 'space-between' }}>
            <span style={{ color: 'var(--text-secondary)', fontSize: '0.85rem' }}>Format</span>
            <span style={{ fontWeight: 700 }}>H.264 MP4 (Optimized for Mobile)</span>
          </div>
        </div>

        {short.status === 'completed' && short.filePath ? (
          <a
            href={downloadUrl}
            download={`short_${short.id.substring(0, 8)}.mp4`}
            className="btn btn-primary btn-lg w-full"
            style={{ textDecoration: 'none', textAlign: 'center' }}
          >
            📥 Download MP4 Short
          </a>
        ) : (
          <div style={{ textAlign: 'center', padding: '12px', color: 'var(--warning)', fontSize: '0.9rem' }}>
            Short is currently {short.status}. Please wait for rendering to finish.
          </div>
        )}

        <Button variant="ghost" onClick={onClose}>
          Close
        </Button>
      </div>
    </Modal>
  );
};
