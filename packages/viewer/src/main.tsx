import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './tokens.css';
import './app.css';
import { App } from './App';
import { initTheme } from './theme';

// Tema sebelum render pertama supaya tidak berkedip terang → gelap.
initTheme();

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
