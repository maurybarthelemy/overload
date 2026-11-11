import Dexie, { type Table } from 'dexie';
import type { Backup, Exercise, Meta, Program, SetEntry, Workout, WorkoutExercise } from './types';
import { SEED_EXERCISES } from './seed';

export class OverloadDB extends Dexie {
  exercises!: Table<Exercise, string>;
  programs!: Table<Program, string>;
  workouts!: Table<Workout, string>;
  workoutExercises!: Table<WorkoutExercise, string>;
  sets!: Table<SetEntry, string>;
  backups!: Table<Backup, number>;
  meta!: Table<Meta, string>;

  constructor() {
    super('overload');
    // Pour faire évoluer le schéma : ajouter this.version(2).stores({...}).upgrade(...)
    this.version(1).stores({
      exercises: 'id, name, muscle, custom',
      programs: 'id, name',
      workouts: 'id, date, status, programId',
      workoutExercises: 'id, workoutId, exerciseId',
      sets: 'id, workoutExerciseId, workoutId, exerciseId, date',
      backups: '++id, createdAt',
      meta: 'key',
    });
    this.on('populate', (tx) => {
      const now = Date.now();
      tx.table('exercises').bulkAdd(SEED_EXERCISES.map((e, i) => ({ ...e, createdAt: now + i })));
    });
  }
}

export const db = new OverloadDB();

export const uid = () =>
  (crypto as Crypto & { randomUUID?: () => string }).randomUUID?.() ??
  Date.now().toString(36) + Math.random().toString(36).slice(2, 10);

export async function getMeta<T>(key: string, fallback: T): Promise<T> {
  const m = await db.meta.get(key);
  return (m?.value as T) ?? fallback;
}
export async function setMeta(key: string, value: unknown) {
  await db.meta.put({ key, value });
}

/** Demande au navigateur de ne jamais purger les données (important sur iOS). */
export async function requestPersistence(): Promise<boolean> {
  try {
    if (navigator.storage?.persisted && (await navigator.storage.persisted())) return true;
    if (navigator.storage?.persist) return await navigator.storage.persist();
  } catch { /* ignore */ }
  return false;
}
