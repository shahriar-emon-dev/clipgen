import React from 'react';
import { useProjectStore } from '../../stores/projectStore.js';
import { Badge } from '../common/Badge.js';

export const Header: React.FC = () => {
  const { currentProject, activeView, setActiveView } = useProjectStore();

  return (
    <header className="app-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flex: 1 }}>
        {activeView === 'project' && currentProject ? (
          <>
            <button
              className="btn btn-ghost btn-sm"
              onClick={() => setActiveView('dashboard')}
              style={{ padding: '4px 8px' }}
            >
              ← Projects
            </button>
            <span style={{ color: 'var(--border-hover)' }}>/</span>
            <span style={{ fontWeight: 700, fontSize: '1rem' }}>{currentProject.name}</span>
            <Badge variant={currentProject.status === 'analyzed' ? 'success' : currentProject.status === 'processing' ? 'warning' : 'accent'}>
              {currentProject.status}
            </Badge>
          </>
        ) : (
          <span style={{ fontWeight: 700, fontSize: '1.1rem' }}>
            {activeView === 'settings' ? 'Settings' : 'Projects Dashboard'}
          </span>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
        <span style={{ fontSize: '0.8rem', color: 'var(--text-tertiary)' }}>Workspace Studio</span>
      </div>
    </header>
  );
};
