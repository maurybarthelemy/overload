import { useLiveQuery } from 'dexie-react-hooks';
import { useMemo } from 'react';
import { db } from '../db/database';
import type { Exercise } from '../db/types';

/** Requêtes réactives : l'UI se met à jour automatiquement à chaque écriture en base. */
export const useExercises = (includeArchived = false) =>
  useLiveQuery(async () => {
    const all = await db.exercises.toArray();
    return all.filter((e) => includeArchived || !e.archived).sort((a, b) => a.name.localeCompare(b.name, 'fr'));
  }, [includeArchived]);

export function useExerciseMap() {
  const list = useLiveQuery(() => db.exercises.toArray());
  return useMemo(() => new Map<string, Exercise>((list ?? []).map((e) => [e.id, e])), [list]);
}

export const useAllDoneSets = () => useLiveQuery(() => db.sets.filter((s) => s.done).toArray());
export const useDoneWorkouts = () =>
  useLiveQuery(async () => (await db.workouts.where('status').equals('done').toArray()).sort((a, b) => b.date.localeCompare(a.date) || b.startedAt - a.startedAt));
export const useActiveWorkout = () => useLiveQuery(() => db.workouts.where('status').equals('active').first().then((w) => w ?? null));
export const usePrograms = () => useLiveQuery(async () => (await db.programs.toArray()).sort((a, b) => a.createdAt - b.createdAt));
