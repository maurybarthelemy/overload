import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useActiveWorkout, useAllDoneSets, useDoneWorkouts, useExerciseMap, usePrograms } from '../hooks/data';
import { globalProgress, prTimeline, sessionsFromSets, weeklyBuckets } from '../lib/analysis';
import { compact, formatDateLong, formatDateShort, kg, relativeDay } from '../lib/format';
import { showNum } from '../lib/numbers';
import { startOrResume } from '../lib/start';
import { Icon } from '../components/Icon';
import { Bars, LineArea } from '../components/Charts';
import { Segmented } from '../components/Segmented';
import { MuscleBadge } from '../components/MuscleBadge';

export default function Dashboard() {
  const nav = useNavigate();
  const sets = useAllDoneSets();
  const workouts = useDoneWorkouts();
  const programs = usePrograms();
  const active = useActiveWorkout();
  const exMap = useExerciseMap();
  const [chart, setChart] = useState<'load' | 'volume'>('load');

  const data = useMemo(() => {
    if (!sets || !workouts) return null;
    const weeks = weeklyBuckets(sets, workouts, 8);
    const prs = prTimeline(sets).slice(0, 5);
    const progress = globalProgress(sets);
    const exercisesDone = new Set(sets.map((s) => s.exerciseId)).size;
    // exercice le plus pratiqué sur 8 semaines → courbe de charge
    const recent = sets.filter((s) => s.date >= weeks[0].week);
    const counts = new Map<string, number>();
    for (const s of recent) counts.set(s.workoutExerciseId + '|' + s.exerciseId, 1);
    const freq = new Map<string, number>();
    for (const k of counts.keys()) { const e = k.split('|')[1]; freq.set(e, (freq.get(e) ?? 0) + 1); }
    // exercice principal : le plus fréquent, puis celui qui a le plus progressé
    const gain = (id: string) => { const ss = sessionsFromSets(recent.filter((s) => s.exerciseId === id)); return ss.length > 1 ? ss[ss.length - 1].topWeight - ss[0].topWeight : 0; };
    const topEx = [...freq.entries()].sort((a, b) => b[1] - a[1] || gain(b[0]) - gain(a[0]))[0]?.[0];
    const topSessions = topEx ? sessionsFromSets(recent.filter((s) => s.exerciseId === topEx)) : [];
    return { weeks, prs, progress, exercisesDone, topEx, topSessions };
  }, [sets, workouts]);

  const start = async (programId?: string) => {
    try { nav(`/workout/${await startOrResume(programId)}`); } catch { /* annulé */ }
  };

  const last = workouts?.[0];
  const hour = new Date().getHours();
  return (
    <div className="page">
      <div className="header">
        <div>
          <div className="sub">{formatDateLong(new Date().toISOString().slice(0, 10))}</div>
          <h1>{hour < 18 ? 'Bonjour' : 'Bonsoir'}</h1>
        </div>
        <Link to="/settings" className="icon-btn" aria-label="Réglages"><Icon name="gear" size={20} /></Link>
      </div>

      {active ? (
        <Link to={`/workout/${active.id}`} className="hero pressable">
          <div><span className="chip up">● En cours</span></div>
          <div><h2>{active.name}</h2><p>Reprendre votre séance</p></div>
          <div className="btn primary block"><Icon name="play" size={18} fill /> Reprendre</div>
        </Link>
      ) : (
        <div className="hero">
          <div><h2>Prêt pour la séance ?</h2><p>{programs?.length ? 'Choisissez un programme ou démarrez une séance libre.' : 'Démarrez une séance libre ou créez vos programmes.'}</p></div>
          {programs && programs.length > 0 && (
            <div className="chips" style={{ padding: '2px 18px', margin: '0 -18px' }}>
              {programs.map((p) => (
                <button key={p.id} className="filter-chip pressable" style={{ background: p.color + '30', color: p.color }} onClick={() => start(p.id)}>{p.name}</button>
              ))}
            </div>
          )}
          <button className="btn primary block" onClick={() => start()}><Icon name="plus" size={20} stroke={2.6} /> Nouvelle séance</button>
        </div>
      )}

      <div className="grid2 mt">
        <div className="card stat"><div className="label">Séances</div><div className="value">{workouts?.length ?? '–'}</div><div className="hint">au total</div></div>
        <div className="card stat"><div className="label">Exercices</div><div className="value">{data?.exercisesDone ?? '–'}</div><div className="hint">pratiqués</div></div>
        <div className="card stat">
          <div className="label">Progression</div>
          <div className="value" style={{ color: !data?.progress.tracked ? undefined : data.progress.avgPct >= 0 ? 'var(--accent)' : 'var(--red)' }}>
            {data?.progress.tracked ? `${data.progress.avgPct >= 0 ? '+' : ''}${showNum(Math.round(data.progress.avgPct * 10) / 10)}` : '–'}<small>%</small>
          </div>
          <div className="hint">{data?.progress.tracked ? `1RM est. · 8 sem. · ${data.progress.up}↑ ${data.progress.down}↓` : 'pas encore assez de données'}</div>
        </div>
        <div className="card stat"><div className="label">Cette semaine</div><div className="value">{data?.weeks[7].sessions ?? 0}<small>séance{(data?.weeks[7].sessions ?? 0) > 1 ? 's' : ''}</small></div><div className="hint">{compact(data?.weeks[7].volume ?? 0)} soulevés</div></div>
      </div>

      {last && (
        <>
          <div className="section-title">Dernière séance <Link to="/history">Tout voir</Link></div>
          <Link to={`/history/${last.id}`} className="card row pressable" style={{ padding: 16 }}>
            <div className="grow">
              <div className="title">{last.name}</div>
              <div className="meta">{relativeDay(last.date)} · {sets?.filter((s) => s.workoutId === last.id).length ?? 0} séries · {compact(sets?.filter((s) => s.workoutId === last.id).reduce((a, s) => a + s.weight * s.reps, 0) ?? 0)}</div>
            </div>
            <Icon name="chevR" size={18} />
          </Link>
        </>
      )}

      <div className="section-title">Évolution — 8 semaines</div>
      <div className="card">
        <Segmented value={chart} onChange={setChart} options={[{ id: 'load', label: 'Charge' }, { id: 'volume', label: 'Volume hebdo' }]} />
        <div className="mt">
          {chart === 'volume' ? (
            <Bars data={(data?.weeks ?? []).map((w) => ({ x: w.week, y: Math.round(w.volume), label: `${w.sessions} séance(s)` }))} unit="kg" />
          ) : data?.topEx ? (
            <>
              <div className="small muted" style={{ marginBottom: 4 }}>Charge max · <Link to={`/exercise/${data.topEx}`} style={{ color: 'var(--accent)' }}>{exMap.get(data.topEx)?.name}</Link></div>
              <LineArea data={data.topSessions.map((s) => ({ x: s.date, y: s.topWeight, label: `× ${s.repsAtTop} rép.` }))} id="dash" />
            </>
          ) : <div className="empty small">Enregistrez vos premières séances pour voir vos courbes.</div>}
        </div>
      </div>

      <div className="section-title">Records récents <Link to="/stats">Statistiques</Link></div>
      {data?.prs.length ? (
        <div className="list">
          {data.prs.map((p, i) => {
            const ex = exMap.get(p.exerciseId);
            if (!ex) return null;
            return (
              <Link key={i} to={`/exercise/${ex.id}`} className="row pressable">
                <MuscleBadge muscle={ex.muscle} />
                <div className="grow"><div className="title">{ex.name}</div><div className="meta">{formatDateShort(p.date)} · {p.kind === 'weight' ? 'charge max' : '1RM estimé ' + kg(Math.round(p.e1rm))}</div></div>
                <span className="chip pr">🏆 {showNum(p.weight)} × {p.reps}</span>
              </Link>
            );
          })}
        </div>
      ) : <div className="card empty small">Vos records apparaîtront ici dès que vous battrez une performance.</div>}
    </div>
  );
}
