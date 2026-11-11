import { useMemo, useState } from 'react';
import { MUSCLES, type MuscleGroup } from '../db/types';
import { useExercises } from '../hooks/data';
import { createExercise } from '../db/actions';
import { Sheet } from './Sheet';
import { Icon } from './Icon';
import { MuscleBadge } from './MuscleBadge';
import { ExerciseForm } from './ExerciseForm';
import { muscleLabel } from '../db/types';

/** Sélecteur d'exercices multi-sélection, avec recherche, filtre par muscle et création rapide. */
export function ExercisePicker({ open, onClose, onPick, exclude = [], title = 'Ajouter des exercices' }: {
  open: boolean; onClose: () => void; onPick: (ids: string[]) => void; exclude?: string[]; title?: string;
}) {
  const exercises = useExercises();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all'>('all');
  const [sel, setSel] = useState<string[]>([]);
  const [creating, setCreating] = useState(false);

  const list = useMemo(() => {
    const nq = norm(q);
    return (exercises ?? []).filter((e) => !exclude.includes(e.id) && (muscle === 'all' || e.muscle === muscle) && (!nq || norm(e.name).includes(nq)));
  }, [exercises, q, muscle, exclude]);

  const close = () => { setSel([]); setQ(''); setCreating(false); onClose(); };
  const toggle = (id: string) => setSel((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  return (
    <Sheet open={open} onClose={close} title={creating ? 'Nouvel exercice' : title}
      action={!creating && sel.length > 0 ? <button className="btn primary sm" onClick={() => { onPick(sel); close(); }}>Ajouter ({sel.length})</button> : undefined}>
      {creating ? (
        <ExerciseForm initial={{ name: q, muscle: muscle === 'all' ? undefined : muscle }} submitLabel="Créer et sélectionner"
          onSubmit={async (v) => { const id = await createExercise(v); setSel((s) => [...s, id]); setCreating(false); setQ(''); }} />
      ) : (
        <>
          <div className="search"><Icon name="search" size={18} /><input className="input" placeholder="Rechercher" value={q} onChange={(e) => setQ(e.target.value)} /></div>
          <div className="chips">
            <button className={`filter-chip ${muscle === 'all' ? 'on' : ''}`} onClick={() => setMuscle('all')}>Tous</button>
            {MUSCLES.map((m) => <button key={m.id} className={`filter-chip ${muscle === m.id ? 'on' : ''}`} onClick={() => setMuscle(m.id)}>{m.label}</button>)}
          </div>
          <button className="btn ghost block" onClick={() => setCreating(true)}><Icon name="plus" size={18} /> Créer un exercice{q ? ` « ${q} »` : ''}</button>
          <div className="list mt">
            {list.map((e) => {
              const on = sel.includes(e.id);
              return (
                <button key={e.id} className="row pressable" onClick={() => toggle(e.id)}>
                  <MuscleBadge muscle={e.muscle} />
                  <div className="grow"><div className="title">{e.name}</div><div className="meta">{muscleLabel(e.muscle)}{e.custom ? ' · perso' : ''}</div></div>
                  <div className="check" style={on ? { background: 'var(--accent)', color: '#00230b' } : undefined}><Icon name={on ? 'check' : 'plus'} size={18} stroke={2.6} /></div>
                </button>
              );
            })}
            {list.length === 0 && <div className="empty small">Aucun exercice trouvé</div>}
          </div>
        </>
      )}
    </Sheet>
  );
}
const norm = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
