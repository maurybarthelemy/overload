import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './components/Icon';
import { ToastProvider } from './components/Toast';
import SeancesPage from './pages/SeancesPage';

const SessionForm = lazy(() => import('./pages/SessionForm'));
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const WorkoutDetail = lazy(() => import('./pages/WorkoutDetail'));
const ProgressionPage = lazy(() => import('./pages/ProgressionPage'));
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));

const TABS = [
  { to: '/', icon: 'library', label: 'Séances' },
  { to: '/history', icon: 'history', label: 'Historique' },
  { to: '/progression', icon: 'stats', label: 'Progression' },
];

function Shell() {
  const loc = useLocation();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  return (
    <div className="app">
      <Suspense fallback={<div className="page" />}>
        <Routes>
          <Route path="/" element={<SeancesPage />} />
          <Route path="/seance/:id" element={<SessionForm />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<WorkoutDetail />} />
          <Route path="/progression" element={<ProgressionPage />} />
          <Route path="/exercise/:id" element={<ExerciseDetail />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="*" element={<SeancesPage />} />
        </Routes>
      </Suspense>
      <div className="tabbar">
        <nav>
          {TABS.map((t) => (
            <NavLink key={t.to} to={t.to} end={t.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
              <Icon name={t.icon} size={24} stroke={1.9} />
              {t.label}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}

export default function App() {
  return (
    <ToastProvider>
      <HashRouter>
        <Shell />
      </HashRouter>
    </ToastProvider>
  );
}
