import { useEffect, useMemo, useState } from 'react';
import { deleteProgram, PROGRAM_COLORS, programItems, saveProgram } from '../db/actions';
import { WEEKDAYS, WEEKDAYS_SHORT, type Program, type ProgramItem } from '../db/types';
import { useAllDoneSets, useExerciseMap } from '../hooks/data';
import { sessionsFromSets } from '../lib/analysis';
import { formatDateShort } from '../lib/format';
import { parseNum, showNum } from '../lib/numbers';
import { Icon } from './Icon';
import { Sheet } from './Sheet';
import { ExercisePicker } from './ExercisePicker';
import { MuscleBadge } from './MuscleBadge';

/** Édition d'une séance modèle : exercices, ordre, séries, répétitions, charge, jours. */
export function ProgramEditor({ initial, onClose }: { initial: Partial<Program>; onClose: () => void }) {
  const exMap = useExerciseMap();
  const allSets = useAllDoneSets();
  const [name, setName] = useState(initial.name ?? '');
  const [focus, setFocus] = useState(initial.focus ?? '');
  const [days, setDays] = useState<number[]>(initial.days ?? []);
  const [items, setItems] = useState<ProgramItem[]>(initial.items ?? []);
  const [color, setColor] = useState(initial.color ?? PROGRAM_COLORS[0]);
  const [picker, setPicker] = useState(false);

  // Anciens programmes sans détail : on génère les lignes par défaut
  useEffect(() => {
    if (!initial.items && initial.id) programItems(initial as Program).then(setItems);
  }, [initial]);

  const lastPerf = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) {
      const ss = sessionsFromSets((allSets ?? []).filter((s) => s.exerciseId === it.exerciseId));
      const l = ss[ss.length - 1];
      if (l) m.set(it.exerciseId, `${formatDateShort(l.date)} : ${l.sets.map((s) => `${showNum(s.weight)}×${s.reps}`).join(' · ')}`);
    }
    return m;
  }, [allSets, items]);

  const move = (i: number, d: number) => setItems((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; });
  const patch = (i: number, p: Partial<ProgramItem>) => setItems((a) => a.map((x, k) => (k === i ? { ...x, ...p } : x)));
  const valid = name.trim().length > 0;
  // Enregistrement automatique : chaque ajout d'exercice et la fermeture enregistrent le modèle
  const [pid, setPid] = useState(initial.id);
  const persist = async (next: ProgramItem[] = items) => {
    if (!valid) return;
    const id = await saveProgram({ id: pid, name: name.trim(), focus, days, items: next, color });
    setPid(id);
  };
  const save = async () => { await persist(); onClose(); };

  return (
    <>
      <Sheet open onClose={save} title={initial.id ? 'Modifier la séance modèle' : 'Nouvelle séance modèle'} action={<button className="btn primary sm" disabled={!valid} onClick={save}>OK</button>}>
        <div className="field"><label>Nom de la séance</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Pectoraux" /></div>
        <div className="field"><label>Groupe(s) musculaire(s) travaillé(s)</label><input className="input" value={focus} onChange={(e) => setFocus(e.target.value)} placeholder="ex. Bras / Épaules" /></div>
        <div className="field">
          <label>Jours de la semaine</label>
          <div className="weekday-picker">
            {WEEKDAYS_SHORT.map((l, d) => (
              <button key={d} className={days.includes(d) ? 'on' : ''} style={days.includes(d) ? { background: color } : undefined}
                onClick={() => setDays((a) => (a.includes(d) ? a.filter((x) => x !== d) : [...a, d]))} aria-label={WEEKDAYS[d]}>{l}</button>
            ))}
          </div>
        </div>
        <div className="field"><label>Couleur</label>
          <div className="flex">{PROGRAM_COLORS.map((c) => <button key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 16, background: c, outline: c === color ? '3px solid #fff' : 'none', outlineOffset: 2 }} aria-label={c} />)}</div>
        </div>

        <div className="small muted" style={{ margin: '6px 4px' }}>Exercices prévus ({items.length}) — dans l'ordre de la séance</div>
        {items.map((it, i) => {
          const e = exMap.get(it.exerciseId);
          if (!e) return null;
          return (
            <div key={it.exerciseId + i} className="plan-item">
              <div className="flex" style={{ gap: 10 }}>
                <MuscleBadge muscle={e.muscle} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="title" style={{ fontWeight: 600 }}>{i + 1}. {e.name}</div>
                  <div className="small muted" style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{lastPerf.get(it.exerciseId) ?? 'Aucune performance enregistrée'}</div>
                </div>
                <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => move(i, -1)} aria-label="Monter"><Icon name="up" size={16} /></button>
                <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => move(i, 1)} aria-label="Descendre"><Icon name="down" size={16} /></button>
                <button className="icon-btn" style={{ width: 32, height: 32, color: 'var(--red)' }} onClick={() => setItems((a) => a.filter((_, k) => k !== i))} aria-label="Retirer"><Icon name="close" size={16} /></button>
              </div>
              <div className="grid3 mt" style={{ gap: 8 }}>
                <NumField label="Séries" value={it.sets} onChange={(v) => patch(i, { sets: Math.max(1, Math.round(v)) })} />
                <NumField label="Rép. ciblées" value={it.reps} onChange={(v) => patch(i, { reps: Math.max(1, Math.round(v)) })} />
                <NumField label="Charge kg" value={it.weight} decimal onChange={(v) => patch(i, { weight: Math.max(0, v) })} />
              </div>
            </div>
          );
        })}
        <button className="btn blue block mt" onClick={() => setPicker(true)}><Icon name="plus" size={18} /> Ajouter des exercices</button>
        <p className="small muted mt" style={{ padding: '0 4px' }}>
          Les modifications sont enregistrées automatiquement.
        </p>
        <button className="btn primary block mt" disabled={!valid} onClick={save}>Enregistrer le modèle</button>
        {pid && <button className="btn danger block mt" onClick={async () => { if (confirm('Supprimer ce modèle ? Vos séances passées sont conservées.')) { await deleteProgram(pid); onClose(); } }}>Supprimer le modèle</button>}
      </Sheet>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} exclude={items.map((x) => x.exerciseId)}
        onPick={(ids) => {
          const next = [...items, ...ids.map((exerciseId) => ({ exerciseId, sets: 3, reps: exMap.get(exerciseId)?.repMax ?? 10, weight: 0 }))];
          setItems(next);
          persist(next);
        }} />
    </>
  );
}

function NumField({ label, value, onChange, decimal }: { label: string; value: number; onChange: (v: number) => void; decimal?: boolean }) {
  const [s, setS] = useState(showNum(value));
  useEffect(() => setS(showNum(value)), [value]);
  return (
    <label className="numfield">
      <span>{label}</span>
      <input className="num-input" inputMode={decimal ? 'decimal' : 'numeric'} value={s}
        onFocus={(e) => e.target.select()} onChange={(e) => { setS(e.target.value); if (/^\d+([.,]\d+)?$/.test(e.target.value)) onChange(parseNum(e.target.value)); }} onBlur={() => onChange(parseNum(s))} />
    </label>
  );
}
