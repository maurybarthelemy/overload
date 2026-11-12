import { useEffect, useState } from 'react';
import { lastDoneSets, quickLog, quickLogEntry } from '../db/actions';
import { db } from '../db/database';
import { formatDateShort, todayISO } from '../lib/format';
import { parseNum, showNum } from '../lib/numbers';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { useToast } from './Toast';

interface Row { w: string; r: string }

/** Noter ses poids pour un exercice, n'importe quand, sans séance ni minuteur. */
export function QuickLogSheet({ exerciseId, programId, onClose }: { exerciseId: string | null; programId?: string; onClose: () => void }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [date, setDate] = useState(todayISO());
  const [rows, setRows] = useState<Row[]>([]);
  const [comment, setComment] = useState('');
  const [last, setLast] = useState<string>('');
  const [existing, setExisting] = useState(false);

  // Pré-remplissage : note déjà faite ce jour-là > dernière performance > modèle
  useEffect(() => {
    if (!exerciseId) return;
    let cancel = false;
    (async () => {
      const ex = await db.exercises.get(exerciseId);
      const entry = await quickLogEntry(exerciseId, date, programId);
      const prev = (await lastDoneSets(exerciseId)).filter((s) => s.date < date || !entry);
      const plan = programId ? (await db.programs.get(programId))?.items?.find((i) => i.exerciseId === exerciseId) : undefined;
      if (cancel) return;
      setName(ex?.name ?? '');
      const lastSrc = entry ? (await lastBefore(exerciseId, date)) : prev;
      setLast(lastSrc.length ? `${formatDateShort(lastSrc[0].date)} : ${lastSrc.map((s) => `${showNum(s.weight)} × ${s.reps}`).join(' · ')}` : '');
      setExisting(!!entry);
      setComment(entry?.comment ?? '');
      const src = entry?.sets.length ? entry.sets : prev.length ? prev : plan ? Array.from({ length: plan.sets }, () => ({ weight: plan.weight, reps: plan.reps })) : [{ weight: 0, reps: 10 }];
      setRows(src.map((s) => ({ w: showNum(s.weight), r: String(s.reps) })));
    })();
    return () => { cancel = true; };
  }, [exerciseId, date, programId]);

  if (!exerciseId) return null;
  const set = (i: number, p: Partial<Row>) => setRows((a) => a.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const save = async () => {
    await quickLog({ exerciseId, date, programId, comment, sets: rows.map((x) => ({ weight: parseNum(x.w), reps: Math.round(parseNum(x.r)) })) });
    toast('Poids enregistrés ✓');
    onClose();
  };

  return (
    <Sheet open onClose={onClose} title={name || 'Noter mes poids'} action={<button className="btn primary sm" onClick={save}>OK</button>}>
      <div className="card tight small" style={{ marginBottom: 12 }}>
        <span className="muted">Dernière fois </span>{last || <span className="muted">— aucune donnée</span>}
      </div>
      <div className="field"><label>Date</label><input className="input" type="date" value={date} max={todayISO()} onChange={(e) => e.target.value && setDate(e.target.value)} /></div>
      <div className="set-head" style={{ gridTemplateColumns: '30px 1fr 1fr 40px' }}><span>#</span><span>kg</span><span>Rép.</span><span /></div>
      {rows.map((x, i) => (
        <div key={i} className="set-row" style={{ gridTemplateColumns: '30px 1fr 1fr 40px' }}>
          <span className="set-num">{i + 1}</span>
          <input className="num-input" inputMode="decimal" value={x.w} onFocus={(e) => e.target.select()} onChange={(e) => set(i, { w: e.target.value })} aria-label="Poids (kg)" />
          <input className="num-input" inputMode="numeric" pattern="[0-9]*" value={x.r} onFocus={(e) => e.target.select()} onChange={(e) => set(i, { r: e.target.value })} aria-label="Répétitions" />
          <button className="icon-btn" style={{ width: 36, height: 36, color: 'var(--red)' }} onClick={() => setRows((a) => a.filter((_, k) => k !== i))} aria-label="Supprimer la série"><Icon name="close" size={16} /></button>
        </div>
      ))}
      <button className="btn ghost block sm mt" onClick={() => setRows((a) => [...a, a[a.length - 1] ?? { w: '0', r: '10' }])}><Icon name="plus" size={18} /> Ajouter une série</button>
      <textarea className="input mt" style={{ minHeight: 56 }} placeholder="Commentaire (facultatif)" value={comment} onChange={(e) => setComment(e.target.value)} />
      <button className="btn primary block mt2" onClick={save}><Icon name="check" size={18} /> Enregistrer</button>
      {existing && <p className="small muted mt" style={{ textAlign: 'center' }}>Vous modifiez la note du {formatDateShort(date)}. Les autres jours ne sont pas touchés.</p>}
    </Sheet>
  );
}

async function lastBefore(exerciseId: string, date: string) {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).filter((s) => s.done && s.date < date).toArray();
  if (!sets.length) return [];
  sets.sort((a, b) => b.date.localeCompare(a.date) || b.createdAt - a.createdAt);
  return sets.filter((s) => s.workoutExerciseId === sets[0].workoutExerciseId).sort((a, b) => a.order - b.order);
}
