import { lazy, Suspense, useEffect } from 'react';
import { HashRouter, Link, NavLink, Route, Routes, useLocation } from 'react-router-dom';
import { Icon } from './components/Icon';
import { ToastProvider } from './components/Toast';
import { useActiveWorkout } from './hooks/data';
import Dashboard from './pages/Dashboard';
import WorkoutPage from './pages/WorkoutPage';

// Pages secondaires chargées à la demande (démarrage plus rapide)
const HistoryPage = lazy(() => import('./pages/HistoryPage'));
const WorkoutDetail = lazy(() => import('./pages/WorkoutDetail'));
const ProgramsPage = lazy(() => import('./pages/ProgramsPage'));
const LibraryPage = lazy(() => import('./pages/LibraryPage'));
const ExerciseDetail = lazy(() => import('./pages/ExerciseDetail'));
const StatsPage = lazy(() => import('./pages/StatsPage'));
const SettingsPage = lazy(() => import('./pages/SettingsPage'));
const CarnetPage = lazy(() => import('./pages/CarnetPage'));

const TABS = [
  { to: '/', icon: 'home', label: 'Accueil' },
  { to: '/programs', icon: 'programs', label: 'Programmes' },
  { to: '/history', icon: 'history', label: 'Historique' },
  { to: '/library', icon: 'library', label: 'Exercices' },
  { to: '/stats', icon: 'stats', label: 'Stats' },
];

function Shell() {
  const loc = useLocation();
  const active = useActiveWorkout();
  useEffect(() => { window.scrollTo(0, 0); }, [loc.pathname]);
  const inWorkout = loc.pathname.startsWith('/workout/');
  return (
    <div className="app">
      <Suspense fallback={<div className="page" />}>
        <Routes>
          <Route path="/" element={<Dashboard />} />
          <Route path="/workout/:id" element={<WorkoutPage />} />
          <Route path="/history" element={<HistoryPage />} />
          <Route path="/history/:id" element={<WorkoutDetail />} />
          <Route path="/programs" element={<ProgramsPage />} />
          <Route path="/library" element={<LibraryPage />} />
          <Route path="/exercise/:id" element={<ExerciseDetail />} />
          <Route path="/stats" element={<StatsPage />} />
          <Route path="/settings" element={<SettingsPage />} />
          <Route path="/carnet/:id" element={<CarnetPage />} />
          <Route path="*" element={<Dashboard />} />
        </Routes>
      </Suspense>
      {active && !inWorkout && loc.pathname !== '/' && (
        <Link to={`/workout/${active.id}`} className="live-bar pressable">
          <span className="dot" /><span style={{ flex: 1 }}>{active.name} — en cours</span><Icon name="chevR" size={18} />
        </Link>
      )}
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
