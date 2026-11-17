import React from 'react';
import type { Project } from '@shared/types.js';
import { Badge } from '../common/Badge.js';

interface ProjectCardProps {
  project: Project & { highlightCount?: number; shortsCount?: number };
  onSelect: (id: string) => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
}

export const ProjectCard: React.FC<ProjectCardProps> = ({
  project,
  onSelect,
  onDelete,
}) => {
  const getBadgeVariant = (status: string) => {
    switch (status) {
      case 'analyzed': return 'success';
      case 'processing': return 'warning';
      case 'uploaded': return 'info';
      case 'error': return 'error';
      default: return 'accent';
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="card project-card" onClick={() => onSelect(project.id)}>
      <div className="project-card-header">
        <div className="project-icon">🎬</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="project-title truncate">{project.name}</h3>
          <span className="project-date">{formatDate(project.createdAt)}</span>
        </div>
        <button
          className="btn btn-ghost btn-sm project-delete-btn"
          onClick={(e) => onDelete(project.id, e)}
          title="Delete Project"
        >
          🗑️
        </button>
      </div>

      <div className="project-card-body">
        <div className="project-stats">
          <div className="project-stat-item">
            <span className="stat-value">{project.highlightCount || 0}</span>
            <span className="stat-label">Highlights</span>
          </div>
          <div className="project-stat-item">
            <span className="stat-value">{project.shortsCount || 0}</span>
            <span className="stat-label">Shorts</span>
          </div>
        </div>
      </div>

      <div className="project-card-footer">
        <Badge variant={getBadgeVariant(project.status)}>
          {project.status.toUpperCase()}
        </Badge>
        <span className="project-open-link">Open Studio →</span>
      </div>
    </div>
  );
};
