import React, { useEffect, useState } from 'react';
import { Layout } from './components/layout/Layout.js';
import { Dashboard } from './components/dashboard/Dashboard.js';
import { ProjectPage } from './components/project/ProjectPage.js';
import { SettingsPage } from './components/settings/SettingsPage.js';
import { VoiceoverStudio } from './components/voiceover/VoiceoverStudio.js';
import { MovieExplanationStudio } from './components/movieExplanation/MovieExplanationStudio.js';
import { MovieAnalyzerStudio } from './components/movieAnalyzer/MovieAnalyzerStudio.js';
import { ProjectLibrary } from './components/library/ProjectLibrary.js';
import { CreateProjectModal } from './components/dashboard/CreateProjectModal.js';
import { Toast } from './components/common/Toast.js';
import { useProjectStore } from './stores/projectStore.js';
import { useAuthStore } from './stores/authStore.js';
import { useShortsStore } from './stores/shortsStore.js';
import { useProcessingStore } from './stores/processingStore.js';
import { useMovieExplanationStore } from './stores/movieExplanationStore.js';
import { useMovieAnalyzerStore } from './stores/movieAnalyzerStore.js';

import './styles/index.css';
import './styles/dashboard.css';
import './styles/project.css';
import './styles/upload.css';
import './styles/processing.css';
import './styles/highlights.css';
import './styles/shorts.css';
import './styles/shortsReview.css';
import './styles/settings.css';
import './styles/voiceover.css';
import './styles/movieExplanation.css';
import './styles/movieAnalyzer.css';


export default function App() {
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);

  const { activeView, error: projectError, setError: setProjectError } = useProjectStore();
  const { initAuth } = useAuthStore();
  const { error: shortsError, setError: setShortsError } = useShortsStore();
  const { error: processingError } = useProcessingStore();
  const { error: movieError, setError: setMovieError } = useMovieExplanationStore();
  const { error: analyzerError, setError: setAnalyzerError } = useMovieAnalyzerStore();

  useEffect(() => {
    initAuth();
  }, [initAuth]);

  const currentError = projectError || shortsError || processingError || movieError || analyzerError;

  const clearError = () => {
    setProjectError(null);
    setShortsError(null);
    setMovieError(null);
    setAnalyzerError(null);
  };

  return (
    <Layout
      onOpenCreateModal={() => setIsCreateModalOpen(true)}
    >
      <Toast
        message={currentError}
        type="error"
        onClose={clearError}
      />

      {activeView === 'dashboard' && (
        <Dashboard onOpenCreateModal={() => setIsCreateModalOpen(true)} />
      )}

      {activeView === 'project' && <ProjectPage />}

      {activeView === 'voiceover' && <VoiceoverStudio />}

      {activeView === 'movieExplanation' && <MovieExplanationStudio />}

      {activeView === 'movieAnalyzer' && <MovieAnalyzerStudio />}

      {activeView === 'projectLibrary' && <ProjectLibrary />}

      {activeView === 'settings' && <SettingsPage />}

      <CreateProjectModal
        isOpen={isCreateModalOpen}
        onClose={() => setIsCreateModalOpen(false)}
      />
    </Layout>
  );
}
