import { useState } from 'react';
import { MUSCLES, type Exercise, type MuscleGroup } from '../db/types';
import { parseNum } from '../lib/numbers';

export interface ExerciseFormValues { name: string; muscle: MuscleGroup; repMin: number; repMax: number; increment: number }

export function ExerciseForm({ initial, onSubmit, submitLabel = 'Enregistrer' }: { initial?: Partial<Exercise>; onSubmit: (v: ExerciseFormValues) => void; submitLabel?: string }) {
  const [name, setName] = useState(initial?.name ?? '');
  const [muscle, setMuscle] = useState<MuscleGroup>(initial?.muscle ?? 'pectoraux');
  const [repMin, setRepMin] = useState(String(initial?.repMin ?? 8));
  const [repMax, setRepMax] = useState(String(initial?.repMax ?? 12));
  const [inc, setInc] = useState(String(initial?.increment ?? 2.5).replace('.', ','));
  const valid = name.trim().length > 0;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) return;
        const a = Math.max(1, Math.round(parseNum(repMin) || 8));
        const b = Math.max(a, Math.round(parseNum(repMax) || 12));
        onSubmit({ name: name.trim(), muscle, repMin: a, repMax: b, increment: Math.max(0, parseNum(inc)) });
      }}
    >
      <div className="field">
        <label>Nom de l'exercice</label>
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="ex. Développé couché" autoFocus={!initial} />
      </div>
      <div className="field">
        <label>Groupe musculaire</label>
        <select className="input" value={muscle} onChange={(e) => setMuscle(e.target.value as MuscleGroup)}>
          {MUSCLES.map((m) => <option key={m.id} value={m.id}>{m.label}</option>)}
        </select>
      </div>
      <div className="grid3">
        <div className="field"><label>Rép. min</label><input className="input" inputMode="numeric" value={repMin} onChange={(e) => setRepMin(e.target.value)} /></div>
        <div className="field"><label>Rép. max</label><input className="input" inputMode="numeric" value={repMax} onChange={(e) => setRepMax(e.target.value)} /></div>
        <div className="field"><label>Incrément kg</label><input className="input" inputMode="decimal" value={inc} onChange={(e) => setInc(e.target.value)} /></div>
      </div>
      <p className="small muted" style={{ margin: '-4px 4px 16px' }}>
        La fourchette de répétitions et l'incrément servent aux suggestions de progression (double progression).
      </p>
      <button className="btn primary block" type="submit" disabled={!valid}>{submitLabel}</button>
    </form>
  );
}
