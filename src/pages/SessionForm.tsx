import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { programItems, quickLog } from '../db/actions';
import type { ProgramItem, SetEntry } from '../db/types';
import { useExerciseMap } from '../hooks/data';
import { compareSessions, recommend, sessionsFromSets } from '../lib/analysis';
import { formatDateLong, formatDateShort, todayISO } from '../lib/format';
import { parseNum, showNum } from '../lib/numbers';
import { snapshot } from '../lib/backup';
import { Icon } from '../components/Icon';
import { useToast } from '../components/Toast';

interface Row { w: string; r: string }
type Draft = Record<string, { rows: Row[]; skip: boolean }>;
const draftKey = (pid: string, date: string) => `overload-draft-${pid}-${date}`;

/**
 * Formulaire de séance ultra simple : tous les exercices du modèle sur un écran,
 * pré-remplis avec les derniers poids. On modifie, on touche « Enregistrer ».
 * Ré-enregistrer le même jour met à jour la séance du jour (jamais les jours précédents).
 */
export default function SessionForm() {
  const { id = '' } = useParams();
  const [params] = useSearchParams();
  const nav = useNavigate();
  const toast = useToast();
  const exMap = useExerciseMap();
  const [date, setDate] = useState(params.get('date') ?? todayISO());

  const data = useLiveQuery(async () => {
    const program = await db.programs.get(id);
    if (!program) return null;
    const items = await programItems(program);
    const ids = items.map((i) => i.exerciseId);
    const sets = ids.length ? await db.sets.where('exerciseId').anyOf(ids).filter((s) => s.done).toArray() : [];
    const todayW = await db.workouts.where('date').equals(date).filter((w) => !!w.quick && w.programId === id).first();
    return { program, items, sets, todayWorkoutId: todayW?.id };
  }, [id, date]);

  const [draft, setDraft] = useState<Draft | null>(null);
  const initFor = useRef('');

  // Pré-remplissage une seule fois par (séance, date) : brouillon > séance du jour > dernière fois > modèle
  useEffect(() => {
    if (!data) return;
    const k = `${id}|${date}`;
    if (initFor.current === k) return;
    initFor.current = k;
    let saved: Draft | null = null;
    try { saved = JSON.parse(localStorage.getItem(draftKey(id, date)) ?? 'null'); } catch { /* ignore */ }
    const d: Draft = {};
    for (const it of data.items) {
      if (saved?.[it.exerciseId]) { d[it.exerciseId] = saved[it.exerciseId]; continue; }
      const todays = data.sets.filter((s) => s.exerciseId === it.exerciseId && s.workoutId === data.todayWorkoutId).sort((a, b) => a.order - b.order);
      const prev = lastSession(data.sets, it.exerciseId, date, data.todayWorkoutId);
      d[it.exerciseId] = { rows: initialRows(it, todays.length ? todays : prev), skip: false };
    }
    setDraft(d);
  }, [data, id, date]);

  // Brouillon conservé si l'app est fermée avant d'enregistrer
  useEffect(() => {
    if (!draft) return;
    try { localStorage.setItem(draftKey(id, date), JSON.stringify(draft)); } catch { /* ignore */ }
  }, [draft, id, date]);

  const analysis = useMemo(() => {
    const m = new Map<string, { last?: SetEntry[]; lastDate?: string; reco: ReturnType<typeof recommend>; trend?: ReturnType<typeof compareSessions> }>();
    if (!data) return m;
    for (const it of data.items) {
      const ex = exMap.get(it.exerciseId);
      const ss = sessionsFromSets(data.sets.filter((s) => s.exerciseId === it.exerciseId && s.date < date || (s.exerciseId === it.exerciseId && s.date === date && s.workoutId !== data.todayWorkoutId)));
      const last = ss[ss.length - 1];
      const reco = recommend({ repMin: ex?.repMin ?? it.reps, repMax: ex?.repMax ?? it.reps, increment: ex?.increment ?? 2.5 }, ss);
      m.set(it.exerciseId, { last: last?.sets, lastDate: last?.date, reco, trend: ss.length > 1 ? compareSessions(last, ss[ss.length - 2]) : undefined });
    }
    return m;
  }, [data, exMap, date]);

  if (data === undefined || (data && !draft)) return <div className="page" />;
  if (data === null) return <div className="page"><div className="empty"><h3>Séance introuvable</h3><button className="btn mt" onClick={() => nav('/')}>Retour</button></div></div>;
  const { program, items } = data;

  const update = (exId: string, fn: (rows: Row[]) => Row[]) => setDraft((d) => ({ ...d!, [exId]: { ...d![exId], rows: fn(d![exId].rows) } }));
  const toggleSkip = (exId: string) => setDraft((d) => ({ ...d!, [exId]: { ...d![exId], skip: !d![exId].skip } }));

  const save = async () => {
    for (const it of items) {
      const e = draft![it.exerciseId];
      const sets = e.skip ? [] : e.rows.filter((x) => x.w.trim() !== '').map((x) => ({ weight: parseNum(x.w), reps: Math.round(parseNum(x.r)) }));
      await quickLog({ exerciseId: it.exerciseId, programId: id, date, sets });
    }
    try { localStorage.removeItem(draftKey(id, date)); } catch { /* ignore */ }
    await snapshot('séance');
    toast('Séance enregistrée ✓');
    nav('/history');
  };
  const filled = (exId: string) => !draft![exId].skip && draft![exId].rows.some((x) => x.w.trim() !== '' && parseNum(x.r) > 0);
  const doneCount = items.filter((it) => filled(it.exerciseId)).length;

  return (
    <div className="page">
      <div className="nav-top">
        <button className="back" onClick={() => nav(-1)}><Icon name="chevL" /> Séances</button>
        <button className="btn primary sm" onClick={save}>Enregistrer</button>
      </div>
      <div className="header" style={{ marginTop: 0, marginBottom: 8 }}>
        <div><div className="sub" style={{ color: program.color, fontWeight: 700 }}>{data.todayWorkoutId ? 'Déjà enregistrée — modification' : 'Nouvelle séance'}</div><h1 style={{ fontSize: 30 }}>{program.name}</h1></div>
      </div>
      <label className="date-pill">
        <Icon name="history" size={16} /> {formatDateLong(date)}
        <input type="date" value={date} max={todayISO()} onChange={(e) => { if (e.target.value) setDate(e.target.value); }} aria-label="Date de la séance" />
      </label>
      <p className="small muted" style={{ margin: '10px 4px 14px' }}>Vos derniers poids sont déjà remplis : changez seulement ce qui a bougé.</p>

      {items.map((it, idx) => {
        const ex = exMap.get(it.exerciseId);
        const e = draft![it.exerciseId];
        const a = analysis.get(it.exerciseId);
        return (
          <div key={it.exerciseId} className={`ex-card ${e.skip ? 'skipped' : ''}`}>
            <div className="flex between" style={{ alignItems: 'flex-start' }}>
              <div style={{ minWidth: 0 }}>
                <h3 style={{ fontSize: 18 }}>{idx + 1}. {ex?.name ?? '?'}</h3>
                <div className="prev-line">
                  {a?.last ? <>Dernière fois ({formatDateShort(a.lastDate!)}) : <b style={{ color: 'var(--text)' }}>{a.last.map((s) => `${showNum(s.weight)}×${s.reps}`).join(' · ')}</b></> : 'Première fois'}
                </div>
              </div>
              <button className="btn sm" style={{ flexShrink: 0, height: 32, fontSize: 13 }} onClick={() => toggleSkip(it.exerciseId)}>{e.skip ? 'Ajouter' : 'Pas fait'}</button>
            </div>
            {!e.skip && (
              <>
                {a?.reco.target && a.reco.target.weight > 0 && (
                  <div className="target-line">
                    🎯 À viser : <b>{showNum(a.reco.target.weight)} kg × {a.reco.target.reps}</b>
                    <button onClick={() => update(it.exerciseId, (rows) => rows.map(() => ({ w: showNum(a.reco.target!.weight), r: String(a.reco.target!.reps) })))}>Remplir</button>
                  </div>
                )}
                <div className="set-head" style={{ gridTemplateColumns: '30px 1fr 1fr 36px', marginTop: 8 }}><span>#</span><span>kg</span><span>Rép.</span><span /></div>
                {e.rows.map((x, i) => (
                  <div key={i} className="set-row" style={{ gridTemplateColumns: '30px 1fr 1fr 36px' }}>
                    <span className="set-num">{i + 1}</span>
                    <input className="num-input" inputMode="decimal" placeholder="kg" value={x.w} onFocus={(ev) => ev.target.select()} aria-label={`Série ${i + 1} poids`}
                      onChange={(ev) => update(it.exerciseId, (rows) => rows.map((r, k) => (k === i ? { ...r, w: ev.target.value } : r)))} />
                    <input className="num-input" inputMode="numeric" pattern="[0-9]*" value={x.r} onFocus={(ev) => ev.target.select()} aria-label={`Série ${i + 1} répétitions`}
                      onChange={(ev) => update(it.exerciseId, (rows) => rows.map((r, k) => (k === i ? { ...r, r: ev.target.value } : r)))} />
                    <button className="icon-btn" style={{ width: 34, height: 34, background: 'transparent', color: 'var(--text-3)' }} onClick={() => update(it.exerciseId, (rows) => rows.filter((_, k) => k !== i))} aria-label="Supprimer la série"><Icon name="close" size={16} /></button>
                  </div>
                ))}
                <button className="btn ghost sm block" style={{ marginTop: 4 }} onClick={() => update(it.exerciseId, (rows) => [...rows, rows[rows.length - 1] ?? { w: '', r: String(it.reps) }])}><Icon name="plus" size={16} /> Série</button>
              </>
            )}
          </div>
        );
      })}

      <button className="btn primary block" style={{ height: 56, fontSize: 18 }} onClick={save}><Icon name="check" size={20} stroke={3} /> Enregistrer ({doneCount}/{items.length})</button>
      <p className="small muted mt" style={{ textAlign: 'center' }}>Les exercices laissés vides ne sont pas enregistrés. Vous pourrez modifier la séance depuis l'historique.</p>
    </div>
  );
}

function lastSession(sets: SetEntry[], exerciseId: string, date: string, excludeWorkoutId?: string) {
  const ss = sessionsFromSets(sets.filter((s) => s.exerciseId === exerciseId && s.date <= date && s.workoutId !== excludeWorkoutId));
  return ss[ss.length - 1]?.sets ?? [];
}

function initialRows(plan: ProgramItem, src: { weight: number; reps: number }[]): Row[] {
  const n = src.length || plan.sets;
  return Array.from({ length: Math.max(1, n) }, (_, i) => {
    const s = src[i] ?? src[src.length - 1];
    return s ? { w: showNum(s.weight), r: String(s.reps) } : { w: plan.weight ? showNum(plan.weight) : '', r: String(plan.reps) };
  });
}
