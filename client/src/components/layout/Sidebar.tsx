import React from 'react';
import { useProjectStore } from '../../stores/projectStore.js';
import { useAuthStore } from '../../stores/authStore.js';

interface SidebarProps {
  onOpenCreateModal: () => void;
}

export const Sidebar: React.FC<SidebarProps> = ({ onOpenCreateModal }) => {
  const { activeView, setActiveView, currentProject } = useProjectStore();
  const { user } = useAuthStore();

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo">
        <span className="logo-icon">⚡</span>
        <div>
          <h1>ClipGen</h1>
          <span style={{ fontSize: '0.7rem', color: 'var(--text-tertiary)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: 600 }}>
            AI Shorts Studio
          </span>
        </div>
      </div>

      <nav className="sidebar-nav">
        <button
          className={`sidebar-nav-item ${activeView === 'dashboard' ? 'active' : ''}`}
          onClick={() => setActiveView('dashboard')}
        >
          <span className="nav-icon">📊</span>
          <span>Dashboard</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeView === 'movieExplanation' ? 'active' : ''}`}
          onClick={() => setActiveView('movieExplanation')}
        >
          <span className="nav-icon">🎥</span>
          <span>Movie Explanation</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeView === 'movieAnalyzer' ? 'active' : ''}`}
          onClick={() => setActiveView('movieAnalyzer')}
        >
          <span className="nav-icon">🧠</span>
          <span>Movie Analyzer & Script</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeView === 'voiceover' ? 'active' : ''}`}
          onClick={() => setActiveView('voiceover')}
        >
          <span className="nav-icon">🎙️</span>
          <span>Voiceover Video</span>
        </button>

        <button
          className={`sidebar-nav-item ${activeView === 'projectLibrary' ? 'active' : ''}`}
          onClick={() => setActiveView('projectLibrary')}
        >
          <span className="nav-icon">🗄️</span>
          <span>Project Library</span>
        </button>

        {currentProject && (
          <button
            className={`sidebar-nav-item ${activeView === 'project' ? 'active' : ''}`}
            onClick={() => setActiveView('project')}
          >
            <span className="nav-icon">🎬</span>
            <span className="truncate" style={{ maxWidth: '140px' }}>{currentProject.name}</span>
          </button>
        )}

        <button
          className={`sidebar-nav-item ${activeView === 'settings' ? 'active' : ''}`}
          onClick={() => setActiveView('settings')}
        >
          <span className="nav-icon">⚙️</span>
          <span>Settings</span>
        </button>

        <div style={{ marginTop: 'auto', paddingTop: '16px', borderTop: '1px solid var(--border)' }}>
          <button
            className="btn btn-primary btn-sm w-full"
            onClick={onOpenCreateModal}
            style={{ marginBottom: '12px' }}
          >
            + New Project
          </button>

          {user && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', padding: '6px 8px', fontSize: '0.8rem', color: 'var(--text-secondary)' }}>
              <span style={{ width: '24px', height: '24px', borderRadius: '50%', background: 'var(--accent-subtle)', color: 'var(--accent-light)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                {user.name ? user.name[0].toUpperCase() : 'U'}
              </span>
              <span className="truncate">{user.name || user.email}</span>
            </div>
          )}
        </div>
      </nav>
    </aside>
  );
};
