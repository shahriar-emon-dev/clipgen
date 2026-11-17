// ============================================================
// Episode Intelligence & Story Map Workspace
// Visualizes the complete episode narrative structure,
// character arcs, key discoveries, and indexed scene library.
// ============================================================

import React, { useState } from 'react';
import { useMovieExplanationStore } from '../../stores/movieExplanationStore.js';

export const EpisodeIntelligenceWorkspace: React.FC = () => {
  const { project } = useMovieExplanationStore();
  const episodeIndex = project?.episodeIndex;
  const storyMap = episodeIndex?.storyMap;
  const scenes = episodeIndex?.scenes || [];

  const [filterQuery, setFilterQuery] = useState('');
  const [selectedImportance, setSelectedImportance] = useState<string>('all');

  if (!episodeIndex || !storyMap) {
    return (
      <div style={{ textAlign: 'center', padding: '60px 0', color: 'var(--text-tertiary, #94a3b8)' }}>
        <div style={{ fontSize: '3rem', marginBottom: '12px' }}>🧠</div>
        <h3>No Episode Intelligence Index Available Yet</h3>
        <p style={{ fontSize: '0.88rem', marginTop: '6px' }}>
          Upload an episode video in the Setup tab and run "Analyze Episode Intelligence" to generate the Story Map.
        </p>
      </div>
    );
  }

  const filteredScenes = scenes.filter((s) => {
    const matchesQuery =
      filterQuery === '' ||
      s.description.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.dialogueSnippet.toLowerCase().includes(filterQuery.toLowerCase()) ||
      s.characters.some((c) => c.toLowerCase().includes(filterQuery.toLowerCase())) ||
      s.actions.some((a) => a.toLowerCase().includes(filterQuery.toLowerCase()));

    const matchesImportance =
      selectedImportance === 'all' || s.importance === selectedImportance;

    return matchesQuery && matchesImportance;
  });

  return (
    <div className="mex-storymap-container">
      {/* ── Story Map Hero ── */}
      <div className="mex-storymap-hero">
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
          <div>
            <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.08em', color: '#c084fc', fontWeight: 700 }}>
              AI Narrative Story Map
            </span>
            <h2 style={{ fontSize: '1.4rem', fontWeight: 800, margin: '4px 0', color: '#fff' }}>
              {storyMap.title || 'Episode Narrative Arc'}
            </h2>
          </div>
          <div style={{ background: 'rgba(0,0,0,0.4)', padding: '6px 12px', borderRadius: '8px', fontSize: '0.8rem' }}>
            <span>Total Duration: <strong>{Math.floor(episodeIndex.duration / 60)}m {Math.floor(episodeIndex.duration % 60)}s</strong></span>
          </div>
        </div>

        <p style={{ fontSize: '0.92rem', color: '#e2e8f0', lineHeight: '1.6', marginBottom: '16px' }}>
          {storyMap.logline}
        </p>

        {/* Narrative Progression Milestones */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '12px', marginTop: '16px' }}>
          <div style={{ background: 'rgba(0,0,0,0.35)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #6366f1' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#a5b4fc', fontWeight: 700 }}>Opening Situation</div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#f8fafc' }}>{storyMap.openingSituation}</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.35)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #f59e0b' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#fcd34d', fontWeight: 700 }}>Initial Conflict</div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#f8fafc' }}>{storyMap.initialConflict}</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.35)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #ef4444' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#fca5a5', fontWeight: 700 }}>Main Climax Event</div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#f8fafc' }}>{storyMap.mainClimax.title}</div>
          </div>

          <div style={{ background: 'rgba(0,0,0,0.35)', padding: '12px', borderRadius: '8px', borderLeft: '3px solid #10b981' }}>
            <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', color: '#6ee7b7', fontWeight: 700 }}>Resolution</div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px', color: '#f8fafc' }}>{storyMap.resolution}</div>
          </div>
        </div>
      </div>

      {/* ── Main Characters ── */}
      <div>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', color: '#fff' }}>
          Key Characters & Relationships ({storyMap.characters.length})
        </h3>
        <div className="mex-characters-row">
          {storyMap.characters.map((ch) => (
            <div key={ch.id} className="mex-character-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.9rem', color: '#fff' }}>{ch.name}</span>
                <span style={{ fontSize: '0.7rem', padding: '2px 6px', background: 'rgba(99,102,241,0.2)', color: '#c7d2fe', borderRadius: '4px', textTransform: 'uppercase' }}>
                  {ch.role}
                </span>
              </div>
              <p style={{ fontSize: '0.78rem', color: '#cbd5e1', lineHeight: '1.4' }}>{ch.description}</p>
            </div>
          ))}
        </div>
      </div>

      {/* ── Scene Index Header & Filter Bar ── */}
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '16px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700, margin: 0, color: '#fff' }}>
            Indexed Source Scenes ({filteredScenes.length} / {scenes.length})
          </h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <input
              type="text"
              placeholder="Search dialogue, character, location..."
              value={filterQuery}
              onChange={(e) => setFilterQuery(e.target.value)}
              style={{
                background: 'var(--bg-secondary, #13151f)',
                border: '1px solid var(--border-subtle, rgba(255,255,255,0.1))',
                borderRadius: '6px',
                padding: '6px 12px',
                fontSize: '0.82rem',
                color: '#fff',
                minWidth: '220px',
              }}
            />

            <select
              value={selectedImportance}
              onChange={(e) => setSelectedImportance(e.target.value)}
              className="mex-select"
            >
              <option value="all">All Importance</option>
              <option value="critical">Critical</option>
              <option value="important">Important</option>
              <option value="supporting">Supporting</option>
              <option value="optional">Optional</option>
            </select>
          </div>
        </div>

        {/* ── Scene Index Grid ── */}
        <div className="mex-scenes-grid">
          {filteredScenes.map((scene) => (
            <div key={scene.sceneId} className="mex-scene-card">
              <div className="mex-scene-thumb-wrap">
                {scene.thumbnailUrl ? (
                  <img src={scene.thumbnailUrl} alt="" className="mex-scene-thumb" />
                ) : (
                  <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
                    🎬
                  </div>
                )}
                <span className="mex-scene-tc-badge">
                  {Math.floor(scene.startTime / 60)}:{String(Math.floor(scene.startTime % 60)).padStart(2, '0')} - {Math.floor(scene.endTime / 60)}:{String(Math.floor(scene.endTime % 60)).padStart(2, '0')}
                </span>
                <span className={`mex-scene-importance-badge ${scene.importance}`}>
                  {scene.importance}
                </span>
              </div>

              <div className="mex-scene-content">
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <span style={{ fontWeight: 700, color: '#f1f5f9' }}>{scene.sceneId}</span>
                  <span style={{ fontSize: '0.72rem', color: '#a5b4fc', textTransform: 'uppercase', fontWeight: 600 }}>
                    {scene.narrativePurpose}
                  </span>
                </div>

                <div style={{ color: '#cbd5e1', fontSize: '0.78rem', lineHeight: '1.4' }}>
                  {scene.description}
                </div>

                {scene.dialogueSnippet && (
                  <div style={{ fontStyle: 'italic', color: '#94a3b8', fontSize: '0.74rem', borderLeft: '2px solid rgba(255,255,255,0.2)', paddingLeft: '6px' }}>
                    "{scene.dialogueSnippet}"
                  </div>
                )}

                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginTop: '4px' }}>
                  {scene.characters.map((c, i) => (
                    <span key={i} style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px', color: '#cbd5e1' }}>
                      👤 {c}
                    </span>
                  ))}
                  <span style={{ fontSize: '0.68rem', background: 'rgba(255,255,255,0.06)', padding: '1px 5px', borderRadius: '4px', color: '#cbd5e1' }}>
                    📍 {scene.location}
                  </span>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};
