import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAllDoneSets, useDoneWorkouts, useExerciseMap } from '../hooks/data';
import { computeRecords, RANGES, sessionsFromSets, summarize, weeklyBuckets, type Range } from '../lib/analysis';
import { addDays, compact, formatDateShort, kg, todayISO } from '../lib/format';
import { showNum } from '../lib/numbers';
import { MUSCLES } from '../db/types';
import { Bars, LineArea } from '../components/Charts';
import { Segmented } from '../components/Segmented';
import { MuscleBadge, muscleColor } from '../components/MuscleBadge';
import { Icon } from '../components/Icon';

export default function StatsPage() {
  const sets = useAllDoneSets();
  const workouts = useDoneWorkouts();
  const exMap = useExerciseMap();
  const [range, setRange] = useState<Range>('3m');
  const [weekMetric, setWeekMetric] = useState<'sessions' | 'volume'>('sessions');
  const [exId, setExId] = useState<string>('');

  const days = RANGES.find((r) => r.id === range)!.days;
  const stats = useMemo(() => {
    if (!sets || !workouts) return null;
    const firstDate = sets.reduce((m, s) => (s.date < m ? s.date : m), todayISO());
    const effDays = range === 'all' ? Math.max(7, Math.round((Date.now() - new Date(firstDate).getTime()) / 86400000) + 1) : days;
    const to = todayISO();
    const from = addDays(to, -effDays + 1);
    const cur = summarize(sets, from, to);
    const prev = summarize(sets, addDays(from, -effDays), addDays(from, -1));
    const weeks = weeklyBuckets(sets, workouts, Math.min(52, Math.max(4, Math.ceil(effDays / 7))));
    const inRange = sets.filter((s) => s.date >= from);
    const byMuscle = MUSCLES.map((m) => ({ ...m, sets: inRange.filter((s) => exMap.get(s.exerciseId)?.muscle === m.id).length })).filter((m) => m.sets > 0).sort((a, b) => b.sets - a.sets);
    const exIds = [...new Set(sets.map((s) => s.exerciseId))];
    const perEx = exIds.map((id) => {
      const ss = sessionsFromSets(sets.filter((s) => s.exerciseId === id));
      return { id, sessions: ss, rec: computeRecords(ss) };
    }).sort((a, b) => b.sessions.length - a.sessions.length);
    return { cur, prev, weeks, byMuscle, perEx, from };
  }, [sets, workouts, range, days, exMap]);

  if (!stats) return <div className="page" />;
  const selected = stats.perEx.find((p) => p.id === exId) ?? stats.perEx[0];
  const selSessions = selected?.sessions.filter((s) => s.date >= stats.from) ?? [];
  const maxMuscle = Math.max(1, ...stats.byMuscle.map((m) => m.sets));

  return (
    <div className="page">
      <div className="header"><div><div className="sub">Vos données</div><h1>Statistiques</h1></div></div>
      <Segmented value={range} onChange={setRange} options={RANGES.map((r) => ({ id: r.id, label: r.label }))} />

      <div className="section-title">Comparaison avec la période précédente</div>
      <div className="grid2">
        <Compare label="Séances" cur={stats.cur.sessions} prev={stats.prev.sessions} fmt={String} />
        <Compare label="Volume" cur={stats.cur.volume} prev={stats.prev.volume} fmt={compact} />
        <Compare label="Séries" cur={stats.cur.sets} prev={stats.prev.sets} fmt={String} />
        <Compare label="Répétitions" cur={stats.cur.reps} prev={stats.prev.reps} fmt={String} />
      </div>

      <div className="section-title">Par semaine</div>
      <div className="card">
        <Segmented value={weekMetric} onChange={setWeekMetric} options={[{ id: 'sessions', label: 'Séances' }, { id: 'volume', label: 'Volume (kg)' }]} />
        <div className="mt">
          <Bars data={stats.weeks.map((w) => ({ x: w.week, y: weekMetric === 'sessions' ? w.sessions : Math.round(w.volume), label: weekMetric === 'sessions' ? `${w.sets} séries` : `${w.sessions} séance(s)` }))}
            unit={weekMetric === 'sessions' ? 'séance(s)' : 'kg'} color={weekMetric === 'sessions' ? '#0A84FF' : '#30D158'} fmtX={(s) => 'S. ' + formatDateShort(s)} />
        </div>
        <p className="small muted">Volume = séries × répétitions × poids.</p>
      </div>

      {stats.perEx.length > 0 && selected && (
        <>
          <div className="section-title">Charges par exercice</div>
          <div className="card">
            <select className="input" value={selected.id} onChange={(e) => setExId(e.target.value)}>
              {stats.perEx.map((p) => <option key={p.id} value={p.id}>{exMap.get(p.id)?.name ?? '?'} ({p.sessions.length})</option>)}
            </select>
            <div className="mt"><LineArea data={selSessions.map((s) => ({ x: s.date, y: s.topWeight, label: `× ${s.repsAtTop} rép. · 1RM est. ${showNum(Math.round(s.bestE1rm))} kg` }))} id="statex" /></div>
            <Link to={`/exercise/${selected.id}`} className="btn ghost block sm">Voir l'historique complet <Icon name="chevR" size={16} /></Link>
          </div>
        </>
      )}

      {stats.byMuscle.length > 0 && (
        <>
          <div className="section-title">Séries par groupe musculaire</div>
          <div className="card">
            {stats.byMuscle.map((m) => (
              <div key={m.id} style={{ marginBottom: 10 }}>
                <div className="flex between small"><span>{m.label}</span><span className="muted tabular">{m.sets}</span></div>
                <div style={{ height: 8, borderRadius: 4, background: 'var(--card-2)', marginTop: 4 }}>
                  <div style={{ height: '100%', width: `${(m.sets / maxMuscle) * 100}%`, borderRadius: 4, background: muscleColor(m.id) }} />
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      <div className="section-title">Records personnels</div>
      {stats.perEx.length ? (
        <div className="list">
          {stats.perEx.map(({ id, rec, sessions }) => {
            const e = exMap.get(id);
            if (!e || !rec.maxWeight) return null;
            return (
              <Link key={id} to={`/exercise/${id}`} className="row pressable">
                <MuscleBadge muscle={e.muscle} />
                <div className="grow"><div className="title">{e.name}</div><div className="meta">1RM est. {kg(Math.round(rec.bestE1rm!.value * 2) / 2)} · {sessions.length} passages</div></div>
                <div style={{ textAlign: 'right' }}><div className="tabular" style={{ fontWeight: 700 }}>{showNum(rec.maxWeight.weight)} kg</div><div className="small muted">× {rec.maxWeight.reps} · {formatDateShort(rec.maxWeight.date)}</div></div>
              </Link>
            );
          })}
        </div>
      ) : <div className="card empty small">Aucune donnée pour l'instant.</div>}
    </div>
  );
}

function Compare({ label, cur, prev, fmt }: { label: string; cur: number; prev: number; fmt: (n: number) => string }) {
  const pct = prev ? ((cur - prev) / prev) * 100 : null;
  return (
    <div className="card stat">
      <div className="label">{label}</div>
      <div className="value" style={{ fontSize: 24 }}>{fmt(cur)}</div>
      <div className="hint" style={{ color: pct === null ? undefined : pct >= 0 ? 'var(--accent)' : 'var(--red)' }}>
        {pct === null ? 'pas de période précédente' : `${pct >= 0 ? '+' : ''}${Math.round(pct)} % (avant : ${fmt(prev)})`}
      </div>
    </div>
  );
}
