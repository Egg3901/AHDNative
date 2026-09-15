import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AskPanel } from './ask/AskPanel';
import './style.css';

// The desktop Ask window loads the same bundle with ?view=ask and renders
// only the local panel. It carries the `ask` capability (backend commands,
// no remote privileges); the main window keeps the full app.
const view = new URLSearchParams(window.location.search).get('view');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'ask' ? <AskPanel surface="window" /> : <App />}</StrictMode>,
);
