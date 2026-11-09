import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';
createRoot(document.getElementById('root')!).render(<React.StrictMode><App /></React.StrictMode>);
// PWA, Nov 2026: register the service worker so the app shell is cached
// and "Add to Home Screen" works. Best-effort — a failed registration
// (e.g. an older browser) leaves the app working as a plain web app.
if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('/sw.js').catch(() => { /* ignore */ });
  });
}
