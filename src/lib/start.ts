import { startWorkout, getActiveWorkout } from '../db/actions';

/** Démarre une séance (ou reprend celle en cours) et renvoie son identifiant. */
export async function startOrResume(programId?: string): Promise<string> {
  const active = await getActiveWorkout();
  if (active) {
    if (!programId || active.programId === programId) return active.id;
    if (!confirm(`Une séance « ${active.name} » est en cours. La reprendre ?\n(Annuler pour rester ici)`)) throw new Error('cancel');
    return active.id;
  }
  return startWorkout({ programId });
}
