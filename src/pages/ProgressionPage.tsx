import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllDoneSets, useExerciseMap, usePrograms } from '../hooks/data';
import { compareSessions, computeRecords, rangeStart, RANGES, recommend, sessionsFromSets, type Range } from '../lib/analysis';
import { formatDateShort } from '../lib/format';
import { showNum } from '../lib/numbers';
import { Icon } from '../components/Icon';
import { Segmented } from '../components/Segmented';
import { Sparkline } from '../components/Sparkline';
import { TrendChip } from '../components/Trend';

/** Onglet 3 : ce qu'il faut viser à la prochaine séance + l'évolution, séance par séance. */
export default function ProgressionPage() {
  const programs = usePrograms();
  const sets = useAllDoneSets();
  const exMap = useExerciseMap();
  const [range, setRange] = useState<Range>('3m');

  const byEx = useMemo(() => {
    const m = new Map<string, ReturnType<typeof sessionsFromSets>>();
    const g = new Map<string, typeof sets>();
    for (const s of sets ?? []) g.set(s.exerciseId, [...(g.get(s.exerciseId) ?? []), s]);
    for (const [k, v] of g) m.set(k, sessionsFromSets(v!));
    return m;
  }, [sets]);

  const from = rangeStart(range);
  const inProgram = new Set((programs ?? []).flatMap((p) => p.items?.map((i) => i.exerciseId) ?? p.exerciseIds));
  const others = [...byEx.keys()].filter((id) => !inProgram.has(id));

  const renderEx = (exId: string) => {
    const ex = exMap.get(exId);
    if (!ex) return null;
    const ss = byEx.get(exId) ?? [];
    const last = ss[ss.length - 1];
    const reco = recommend(ex, ss);
    const cmp = ss.length > 1 ? compareSessions(last, ss[ss.length - 2]) : null;
    const pts = ss.filter((s) => s.date >= from);
    const first = pts[0];
    const delta = first && last && pts.length > 1 ? last.topWeight - first.topWeight : null;
    const rec = computeRecords(ss);
    return (
      <Link key={exId} to={`/exercise/${exId}`} className="prog-row pressable">
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="title" style={{ fontWeight: 700 }}>{ex.name}</div>
          {last ? (
            <>
              <div className="small muted">Dernière fois ({formatDateShort(last.date)}) : {last.sets.map((s) => `${showNum(s.weight)}×${s.reps}`).join(' · ')}</div>
              <div className="target-line" style={{ marginTop: 6 }}>🎯 Prochaine séance : <b>{reco.target ? (reco.target.weight > 0 ? `${showNum(reco.target.weight)} kg × ${reco.target.reps}` : `${reco.target.reps} rép.`) : reco.title}</b></div>
              <div className="flex wrap" style={{ gap: 6, marginTop: 6 }}>
                {cmp && <TrendChip trend={cmp.trend} label={cmp.label} />}
                {rec.maxWeight && <span className="chip pr">🏆 {showNum(rec.maxWeight.weight)} kg × {rec.maxWeight.reps}</span>}
              </div>
            </>
          ) : <div className="small muted">Pas encore de poids enregistrés</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <Sparkline values={pts.map((s) => s.topWeight)} />
          {delta !== null && <div className="small" style={{ fontWeight: 700, color: delta > 0 ? 'var(--accent)' : delta < 0 ? 'var(--red)' : 'var(--text-2)' }}>{delta > 0 ? '+' : ''}{showNum(delta)} kg</div>}
        </div>
      </Link>
    );
  };

  return (
    <div className="page">
      <div className="header">
        <div><div className="sub">Objectifs & évolution</div><h1>Progression</h1></div>
        <Link to="/stats" className="icon-btn" aria-label="Statistiques détaillées"><Icon name="stats" size={20} /></Link>
      </div>
      <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ id: r.id, label: r.label }))} />
      <p className="small muted" style={{ margin: '10px 4px 0' }}>
        Les objectifs sont indicatifs : augmentez la charge seulement si vos séries étaient propres et que vous êtes bien récupéré. Touchez un exercice pour voir sa courbe détaillée.
      </p>

      {(programs ?? []).map((p) => (
        <div key={p.id}>
          <div className="section-title"><span className="flex" style={{ gap: 8 }}><span className="seance-dot" style={{ background: p.color }} />{p.name}</span></div>
          <div className="list">{(p.items?.map((i) => i.exerciseId) ?? p.exerciseIds).map(renderEx)}</div>
        </div>
      ))}
      {others.length > 0 && (
        <>
          <div className="section-title">Autres exercices</div>
          <div className="list">{others.map(renderEx)}</div>
        </>
      )}
    </div>
  );
}
