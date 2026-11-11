import { useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MUSCLES, muscleLabel, type MuscleGroup } from '../db/types';
import { useAllDoneSets, useExercises } from '../hooks/data';
import { createExercise } from '../db/actions';
import { relativeDay } from '../lib/format';
import { Icon } from '../components/Icon';
import { MuscleBadge } from '../components/MuscleBadge';
import { Sheet } from '../components/Sheet';
import { ExerciseForm } from '../components/ExerciseForm';

export default function LibraryPage() {
  const nav = useNavigate();
  const exercises = useExercises();
  const sets = useAllDoneSets();
  const [q, setQ] = useState('');
  const [muscle, setMuscle] = useState<MuscleGroup | 'all' | 'fav'>('all');
  const [create, setCreate] = useState(false);

  const lastDate = useMemo(() => {
    const m = new Map<string, string>();
    for (const s of sets ?? []) if ((m.get(s.exerciseId) ?? '') < s.date) m.set(s.exerciseId, s.date);
    return m;
  }, [sets]);
  const nq = q.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  const list = (exercises ?? []).filter((e) =>
    (muscle === 'all' || (muscle === 'fav' ? e.favorite : e.muscle === muscle)) &&
    (!nq || e.name.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().includes(nq)));
  const grouped = MUSCLES.map((m) => ({ ...m, items: list.filter((e) => e.muscle === m.id) })).filter((g) => g.items.length);

  return (
    <div className="page">
      <div className="header">
        <div><div className="sub">{exercises?.length ?? 0} exercices</div><h1>Exercices</h1></div>
        <button className="icon-btn accent" onClick={() => setCreate(true)} aria-label="Nouvel exercice"><Icon name="plus" /></button>
      </div>
      <div className="search"><Icon name="search" size={18} /><input className="input" placeholder="Rechercher un exercice" value={q} onChange={(e) => setQ(e.target.value)} /></div>
      <div className="chips">
        <button className={`filter-chip ${muscle === 'all' ? 'on' : ''}`} onClick={() => setMuscle('all')}>Tous</button>
        <button className={`filter-chip ${muscle === 'fav' ? 'on' : ''}`} onClick={() => setMuscle('fav')}>★ Favoris</button>
        {MUSCLES.map((m) => <button key={m.id} className={`filter-chip ${muscle === m.id ? 'on' : ''}`} onClick={() => setMuscle(m.id)}>{m.label}</button>)}
      </div>
      {grouped.map((g) => (
        <div key={g.id}>
          <div className="section-title" style={{ fontSize: 17 }}>{g.label}</div>
          <div className="list">
            {g.items.map((e) => (
              <Link key={e.id} to={`/exercise/${e.id}`} className="row pressable">
                <MuscleBadge muscle={e.muscle} />
                <div className="grow">
                  <div className="title">{e.favorite ? '★ ' : ''}{e.name}</div>
                  <div className="meta">{lastDate.get(e.id) ? `Dernière fois : ${relativeDay(lastDate.get(e.id)!)}` : muscleLabel(e.muscle)}{e.custom ? ' · perso' : ''}</div>
                </div>
                <Icon name="chevR" size={18} />
              </Link>
            ))}
          </div>
        </div>
      ))}
      {!grouped.length && <div className="card empty small">Aucun exercice. <button className="btn ghost sm" onClick={() => setCreate(true)}>Créer « {q} »</button></div>}
      <Sheet open={create} onClose={() => setCreate(false)} title="Nouvel exercice">
        <ExerciseForm initial={{ name: q }} submitLabel="Créer" onSubmit={async (v) => { const id = await createExercise(v); setCreate(false); nav(`/exercise/${id}`); }} />
      </Sheet>
    </div>
  );
}
