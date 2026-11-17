import React, { useEffect } from 'react';
import { useProjectStore } from '../../stores/projectStore.js';
import { ProjectCard } from './ProjectCard.js';
import { Button } from '../common/Button.js';
import { Spinner } from '../common/Spinner.js';

interface DashboardProps {
  onOpenCreateModal: () => void;
}

export const Dashboard: React.FC<DashboardProps> = ({ onOpenCreateModal }) => {
  const { projects, loading, loadProjects, selectProject, deleteProject } = useProjectStore();

  useEffect(() => {
    loadProjects();
  }, [loadProjects]);

  const handleDelete = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (confirm('Are you sure you want to delete this project and all its generated files?')) {
      await deleteProject(id);
    }
  };

  return (
    <div className="dashboard-container">
      <div className="dashboard-hero">
        <div className="hero-content">
          <h2>Turn Long Videos into Viral Shorts</h2>
          <p>
            Automatically analyze 20–30 minute videos, detect viral moments with multi-signal AI scoring, and produce 9:16 vertical Shorts with synced captions in seconds.
          </p>
          <div style={{ marginTop: '16px', display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
            <Button variant="primary" size="lg" onClick={onOpenCreateModal}>
              + Create Shorts Project
            </Button>
            <Button variant="secondary" size="lg" onClick={() => useProjectStore.getState().setActiveView('movieExplanation')}>
              🎬 Movie Explanation Studio
            </Button>
            <Button variant="secondary" size="lg" onClick={() => useProjectStore.getState().setActiveView('voiceover')}>
              🎙️ Voiceover Video Studio
            </Button>
          </div>
        </div>
      </div>

      {/* ── Movie & Series Explanation Studio Dedicated Banner ── */}
      <div
        style={{
          margin: '20px 0 28px',
          background: 'linear-gradient(135deg, rgba(30, 27, 75, 0.75), rgba(59, 7, 100, 0.75))',
          border: '1px solid rgba(168, 85, 247, 0.4)',
          borderRadius: '14px',
          padding: '24px 28px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '24px',
          boxShadow: '0 8px 32px rgba(0, 0, 0, 0.35)',
        }}
      >
        <div style={{ maxWidth: '780px' }}>
          <div style={{ display: 'inline-flex', alignItems: 'center', gap: '6px', padding: '3px 10px', background: 'rgba(168, 85, 247, 0.25)', borderRadius: '9999px', fontSize: '0.75rem', fontWeight: 700, color: '#c084fc', marginBottom: '8px', textTransform: 'uppercase' }}>
            Story-Aware AI Editing
          </div>
          <h3 style={{ fontSize: '1.35rem', fontWeight: 800, color: '#fff', margin: '0 0 6px' }}>
            Movie & Series Explanation Studio
          </h3>
          <p style={{ fontSize: '0.88rem', color: '#cbd5e1', margin: 0, lineHeight: '1.5' }}>
            Upload the original episode, explanation transcript, and voiceover. AI understands the story, selects relevant scenes, and creates a coherent explanation video.
          </p>
        </div>

        <Button
          variant="primary"
          size="lg"
          onClick={() => useProjectStore.getState().setActiveView('movieExplanation')}
          style={{ whiteSpace: 'nowrap', padding: '14px 24px', fontWeight: 700, background: 'linear-gradient(135deg, #6366f1, #a855f7)', border: 'none' }}
        >
          🎬 Open Explanation Studio
        </Button>
      </div>

      <div className="dashboard-section-header">
        <div>
          <h3>Recent Projects</h3>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {projects.length} {projects.length === 1 ? 'project' : 'projects'} in workspace
          </span>
        </div>
      </div>

      {loading ? (
        <div style={{ padding: '60px 0', display: 'flex', justifyContent: 'center' }}>
          <Spinner size="lg" label="Loading projects..." />
        </div>
      ) : projects.length === 0 ? (
        <div className="empty-state">
          <div className="empty-state-icon">🎬</div>
          <h3>No projects yet</h3>
          <p>Create your first project and upload a long-form video to start extracting high-performing Shorts.</p>
          <Button variant="primary" onClick={onOpenCreateModal} style={{ marginTop: '16px' }}>
            Create First Project
          </Button>
        </div>
      ) : (
        <div className="projects-grid">
          {projects.map((project) => (
            <ProjectCard
              key={project.id}
              project={project}
              onSelect={selectProject}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}
    </div>
  );
};
