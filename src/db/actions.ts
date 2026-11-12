/**
 * Toutes les écritures passent par ce module : l'UI n'écrit jamais directement en base.
 * Chaque opération est persistée immédiatement dans IndexedDB (sauvegarde automatique).
 */
import { db, getMeta, setMeta, uid } from './database';
import type { Difficulty, Exercise, MuscleGroup, Program, ProgramItem, SetEntry, Workout, WorkoutExercise } from './types';
import { todayISO } from '../lib/format';

// ---------- Séances ----------
export async function getActiveWorkout() {
  return db.workouts.where('status').equals('active').first();
}

export async function startWorkout(opts: { programId?: string; name?: string } = {}): Promise<string> {
  const program = opts.programId ? await db.programs.get(opts.programId) : undefined;
  const id = uid();
  const date = todayISO();
  const items = program ? await programItems(program) : [];
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    await db.workouts.add({
      id, date, status: 'active', startedAt: Date.now(),
      name: opts.name ?? program?.name ?? 'Séance libre',
      programId: program?.id,
    });
    if (program) {
      // Copie du modèle : la séance devient indépendante du programme
      for (const [i, item] of items.entries()) await addExerciseInternal(id, item.exerciseId, i, date, undefined, item);
    }
  });
  return id;
}

/**
 * Ajoute un exercice à la séance et pré-remplit les séries.
 * - avec un modèle (plan) : autant de séries que prévu ; charge et reps = dernière performance
 *   réelle sur cet exercice si elle existe, sinon les valeurs du modèle ;
 * - sans modèle : recopie la dernière performance (ou le gabarit fourni pour une duplication).
 */
async function addExerciseInternal(workoutId: string, exerciseId: string, order: number, date: string, template?: SetEntry[], plan?: ProgramItem) {
  const weId = uid();
  await db.workoutExercises.add({ id: weId, workoutId, exerciseId, order, targetSets: plan?.sets, targetReps: plan?.reps });
  const history = template ?? (await lastDoneSets(exerciseId, workoutId));
  let rows: { weight: number; reps: number }[] = history.map((s) => ({ weight: s.weight, reps: s.reps }));
  if (plan) {
    rows = Array.from({ length: Math.max(1, plan.sets) }, (_, i) => {
      const h = history[i] ?? history[history.length - 1];
      return h ? { weight: h.weight, reps: h.reps } : { weight: plan.weight, reps: plan.reps };
    });
  }
  const now = Date.now();
  await db.sets.bulkAdd(
    rows.map((s, i) => ({
      id: uid(), workoutExerciseId: weId, workoutId, exerciseId, order: i,
      weight: s.weight, reps: s.reps, done: false, date, createdAt: now + i,
    })),
  );
  return weId;
}

export async function lastDoneSets(exerciseId: string, excludeWorkoutId?: string): Promise<SetEntry[]> {
  const sets = await db.sets.where('exerciseId').equals(exerciseId).filter((s) => s.done && s.workoutId !== excludeWorkoutId).toArray();
  if (!sets.length) return [];
  sets.sort((a, b) => (a.date === b.date ? b.createdAt - a.createdAt : b.date.localeCompare(a.date)));
  const lastWorkout = sets[0].workoutExerciseId;
  return sets.filter((s) => s.workoutExerciseId === lastWorkout).sort((a, b) => a.order - b.order);
}

export async function addExerciseToWorkout(workoutId: string, exerciseId: string) {
  const w = await db.workouts.get(workoutId);
  if (!w) return;
  const count = await db.workoutExercises.where('workoutId').equals(workoutId).count();
  return db.transaction('rw', db.workoutExercises, db.sets, () => addExerciseInternal(workoutId, exerciseId, count, w.date));
}

export async function removeWorkoutExercise(weId: string) {
  await db.transaction('rw', db.workoutExercises, db.sets, async () => {
    await db.sets.where('workoutExerciseId').equals(weId).delete();
    await db.workoutExercises.delete(weId);
  });
}

export async function moveWorkoutExercise(workoutId: string, weId: string, dir: -1 | 1) {
  const list = (await db.workoutExercises.where('workoutId').equals(workoutId).toArray()).sort((a, b) => a.order - b.order);
  const i = list.findIndex((x) => x.id === weId);
  const j = i + dir;
  if (i < 0 || j < 0 || j >= list.length) return;
  [list[i], list[j]] = [list[j], list[i]];
  await db.transaction('rw', db.workoutExercises, () => Promise.all(list.map((x, k) => db.workoutExercises.update(x.id, { order: k }))));
}

export async function updateWorkoutExercise(weId: string, patch: Partial<Pick<WorkoutExercise, 'difficulty' | 'goodForm' | 'comment'>>) {
  await db.workoutExercises.update(weId, patch);
}

export async function addSet(we: WorkoutExercise, values?: { weight: number; reps: number }) {
  const existing = (await db.sets.where('workoutExerciseId').equals(we.id).toArray()).sort((a, b) => a.order - b.order);
  const last = existing[existing.length - 1];
  const w = await db.workouts.get(we.workoutId);
  await db.sets.add({
    id: uid(), workoutExerciseId: we.id, workoutId: we.workoutId, exerciseId: we.exerciseId,
    order: (last?.order ?? -1) + 1, weight: values?.weight ?? last?.weight ?? 0, reps: values?.reps ?? last?.reps ?? 8,
    done: false, date: w?.date ?? todayISO(), createdAt: Date.now(),
  });
}

export async function updateSet(id: string, patch: Partial<Pick<SetEntry, 'weight' | 'reps' | 'done'>>) {
  await db.sets.update(id, patch);
}

export async function deleteSet(id: string) {
  await db.sets.delete(id);
}

export async function updateWorkout(id: string, patch: Partial<Pick<Workout, 'name' | 'date' | 'notes'>>) {
  await db.transaction('rw', db.workouts, db.sets, async () => {
    await db.workouts.update(id, patch);
    if (patch.date) await db.sets.where('workoutId').equals(id).modify({ date: patch.date });
  });
}

/** Termine la séance : les séries non validées sont supprimées, les exercices vides retirés. */
export async function finishWorkout(id: string) {
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    await db.sets.where('workoutId').equals(id).filter((s) => !s.done).delete();
    const wes = await db.workoutExercises.where('workoutId').equals(id).toArray();
    for (const we of wes) {
      if ((await db.sets.where('workoutExerciseId').equals(we.id).count()) === 0) await db.workoutExercises.delete(we.id);
    }
    await db.workouts.update(id, { status: 'done', finishedAt: Date.now() });
  });
}

export async function reopenWorkout(id: string) {
  const active = await getActiveWorkout();
  if (active && active.id !== id) throw new Error('Une séance est déjà en cours.');
  await db.workouts.update(id, { status: 'active' });
}

export async function deleteWorkout(id: string) {
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    await db.sets.where('workoutId').equals(id).delete();
    await db.workoutExercises.where('workoutId').equals(id).delete();
    await db.workouts.delete(id);
  });
}

/** Duplique une séance passée en nouvelle séance active (mêmes exercices, mêmes charges). */
export async function duplicateWorkout(sourceId: string): Promise<string> {
  const src = await db.workouts.get(sourceId);
  if (!src) throw new Error('Séance introuvable');
  const id = uid();
  const date = todayISO();
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    await db.workouts.add({ id, date, status: 'active', startedAt: Date.now(), name: src.name, programId: src.programId });
    const wes = (await db.workoutExercises.where('workoutId').equals(sourceId).toArray()).sort((a, b) => a.order - b.order);
    for (const [i, we] of wes.entries()) {
      const sets = (await db.sets.where('workoutExerciseId').equals(we.id).toArray()).sort((a, b) => a.order - b.order);
      const weId = await addExerciseInternal(id, we.exerciseId, i, date, sets);
      if (we.targetSets) await db.workoutExercises.update(weId, { targetSets: we.targetSets, targetReps: we.targetReps });
    }
  });
  return id;
}

// ---------- Exercices ----------
export async function createExercise(data: { name: string; muscle: MuscleGroup; repMin?: number; repMax?: number; increment?: number }) {
  const id = 'cx-' + uid();
  await db.exercises.add({
    id, name: data.name.trim(), muscle: data.muscle, custom: true,
    repMin: data.repMin ?? 8, repMax: data.repMax ?? 12, increment: data.increment ?? 2.5, createdAt: Date.now(),
  });
  return id;
}

export async function updateExercise(id: string, patch: Partial<Omit<Exercise, 'id' | 'custom' | 'createdAt'>>) {
  await db.exercises.update(id, patch);
}

/** Un exercice avec historique est archivé (jamais de perte d'historique), sinon supprimé. */
export async function deleteExercise(id: string) {
  const used = await db.sets.where('exerciseId').equals(id).count();
  if (used > 0) await db.exercises.update(id, { archived: true });
  else await db.exercises.delete(id);
  const programs = await db.programs.toArray();
  for (const p of programs) {
    if (p.exerciseIds.includes(id) || p.items?.some((x) => x.exerciseId === id)) {
      await db.programs.update(p.id, { exerciseIds: p.exerciseIds.filter((x) => x !== id), items: p.items?.filter((x) => x.exerciseId !== id) });
    }
  }
}

// ---------- Programmes ----------
export const PROGRAM_COLORS = ['#30D158', '#0A84FF', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF'];

/** Lignes du modèle ; les anciens programmes (sans détail) reçoivent des valeurs par défaut. */
export async function programItems(p: Program): Promise<ProgramItem[]> {
  if (p.items) return p.items;
  const exs = await db.exercises.bulkGet(p.exerciseIds);
  return p.exerciseIds.map((exerciseId, i) => ({ exerciseId, sets: 3, reps: exs[i]?.repMax ?? 10, weight: 0 }));
}

/** Enregistre un modèle. N'affecte que les FUTURES séances (les séances passées sont des copies). */
export async function saveProgram(p: Partial<Program> & { name: string; items: ProgramItem[] }) {
  const patch = {
    name: p.name, items: p.items, exerciseIds: p.items.map((x) => x.exerciseId),
    days: [...new Set(p.days ?? [])].sort(), focus: p.focus?.trim() || undefined,
  };
  if (p.id) {
    await db.programs.update(p.id, { ...patch, color: p.color });
    return p.id;
  }
  const id = uid();
  const n = await db.programs.count();
  await db.programs.add({ id, ...patch, color: p.color ?? PROGRAM_COLORS[n % PROGRAM_COLORS.length], createdAt: Date.now() });
  return id;
}

/** Affecte un modèle à un jour (ou rend le jour « repos » si programId est vide). */
export async function setDayProgram(day: number, programId: string | null) {
  await db.transaction('rw', db.programs, async () => {
    for (const p of await db.programs.toArray()) {
      const has = p.days?.includes(day) ?? false;
      if (p.id === programId && !has) await db.programs.update(p.id, { days: [...(p.days ?? []), day].sort() });
      if (p.id !== programId && has) await db.programs.update(p.id, { days: p.days!.filter((d) => d !== day) });
    }
  });
}

/** Remplace le modèle par ce qui a été réellement fait dans une séance (action explicite uniquement). */
export async function updateProgramFromWorkout(programId: string, workoutId: string) {
  const wes = (await db.workoutExercises.where('workoutId').equals(workoutId).toArray()).sort((a, b) => a.order - b.order);
  const items: ProgramItem[] = [];
  for (const we of wes) {
    const sets = (await db.sets.where('workoutExerciseId').equals(we.id).toArray()).filter((s) => s.done).sort((a, b) => a.order - b.order);
    if (!sets.length) continue;
    items.push({ exerciseId: we.exerciseId, sets: sets.length, reps: we.targetReps ?? Math.max(...sets.map((s) => s.reps)), weight: Math.max(...sets.map((s) => s.weight)) });
  }
  await db.programs.update(programId, { items, exerciseIds: items.map((i) => i.exerciseId) });
}

// ---------- Semaine type par défaut ----------
const DEFAULT_WEEK: { name: string; focus: string; days: number[]; color: string; items: [string, number, number][] }[] = [
  { name: 'Pectoraux', focus: 'Pectoraux', days: [0], color: '#30D158', items: [
    ['ex-developpe-couche', 4, 10], ['ex-developpe-incline-halteres', 3, 10], ['ex-dips-pectoraux', 3, 10], ['ex-ecarte-a-la-poulie', 3, 12], ['ex-pec-deck', 3, 12]] },
  { name: 'Bras / Épaules', focus: 'Bras / Épaules', days: [1, 5], color: '#FF9F0A', items: [
    ['ex-developpe-militaire', 4, 8], ['ex-elevations-laterales', 4, 15], ['ex-oiseau', 3, 15], ['ex-curl-barre', 3, 10], ['ex-curl-marteau', 3, 10], ['ex-barre-au-front', 3, 10], ['ex-extension-poulie', 3, 12]] },
  { name: 'Dos', focus: 'Dos', days: [4], color: '#0A84FF', items: [
    ['ex-tractions', 4, 8], ['ex-tirage-vertical', 3, 10], ['ex-rowing-barre', 4, 10], ['ex-tirage-horizontal', 3, 10], ['ex-pullover-poulie', 3, 12], ['ex-face-pull', 3, 15]] },
  { name: 'Jambes', focus: 'Jambes', days: [6], color: '#BF5AF2', items: [
    ['ex-squat', 4, 8], ['ex-presse-a-cuisses', 3, 10], ['ex-souleve-de-terre-roumain', 3, 10], ['ex-leg-curl-assis', 3, 12], ['ex-leg-extension', 3, 12], ['ex-mollets-debout', 4, 12]] },
];

/**
 * Crée une seule fois la semaine type (L Pecs, M Bras/Épaules, V Dos, S Bras/Épaules, D Jambes).
 * Ne touche jamais aux programmes existants ; les jours déjà occupés ne sont pas réattribués.
 */
export async function ensureWeeklyPlan() {
  if (await getMeta('weeklyPlanSeeded', false)) return;
  await setMeta('weeklyPlanSeeded', true);
  const existing = await db.programs.toArray();
  const taken = new Set(existing.flatMap((p) => p.days ?? []));
  const known = new Set((await db.exercises.toArray()).map((e) => e.id));
  let t = Date.now();
  for (const d of DEFAULT_WEEK) {
    if (existing.some((p) => p.name.toLowerCase() === d.name.toLowerCase())) continue;
    const items = d.items.filter(([id]) => known.has(id)).map(([exerciseId, sets, reps]) => ({ exerciseId, sets, reps, weight: 0 }));
    await db.programs.add({
      id: uid(), name: d.name, focus: d.focus, color: d.color, days: d.days.filter((x) => !taken.has(x)),
      items, exerciseIds: items.map((i) => i.exerciseId), createdAt: t++,
    });
  }
}

export async function deleteProgram(id: string) {
  await db.programs.delete(id);
}

export type { Difficulty };
