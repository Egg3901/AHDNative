import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import { AskPanel } from './ask/AskPanel';
import { installIosSafeArea } from './ui/iosSafeArea';
import './style.css';

// #436 fallback: measure the live env(safe-area-inset-top). On iPhone-class
// portrait webviews where the WKWebView reports ~zero (internal iOS 0.1.8),
// publish the fail-safe top floor plus a diagnostic instead of overlapping
// the status bar. Installed here so every view (game, MP, standalone Ask
// window) is covered; desktop/Android/landscape stay env()-only.
installIosSafeArea();

// The desktop Ask window loads the same bundle with ?view=ask and renders
// only the local panel. It carries the `ask` capability (backend commands,
// no remote privileges); the main window keeps the full app.
const view = new URLSearchParams(window.location.search).get('view');

createRoot(document.getElementById('root')!).render(
  <StrictMode>{view === 'ask' ? <AskPanel surface="window" /> : <App />}</StrictMode>,
);
