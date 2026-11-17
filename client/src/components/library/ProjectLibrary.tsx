// ============================================================
// Project Library — Central Storage & Project Management
// Allows viewing, filtering, individual asset deletion, bulk deletion,
// trash restore, and safe protected global cleanup.
// ============================================================

import React, { useEffect, useState, useMemo } from 'react';
import { useProjectLibraryStore } from '../../stores/projectLibraryStore.js';
import { useProjectStore } from '../../stores/projectStore.js';
import { useMovieAnalyzerStore } from '../../stores/movieAnalyzerStore.js';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';
import type {
  ProjectLibraryCategory,
  ProjectLibraryItem,
  ProjectLibraryAsset,
  ProjectLibraryAssetType,
} from '@shared/types.js';

export const ProjectLibrary: React.FC = () => {
  const {
    overview,
    loading,
    error,
    selectedCategory,
    searchQuery,
    selectedItemKeys,
    viewMode,
    actionInProgress,
    actionMessage,
    loadOverview,
    setSelectedCategory,
    setSearchQuery,
    setViewMode,
    toggleItemSelection,
    selectAllItems,
    clearSelection,
    deleteProject,
    restoreProject,
    deleteAsset,
    bulkDeleteSelected,
    deleteAllProjects,
    cleanupOrphans,
  } = useProjectLibraryStore();

  const { setActiveView, selectProject } = useProjectStore();
  const { selectProject: selectAnalyzerProject } = useMovieAnalyzerStore();
  const { loadProject: loadExplanationProject } = useMovieExplanationStore();

  // Dialog & Modal States
  const [deleteTarget, setDeleteTarget] = useState<{
    kind: 'project' | 'asset';
    category: ProjectLibraryCategory;
    projectId: string;
    projectName: string;
    assetType?: ProjectLibraryAssetType;
    assetName?: string;
    permanent?: boolean;
  } | null>(null);

  const [showBulkModal, setShowBulkModal] = useState(false);
  const [showDeleteAllModal, setShowDeleteAllModal] = useState(false);
  const [deleteAllPhrase, setDeleteAllPhrase] = useState('');
  const [deleteAllScope, setDeleteAllScope] = useState<'all' | 'trash_only' | 'assets_only'>('all');
  const [orphanMessage, setOrphanMessage] = useState<string | null>(null);

  // Expanded projects accordion state
  const [expandedProjects, setExpandedProjects] = useState<Record<string, boolean>>({});

  useEffect(() => {
    loadOverview();
  }, [loadOverview]);

  const toggleExpand = (id: string) => {
    setExpandedProjects((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  // Filter projects by category, search query, and view mode (active vs trash)
  const displayedProjects = useMemo(() => {
    if (!overview || !overview.projects) return [];
    let list = viewMode === 'active'
      ? overview.projects.filter((p) => !p.isTrash)
      : overview.projects.filter((p) => !!p.isTrash);

    if (selectedCategory !== 'all') {
      list = list.filter((p) => p.type === selectedCategory);
    }

    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      list = list.filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          p.id.toLowerCase().includes(q) ||
          p.assets.some((a) => a.name.toLowerCase().includes(q) || a.filename.toLowerCase().includes(q))
      );
    }

    return list;
  }, [overview, selectedCategory, searchQuery, viewMode]);

  // Keys in currently displayed view for "Select All"
  const currentViewKeys = useMemo(() => {
    return displayedProjects.map((p) => `proj:${p.type}:${p.id}`);
  }, [displayedProjects]);

  const isAllCurrentSelected =
    currentViewKeys.length > 0 && currentViewKeys.every((k) => selectedItemKeys.includes(k));

  // Handler to open project in its corresponding studio
  const handleOpenProject = async (p: ProjectLibraryItem) => {
    try {
      if (p.type === 'movie_analyzer') {
        await selectAnalyzerProject(p.id);
        setActiveView('movieAnalyzer');
      } else if (p.type === 'movie_explanation') {
        await loadExplanationProject(p.id);
        setActiveView('movieExplanation');
      } else if (p.type === 'voiceover') {
        setActiveView('voiceover');
      } else {
        await selectProject(p.id);
        setActiveView('project');
      }
    } catch (e: any) {
      console.error('Failed to open project:', e);
    }
  };

  // Category labels and icons
  const categoryMeta: Record<ProjectLibraryCategory, { label: string; icon: string; color: string }> = {
    movie_analyzer: { label: 'Movie Analyzer', icon: '🧠', color: '#6366f1' },
    movie_explanation: { label: 'Movie Explanation', icon: '🎥', color: '#ec4899' },
    voiceover: { label: 'Voiceover Video', icon: '🎙️', color: '#10b981' },
    clipping: { label: 'Shorts Clipping', icon: '🎬', color: '#f59e0b' },
  };

  const assetTypeIcons: Record<ProjectLibraryAssetType, string> = {
    video: '📹',
    transcript: '📄',
    script: '📝',
    audio: '🎵',
    thumbnail: '🖼️',
    render: '🎞️',
    clips: '✂️',
    other: '📦',
  };

  return (
    <div className="project-library-container" style={{ padding: '24px 32px', maxWidth: '1400px', margin: '0 auto', color: '#e2e8f0' }}>
      {/* ── Top Header & Actions ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px', flexWrap: 'wrap', gap: '16px' }}>
        <div>
          <h1 style={{ fontSize: '1.75rem', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: '10px' }}>
            <span>🗄️</span> Project Library & Storage Cleanup
          </h1>
          <p style={{ margin: '4px 0 0', color: '#94a3b8', fontSize: '0.9rem' }}>
            Inspect, manage, and safely clean up projects, source videos, transcripts, scripts, and audio assets.
          </p>
        </div>

        <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
          <button
            className="btn btn-secondary btn-sm"
            onClick={async () => {
              const res = await cleanupOrphans();
              if (res) {
                setOrphanMessage('Storage orphan cleanup completed successfully.');
                setTimeout(() => setOrphanMessage(null), 4000);
              }
            }}
            disabled={actionInProgress}
            style={{ display: 'flex', alignItems: 'center', gap: '6px', background: '#1e293b', border: '1px solid #334155' }}
            title="Clean untracked or orphaned files from disk storage"
          >
            <span>🧹</span> Clean Storage
          </button>

          <button
            className="btn btn-danger btn-sm"
            onClick={() => {
              setDeleteAllPhrase('');
              setShowDeleteAllModal(true);
            }}
            disabled={actionInProgress}
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <span>⚠️</span> Delete All Projects
          </button>
        </div>
      </div>

      {/* Notification / Action Banner */}
      {(actionInProgress || actionMessage || orphanMessage || error) && (
        <div
          style={{
            padding: '12px 16px',
            borderRadius: '8px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: error ? 'rgba(239, 68, 68, 0.15)' : 'rgba(59, 130, 246, 0.15)',
            border: `1px solid ${error ? '#ef4444' : '#3b82f6'}`,
            color: error ? '#fca5a5' : '#bfdbfe',
            fontSize: '0.9rem',
          }}
        >
          <span>{actionMessage || orphanMessage || error}</span>
          {actionInProgress && <span className="spinner-border spinner-border-sm" />}
        </div>
      )}

      {/* ── Metric Summary Cards ── */}
      {overview && (
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px', marginBottom: '24px' }}>
          <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Active Projects
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#f8fafc', marginTop: '4px' }}>
              {overview.totalProjectsCount}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              Across 4 studio modules
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Disk Storage Used
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#38bdf8', marginTop: '4px' }}>
              {overview.formattedTotalStorage}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              Actual files on local drive
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Source Videos
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#a78bfa', marginTop: '4px' }}>
              {overview.projects.reduce((acc, p) => acc + p.assets.filter((a) => a.type === 'video').length, 0)}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              MP4, MKV, and uploaded cuts
            </div>
          </div>

          <div style={{ background: '#1e293b', padding: '16px 20px', borderRadius: '10px', border: '1px solid #334155' }}>
            <div style={{ fontSize: '0.8rem', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Transcripts & Audio
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: '#34d399', marginTop: '4px' }}>
              {overview.projects.reduce(
                (acc, p) => acc + p.assets.filter((a) => a.type === 'transcript' || a.type === 'script' || a.type === 'audio').length,
                0
              )}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '2px' }}>
              Scripts, TXT, and voiceovers
            </div>
          </div>

          <div
            onClick={() => setViewMode(viewMode === 'active' ? 'trash' : 'active')}
            style={{
              background: viewMode === 'trash' ? 'rgba(239, 68, 68, 0.15)' : '#1e293b',
              padding: '16px 20px',
              borderRadius: '10px',
              border: `1px solid ${viewMode === 'trash' ? '#ef4444' : '#334155'}`,
              cursor: 'pointer',
              transition: 'all 0.2s ease',
            }}
          >
            <div style={{ fontSize: '0.8rem', color: viewMode === 'trash' ? '#fca5a5' : '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }}>
              Trash Bin
            </div>
            <div style={{ fontSize: '1.75rem', fontWeight: 700, color: viewMode === 'trash' ? '#f87171' : '#f43f5e', marginTop: '4px' }}>
              {overview.trashCount}
            </div>
            <div style={{ fontSize: '0.75rem', color: '#94a3b8', marginTop: '2px' }}>
              {viewMode === 'trash' ? 'Viewing deleted items (Click to exit)' : 'Click to view / restore deleted'}
            </div>
          </div>
        </div>
      )}

      {/* ── Search, Categories, and Mode Bar ── */}
      <div
        style={{
          background: '#0f172a',
          padding: '16px 20px',
          borderRadius: '10px',
          border: '1px solid #1e293b',
          marginBottom: '20px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px',
        }}
      >
        {/* Category Tabs */}
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            className={`btn btn-sm ${selectedCategory === 'all' ? 'btn-primary' : 'btn-secondary'}`}
            onClick={() => setSelectedCategory('all')}
            style={{ fontSize: '0.85rem' }}
          >
            All Categories ({overview?.totalProjectsCount || 0})
          </button>
          {(['movie_analyzer', 'movie_explanation', 'voiceover', 'clipping'] as ProjectLibraryCategory[]).map((cat) => {
            const meta = categoryMeta[cat];
            const count = overview?.countsByCategory?.[cat] || 0;
            return (
              <button
                key={cat}
                className={`btn btn-sm ${selectedCategory === cat ? 'btn-primary' : 'btn-secondary'}`}
                onClick={() => setSelectedCategory(cat)}
                style={{
                  fontSize: '0.85rem',
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  background: selectedCategory === cat ? undefined : '#1e293b',
                  borderColor: selectedCategory === cat ? undefined : '#334155',
                }}
              >
                <span>{meta.icon}</span>
                <span>{meta.label}</span>
                <span style={{ background: 'rgba(255,255,255,0.15)', padding: '2px 6px', borderRadius: '10px', fontSize: '0.75rem' }}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search Input */}
        <div style={{ position: 'relative', minWidth: '260px' }}>
          <input
            type="text"
            className="form-input form-input-sm"
            placeholder="Search by name, file, or ID..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              paddingLeft: '32px',
              background: '#1e293b',
              border: '1px solid #334155',
              color: '#f8fafc',
              borderRadius: '6px',
              width: '100%',
            }}
          />
          <span style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: '#64748b' }}>
            🔍
          </span>
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
              }}
            >
              ✕
            </button>
          )}
        </div>
      </div>

      {/* ── Bulk Selection Bar (Shown when items are selected) ── */}
      {selectedItemKeys.length > 0 && (
        <div
          style={{
            background: 'linear-gradient(90deg, #1e293b, #0f172a)',
            padding: '12px 20px',
            borderRadius: '8px',
            border: '1px solid #3b82f6',
            marginBottom: '16px',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <span style={{ fontWeight: 600, color: '#60a5fa' }}>
              ✓ {selectedItemKeys.length} {selectedItemKeys.length === 1 ? 'item' : 'items'} selected
            </span>
            <button
              className="btn btn-ghost btn-xs"
              onClick={clearSelection}
              style={{ color: '#94a3b8', textDecoration: 'underline' }}
            >
              Clear selection
            </button>
          </div>

          <div style={{ display: 'flex', gap: '8px' }}>
            <button
              className="btn btn-danger btn-sm"
              onClick={() => setShowBulkModal(true)}
              disabled={actionInProgress}
            >
              🗑️ Delete Selected ({selectedItemKeys.length})
            </button>
          </div>
        </div>
      )}

      {/* ── View Mode Indicator & Select All Control ── */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '12px', padding: '0 4px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: '8px', cursor: 'pointer', fontSize: '0.85rem', color: '#94a3b8' }}>
            <input
              type="checkbox"
              checked={isAllCurrentSelected}
              onChange={() => selectAllItems(currentViewKeys)}
              style={{ cursor: 'pointer' }}
            />
            <span>Select all {displayedProjects.length} projects in view</span>
          </label>
        </div>

        <div style={{ fontSize: '0.85rem', color: '#64748b' }}>
          {viewMode === 'trash' ? (
            <span style={{ color: '#f87171', fontWeight: 600 }}>🗑️ Viewing Trash Bin (Items can be restored or purged)</span>
          ) : (
            <span>Showing {displayedProjects.length} active projects</span>
          )}
        </div>
      </div>

      {/* ── Project Cards / Rows ── */}
      {loading && !overview ? (
        <div style={{ textAlign: 'center', padding: '60px 0', color: '#94a3b8' }}>
          <div className="spinner-border mb-3" style={{ width: '3rem', height: '3rem' }} />
          <div>Scanning storage directories across application...</div>
        </div>
      ) : displayedProjects.length === 0 ? (
        <div
          style={{
            textAlign: 'center',
            padding: '60px 20px',
            background: '#0f172a',
            borderRadius: '12px',
            border: '1px dashed #334155',
            color: '#94a3b8',
          }}
        >
          <div style={{ fontSize: '2.5rem', marginBottom: '12px' }}>{viewMode === 'trash' ? '🗑️' : '📁'}</div>
          <div style={{ fontSize: '1.1rem', fontWeight: 600, color: '#f8fafc', marginBottom: '4px' }}>
            {viewMode === 'trash' ? 'Trash Bin is empty' : 'No projects found'}
          </div>
          <div style={{ fontSize: '0.85rem', maxWidth: '400px', margin: '0 auto' }}>
            {viewMode === 'trash'
              ? 'Deleted projects moved to the trash will appear here before permanent deletion.'
              : searchQuery
              ? 'No projects match your search query. Try clearing the search filter.'
              : 'Create a new project using the + New Project button in the sidebar.'}
          </div>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
          {displayedProjects.map((p) => {
            const meta = categoryMeta[p.type] || { label: p.typeLabel || p.type, icon: '📁', color: '#64748b' };
            const isSelected = selectedItemKeys.includes(`proj:${p.type}:${p.id}`);
            const isExpanded = expandedProjects[p.id] !== false; // Default expanded

            return (
              <div
                key={p.id}
                style={{
                  background: '#1e293b',
                  borderRadius: '10px',
                  border: isSelected ? '1px solid #3b82f6' : '1px solid #334155',
                  overflow: 'hidden',
                  transition: 'all 0.15s ease',
                  boxShadow: '0 2px 8px rgba(0,0,0,0.2)',
                }}
              >
                {/* Project Header Row */}
                <div
                  style={{
                    padding: '16px 20px',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: '12px',
                    background: isSelected ? 'rgba(59, 130, 246, 0.08)' : undefined,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '14px', flex: '1 1 300px' }}>
                    <input
                      type="checkbox"
                      checked={isSelected}
                      onChange={() => toggleItemSelection(`proj:${p.type}:${p.id}`)}
                      style={{ cursor: 'pointer', width: '16px', height: '16px' }}
                    />

                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                        <span
                          style={{
                            fontSize: '0.75rem',
                            fontWeight: 700,
                            padding: '2px 8px',
                            borderRadius: '4px',
                            background: `${meta.color}20`,
                            color: meta.color,
                            border: `1px solid ${meta.color}40`,
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px',
                          }}
                        >
                          <span>{meta.icon}</span>
                          <span>{meta.label}</span>
                        </span>

                        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: '#f8fafc' }}>
                          {p.name}
                        </h3>

                        {p.status && (
                          <span
                            style={{
                              fontSize: '0.75rem',
                              padding: '2px 6px',
                              borderRadius: '4px',
                              background: '#334155',
                              color: '#94a3b8',
                            }}
                          >
                            {p.status}
                          </span>
                        )}
                      </div>

                      <div style={{ display: 'flex', gap: '14px', fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>
                        <span>Created: {new Date(p.createdAt).toLocaleDateString()}</span>
                        <span>•</span>
                        <span>Storage: <strong style={{ color: '#38bdf8' }}>{p.formattedTotalStorage || p.formattedTotalSize}</strong></span>
                        <span>•</span>
                        <span>Assets: {p.assets.length}</span>
                        <span>•</span>
                        <span style={{ fontFamily: 'monospace' }}>ID: {p.id.slice(0, 8)}...</span>
                      </div>
                    </div>
                  </div>

                  {/* Project Action Controls */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    {viewMode === 'active' ? (
                      <>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => handleOpenProject(p)}
                          style={{ background: '#0f172a', border: '1px solid #334155' }}
                        >
                          🚀 Open in Studio
                        </button>

                        <button
                          className="btn btn-ghost btn-xs"
                          onClick={() =>
                            setDeleteTarget({
                              kind: 'project',
                              category: p.type,
                              projectId: p.id,
                              projectName: p.name,
                              permanent: false,
                            })
                          }
                          title="Move project to Trash"
                          style={{ color: '#f87171' }}
                        >
                          🗑️ Move to Trash
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          className="btn btn-secondary btn-xs"
                          onClick={() => restoreProject(p.type, p.id)}
                          style={{ color: '#34d399', borderColor: '#059669' }}
                        >
                          🔄 Restore
                        </button>

                        <button
                          className="btn btn-danger btn-xs"
                          onClick={() =>
                            setDeleteTarget({
                              kind: 'project',
                              category: p.type,
                              projectId: p.id,
                              projectName: p.name,
                              permanent: true,
                            })
                          }
                        >
                          ❌ Delete Permanently
                        </button>
                      </>
                    )}

                    <button
                      className="btn btn-ghost btn-xs"
                      onClick={() => toggleExpand(p.id)}
                      style={{ color: '#94a3b8', padding: '4px 6px' }}
                      title={isExpanded ? 'Collapse files' : 'Expand files'}
                    >
                      {isExpanded ? '▲' : '▼'}
                    </button>
                  </div>
                </div>

                {/* ── Expandable Individual Asset List ── */}
                {isExpanded && (
                  <div style={{ background: '#0f172a', borderTop: '1px solid #334155', padding: '12px 20px' }}>
                    <div style={{ fontSize: '0.75rem', fontWeight: 600, color: '#64748b', textTransform: 'uppercase', marginBottom: '8px', letterSpacing: '0.05em' }}>
                      Associated Files ({p.assets.length})
                    </div>

                    {p.assets.length === 0 ? (
                      <div style={{ fontSize: '0.8rem', color: '#64748b', fontStyle: 'italic', padding: '6px 0' }}>
                        No physical files currently stored for this project.
                      </div>
                    ) : (
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: '8px' }}>
                        {p.assets.map((asset) => {
                          const assetKey = `asset:${p.type}:${p.id}:${asset.type}`;
                          const isAssetSelected = selectedItemKeys.includes(assetKey);

                          return (
                            <div
                              key={asset.assetId}
                              style={{
                                background: isAssetSelected ? 'rgba(59, 130, 246, 0.12)' : '#1e293b',
                                border: isAssetSelected ? '1px solid #3b82f6' : '1px solid #334155',
                                borderRadius: '6px',
                                padding: '10px 14px',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'space-between',
                                gap: '10px',
                              }}
                            >
                              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0, flex: 1 }}>
                                {viewMode === 'active' && asset.canDeleteIndividually && (
                                  <input
                                    type="checkbox"
                                    checked={isAssetSelected}
                                    onChange={() => toggleItemSelection(assetKey)}
                                    style={{ cursor: 'pointer' }}
                                  />
                                )}

                                <span style={{ fontSize: '1.2rem' }}>
                                  {assetTypeIcons[asset.type] || '📦'}
                                </span>

                                <div style={{ minWidth: 0 }}>
                                  <div
                                    style={{
                                      fontSize: '0.85rem',
                                      fontWeight: 600,
                                      color: '#f1f5f9',
                                      whiteSpace: 'nowrap',
                                      overflow: 'hidden',
                                      textOverflow: 'ellipsis',
                                    }}
                                    title={asset.filename}
                                  >
                                    {asset.name}
                                  </div>
                                  <div style={{ fontSize: '0.7rem', color: '#94a3b8', display: 'flex', gap: '8px', marginTop: '2px' }}>
                                    <span style={{ color: '#38bdf8', fontWeight: 600 }}>{asset.formattedSize}</span>
                                    {asset.metadata?.duration && (
                                      <span>• {Math.round(asset.metadata.duration)}s</span>
                                    )}
                                    {asset.metadata?.resolution && (
                                      <span>• {asset.metadata.resolution}</span>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Individual Asset Delete Button */}
                              {viewMode === 'active' && asset.canDeleteIndividually && (
                                <button
                                  className="btn btn-ghost btn-xs"
                                  onClick={() =>
                                    setDeleteTarget({
                                      kind: 'asset',
                                      category: p.type,
                                      projectId: p.id,
                                      projectName: p.name,
                                      assetType: asset.type,
                                      assetName: asset.name,
                                    })
                                  }
                                  title={`Delete this ${asset.type} only (Leaves project intact)`}
                                  style={{ color: '#f87171', padding: '2px 6px' }}
                                >
                                  ✕
                                </button>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* ── Single Item Delete Confirmation Dialog ── */}
      {deleteTarget && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 12px', color: '#f8fafc' }}>
              {deleteTarget.kind === 'asset'
                ? `Delete ${deleteTarget.assetType?.toUpperCase()} File?`
                : deleteTarget.permanent
                ? 'Permanently Delete Project?'
                : 'Move Project to Trash?'}
            </h3>

            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 16px' }}>
              {deleteTarget.kind === 'asset' ? (
                <>
                  Are you sure you want to delete the file <strong>"{deleteTarget.assetName}"</strong> from project <strong>"{deleteTarget.projectName}"</strong>?
                  <br />
                  <br />
                  <span style={{ color: '#38bdf8' }}>
                    ✓ Safe deletion: This removes only this specific file from disk. The rest of the project and other assets will remain untouched.
                  </span>
                </>
              ) : deleteTarget.permanent ? (
                <>
                  This will <strong>permanently destroy</strong> all files, transcripts, scripts, and video renders associated with <strong>"{deleteTarget.projectName}"</strong> from your hard drive.
                  <br />
                  <br />
                  <span style={{ color: '#f87171' }}>⚠️ This action cannot be undone.</span>
                </>
              ) : (
                <>
                  Move <strong>"{deleteTarget.projectName}"</strong> to the Trash Bin?
                  <br />
                  <br />
                  <span style={{ color: '#34d399' }}>
                    ✓ You can restore this project anytime from the Trash Bin before permanently deleting it.
                  </span>
                </>
              )}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setDeleteTarget(null)}
                disabled={actionInProgress}
              >
                Cancel
              </button>

              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (deleteTarget.kind === 'asset' && deleteTarget.assetType) {
                    await deleteAsset(deleteTarget.category, deleteTarget.projectId, deleteTarget.assetType);
                  } else {
                    await deleteProject(deleteTarget.category, deleteTarget.projectId, deleteTarget.permanent);
                  }
                  setDeleteTarget(null);
                }}
                disabled={actionInProgress}
              >
                {deleteTarget.permanent || deleteTarget.kind === 'asset' ? 'Yes, Delete' : 'Move to Trash'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Bulk Delete Confirmation Modal ── */}
      {showBulkModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.75)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#1e293b',
              border: '1px solid #475569',
              borderRadius: '12px',
              padding: '24px',
              maxWidth: '480px',
              width: '100%',
              boxShadow: '0 20px 25px -5px rgba(0,0,0,0.5)',
            }}
          >
            <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: '0 0 12px', color: '#f8fafc' }}>
              Delete Selected Items?
            </h3>

            <p style={{ color: '#cbd5e1', fontSize: '0.9rem', lineHeight: 1.5, margin: '0 0 16px' }}>
              You have selected <strong>{selectedItemKeys.length} items</strong> for deletion.
              <br />
              <br />
              {viewMode === 'trash' ? (
                <span style={{ color: '#f87171' }}>
                  ⚠️ These trashed items will be <strong>permanently deleted</strong> from disk storage.
                </span>
              ) : (
                <span style={{ color: '#38bdf8' }}>
                  ✓ Selected projects will be moved to the Trash Bin, and selected individual assets will be removed from disk.
                </span>
              )}
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowBulkModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </button>

              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  await bulkDeleteSelected(viewMode === 'trash');
                  setShowBulkModal(false);
                }}
                disabled={actionInProgress}
              >
                Yes, Delete {selectedItemKeys.length} Items
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Protected DELETE ALL Projects Modal ── */}
      {showDeleteAllModal && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.85)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            padding: '16px',
          }}
        >
          <div
            style={{
              background: '#0f172a',
              border: '2px solid #ef4444',
              borderRadius: '14px',
              padding: '28px',
              maxWidth: '540px',
              width: '100%',
              boxShadow: '0 25px 50px -12px rgba(239, 68, 68, 0.35)',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
              <span style={{ fontSize: '2rem' }}>⚠️</span>
              <div>
                <h3 style={{ fontSize: '1.35rem', fontWeight: 800, margin: 0, color: '#f87171' }}>
                  Protected Action: Delete All Projects
                </h3>
                <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                  Global storage cleanout with explicit phrase confirmation
                </span>
              </div>
            </div>

            <div style={{ background: '#1e293b', padding: '14px 16px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.85rem', color: '#cbd5e1' }}>
              <div style={{ marginBottom: '6px' }}>
                Total Active Projects: <strong style={{ color: '#f8fafc' }}>{overview?.totalProjects || 0}</strong>
              </div>
              <div style={{ marginBottom: '6px' }}>
                Total Storage Affected: <strong style={{ color: '#38bdf8' }}>{overview?.formattedTotalStorage || '0 B'}</strong>
              </div>
              <div>
                Trash Items: <strong style={{ color: '#f87171' }}>{overview?.trashCount || 0}</strong>
              </div>
            </div>

            <div style={{ marginBottom: '16px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#94a3b8', marginBottom: '6px' }}>
                Select Cleanup Scope:
              </label>
              <select
                className="form-input form-input-sm"
                value={deleteAllScope}
                onChange={(e) => setDeleteAllScope(e.target.value as any)}
                style={{ width: '100%', background: '#1e293b', border: '1px solid #334155', color: '#f8fafc' }}
              >
                <option value="all">All Projects & All Storage (Full Reset)</option>
                <option value="trash_only">Empty Trash Bin Only (Permanent purge of deleted items)</option>
                <option value="assets_only">Clean Media Assets Only (Keep project configs & scripts)</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'block', fontSize: '0.85rem', fontWeight: 600, color: '#fca5a5', marginBottom: '6px' }}>
                To confirm this permanent action, type <code style={{ color: '#ef4444', background: '#450a0a', padding: '2px 6px', borderRadius: '4px' }}>DELETE ALL</code> below:
              </label>
              <input
                type="text"
                className="form-input"
                placeholder="Type DELETE ALL to confirm"
                value={deleteAllPhrase}
                onChange={(e) => setDeleteAllPhrase(e.target.value)}
                style={{
                  width: '100%',
                  background: '#1e293b',
                  border: deleteAllPhrase === 'DELETE ALL' ? '2px solid #ef4444' : '1px solid #475569',
                  color: '#f8fafc',
                  fontWeight: 700,
                  letterSpacing: '0.05em',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '12px' }}>
              <button
                className="btn btn-secondary btn-sm"
                onClick={() => setShowDeleteAllModal(false)}
                disabled={actionInProgress}
              >
                Cancel
              </button>

              <button
                className="btn btn-danger btn-sm"
                onClick={async () => {
                  if (deleteAllPhrase !== 'DELETE ALL') return;
                  await deleteAllProjects(deleteAllPhrase, deleteAllScope);
                  setShowDeleteAllModal(false);
                }}
                disabled={deleteAllPhrase !== 'DELETE ALL' || actionInProgress}
                style={{
                  opacity: deleteAllPhrase === 'DELETE ALL' ? 1 : 0.5,
                  cursor: deleteAllPhrase === 'DELETE ALL' ? 'pointer' : 'not-allowed',
                }}
              >
                Permanently Execute Cleanup
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
