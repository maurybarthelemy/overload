import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import App from './App';
import { requestPersistence } from './db/database';
import { dailySnapshot } from './lib/backup';
import './styles/app.css';

// Service worker : mise en cache de l'app pour un fonctionnement 100 % hors connexion
registerSW({ immediate: true });

// Protection des données : stockage persistant + point de restauration quotidien
requestPersistence();
dailySnapshot().catch(() => {});

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
