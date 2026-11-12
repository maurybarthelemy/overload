import { useMemo } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { deleteWorkout } from '../db/actions';
import { ProgramCompare } from '../components/ProgramCompare';
import { DIFFICULTIES } from '../db/types';
import { buildSession, compareSessions, isPR, sessionsFromSets } from '../lib/analysis';
import { compact, durationMin, formatDateLong } from '../lib/format';
import { showNum } from '../lib/numbers';
import { useExerciseMap } from '../hooks/data';
import { Icon } from '../components/Icon';
import { TrendChip } from '../components/Trend';

export default function WorkoutDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const exMap = useExerciseMap();
  const data = useLiveQuery(async () => {
    const w = await db.workouts.get(id);
    if (!w) return null;
    const program = w.programId ? await db.programs.get(w.programId) : undefined;
    const wes = (await db.workoutExercises.where('workoutId').equals(id).toArray()).sort((a, b) => a.order - b.order);
    const sets = await db.sets.where('workoutId').equals(id).toArray();
    const hist = await db.sets.where('exerciseId').anyOf(wes.map((x) => x.exerciseId)).filter((s) => s.done && s.workoutId !== id && s.date <= w.date).toArray();
    return { w, wes, sets, hist, program };
  }, [id]);

  const totals = useMemo(() => {
    const done = data?.sets.filter((s) => s.done) ?? [];
    return { n: done.length, vol: done.reduce((a, s) => a + s.weight * s.reps, 0), reps: done.reduce((a, s) => a + s.reps, 0) };
  }, [data]);

  if (data === undefined) return <div className="page" />;
  if (data === null) return <div className="page"><div className="empty"><h3>Séance introuvable</h3><Link to="/history" className="btn mt">Historique</Link></div></div>;
  const { w, wes, sets, hist } = data;


  return (
    <div className="page">
      <div className="nav-top">
        <button className="back" onClick={() => nav(-1)}><Icon name="chevL" /> Retour</button>
        {w.quick && w.programId && <button className="btn sm" onClick={() => nav(`/seance/${w.programId}?date=${w.date}`)}><Icon name="edit" size={16} /> Modifier</button>}
      </div>
      <div className="header" style={{ marginTop: 0 }}>
        <div><div className="sub">{formatDateLong(w.date)}</div><h1 style={{ fontSize: 28 }}>{w.name}</h1></div>
      </div>
      <div className="grid3">
        <div className="card tight stat"><div className="label">Séries</div><div className="value" style={{ fontSize: 22 }}>{totals.n}</div></div>
        <div className="card tight stat"><div className="label">Volume</div><div className="value" style={{ fontSize: 22 }}>{compact(totals.vol)}</div></div>
        <div className="card tight stat"><div className="label">Durée</div><div className="value" style={{ fontSize: 22 }}>{w.finishedAt ? <>{durationMin(w.startedAt, w.finishedAt)}<small>min</small></> : '–'}</div></div>
      </div>
      {w.notes && <div className="card mt small muted">{w.notes}</div>}
      <ProgramCompare workout={w} />


      <div className="section-title">Exercices</div>
      {wes.map((we) => {
        const ex = exMap.get(we.exerciseId);
        const own = sets.filter((s) => s.workoutExerciseId === we.id && s.done).sort((a, b) => a.order - b.order);
        const cur = buildSession(own);
        const prevSessions = sessionsFromSets(hist.filter((s) => s.exerciseId === we.exerciseId));
        const prev = prevSessions[prevSessions.length - 1];
        const cmp = cur && prev ? compareSessions(cur, prev) : null;
        return (
          <Link key={we.id} to={`/exercise/${we.exerciseId}`} className="card pressable" style={{ display: 'block' }}>
            <div className="flex between"><b>{ex?.name ?? 'Exercice supprimé'}</b><Icon name="chevR" size={16} /></div>
            <div className="history-sets">
              {own.map((s) => <span key={s.id} style={isPR(s, prevSessions) ? { background: 'rgba(255,159,10,.16)', color: 'var(--orange)' } : undefined}>{showNum(s.weight)} kg × {s.reps}</span>)}
            </div>
            <div className="flex wrap mt" style={{ gap: 6 }}>
              {cmp ? <TrendChip trend={cmp.trend} label={cmp.label} /> : <span className="chip blue">Première fois</span>}
              {we.difficulty && <span className="chip">{DIFFICULTIES.find((d) => d.v === we.difficulty)?.label}</span>}
              {we.goodForm === false && <span className="chip down">Technique à revoir</span>}
            </div>
            {we.comment && <p className="small muted mt">« {we.comment} »</p>}
          </Link>
        );
      })}
      <button className="btn danger block mt2" onClick={async () => { if (confirm('Supprimer définitivement cette séance ?')) { await deleteWorkout(id); nav('/history', { replace: true }); } }}>Supprimer la séance</button>
    </div>
  );
}
