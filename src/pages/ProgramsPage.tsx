import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { deleteProgram, PROGRAM_COLORS, saveProgram } from '../db/actions';
import type { Program } from '../db/types';
import { useExerciseMap, usePrograms } from '../hooks/data';
import { relativeDay } from '../lib/format';
import { startOrResume } from '../lib/start';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { ExercisePicker } from '../components/ExercisePicker';
import { MuscleBadge } from '../components/MuscleBadge';

const TEMPLATES: { name: string; ids: string[] }[] = [
  { name: 'Push', ids: ['ex-developpe-couche', 'ex-developpe-incline-halteres', 'ex-developpe-militaire', 'ex-elevations-laterales', 'ex-extension-poulie'] },
  { name: 'Pull', ids: ['ex-tractions', 'ex-rowing-barre', 'ex-tirage-horizontal', 'ex-face-pull', 'ex-curl-barre'] },
  { name: 'Legs', ids: ['ex-squat', 'ex-souleve-de-terre-roumain', 'ex-presse-a-cuisses', 'ex-leg-curl-assis', 'ex-mollets-debout'] },
  { name: 'Upper', ids: ['ex-developpe-couche', 'ex-rowing-barre', 'ex-developpe-militaire', 'ex-tirage-vertical', 'ex-curl-halteres', 'ex-barre-au-front'] },
  { name: 'Lower', ids: ['ex-squat', 'ex-souleve-de-terre-roumain', 'ex-hip-thrust', 'ex-leg-extension', 'ex-mollets-assis'] },
];

export default function ProgramsPage() {
  const nav = useNavigate();
  const programs = usePrograms();
  const exMap = useExerciseMap();
  const lastByProgram = useLiveQuery(async () => {
    const m = new Map<string, string>();
    for (const w of await db.workouts.where('status').equals('done').toArray()) if (w.programId && (m.get(w.programId) ?? '') < w.date) m.set(w.programId, w.date);
    return m;
  });
  const [editing, setEditing] = useState<Partial<Program> | null>(null);

  const start = async (pid: string) => { try { nav(`/workout/${await startOrResume(pid)}`); } catch { /* annulé */ } };

  return (
    <div className="page">
      <div className="header">
        <div><div className="sub">{programs?.length ?? 0} programmes</div><h1>Programmes</h1></div>
        <button className="icon-btn accent" onClick={() => setEditing({ name: '', exerciseIds: [] })} aria-label="Nouveau programme"><Icon name="plus" /></button>
      </div>

      {programs?.map((p) => (
        <div key={p.id} className="card">
          <div className="flex between">
            <div className="flex"><span className="dot-c" style={{ background: p.color }} /><h3 style={{ fontSize: 19 }}>{p.name}</h3></div>
            <button className="icon-btn" onClick={() => setEditing(p)} aria-label="Modifier"><Icon name="edit" size={18} /></button>
          </div>
          <div className="small muted" style={{ margin: '4px 0 10px' }}>
            {p.exerciseIds.length} exercices{lastByProgram?.get(p.id) ? ` · dernière fois ${relativeDay(lastByProgram.get(p.id)!).toLowerCase()}` : ''}
          </div>
          <div className="small" style={{ color: 'var(--text-2)', lineHeight: 1.6 }}>{p.exerciseIds.map((id) => exMap.get(id)?.name).filter(Boolean).join(' · ')}</div>
          <button className="btn primary block mt" onClick={() => start(p.id)}><Icon name="play" size={16} fill /> Démarrer</button>
        </div>
      ))}

      {programs && programs.length === 0 && (
        <>
          <div className="card empty"><div className="big">🗂️</div><h3>Aucun programme</h3><p>Créez vos séances types pour démarrer en un geste. Vous pouvez partir d'un modèle :</p></div>
          <div className="list mt">
            {TEMPLATES.map((t) => (
              <button key={t.name} className="row pressable" onClick={() => setEditing({ name: t.name, exerciseIds: t.ids.filter((i) => exMap.has(i)) })}>
                <div className="grow"><div className="title">{t.name}</div><div className="meta">{t.ids.map((i) => exMap.get(i)?.name).filter(Boolean).join(', ')}</div></div>
                <Icon name="plus" size={18} />
              </button>
            ))}
          </div>
        </>
      )}

      {editing && <ProgramEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function ProgramEditor({ initial, onClose }: { initial: Partial<Program>; onClose: () => void }) {
  const exMap = useExerciseMap();
  const [name, setName] = useState(initial.name ?? '');
  const [ids, setIds] = useState<string[]>(initial.exerciseIds ?? []);
  const [color, setColor] = useState(initial.color ?? PROGRAM_COLORS[0]);
  const [picker, setPicker] = useState(false);
  const move = (i: number, d: number) => setIds((a) => { const b = [...a]; const j = i + d; if (j < 0 || j >= b.length) return a; [b[i], b[j]] = [b[j], b[i]]; return b; });
  const save = async () => { if (!name.trim()) return; await saveProgram({ id: initial.id, name: name.trim(), exerciseIds: ids, color }); onClose(); };

  return (
    <>
      <Sheet open onClose={onClose} title={initial.id ? 'Modifier le programme' : 'Nouveau programme'} action={<button className="btn primary sm" disabled={!name.trim()} onClick={save}>OK</button>}>
        <div className="field"><label>Nom</label><input className="input" value={name} onChange={(e) => setName(e.target.value)} placeholder="Push, Pull, Legs…" /></div>
        <div className="field"><label>Couleur</label>
          <div className="flex">{PROGRAM_COLORS.map((c) => <button key={c} onClick={() => setColor(c)} style={{ width: 32, height: 32, borderRadius: 16, background: c, outline: c === color ? '3px solid #fff' : 'none', outlineOffset: 2 }} aria-label={c} />)}</div>
        </div>
        <div className="small muted" style={{ margin: '6px 4px' }}>Exercices ({ids.length})</div>
        <div className="list">
          {ids.map((id, i) => {
            const e = exMap.get(id);
            if (!e) return null;
            return (
              <div key={id} className="row">
                <MuscleBadge muscle={e.muscle} />
                <div className="grow title">{e.name}</div>
                <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => move(i, -1)} aria-label="Monter"><Icon name="up" size={16} /></button>
                <button className="icon-btn" style={{ width: 32, height: 32 }} onClick={() => move(i, 1)} aria-label="Descendre"><Icon name="down" size={16} /></button>
                <button className="icon-btn" style={{ width: 32, height: 32, color: 'var(--red)' }} onClick={() => setIds((a) => a.filter((x) => x !== id))} aria-label="Retirer"><Icon name="close" size={16} /></button>
              </div>
            );
          })}
        </div>
        <button className="btn blue block mt" onClick={() => setPicker(true)}><Icon name="plus" size={18} /> Ajouter des exercices</button>
        <button className="btn primary block mt" disabled={!name.trim()} onClick={save}>Enregistrer</button>
        {initial.id && <button className="btn danger block mt" onClick={async () => { if (confirm('Supprimer ce programme ? (vos séances passées sont conservées)')) { await deleteProgram(initial.id!); onClose(); } }}>Supprimer le programme</button>}
      </Sheet>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} exclude={ids} onPick={(n) => setIds((a) => [...a, ...n])} />
    </>
  );
}
