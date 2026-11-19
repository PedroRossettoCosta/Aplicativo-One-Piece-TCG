import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './theme'; // before the first paint: light/dark
import App from './App';
import '@fontsource-variable/figtree';
import './index.css';

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
