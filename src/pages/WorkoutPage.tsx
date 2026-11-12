import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db, getMeta } from '../db/database';
import {
  addExerciseToWorkout, addSet, deleteSet, deleteWorkout, finishWorkout, moveWorkoutExercise,
  removeWorkoutExercise, updateSet, updateWorkout, updateWorkoutExercise,
} from '../db/actions';
import { DIFFICULTIES, type Exercise, type SetEntry, type WorkoutExercise } from '../db/types';
import { buildSession, compareSessions, isPR, recommend, sessionsFromSets, type Session } from '../lib/analysis';
import { formatDateShort, kg } from '../lib/format';
import { parseNum, showNum } from '../lib/numbers';
import { snapshot } from '../lib/backup';
import { useExerciseMap } from '../hooks/data';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { ExercisePicker } from '../components/ExercisePicker';
import { TrendChip } from '../components/Trend';
import { useToast } from '../components/Toast';
import { ProgramCompare } from '../components/ProgramCompare';

export default function WorkoutPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const toast = useToast();
  const exMap = useExerciseMap();
  const workout = useLiveQuery(() => db.workouts.get(id), [id]);
  const wes = useLiveQuery(async () => (await db.workoutExercises.where('workoutId').equals(id).toArray()).sort((a, b) => a.order - b.order), [id]);
  const sets = useLiveQuery(() => db.sets.where('workoutId').equals(id).toArray(), [id]);
  const exIds = useMemo(() => [...new Set((wes ?? []).map((w) => w.exerciseId))], [wes]);
  // Historique (hors séance courante) des exercices présents
  const history = useLiveQuery(async () => {
    if (!exIds.length) return { sets: [] as SetEntry[], metas: [] as WorkoutExercise[] };
    const s = await db.sets.where('exerciseId').anyOf(exIds).filter((x) => x.done && x.workoutId !== id).toArray();
    const metas = await db.workoutExercises.bulkGet([...new Set(s.map((x) => x.workoutExerciseId))]);
    return { sets: s, metas: metas.filter(Boolean) as WorkoutExercise[] };
  }, [exIds.join(','), id]);

  const [picker, setPicker] = useState(false);
  const [editHead, setEditHead] = useState(false);
  const [restEnd, setRestEnd] = useState<number | null>(null);
  const [restDur, setRestDur] = useState(90);
  useEffect(() => { getMeta('restSeconds', 90).then(setRestDur); }, []);

  if (workout === undefined || !wes || !sets) return <div className="page" />;
  if (workout === null || !workout) return <div className="page"><div className="empty"><h3>Séance introuvable</h3><Link className="btn mt" to="/">Accueil</Link></div></div>;

  const isActive = workout.status === 'active';
  const doneCount = sets.filter((s) => s.done).length;
  const volume = sets.filter((s) => s.done).reduce((a, s) => a + s.weight * s.reps, 0);

  const onValidate = async (s: SetEntry, value: boolean) => {
    await updateSet(s.id, { done: value });
    if (!value) return;
    if (isActive) setRestEnd(Date.now() + restDur * 1000);
    const prev = sessionsFromSets((history?.sets ?? []).filter((x) => x.exerciseId === s.exerciseId));
    const pr = isPR(s, prev);
    if (pr) toast(pr === 'weight' ? '🏆 Nouveau record de charge !' : '🏆 Nouveau record (1RM estimé) !');
    if ('vibrate' in navigator) navigator.vibrate?.(30);
  };

  const finish = async () => {
    const pending = sets.filter((s) => !s.done).length;
    if (doneCount === 0) {
      if (confirm('Aucune série validée. Supprimer cette séance ?')) { await deleteWorkout(id); nav('/'); }
      return;
    }
    if (pending && !confirm(`${pending} série(s) non validée(s) seront ignorées. Terminer la séance ?`)) return;
    await finishWorkout(id);
    await snapshot('fin de séance');
    toast('Séance enregistrée ✓');
    nav(`/history/${id}`, { replace: true });
  };

  return (
    <div className="page">
      {restEnd && <RestTimer end={restEnd} total={restDur} onAdjust={(d) => setRestEnd((e) => (e ?? Date.now()) + d * 1000)} onClose={() => setRestEnd(null)}
      />}
      <div className="nav-top">
        <button className="back" onClick={() => nav(-1)}><Icon name="chevL" /> Retour</button>
        {isActive ? <button className="btn primary sm" onClick={finish}>Terminer</button>
          : <button className="btn sm" onClick={() => nav(`/history/${id}`)}>OK</button>}
      </div>
      <div className="header" style={{ marginTop: 0 }}>
        <div style={{ minWidth: 0 }}>
          <div className="sub">{formatDateShort(workout.date)} · {isActive ? <Elapsed since={workout.startedAt} /> : 'modification'}</div>
          <h1 style={{ fontSize: 28 }} onClick={() => setEditHead(true)}>{workout.name}</h1>
        </div>
        <button className="icon-btn" onClick={() => setEditHead(true)} aria-label="Modifier"><Icon name="edit" size={18} /></button>
      </div>
      {workout.programId && <div className="small muted" style={{ margin: '-10px 0 12px' }}>Séance issue de votre modèle : modifier les charges ici n'affecte ni le modèle ni vos séances passées.</div>}
      <div className="grid3" style={{ marginBottom: 16 }}>
        <div className="card tight stat"><div className="label">Exercices</div><div className="value" style={{ fontSize: 22 }}>{wes.length}</div></div>
        <div className="card tight stat"><div className="label">Séries</div><div className="value" style={{ fontSize: 22 }}>{doneCount}</div></div>
        <div className="card tight stat"><div className="label">Volume</div><div className="value" style={{ fontSize: 22 }}>{Math.round(volume)}<small>kg</small></div></div>
      </div>
      {doneCount > 0 && <div style={{ margin: '-6px 0 16px' }}><ProgramCompare workout={workout} /></div>}

      {wes.map((we, i) => {
        const ex = exMap.get(we.exerciseId);
        if (!ex) return null;
        const hSets = (history?.sets ?? []).filter((s) => s.exerciseId === we.exerciseId);
        const sessions = sessionsFromSets(hSets).filter((s) => s.date <= workout.date);
        const lastMeta = history?.metas.find((m) => m.id === sessions[sessions.length - 1]?.workoutExerciseId);
        return (
          <ExerciseCard key={we.id} we={we} ex={ex} sets={sets.filter((s) => s.workoutExerciseId === we.id).sort((a, b) => a.order - b.order)}
            sessions={sessions} lastMeta={lastMeta} first={i === 0} last={i === wes.length - 1} onValidate={onValidate} />
        );
      })}

      {wes.length === 0 && (
        <div className="empty"><div className="big">🏋️</div><h3>Séance vide</h3><p>Ajoutez votre premier exercice pour commencer.</p></div>
      )}
      <button className="btn blue block" onClick={() => setPicker(true)}><Icon name="plus" size={20} /> Ajouter un exercice</button>
      {isActive && doneCount > 0 && <button className="btn primary block mt" onClick={finish}><Icon name="check" size={20} /> Terminer la séance</button>}
      <button className="btn danger block mt" onClick={async () => { if (confirm('Supprimer définitivement cette séance ?')) { await deleteWorkout(id); nav('/', { replace: true }); } }}>
        Supprimer la séance
      </button>

      <ExercisePicker open={picker} onClose={() => setPicker(false)} onPick={async (ids) => { for (const x of ids) await addExerciseToWorkout(id, x); }} />
      <Sheet open={editHead} onClose={() => setEditHead(false)} title="Séance">
        <HeadForm name={workout.name} date={workout.date} notes={workout.notes ?? ''} onSave={async (v) => { await updateWorkout(id, v); setEditHead(false); }} />
      </Sheet>
    </div>
  );
}

function HeadForm({ name, date, notes, onSave }: { name: string; date: string; notes: string; onSave: (v: { name: string; date: string; notes: string }) => void }) {
  const [n, setN] = useState(name), [d, setD] = useState(date), [no, setNo] = useState(notes);
  return (
    <form onSubmit={(e) => { e.preventDefault(); onSave({ name: n.trim() || name, date: d || date, notes: no }); }}>
      <div className="field"><label>Nom</label><input className="input" value={n} onChange={(e) => setN(e.target.value)} /></div>
      <div className="field"><label>Date de la séance</label><input className="input" type="date" value={d} onChange={(e) => setD(e.target.value)} /></div>
      <div className="field"><label>Notes</label><textarea className="input" value={no} onChange={(e) => setNo(e.target.value)} placeholder="Forme du jour, sommeil…" /></div>
      <button className="btn primary block">Enregistrer</button>
    </form>
  );
}

function Elapsed({ since }: { since: number }) {
  const [, tick] = useState(0);
  useEffect(() => { const t = setInterval(() => tick((x) => x + 1), 30000); return () => clearInterval(t); }, []);
  const m = Math.floor((Date.now() - since) / 60000);
  return <>{m < 60 ? `${m} min` : `${Math.floor(m / 60)} h ${String(m % 60).padStart(2, '0')}`}</>;
}

// ---------------------------------------------------------------------------

function ExerciseCard({ we, ex, sets, sessions, lastMeta, first, last, onValidate }: {
  we: WorkoutExercise; ex: Exercise; sets: SetEntry[]; sessions: Session[]; lastMeta?: WorkoutExercise;
  first: boolean; last: boolean; onValidate: (s: SetEntry, v: boolean) => void;
}) {
  const [menu, setMenu] = useState(false);
  const [notes, setNotes] = useState(!!(we.comment || we.difficulty));
  const [setMenuFor, setSetMenuFor] = useState<SetEntry | null>(null);
  const prev = sessions[sessions.length - 1];
  const reco = recommend(ex, sessions, lastMeta);
  const current = buildSession(sets);
  const cmp = current && prev ? compareSessions(current, prev) : null;
  const pendingSets = sets.filter((s) => !s.done);

  const applyTarget = async () => {
    if (!reco.target) return;
    for (const s of pendingSets) await updateSet(s.id, { weight: reco.target.weight, reps: reco.target.reps });
    if (!pendingSets.length) await addSet(we, reco.target);
  };

  return (
    <div className="ex-card">
      <div className="ex-card-head">
        <div className="grow" style={{ flex: 1, minWidth: 0 }}>
          <Link to={`/exercise/${ex.id}`}><h3>{ex.name}</h3></Link>
          <div className="prev-line">
            {prev ? <>Dernière fois ({formatDateShort(prev.date)}) : {prev.sets.map((s) => `${showNum(s.weight)}×${s.reps}`).join(' · ')}</> : 'Première séance sur cet exercice'}
          </div>
          <div className="flex wrap" style={{ gap: 0 }}>
            {we.targetSets && <span className="target-chip">🎯 Objectif {we.targetSets} × {we.targetReps}</span>}
            {cmp && <span style={{ marginTop: 6 }}><TrendChip trend={cmp.trend} label={cmp.label} /></span>}
          </div>
        </div>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="Options"><Icon name="dots" /></button>
      </div>

      <div className={`reco ${reco.kind}`}>
        <div style={{ flex: 1 }}>
          <b>{reco.title}</b>
          <p>{reco.detail}</p>
        </div>
        {reco.target && pendingSets.length > 0 && <button className="btn sm" style={{ flexShrink: 0 }} onClick={applyTarget}>Appliquer</button>}
      </div>

      <div className="set-head"><span>#</span><span>Préc.</span><span>kg</span><span>Rép.</span><span /></div>
      {sets.map((s, i) => (
        <SetRow key={s.id} s={s} index={i} prev={prev?.sets[i]}
          onValidate={(v) => onValidate(s, v)} onMenu={() => setSetMenuFor(s)}
          pr={s.done && prev ? isPR(s, sessions) : null} />
      ))}
      <button className="btn ghost block sm mt" onClick={() => addSet(we)}><Icon name="plus" size={18} /> Ajouter une série</button>

      {notes ? (
        <div className="mt">
          <div className="small muted" style={{ marginBottom: 6 }}>Difficulté ressentie (facultatif)</div>
          <div className="pill-diff">
            {DIFFICULTIES.map((d) => (
              <button key={d.v} className={we.difficulty === d.v ? 'on' : ''} onClick={() => updateWorkoutExercise(we.id, { difficulty: we.difficulty === d.v ? undefined : d.v })}>{d.label}</button>
            ))}
          </div>
          <div className="flex between mt">
            <span className="small">Technique propre</span>
            <button className={`toggle ${we.goodForm !== false ? 'on' : ''}`} aria-label="Technique propre" onClick={() => updateWorkoutExercise(we.id, { goodForm: we.goodForm === false })} />
          </div>
          <CommentBox value={we.comment ?? ''} onSave={(c) => updateWorkoutExercise(we.id, { comment: c })} />
        </div>
      ) : (
        <button className="btn ghost sm block" style={{ color: 'var(--text-2)' }} onClick={() => setNotes(true)}>Ressenti & commentaire</button>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title={ex.name}>
        <div className="list">
          {!first && <button className="row pressable" onClick={() => { moveWorkoutExercise(we.workoutId, we.id, -1); setMenu(false); }}><Icon name="up" /> Monter</button>}
          {!last && <button className="row pressable" onClick={() => { moveWorkoutExercise(we.workoutId, we.id, 1); setMenu(false); }}><Icon name="down" /> Descendre</button>}
          <Link className="row pressable" to={`/exercise/${ex.id}`}><Icon name="history" /> Historique de l'exercice</Link>
          <button className="row pressable" style={{ color: 'var(--red)' }} onClick={() => { if (confirm(`Retirer ${ex.name} de la séance ?`)) removeWorkoutExercise(we.id); setMenu(false); }}><Icon name="trash" /> Retirer de la séance</button>
        </div>
      </Sheet>
      <Sheet open={!!setMenuFor} onClose={() => setSetMenuFor(null)} title={setMenuFor ? `Série ${sets.indexOf(setMenuFor) + 1}` : ''}>
        <div className="list">
          <button className="row pressable" onClick={async () => { if (setMenuFor) await addSet(we, { weight: setMenuFor.weight, reps: setMenuFor.reps }); setSetMenuFor(null); }}><Icon name="copy" /> Dupliquer la série</button>
          {setMenuFor?.done && <button className="row pressable" onClick={async () => { await updateSet(setMenuFor.id, { done: false }); setSetMenuFor(null); }}><Icon name="edit" /> Marquer non validée</button>}
          <button className="row pressable" style={{ color: 'var(--red)' }} onClick={async () => { if (setMenuFor) await deleteSet(setMenuFor.id); setSetMenuFor(null); }}><Icon name="trash" /> Supprimer la série</button>
        </div>
      </Sheet>
    </div>
  );
}

function CommentBox({ value, onSave }: { value: string; onSave: (v: string) => void }) {
  const [v, setV] = useState(value);
  useEffect(() => setV(value), [value]);
  return <textarea className="input mt" style={{ minHeight: 60 }} placeholder="Commentaire (sensations, réglages machine…)" value={v} onChange={(e) => setV(e.target.value)} onBlur={() => v !== value && onSave(v)} />;
}

/** Ligne de série : saisie locale (gère « 42,5 »), enregistrement immédiat en base. */
function SetRow({ s, index, prev, onValidate, onMenu, pr }: {
  s: SetEntry; index: number; prev?: SetEntry; onValidate: (v: boolean) => void; onMenu: () => void; pr: 'weight' | 'e1rm' | null;
}) {
  const [w, setW] = useState(showNum(s.weight));
  const [r, setR] = useState(String(s.reps));
  const focused = useRef<'w' | 'r' | null>(null);
  useEffect(() => { if (focused.current !== 'w') setW(showNum(s.weight)); }, [s.weight]);
  useEffect(() => { if (focused.current !== 'r') setR(String(s.reps)); }, [s.reps]);

  const commitW = (str: string) => { const n = parseNum(str); if (n !== s.weight) updateSet(s.id, { weight: n }); };
  const commitR = (str: string) => { const n = Math.round(parseNum(str)); if (n !== s.reps) updateSet(s.id, { reps: n }); };

  return (
    <>
      <div className={`set-row ${s.done ? 'done' : ''}`}>
        <button className="set-num" onClick={onMenu} aria-label="Options de la série">{index + 1}</button>
        <button className="set-prev" onClick={() => { if (prev && !s.done) updateSet(s.id, { weight: prev.weight, reps: prev.reps }); }}>
          {prev ? `${showNum(prev.weight)}×${prev.reps}` : '—'}
        </button>
        <input className="num-input" inputMode="decimal" value={w} aria-label="Poids (kg)"
          onFocus={(e) => { focused.current = 'w'; e.target.select(); }}
          onChange={(e) => { setW(e.target.value); commitW(e.target.value); }}
          onBlur={() => { focused.current = null; setW(showNum(parseNum(w))); }} />
        <input className="num-input" inputMode="numeric" pattern="[0-9]*" value={r} aria-label="Répétitions"
          onFocus={(e) => { focused.current = 'r'; e.target.select(); }}
          onChange={(e) => { setR(e.target.value); commitR(e.target.value); }}
          onBlur={() => { focused.current = null; setR(String(Math.round(parseNum(r)))); }} />
        <button className="check" onClick={() => { commitW(w); commitR(r); onValidate(!s.done); (document.activeElement as HTMLElement)?.blur(); }} aria-label="Valider la série">
          <Icon name="check" size={20} stroke={3} />
        </button>
      </div>
      {pr && <div className="set-head" style={{ padding: 0 }}><span /><span className="pr-badge">🏆 {pr === 'weight' ? 'Record de charge' : 'Record 1RM estimé'} · {kg(s.weight)} × {s.reps}</span></div>}
    </>
  );
}

function RestTimer({ end, total, onAdjust, onClose }: { end: number; total: number; onAdjust: (d: number) => void; onClose: () => void }) {
  const [now, setNow] = useState(Date.now());
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 250); return () => clearInterval(t); }, []);
  const left = Math.max(0, Math.round((end - now) / 1000));
  useEffect(() => {
    if (left === 0) { navigator.vibrate?.([200, 100, 200]); const t = setTimeout(onClose, 2500); return () => clearTimeout(t); }
  }, [left === 0]); // eslint-disable-line
  return (
    <div className="rest">
      <Icon name="timer" />
      <div style={{ flex: 1 }}>
        <div className="time" style={{ color: left === 0 ? 'var(--accent)' : undefined }}>{left === 0 ? 'Go !' : `${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`}</div>
        <div className="bar"><i style={{ width: `${Math.min(100, (left / total) * 100)}%` }} /></div>
      </div>
      <button className="btn sm" onClick={() => onAdjust(-15)}>−15</button>
      <button className="btn sm" onClick={() => onAdjust(15)}>+15</button>
      <button className="icon-btn" onClick={onClose} aria-label="Fermer le minuteur"><Icon name="close" size={18} /></button>
    </div>
  );
}
