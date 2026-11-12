import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../db/database';
import { programItems } from '../db/actions';
import { useAllDoneSets, useExerciseMap } from '../hooks/data';
import { compareSessions, sessionsFromSets } from '../lib/analysis';
import { formatDateShort, todayISO } from '../lib/format';
import { showNum } from '../lib/numbers';
import { startOrResume } from '../lib/start';
import { Icon } from '../components/Icon';
import { MuscleBadge } from '../components/MuscleBadge';
import { QuickLogSheet } from '../components/QuickLogSheet';
import { TrendChip } from '../components/Trend';

/** Carnet d'un programme : tous les exercices avec les derniers poids, notables à tout moment. */
export default function CarnetPage() {
  const { id = '' } = useParams();
  const nav = useNavigate();
  const exMap = useExerciseMap();
  const sets = useAllDoneSets();
  const program = useLiveQuery(() => db.programs.get(id).then((p) => p ?? null), [id]);
  const items = useLiveQuery(async () => (program ? programItems(program) : []), [program]);
  const [logging, setLogging] = useState<string | null>(null);
  const today = todayISO();

  const perEx = useMemo(() => {
    const m = new Map<string, ReturnType<typeof sessionsFromSets>>();
    for (const it of items ?? []) m.set(it.exerciseId, sessionsFromSets((sets ?? []).filter((s) => s.exerciseId === it.exerciseId)));
    return m;
  }, [items, sets]);

  if (program === undefined) return <div className="page" />;
  if (program === null) return <div className="page"><div className="empty"><h3>Programme introuvable</h3><Link to="/programs" className="btn mt">Programmes</Link></div></div>;

  return (
    <div className="page">
      <div className="nav-top"><button className="back" onClick={() => nav(-1)}><Icon name="chevL" /> Retour</button></div>
      <div className="header" style={{ marginTop: 0 }}>
        <div><div className="sub" style={{ color: program.color, fontWeight: 700 }}>{program.focus || 'Carnet'}</div><h1 style={{ fontSize: 28 }}>{program.name}</h1></div>
      </div>
      <p className="small muted" style={{ margin: '-8px 4px 14px' }}>Touchez un exercice pour noter vos poids, quand vous voulez — pas besoin de démarrer une séance.</p>

      {(items ?? []).map((it) => {
        const ex = exMap.get(it.exerciseId);
        if (!ex) return null;
        const ss = perEx.get(it.exerciseId) ?? [];
        const last = ss[ss.length - 1];
        const prev = ss[ss.length - 2];
        const doneToday = last?.date === today;
        const cmp = last && prev ? compareSessions(last, prev) : null;
        return (
          <button key={it.exerciseId} className="card pressable" style={{ display: 'block', width: '100%', textAlign: 'left' }} onClick={() => setLogging(it.exerciseId)}>
            <div className="flex" style={{ gap: 10 }}>
              <MuscleBadge muscle={ex.muscle} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="title" style={{ fontWeight: 700 }}>{ex.name}</div>
                <div className="small muted">Objectif {it.sets} × {it.reps}{it.weight ? ` · ${showNum(it.weight)} kg` : ''}</div>
              </div>
              {doneToday ? <span className="chip up"><Icon name="check" size={12} stroke={3} /> Noté</span> : <span className="chip blue"><Icon name="edit" size={12} /> Noter</span>}
            </div>
            {last ? (
              <>
                <div className="small muted mt">{doneToday ? "Aujourd'hui" : `Dernière fois (${formatDateShort(last.date)})`}</div>
                <div className="history-sets" style={{ marginTop: 4 }}>{last.sets.map((s) => <span key={s.id}>{showNum(s.weight)} × {s.reps}</span>)}</div>
                {cmp && <div className="mt"><TrendChip trend={cmp.trend} label={cmp.label} /></div>}
              </>
            ) : <div className="small muted mt">Pas encore de poids notés</div>}
          </button>
        );
      })}
      {items && items.length === 0 && <div className="card empty small">Ce programme ne contient aucun exercice. Ajoutez-en depuis « Modifier ».</div>}

      <button className="btn block mt2" onClick={async () => { try { nav(`/workout/${await startOrResume(id)}`); } catch { /* annulé */ } }}>
        <Icon name="play" size={14} fill /> Ou lancer une séance guidée
      </button>

      <QuickLogSheet exerciseId={logging} programId={id} onClose={() => setLogging(null)} />
    </div>
  );
}
