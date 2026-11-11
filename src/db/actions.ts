/**
 * Toutes les écritures passent par ce module : l'UI n'écrit jamais directement en base.
 * Chaque opération est persistée immédiatement dans IndexedDB (sauvegarde automatique).
 */
import { db, uid } from './database';
import type { Difficulty, Exercise, MuscleGroup, Program, SetEntry, Workout, WorkoutExercise } from './types';
import { todayISO } from '../lib/format';

// ---------- Séances ----------
export async function getActiveWorkout() {
  return db.workouts.where('status').equals('active').first();
}

export async function startWorkout(opts: { programId?: string; name?: string } = {}): Promise<string> {
  const program = opts.programId ? await db.programs.get(opts.programId) : undefined;
  const id = uid();
  const date = todayISO();
  await db.transaction('rw', db.workouts, db.workoutExercises, db.sets, async () => {
    await db.workouts.add({
      id, date, status: 'active', startedAt: Date.now(),
      name: opts.name ?? program?.name ?? 'Séance libre',
      programId: program?.id,
    });
    if (program) {
      for (const [i, exId] of program.exerciseIds.entries()) await addExerciseInternal(id, exId, i, date);
    }
  });
  return id;
}

/** Ajoute un exercice à la séance et pré-remplit les séries avec les charges de la dernière fois. */
async function addExerciseInternal(workoutId: string, exerciseId: string, order: number, date: string, template?: SetEntry[]) {
  const weId = uid();
  await db.workoutExercises.add({ id: weId, workoutId, exerciseId, order });
  const source = template ?? (await lastDoneSets(exerciseId, workoutId));
  const now = Date.now();
  await db.sets.bulkAdd(
    source.map((s, i) => ({
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
      await addExerciseInternal(id, we.exerciseId, i, date, sets);
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
  for (const p of programs) if (p.exerciseIds.includes(id)) await db.programs.update(p.id, { exerciseIds: p.exerciseIds.filter((x) => x !== id) });
}

// ---------- Programmes ----------
export const PROGRAM_COLORS = ['#30D158', '#0A84FF', '#FF9F0A', '#BF5AF2', '#FF375F', '#64D2FF'];

export async function saveProgram(p: Partial<Program> & { name: string; exerciseIds: string[] }) {
  if (p.id) {
    await db.programs.update(p.id, { name: p.name, exerciseIds: p.exerciseIds, color: p.color });
    return p.id;
  }
  const id = uid();
  const n = await db.programs.count();
  await db.programs.add({ id, name: p.name, exerciseIds: p.exerciseIds, color: p.color ?? PROGRAM_COLORS[n % PROGRAM_COLORS.length], createdAt: Date.now() });
  return id;
}

export async function deleteProgram(id: string) {
  await db.programs.delete(id);
}

export type { Difficulty };
