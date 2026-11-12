import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from './database';
import { ensureWeeklyPlan, finishWorkout, saveProgram, startWorkout, updateSet } from './actions';

const setsOf = async (workoutId: string) => (await db.sets.where('workoutId').equals(workoutId).toArray()).sort((a, b) => a.createdAt - b.createdAt);

describe('modèles permanents et historique', () => {
  beforeEach(async () => { await db.delete(); await db.open(); });

  it('démarre un ancien programme sans détail (compatibilité)', async () => {
    await db.programs.add({ id: 'old', name: 'Push', exerciseIds: ['ex-developpe-couche', 'ex-curl-barre'], color: '#fff', createdAt: 1 });
    const w = await startWorkout({ programId: 'old' });
    expect(await db.workoutExercises.where('workoutId').equals(w).count()).toBe(2);
    expect(await db.sets.where('workoutId').equals(w).count()).toBe(6);
  });

  it('crée la semaine type demandée', async () => {
    await ensureWeeklyPlan();
    await ensureWeeklyPlan(); // idempotent
    const ps = await db.programs.toArray();
    const day = (d: number) => ps.filter((p) => p.days?.includes(d)).map((p) => p.name);
    expect(ps).toHaveLength(4);
    expect(day(0)).toEqual(['Pectoraux']);
    expect(day(1)).toEqual(['Bras / Épaules']);
    expect(day(2)).toEqual([]);
    expect(day(3)).toEqual([]);
    expect(day(4)).toEqual(['Dos']);
    expect(day(5)).toEqual(['Bras / Épaules']);
    expect(day(6)).toEqual(['Jambes']);
  });

  it('réutilise le modèle chaque semaine avec les dernières performances, sans réécrire le passé', async () => {
    const pid = await saveProgram({ name: 'Pectoraux', days: [0], items: [{ exerciseId: 'ex-developpe-couche', sets: 3, reps: 10, weight: 50 }] });

    // Semaine 1 : séance pré-remplie depuis le modèle
    const w1 = await startWorkout({ programId: pid });
    let s1 = await setsOf(w1);
    expect(s1.map((s) => [s.weight, s.reps])).toEqual([[50, 10], [50, 10], [50, 10]]);
    for (const s of s1) await updateSet(s.id, { done: true });
    await finishWorkout(w1);

    // Semaine 2 : même séance, dernières perfs affichées ; on modifie la charge
    const w2 = await startWorkout({ programId: pid });
    const s2 = await setsOf(w2);
    expect(s2).toHaveLength(3);
    expect(s2.map((s) => s.weight)).toEqual([50, 50, 50]);
    for (const s of s2) await updateSet(s.id, { weight: 52.5, reps: 8, done: true });
    await finishWorkout(w2);

    // Le modèle n'a pas bougé, la semaine 1 non plus
    const p = await db.programs.get(pid);
    expect(p!.items![0]).toMatchObject({ sets: 3, reps: 10, weight: 50 });
    s1 = await setsOf(w1);
    expect(s1.every((s) => s.weight === 50 && s.reps === 10 && s.done)).toBe(true);

    // Modifier le modèle n'affecte pas les séances passées
    await saveProgram({ id: pid, name: 'Pectoraux', days: [0], items: [{ exerciseId: 'ex-developpe-couche', sets: 4, reps: 12, weight: 40 }] });
    expect((await setsOf(w2)).map((s) => s.weight)).toEqual([52.5, 52.5, 52.5]);
    const we2 = await db.workoutExercises.where('workoutId').equals(w2).first();
    expect(we2).toMatchObject({ targetSets: 3, targetReps: 10 });

    // Semaine 3 : 4 séries (nouveau modèle), pré-remplies avec la dernière perf réelle
    const w3 = await startWorkout({ programId: pid });
    expect((await setsOf(w3)).map((s) => [s.weight, s.reps])).toEqual([[52.5, 8], [52.5, 8], [52.5, 8], [52.5, 8]]);
  });
});
