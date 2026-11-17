import React, { useState } from 'react';
import { Modal } from '../common/Modal.js';
import { Button } from '../common/Button.js';
import { useProjectStore } from '../../stores/projectStore.js';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';

interface CreateProjectModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const CreateProjectModal: React.FC<CreateProjectModalProps> = ({ isOpen, onClose }) => {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [workflow, setWorkflow] = useState<'movieExplanation' | 'shorts' | 'voiceover'>('movieExplanation');
  const { createProject, setActiveView } = useProjectStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (workflow === 'voiceover') {
      setActiveView('voiceover');
      onClose();
      return;
    }

    if (workflow === 'movieExplanation') {
      setLoading(true);
      setError(null);
      try {
        await useMovieExplanationStore.getState().createProject(name.trim() || undefined);
        setActiveView('movieExplanation');
        setName('');
        onClose();
      } catch (err: any) {
        setError(err.message || 'Failed to create movie explanation project');
      } finally {
        setLoading(false);
      }
      return;
    }

    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      await createProject(name.trim());
      setName('');
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create project');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Create New Project"
    >
      <form onSubmit={handleSubmit}>
        {error && (
          <div style={{ padding: '8px 12px', background: 'var(--error-subtle)', color: 'var(--error)', borderRadius: 'var(--radius-md)', marginBottom: '16px', fontSize: '0.85rem' }}>
            {error}
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '10px', marginBottom: '20px' }}>
          <div
            onClick={() => setWorkflow('movieExplanation')}
            style={{
              padding: '12px',
              border: `2px solid ${workflow === 'movieExplanation' ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              background: workflow === 'movieExplanation' ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontSize: '1.4rem' }}>🎬</div>
            <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>Movie Explanation</div>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-tertiary)' }}>
              Full Episode + Script + Voiceover → Explanation Video
            </div>
          </div>

          <div
            onClick={() => setWorkflow('shorts')}
            style={{
              padding: '12px',
              border: `2px solid ${workflow === 'shorts' ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              background: workflow === 'shorts' ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontSize: '1.4rem' }}>⚡</div>
            <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>AI Shorts Studio</div>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-tertiary)' }}>
              Upload 1 video, extract viral highlights and 9:16 Shorts
            </div>
          </div>

          <div
            onClick={() => setWorkflow('voiceover')}
            style={{
              padding: '12px',
              border: `2px solid ${workflow === 'voiceover' ? 'var(--accent)' : 'var(--border)'}`,
              borderRadius: 'var(--radius-md)',
              background: workflow === 'voiceover' ? 'rgba(99, 102, 241, 0.08)' : 'var(--bg-tertiary)',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              gap: '4px',
            }}
          >
            <div style={{ fontSize: '1.4rem' }}>🎙️</div>
            <div style={{ fontWeight: 600, fontSize: '0.86rem' }}>Voiceover → Video</div>
            <div style={{ fontSize: '0.70rem', color: 'var(--text-tertiary)' }}>
              Voiceover narration + footage library → Visual Director
            </div>
          </div>
        </div>

        {(workflow === 'shorts' || workflow === 'movieExplanation') && (
          <div className="form-group">
            <label className="form-label">Project Name</label>
            <input
              className="input"
              type="text"
              placeholder={workflow === 'movieExplanation' ? 'e.g. The Mentalist S01E02, Inception Breakdown' : 'e.g. Podcast Episode 42, Keynote Speech'}
              value={name}
              onChange={(e) => setName(e.target.value)}
              autoFocus
              required={workflow === 'shorts'}
            />
            <span style={{ fontSize: '0.75rem', color: 'var(--text-tertiary)', marginTop: '4px' }}>
              {workflow === 'movieExplanation'
                ? 'Upload 45–90m episode video, script, and voiceover on the next step.'
                : 'You can upload a 20–30 minute video on the next step.'}
            </span>
          </div>
        )}

        <div style={{ marginTop: '24px', display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" loading={loading}>
            {workflow === 'voiceover'
              ? 'Open Voiceover Studio'
              : workflow === 'movieExplanation'
              ? 'Start Movie Project'
              : 'Create Project'}
          </Button>
        </div>
      </form>
    </Modal>
  );
};
