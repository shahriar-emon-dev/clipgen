import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App.js';
import { ErrorBoundary } from './components/common/ErrorBoundary.js';

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <ErrorBoundary fallbackTitle="Application Studio Error">
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
