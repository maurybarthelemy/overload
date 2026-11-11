/**
 * Moteur d'analyse de la surcharge progressive.
 * Fonctions pures : elles ne lisent pas la base, elles reçoivent les données.
 */
import type { Exercise, SetEntry, WorkoutExercise } from '../db/types';
import { addDays, todayISO, weekStart } from './format';

/** 1RM estimé (formule d'Epley). */
export const e1rm = (weight: number, reps: number) => (reps <= 0 ? 0 : reps === 1 ? weight : weight * (1 + reps / 30));
export const round = (n: number, step = 0.5) => Math.round(n / step) * step;

export interface Session {
  workoutId: string;
  workoutExerciseId: string;
  date: string;
  sets: SetEntry[];
  topWeight: number;
  /** Répétitions max réalisées à la charge la plus lourde */
  repsAtTop: number;
  totalReps: number;
  volume: number;
  bestE1rm: number;
  bestSet: SetEntry;
}

export function buildSession(sets: SetEntry[]): Session | null {
  const done = sets.filter((s) => s.done).sort((a, b) => a.order - b.order);
  if (!done.length) return null;
  const topWeight = Math.max(...done.map((s) => s.weight));
  let bestSet = done[0];
  for (const s of done) if (e1rm(s.weight, s.reps) > e1rm(bestSet.weight, bestSet.reps)) bestSet = s;
  return {
    workoutId: done[0].workoutId,
    workoutExerciseId: done[0].workoutExerciseId,
    date: done[0].date,
    sets: done,
    topWeight,
    repsAtTop: Math.max(...done.filter((s) => s.weight === topWeight).map((s) => s.reps)),
    totalReps: done.reduce((a, s) => a + s.reps, 0),
    volume: done.reduce((a, s) => a + s.reps * s.weight, 0),
    bestE1rm: e1rm(bestSet.weight, bestSet.reps),
    bestSet,
  };
}

/** Regroupe les séries d'un exercice par passage, du plus ancien au plus récent. */
export function sessionsFromSets(sets: SetEntry[]): Session[] {
  const by = new Map<string, SetEntry[]>();
  for (const s of sets) {
    if (!s.done) continue;
    const arr = by.get(s.workoutExerciseId) ?? [];
    arr.push(s);
    by.set(s.workoutExerciseId, arr);
  }
  const out: Session[] = [];
  for (const arr of by.values()) {
    const s = buildSession(arr);
    if (s) out.push(s);
  }
  return out.sort((a, b) => (a.date === b.date ? a.sets[0].createdAt - b.sets[0].createdAt : a.date.localeCompare(b.date)));
}

export type Trend = 'up' | 'down' | 'same';
export interface Comparison {
  weightDelta: number;
  repsDelta: number; // reps à la charge max (si même charge) ou reps totales
  volumeDelta: number;
  volumePct: number;
  e1rmDelta: number;
  trend: Trend;
  label: string;
}

/** Compare un passage au précédent. */
export function compareSessions(cur: Session, prev: Session): Comparison {
  const weightDelta = cur.topWeight - prev.topWeight;
  const repsDelta = weightDelta === 0 ? cur.repsAtTop - prev.repsAtTop : cur.totalReps - prev.totalReps;
  const volumeDelta = cur.volume - prev.volume;
  const volumePct = prev.volume ? (volumeDelta / prev.volume) * 100 : 0;
  const e1rmDelta = cur.bestE1rm - prev.bestE1rm;
  let trend: Trend = 'same';
  if (weightDelta > 0 || (weightDelta === 0 && (repsDelta > 0 || volumeDelta > 0)) || e1rmDelta > 0.5) trend = 'up';
  else if (weightDelta < 0 || (weightDelta === 0 && repsDelta < 0) || e1rmDelta < -0.5) trend = 'down';
  // une hausse de charge avec moins de reps reste une progression si le 1RM estimé ne chute pas fortement
  if (weightDelta > 0 && e1rmDelta < -2) trend = 'same';
  let label = 'Performance stable';
  if (weightDelta > 0) label = `+${fmt(weightDelta)} kg sur la charge max`;
  else if (weightDelta < 0) label = `${fmt(weightDelta)} kg sur la charge max`;
  else if (repsDelta > 0) label = `+${repsDelta} rép. à charge égale`;
  else if (repsDelta < 0) label = `${repsDelta} rép. à charge égale`;
  else if (volumeDelta > 0) label = `Volume +${Math.round(volumePct)} %`;
  return { weightDelta, repsDelta, volumeDelta, volumePct, e1rmDelta, trend, label };
}
const fmt = (n: number) => String(Math.round(n * 100) / 100).replace('.', ',');

// ---------- Records ----------
export interface Records {
  maxWeight?: { weight: number; reps: number; date: string };
  bestE1rm?: { value: number; weight: number; reps: number; date: string };
  maxReps?: { weight: number; reps: number; date: string };
  maxVolume?: { value: number; date: string };
}

export function computeRecords(sessions: Session[]): Records {
  const r: Records = {};
  for (const s of sessions) {
    for (const set of s.sets) {
      if (!r.maxWeight || set.weight > r.maxWeight.weight || (set.weight === r.maxWeight.weight && set.reps > r.maxWeight.reps))
        r.maxWeight = { weight: set.weight, reps: set.reps, date: s.date };
      const est = e1rm(set.weight, set.reps);
      if (!r.bestE1rm || est > r.bestE1rm.value) r.bestE1rm = { value: est, weight: set.weight, reps: set.reps, date: s.date };
      if (!r.maxReps || set.reps > r.maxReps.reps || (set.reps === r.maxReps.reps && set.weight > r.maxReps.weight))
        r.maxReps = { weight: set.weight, reps: set.reps, date: s.date };
    }
    if (!r.maxVolume || s.volume > r.maxVolume.value) r.maxVolume = { value: s.volume, date: s.date };
  }
  return r;
}

/** Une série est-elle un record (charge max ou 1RM estimé) par rapport à l'historique antérieur ? */
export function isPR(set: { weight: number; reps: number }, previous: Session[]): 'weight' | 'e1rm' | null {
  if (!previous.length || set.reps <= 0) return null;
  const rec = computeRecords(previous);
  if (rec.maxWeight && set.weight > rec.maxWeight.weight) return 'weight';
  if (rec.bestE1rm && e1rm(set.weight, set.reps) > rec.bestE1rm.value + 0.01) return 'e1rm';
  return null;
}

// ---------- Recommandation (double progression) ----------
export type RecoKind = 'start' | 'increase' | 'reps' | 'hold' | 'deload';
export interface Recommendation {
  kind: RecoKind;
  title: string;
  detail: string;
  target?: { weight: number; reps: number };
}

/**
 * Double progression : on progresse d'abord en répétitions dans la fourchette [repMin, repMax],
 * puis on augmente la charge quand toutes les séries de travail atteignent repMax
 * — uniquement si le ressenti et la technique le permettent. Toujours indicatif.
 */
export function recommend(
  ex: Pick<Exercise, 'repMin' | 'repMax' | 'increment'>,
  sessions: Session[],
  lastMeta?: Pick<WorkoutExercise, 'difficulty' | 'goodForm'>,
): Recommendation {
  const last = sessions[sessions.length - 1];
  if (!last) {
    return {
      kind: 'start',
      title: 'Première fois',
      detail: `Choisissez une charge permettant ${ex.repMin}–${ex.repMax} répétitions propres en gardant 2 à 3 répétitions en réserve.`,
    };
  }
  const working = last.sets.filter((s) => s.weight === last.topWeight);
  const minReps = Math.min(...working.map((s) => s.reps));
  const allTop = working.every((s) => s.reps >= ex.repMax);
  const hard = (lastMeta?.difficulty ?? 0) >= 4;
  const badForm = lastMeta?.goodForm === false;
  const w = last.topWeight;

  // Régression sur 2 passages consécutifs → suggérer de récupérer / alléger
  if (sessions.length >= 3) {
    const [a, b, c] = sessions.slice(-3);
    if (c.bestE1rm < b.bestE1rm - 0.5 && b.bestE1rm < a.bestE1rm - 0.5) {
      return {
        kind: 'deload',
        title: 'Performances en baisse',
        detail: 'Deux passages consécutifs en baisse. Vérifiez sommeil, alimentation et récupération. Une séance plus légère (≈ -10 %) peut aider à relancer la progression.',
        target: { weight: round(w * 0.9, 0.5), reps: ex.repMin + 2 },
      };
    }
  }

  if (allTop && !hard && !badForm) {
    if (ex.increment <= 0) {
      return {
        kind: 'increase',
        title: 'Prêt à progresser',
        detail: `Toutes vos séries ont atteint ${ex.repMax} rép. Ajoutez du lest ou une variante plus difficile si vous vous sentez bien.`,
        target: { weight: w, reps: ex.repMax + 1 },
      };
    }
    return {
      kind: 'increase',
      title: `Essayez ${fmt(w + ex.increment)} kg`,
      detail: `Toutes vos séries ont atteint ${ex.repMax} rép. avec une bonne exécution. Si vous êtes bien récupéré, passez à ${fmt(w + ex.increment)} kg et visez ${ex.repMin} rép. Sinon, consolidez ${fmt(w)} kg.`,
      target: { weight: w + ex.increment, reps: ex.repMin },
    };
  }
  if (allTop && (hard || badForm)) {
    return {
      kind: 'hold',
      title: `Consolidez ${fmt(w)} kg`,
      detail: badForm
        ? 'Haut de fourchette atteint, mais technique à améliorer. Gardez la charge et soignez l\'exécution avant d\'augmenter.'
        : 'Haut de fourchette atteint, mais ressenti très difficile. Refaites cette charge pour la rendre plus confortable avant d\'augmenter.',
      target: { weight: w, reps: ex.repMax },
    };
  }
  if (minReps < ex.repMin && hard) {
    return {
      kind: 'hold',
      title: `Restez à ${fmt(w)} kg`,
      detail: `Sous la fourchette (${minReps} rép.) avec un ressenti difficile. Gardez la charge et visez ${ex.repMin} rép. propres — ou réduisez légèrement si la technique se dégrade.`,
      target: { weight: w, reps: ex.repMin },
    };
  }
  const goal = Math.min(ex.repMax, Math.max(minReps + 1, ex.repMin));
  return {
    kind: 'reps',
    title: `${fmt(w)} kg × ${goal}`,
    detail: `Gardez ${fmt(w)} kg et essayez d'ajouter 1 répétition (objectif ${ex.repMin}–${ex.repMax}). Quand toutes les séries atteignent ${ex.repMax}, vous pourrez augmenter la charge.`,
    target: { weight: w, reps: goal },
  };
}

// ---------- Agrégats globaux ----------
export type Range = '1m' | '3m' | '6m' | '1y' | 'all';
export const RANGES: { id: Range; label: string; days: number }[] = [
  { id: '1m', label: '1M', days: 30 },
  { id: '3m', label: '3M', days: 91 },
  { id: '6m', label: '6M', days: 182 },
  { id: '1y', label: '1A', days: 365 },
  { id: 'all', label: 'Tout', days: 36500 },
];
export const rangeStart = (r: Range, from = todayISO()) => addDays(from, -RANGES.find((x) => x.id === r)!.days);

export interface WeekBucket { week: string; sessions: number; volume: number; sets: number; reps: number }

export function weeklyBuckets(sets: SetEntry[], workoutDates: { id: string; date: string }[], weeks: number): WeekBucket[] {
  const start = weekStart(addDays(todayISO(), -7 * (weeks - 1)));
  const map = new Map<string, WeekBucket>();
  for (let i = 0; i < weeks; i++) {
    const w = addDays(start, i * 7);
    map.set(w, { week: w, sessions: 0, volume: 0, sets: 0, reps: 0 });
  }
  for (const w of workoutDates) {
    const b = map.get(weekStart(w.date));
    if (b) b.sessions++;
  }
  for (const s of sets) {
    if (!s.done) continue;
    const b = map.get(weekStart(s.date));
    if (b) { b.volume += s.weight * s.reps; b.sets++; b.reps += s.reps; }
  }
  return [...map.values()];
}

export interface PeriodSummary { sessions: number; sets: number; reps: number; volume: number; exercises: number }
export function summarize(sets: SetEntry[], from: string, to: string): PeriodSummary {
  const sel = sets.filter((s) => s.done && s.date >= from && s.date <= to);
  return {
    sessions: new Set(sel.map((s) => s.workoutId)).size,
    sets: sel.length,
    reps: sel.reduce((a, s) => a + s.reps, 0),
    volume: sel.reduce((a, s) => a + s.reps * s.weight, 0),
    exercises: new Set(sel.map((s) => s.exerciseId)).size,
  };
}

/**
 * Progression globale : variation moyenne du 1RM estimé par exercice
 * entre le premier et le dernier passage sur la fenêtre donnée.
 */
export function globalProgress(sets: SetEntry[], days = 56) {
  const from = addDays(todayISO(), -days);
  const byEx = new Map<string, SetEntry[]>();
  for (const s of sets) {
    if (!s.done || s.date < from) continue;
    const arr = byEx.get(s.exerciseId) ?? [];
    arr.push(s);
    byEx.set(s.exerciseId, arr);
  }
  let up = 0, down = 0, same = 0;
  const pcts: number[] = [];
  for (const arr of byEx.values()) {
    const ss = sessionsFromSets(arr);
    if (ss.length < 2) continue;
    const first = ss[0].bestE1rm, last = ss[ss.length - 1].bestE1rm;
    if (!first) continue;
    const pct = ((last - first) / first) * 100;
    pcts.push(pct);
    if (pct > 0.5) up++; else if (pct < -0.5) down++; else same++;
  }
  const avg = pcts.length ? pcts.reduce((a, b) => a + b, 0) / pcts.length : 0;
  return { avgPct: avg, up, down, same, tracked: pcts.length };
}

/** Liste chronologique des records battus (charge max ou 1RM estimé), tous exercices confondus. */
export interface PREvent { exerciseId: string; date: string; weight: number; reps: number; kind: 'weight' | 'e1rm'; e1rm: number }
export function prTimeline(sets: SetEntry[]): PREvent[] {
  const byEx = new Map<string, SetEntry[]>();
  for (const s of sets) if (s.done) { const a = byEx.get(s.exerciseId) ?? []; a.push(s); byEx.set(s.exerciseId, a); }
  const out: PREvent[] = [];
  for (const [exId, arr] of byEx) {
    const ss = sessionsFromSets(arr);
    let maxW = -1, maxE = -1;
    ss.forEach((s, i) => {
      if (i > 0) {
        if (s.topWeight > maxW) out.push({ exerciseId: exId, date: s.date, weight: s.topWeight, reps: s.repsAtTop, kind: 'weight', e1rm: s.bestE1rm });
        else if (s.bestE1rm > maxE + 0.01) out.push({ exerciseId: exId, date: s.date, weight: s.bestSet.weight, reps: s.bestSet.reps, kind: 'e1rm', e1rm: s.bestE1rm });
      }
      maxW = Math.max(maxW, s.topWeight);
      maxE = Math.max(maxE, s.bestE1rm);
    });
  }
  return out.sort((a, b) => b.date.localeCompare(a.date));
}
