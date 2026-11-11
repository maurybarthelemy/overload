import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { useAllDoneSets, useDoneWorkouts, useExerciseMap } from '../hooks/data';
import { compact, durationMin, formatDateFull, parseISO, relativeDay } from '../lib/format';
import { Icon } from '../components/Icon';

export default function HistoryPage() {
  const workouts = useDoneWorkouts();
  const sets = useAllDoneSets();
  const exMap = useExerciseMap();
  const groups = useMemo(() => {
    const g = new Map<string, typeof workouts>();
    for (const w of workouts ?? []) {
      const k = new Intl.DateTimeFormat('fr-FR', { month: 'long', year: 'numeric' }).format(parseISO(w.date));
      g.set(k, [...(g.get(k) ?? []), w]);
    }
    return [...g.entries()];
  }, [workouts]);
  const byWorkout = useMemo(() => {
    const m = new Map<string, { n: number; vol: number; ex: Set<string> }>();
    for (const s of sets ?? []) {
      const e = m.get(s.workoutId) ?? { n: 0, vol: 0, ex: new Set() };
      e.n++; e.vol += s.weight * s.reps; e.ex.add(s.exerciseId);
      m.set(s.workoutId, e);
    }
    return m;
  }, [sets]);

  return (
    <div className="page">
      <div className="header"><div><div className="sub">{workouts?.length ?? 0} séances</div><h1>Historique</h1></div></div>
      {workouts && workouts.length === 0 && <div className="card empty"><div className="big">📅</div><h3>Aucune séance</h3><p>Vos séances terminées apparaîtront ici.</p></div>}
      {groups.map(([month, ws]) => (
        <div key={month}>
          <div className="section-title" style={{ textTransform: 'capitalize', fontSize: 17 }}>{month}</div>
          <div className="list">
            {ws!.map((w) => {
              const st = byWorkout.get(w.id);
              const names = [...(st?.ex ?? [])].map((id) => exMap.get(id)?.name).filter(Boolean);
              return (
                <Link key={w.id} to={`/history/${w.id}`} className="row pressable">
                  <div className="grow">
                    <div className="flex between"><span className="title">{w.name}</span><span className="small muted">{relativeDay(w.date) === formatDateFull(w.date) ? formatDateFull(w.date) : relativeDay(w.date)}</span></div>
                    <div className="meta">{st?.n ?? 0} séries · {compact(st?.vol ?? 0)}{w.finishedAt ? ` · ${durationMin(w.startedAt, w.finishedAt)} min` : ''}</div>
                    <div className="meta" style={{ color: 'var(--text-3)' }}>{names.join(', ')}</div>
                  </div>
                  <Icon name="chevR" size={18} />
                </Link>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
