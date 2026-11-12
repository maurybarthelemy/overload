import { useLiveQuery } from 'dexie-react-hooks';
import { Link } from 'react-router-dom';
import { db } from '../db/database';
import type { Workout } from '../db/types';
import { compact, formatDateShort } from '../lib/format';

/** Compare une séance à la précédente du même programme (ex. lundi dernier). */
export function ProgramCompare({ workout }: { workout: Workout }) {
  const data = useLiveQuery(async () => {
    if (!workout.programId) return null;
    const prevs = await db.workouts.where('programId').equals(workout.programId)
      .filter((w) => w.status === 'done' && w.id !== workout.id && (w.date < workout.date || (w.date === workout.date && w.startedAt < workout.startedAt)))
      .toArray();
    const prev = prevs.sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt)[0];
    if (!prev) return null;
    const [cur, old] = await Promise.all([workout.id, prev.id].map((id) => db.sets.where('workoutId').equals(id).filter((s) => s.done).toArray()));
    const sum = (arr: typeof cur) => ({ sets: arr.length, reps: arr.reduce((a, s) => a + s.reps, 0), vol: arr.reduce((a, s) => a + s.reps * s.weight, 0) });
    return { prev, cur: sum(cur), old: sum(old) };
  }, [workout.id, workout.programId, workout.date, workout.status]);
  if (!data) return null;
  const { prev, cur, old } = data;
  const pct = old.vol ? Math.round(((cur.vol - old.vol) / old.vol) * 100) : 0;
  const col = (d: number) => (d > 0 ? 'var(--accent)' : d < 0 ? 'var(--red)' : 'var(--text-2)');
  const sign = (d: number) => (d > 0 ? `+${d}` : String(d));
  return (
    <div className="card mt">
      <div className="flex between small">
        <span className="muted">vs séance précédente</span>
        <Link to={`/history/${prev.id}`} style={{ color: 'var(--accent)' }}>{prev.name} · {formatDateShort(prev.date)}</Link>
      </div>
      <div className="week-compare">
        <div><b style={{ color: col(cur.vol - old.vol) }}>{cur.vol ? `${pct > 0 ? '+' : ''}${pct} %` : '–'}</b><span>Volume ({compact(old.vol)})</span></div>
        <div><b style={{ color: col(cur.sets - old.sets) }}>{sign(cur.sets - old.sets)}</b><span>Séries ({old.sets})</span></div>
        <div><b style={{ color: col(cur.reps - old.reps) }}>{sign(cur.reps - old.reps)}</b><span>Rép. ({old.reps})</span></div>
      </div>
    </div>
  );
}
