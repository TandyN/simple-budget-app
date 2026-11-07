import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './ui/theme/tokens.css';
import './ui/theme/global.css';
import { App } from './App';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error('Missing #root element in index.html');
}

createRoot(rootElement).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
