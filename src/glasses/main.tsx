import {StrictMode} from 'react';
import {createRoot} from 'react-dom/client';
import App from './App.tsx';
import './styles.css';
import {keepFresh} from '../lib/fresh.ts';

keepFresh(5000);

const root = document.getElementById('root');
if (!root) throw new Error('Missing #root mount element');

// The design is a 600×600 canvas. If the host reports a smaller viewport, scale it down.
function fit() {
  const s = Math.min(window.innerWidth, window.innerHeight) / 600;
  root!.style.zoom = s > 0 && s < 0.999 ? String(Math.round(s * 1000) / 1000) : '';
}
fit();
window.addEventListener('resize', fit);

// Add ?debug to the URL for a live readout of glasses input.
if (/[?&]debug\b/.test(location.search)) void import('../lib/debug.ts').then(m => m.installDebug());

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
