import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { deleteExercise, updateExercise } from '../db/actions';
import { muscleLabel, type WorkoutExercise } from '../db/types';
import { compareSessions, computeRecords, rangeStart, RANGES, recommend, sessionsFromSets, type Range } from '../lib/analysis';
import { formatDateFull, formatDateShort, kg, relativeDay } from '../lib/format';
import { showNum } from '../lib/numbers';
import { Icon } from '../components/Icon';
import { LineArea } from '../components/Charts';
import { Segmented } from '../components/Segmented';
import { Sheet } from '../components/Sheet';
import { ExerciseForm } from '../components/ExerciseForm';
import { TrendChip } from '../components/Trend';

type Metric = 'weight' | 'e1rm' | 'reps' | 'volume';

export default function ExerciseDetail() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const ex = useLiveQuery(() => db.exercises.get(id).then((e) => e ?? null), [id]);
  const data = useLiveQuery(async () => {
    const sets = await db.sets.where('exerciseId').equals(id).filter((s) => s.done).toArray();
    const metas = (await db.workoutExercises.bulkGet([...new Set(sets.map((s) => s.workoutExerciseId))])).filter(Boolean) as WorkoutExercise[];
    return { sets, metas };
  }, [id]);
  const [range, setRange] = useState<Range>('3m');
  const [metric, setMetric] = useState<Metric>('weight');
  const [edit, setEdit] = useState(false);
  const [showAll, setShowAll] = useState(false);

  const sessions = useMemo(() => sessionsFromSets(data?.sets ?? []), [data]);
  const records = useMemo(() => computeRecords(sessions), [sessions]);
  const inRange = sessions.filter((s) => s.date >= rangeStart(range));

  if (ex === undefined || !data) return <div className="page" />;
  if (ex === null) return <div className="page"><div className="empty"><h3>Exercice introuvable</h3><Link to="/library" className="btn mt">Bibliothèque</Link></div></div>;

  const last = sessions[sessions.length - 1];
  const prev = sessions[sessions.length - 2];
  const cmp = last && prev ? compareSessions(last, prev) : null;
  const lastMeta = data.metas.find((m) => m.id === last?.workoutExerciseId);
  const reco = recommend(ex, sessions, lastMeta);
  const rangeFirst = inRange[0], rangeLast = inRange[inRange.length - 1];
  const rangeDelta = rangeFirst && rangeLast && rangeFirst !== rangeLast ? rangeLast.topWeight - rangeFirst.topWeight : null;

  const chartData = inRange.map((s) => ({
    x: s.date,
    y: metric === 'weight' ? s.topWeight : metric === 'e1rm' ? Math.round(s.bestE1rm * 10) / 10 : metric === 'reps' ? s.totalReps : Math.round(s.volume),
    label: metric === 'reps' ? `${s.sets.length} séries · max ${Math.max(...s.sets.map((x) => x.reps))} rép.` : `${showNum(s.topWeight)} kg × ${s.repsAtTop}`,
  }));
  const unit = metric === 'reps' ? 'rép.' : 'kg';
  const color = metric === 'weight' ? '#30D158' : metric === 'e1rm' ? '#FF9F0A' : metric === 'reps' ? '#0A84FF' : '#BF5AF2';

  return (
    <div className="page">
      <div className="nav-top">
        <button className="back" onClick={() => nav(-1)}><Icon name="chevL" /> Retour</button>
        <div className="flex">
          <button className="icon-btn" style={{ color: ex.favorite ? 'var(--orange)' : undefined }} onClick={() => updateExercise(id, { favorite: !ex.favorite })} aria-label="Favori"><Icon name="star" size={18} fill={ex.favorite} /></button>
          <button className="icon-btn" onClick={() => setEdit(true)} aria-label="Modifier"><Icon name="edit" size={18} /></button>
        </div>
      </div>
      <div className="header" style={{ marginTop: 0 }}>
        <div>
          <div className="sub">{muscleLabel(ex.muscle)} · objectif {ex.repMin}–{ex.repMax} rép.</div>
          <h1 style={{ fontSize: 28 }}>{ex.name}</h1>
        </div>
      </div>

      {sessions.length === 0 ? (
        <div className="card empty"><div className="big">📈</div><h3>Pas encore d'historique</h3><p>Ajoutez cet exercice à une séance pour suivre votre progression.</p></div>
      ) : (
        <>
          <div className="grid2">
            <div className="card stat"><div className="label">Dernier passage</div><div className="value" style={{ fontSize: 20 }}>{relativeDay(last.date)}</div><div className="hint">{last.sets.map((s) => `${showNum(s.weight)}×${s.reps}`).join(' · ')}</div></div>
            <div className="card stat"><div className="label">Record de charge</div><div className="value">{showNum(records.maxWeight!.weight)}<small>kg × {records.maxWeight!.reps}</small></div><div className="hint">{formatDateFull(records.maxWeight!.date)}</div></div>
            <div className="card stat"><div className="label">1RM estimé</div><div className="value">{showNum(Math.round(records.bestE1rm!.value * 2) / 2)}<small>kg</small></div><div className="hint">{showNum(records.bestE1rm!.weight)} × {records.bestE1rm!.reps} · Epley</div></div>
            <div className="card stat"><div className="label">Max répétitions</div><div className="value">{records.maxReps!.reps}<small>rép.</small></div><div className="hint">à {kg(records.maxReps!.weight)}</div></div>
          </div>
          {cmp && <div className="card mt flex between"><span className="small muted">vs séance précédente</span><TrendChip trend={cmp.trend} label={cmp.label} /></div>}

          <div className={`reco ${reco.kind} mt`} style={{ marginBottom: 0 }}>
            <div><b>Prochaine étape : {reco.title}</b><p>{reco.detail}</p><p style={{ fontSize: 12, marginTop: 6, opacity: .8 }}>Suggestion indicative : écoutez votre récupération et votre ressenti.</p></div>
          </div>

          <div className="section-title">Évolution</div>
          <div className="card">
            <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
            <div className="mt" />
            <Segmented value={metric} onChange={setMetric} options={[{ id: 'weight', label: 'Charge' }, { id: 'reps', label: 'Rép.' }, { id: 'e1rm', label: '1RM' }, { id: 'volume', label: 'Volume' }]} />
            <div className="flex between mt small">
              <span className="muted">{inRange.length} passage{inRange.length > 1 ? 's' : ''}</span>
              {rangeDelta !== null && <span style={{ color: rangeDelta > 0 ? 'var(--accent)' : rangeDelta < 0 ? 'var(--red)' : 'var(--text-2)', fontWeight: 600 }}>{rangeDelta > 0 ? '+' : ''}{showNum(rangeDelta)} kg sur la période</span>}
            </div>
            <div className="mt"><LineArea data={chartData} unit={unit} color={color} id={'ex' + metric} /></div>
          </div>

          <div className="section-title">Toutes les performances</div>
          {[...sessions].reverse().slice(0, showAll ? undefined : 10).map((s, i) => {
            const arr = [...sessions].reverse();
            const p = arr[i + 1];
            const c = p ? compareSessions(s, p) : null;
            const meta = data.metas.find((m) => m.id === s.workoutExerciseId);
            return (
              <Link key={s.workoutExerciseId} to={`/history/${s.workoutId}`} className="card pressable" style={{ display: 'block' }}>
                <div className="flex between"><b>{formatDateShort(s.date)}</b>{c ? <TrendChip trend={c.trend} label={c.label} /> : <span className="chip blue">Début</span>}</div>
                <div className="history-sets">{s.sets.map((x) => <span key={x.id}>{showNum(x.weight)} × {x.reps}</span>)}</div>
                <div className="small muted mt">Volume {Math.round(s.volume)} kg · 1RM est. {showNum(Math.round(s.bestE1rm * 2) / 2)} kg{meta?.comment ? ` · « ${meta.comment} »` : ''}</div>
              </Link>
            );
          })}
          {!showAll && sessions.length > 10 && <button className="btn ghost block" onClick={() => setShowAll(true)}>Afficher les {sessions.length - 10} passages plus anciens</button>}
        </>
      )}

      <Sheet open={edit} onClose={() => setEdit(false)} title="Modifier l'exercice">
        <ExerciseForm initial={ex} onSubmit={async (v) => { await updateExercise(id, v); setEdit(false); }} />
        <button className="btn danger block mt" onClick={async () => {
          if (!confirm(sessions.length ? 'Cet exercice a un historique : il sera masqué de la bibliothèque mais vos données sont conservées. Continuer ?' : 'Supprimer cet exercice ?')) return;
          await deleteExercise(id); nav('/library', { replace: true });
        }}>{sessions.length ? 'Archiver l\'exercice' : 'Supprimer l\'exercice'}</button>
      </Sheet>
    </div>
  );
}
