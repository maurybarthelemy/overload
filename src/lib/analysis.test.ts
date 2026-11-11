import { describe, expect, it } from 'vitest';
import { compareSessions, recommend, sessionsFromSets, computeRecords } from './analysis';
import type { SetEntry } from '../db/types';

let n = 0;
const mk = (date: string, weId: string, sets: [number, number][]): SetEntry[] =>
  sets.map(([weight, reps], i) => ({ id: String(n++), workoutExerciseId: weId, workoutId: 'w' + weId, exerciseId: 'bench', order: i, weight, reps, done: true, date, createdAt: n }));

const ex = { repMin: 10, repMax: 12, increment: 2.5 };

describe('double progression (exemple développé couché)', () => {
  const s1 = mk('2026-01-05', 'a', [[40, 10], [40, 10], [40, 10]]);
  const s2 = mk('2026-01-12', 'b', [[40, 11], [40, 11], [40, 11]]);
  const s3 = mk('2026-01-19', 'c', [[40, 12], [40, 12], [40, 12]]);
  const s4 = mk('2026-01-26', 'd', [[42.5, 10], [42.5, 10], [42.5, 10]]);

  it('suggère +1 répétition sous le haut de fourchette', () => {
    const r = recommend(ex, sessionsFromSets([...s1]));
    expect(r.kind).toBe('reps');
    expect(r.target).toEqual({ weight: 40, reps: 11 });
  });
  it('suggère +2,5 kg quand toutes les séries atteignent 12', () => {
    const r = recommend(ex, sessionsFromSets([...s1, ...s2, ...s3]), { difficulty: 2, goodForm: true });
    expect(r.kind).toBe('increase');
    expect(r.target).toEqual({ weight: 42.5, reps: 10 });
  });
  it("n'impose pas d'augmentation si le ressenti est très dur", () => {
    const r = recommend(ex, sessionsFromSets([...s1, ...s2, ...s3]), { difficulty: 4 });
    expect(r.kind).toBe('hold');
  });
  it('reconnaît la semaine 4 comme une progression', () => {
    const ss = sessionsFromSets([...s1, ...s2, ...s3, ...s4]);
    const c = compareSessions(ss[3], ss[2]);
    expect(c.weightDelta).toBe(2.5);
    expect(c.trend).toBe('up');
    expect(computeRecords(ss).maxWeight?.weight).toBe(42.5);
  });
});
