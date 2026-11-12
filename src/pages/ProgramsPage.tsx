import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { deleteProgram, PROGRAM_COLORS, programItems, saveProgram, setDayProgram } from '../db/actions';
import { todayWeekday, WEEKDAYS, WEEKDAYS_SHORT, type Program, type ProgramItem } from '../db/types';
import { useAllDoneSets, useExerciseMap, usePrograms } from '../hooks/data';
import { sessionsFromSets } from '../lib/analysis';
import { addDays, formatDateShort, relativeDay, todayISO, weekStart } from '../lib/format';
import { parseNum, showNum } from '../lib/numbers';
import { startOrResume } from '../lib/start';
import { Icon } from '../components/Icon';
import { Sheet } from '../components/Sheet';
import { ExercisePicker } from '../components/ExercisePicker';
import { MuscleBadge } from '../components/MuscleBadge';

/**
 * Programmes = modèles PERMANENTS organisés par jour de la semaine.
 * « Commencer la séance » crée une copie indépendante : l'historique n'est jamais réécrit.
 */
export default function ProgramsPage() {
  const nav = useNavigate();
  const programs = usePrograms();
  const today = todayWeekday();
  const monday = weekStart(todayISO());
  const doneThisWeek = useLiveQuery(async () => {
    const ws = await db.workouts.where('date').aboveOrEqual(monday).filter((w) => w.status === 'done' && !!w.programId).toArray();
    return ws;
  }, [monday]);
  const lastByProgram = useLiveQuery(async () => {
    const m = new Map<string, string>();
    for (const w of await db.workouts.where('status').equals('done').toArray()) if (w.programId && (m.get(w.programId) ?? '') < w.date) m.set(w.programId, w.date);
    return m;
  });
  const [editing, setEditing] = useState<Partial<Program> | null>(null);
  const [assignDay, setAssignDay] = useState<number | null>(null);

  const start = async (pid: string) => { try { nav(`/workout/${await startOrResume(pid)}`); } catch { /* annulé */ } };
  const byDay = (d: number) => (programs ?? []).filter((p) => p.days?.includes(d));

  return (
    <div className="page">
      <div className="header">
        <div><div className="sub">Semaine type</div><h1>Programmes</h1></div>
        <button className="icon-btn accent" onClick={() => setEditing({ name: '', items: [], days: [] })} aria-label="Nouveau modèle"><Icon name="plus" /></button>
      </div>

      {WEEKDAYS.map((dayName, d) => {
        const list = byDay(d);
        const date = addDays(monday, d);
        const isToday = d === today;
        return (
          <div key={d} className={`day-card ${isToday ? 'today' : ''} ${list.length ? '' : 'is-rest'}`}>
            <div className="day-head">
              <div className="flex" style={{ gap: 8 }}>
                <span className="day-name">{dayName}</span>
                <span className="small muted" style={{ whiteSpace: 'nowrap' }}>{formatDateShort(date)}</span>
                {isToday && <span className="chip up">Aujourd'hui</span>}
              </div>
              {!list.length && <button className="btn ghost sm" style={{ padding: '0 4px' }} onClick={() => setAssignDay(d)}><Icon name="plus" size={16} /> Séance</button>}
            </div>
            {!list.length && <div className="day-rest">😴 Repos</div>}
            {list.map((p) => {
              const done = doneThisWeek?.find((w) => w.programId === p.id && w.date === date);
              const n = p.items?.length ?? p.exerciseIds.length;
              const sets = p.items?.reduce((a, i) => a + i.sets, 0);
              return (
                <div key={p.id} className="day-session">
                  <div className="flex" style={{ gap: 10, alignItems: 'flex-start' }}>
                    <span className="day-bar" style={{ background: p.color }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="day-focus" style={{ color: p.color }}>{p.focus || p.name}</div>
                      <div className="title" style={{ fontWeight: 600 }}>{p.name}</div>
                      <div className="small muted">{n} exercices{sets ? ` · ${sets} séries` : ''}{lastByProgram?.get(p.id) ? ` · dernière fois ${relativeDay(lastByProgram.get(p.id)!).toLowerCase()}` : ''}</div>
                    </div>
                    {done && <span className="chip up"><Icon name="check" size={12} stroke={3} /> Faite</span>}
                  </div>
                  <button className="btn primary block mt" style={{ height: 44 }} onClick={() => nav(`/carnet/${p.id}`)}>
                    <Icon name="edit" size={16} /> Noter mes poids
                  </button>
                  <div className="flex mt" style={{ gap: 8 }}>
                    <button className="btn sm" style={{ flex: 1, height: 40, whiteSpace: 'nowrap', padding: '0 10px', fontSize: 14 }} onClick={() => start(p.id)}>
                      <Icon name="play" size={14} fill /> Commencer la séance
                    </button>
                    <button className="btn sm" style={{ height: 40, padding: '0 12px' }} onClick={() => setEditing(p)} aria-label="Modifier le programme"><Icon name="edit" size={16} /> Modifier</button>
                  </div>
                </div>
              );
            })}
          </div>
        );
      })}

      <div className="section-title">Mes séances modèles</div>
      <p className="small muted" style={{ margin: '-4px 4px 10px' }}>
        Un modèle est permanent : chaque semaine vous retrouvez la même séance, pré-remplie avec vos dernières performances.
        Le modifier n'affecte que les prochaines séances, jamais votre historique.
      </p>
      <div className="list">
        {programs?.map((p) => (
          <button key={p.id} className="row pressable" onClick={() => setEditing(p)}>
            <span className="dot-c" style={{ background: p.color }} />
            <div className="grow">
              <div className="title">{p.name}</div>
              <div className="meta">{p.days?.length ? p.days.map((d) => WEEKDAYS[d].slice(0, 3)).join(', ') : 'Non programmé'} · {(p.items ?? p.exerciseIds).length} exercices</div>
            </div>
            <Icon name="chevR" size={18} />
          </button>
        ))}
        <button className="row pressable" style={{ color: 'var(--accent)' }} onClick={() => setEditing({ name: '', items: [], days: [] })}>
          <Icon name="plus" size={20} /><div className="grow title">Nouveau modèle</div>
        </button>
      </div>

      <Sheet open={assignDay !== null} onClose={() => setAssignDay(null)} title={assignDay !== null ? WEEKDAYS[assignDay] : ''}>
        <div className="list">
          {programs?.map((p) => (
            <button key={p.id} className="row pressable" onClick={async () => { await setDayProgram(assignDay!, p.id); setAssignDay(null); }}>
              <span className="dot-c" style={{ background: p.color }} /><div className="grow title">{p.name}</div><Icon name="plus" size={18} />
            </button>
          ))}
          <button className="row pressable" style={{ color: 'var(--accent)' }} onClick={() => { const d = assignDay!; setAssignDay(null); setEditing({ name: '', items: [], days: [d] }); }}>
            <Icon name="plus" size={20} /><div className="grow title">Créer une nouvelle séance pour ce jour</div>
          </button>
        </div>
      </Sheet>

      {editing && <ProgramEditor initial={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

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
  const save = async () => {
    if (!valid) return;
    await saveProgram({ id: initial.id, name: name.trim(), focus, days, items, color });
    onClose();
  };

  return (
    <>
      <Sheet open onClose={onClose} title={initial.id ? 'Modifier la séance modèle' : 'Nouvelle séance modèle'} action={<button className="btn primary sm" disabled={!valid} onClick={save}>OK</button>}>
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
          Au démarrage, chaque série est pré-remplie avec votre dernière performance réelle (ou la charge du modèle s'il n'y en a pas encore).
        </p>
        <button className="btn primary block mt" disabled={!valid} onClick={save}>Enregistrer le modèle</button>
        {initial.id && <button className="btn danger block mt" onClick={async () => { if (confirm('Supprimer ce modèle ? Vos séances passées sont conservées.')) { await deleteProgram(initial.id!); onClose(); } }}>Supprimer le modèle</button>}
      </Sheet>
      <ExercisePicker open={picker} onClose={() => setPicker(false)} exclude={items.map((x) => x.exerciseId)}
        onPick={(ids) => setItems((a) => [...a, ...ids.map((exerciseId) => ({ exerciseId, sets: 3, reps: exMap.get(exerciseId)?.repMax ?? 10, weight: 0 }))])} />
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
