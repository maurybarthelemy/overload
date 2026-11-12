import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { todayWeekday, WEEKDAYS, type Program } from '../db/types';
import { useActiveWorkout, useExerciseMap, usePrograms } from '../hooks/data';
import { relativeDay } from '../lib/format';
import { Icon } from '../components/Icon';
import { ProgramEditor } from './ProgramsPage';

/** Onglet 1 : les séances modèles. On en ouvre une, on tape ses poids, c'est tout. */
export default function SeancesPage() {
  const programs = usePrograms();
  const exMap = useExerciseMap();
  const active = useActiveWorkout();
  const [editing, setEditing] = useState<Partial<Program> | null>(null);
  const lastByProgram = useLiveQuery(async () => {
    const m = new Map<string, string>();
    for (const w of await db.workouts.where('status').equals('done').toArray()) if (w.programId && (m.get(w.programId) ?? '') < w.date) m.set(w.programId, w.date);
    return m;
  });
  const today = todayWeekday();
  // Séance du jour en premier
  const sorted = [...(programs ?? [])].sort((a, b) => Number(!!b.days?.includes(today)) - Number(!!a.days?.includes(today)));

  return (
    <div className="page">
      <div className="header">
        <div><div className="sub">{WEEKDAYS[today]}</div><h1>Séances</h1></div>
        <Link to="/settings" className="icon-btn" aria-label="Réglages"><Icon name="gear" size={20} /></Link>
      </div>

      {active && (
        <Link to={`/workout/${active.id}`} className="banner blue pressable" style={{ textDecoration: 'none' }}>
          <span>▶</span><span style={{ flex: 1 }}>Une séance guidée « {active.name} » est en cours — la reprendre</span><Icon name="chevR" size={16} />
        </Link>
      )}

      {sorted.map((p) => {
        const isToday = p.days?.includes(today);
        const names = (p.items ?? []).map((i) => exMap.get(i.exerciseId)?.name).filter(Boolean);
        const last = lastByProgram?.get(p.id);
        return (
          <div key={p.id} className={`seance-card ${isToday ? 'today' : ''}`}>
            <Link to={`/seance/${p.id}`} className="pressable" style={{ display: 'block' }}>
              <div className="flex between">
                <div className="flex" style={{ gap: 10 }}>
                  <span className="seance-dot" style={{ background: p.color }} />
                  <h2 className="seance-title">{p.name}</h2>
                </div>
                {isToday ? <span className="chip up">Aujourd'hui</span> : <Icon name="chevR" size={18} />}
              </div>
              <div className="small muted" style={{ marginTop: 6 }}>
                {names.length} exercices{p.days?.length ? ` · ${p.days.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ')}` : ''}{last ? ` · fait ${relativeDay(last).toLowerCase()}` : ''}
              </div>
              <div className="small" style={{ color: 'var(--text-3)', marginTop: 4, lineHeight: 1.45 }}>{names.join(' · ')}</div>
              <div className="btn primary block mt" style={{ height: 46 }}><Icon name="edit" size={18} /> Mettre mes poids</div>
            </Link>
            <button className="btn ghost sm block" style={{ marginTop: 6, color: 'var(--text-2)' }} onClick={() => setEditing(p)}>Modifier les exercices</button>
          </div>
        );
      })}

      <button className="btn block mt" onClick={() => setEditing({ name: '', items: [], days: [] })}><Icon name="plus" size={18} /> Nouvelle séance modèle</button>
      {editing && <ProgramEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}
