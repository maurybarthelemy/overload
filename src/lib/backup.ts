/**
 * Sauvegarde, export et restauration.
 * - Export JSON complet (restaurable) et CSV (lisible dans Excel/Numbers).
 * - Instantanés automatiques internes (10 derniers) pour annuler une erreur.
 * - Sur iPhone, le partage (Web Share) permet d'enregistrer le fichier dans iCloud Drive / Fichiers.
 */
import { db, getMeta, setMeta } from '../db/database';
import { todayISO } from './format';

export const BACKUP_VERSION = 1;
const SNAPSHOT_KEEP = 10;

export interface BackupFile {
  app: 'overload';
  version: number;
  exportedAt: string;
  data: {
    exercises: unknown[]; programs: unknown[]; workouts: unknown[]; workoutExercises: unknown[]; sets: unknown[];
  };
}

export async function buildBackup(): Promise<BackupFile> {
  const [exercises, programs, workouts, workoutExercises, sets] = await Promise.all([
    db.exercises.toArray(), db.programs.toArray(), db.workouts.toArray(), db.workoutExercises.toArray(), db.sets.toArray(),
  ]);
  return { app: 'overload', version: BACKUP_VERSION, exportedAt: new Date().toISOString(), data: { exercises, programs, workouts, workoutExercises, sets } };
}

export function validateBackup(obj: unknown): obj is BackupFile {
  const b = obj as BackupFile;
  return !!b && b.app === 'overload' && typeof b.version === 'number' && !!b.data &&
    ['exercises', 'programs', 'workouts', 'workoutExercises', 'sets'].every((k) => Array.isArray((b.data as Record<string, unknown>)[k]));
}

/** Restaure une sauvegarde. mode 'replace' efface tout ; 'merge' ajoute/écrase par identifiant. */
export async function restoreBackup(b: BackupFile, mode: 'replace' | 'merge') {
  await snapshot('avant restauration');
  await db.transaction('rw', [db.exercises, db.programs, db.workouts, db.workoutExercises, db.sets], async () => {
    if (mode === 'replace') {
      await Promise.all([db.exercises.clear(), db.programs.clear(), db.workouts.clear(), db.workoutExercises.clear(), db.sets.clear()]);
    }
    await db.exercises.bulkPut(b.data.exercises as never[]);
    await db.programs.bulkPut(b.data.programs as never[]);
    await db.workouts.bulkPut(b.data.workouts as never[]);
    await db.workoutExercises.bulkPut(b.data.workoutExercises as never[]);
    await db.sets.bulkPut(b.data.sets as never[]);
  });
}

// ---------- Instantanés internes ----------
export async function snapshot(_reason = 'auto') {
  const b = await buildBackup();
  if (!b.data.sets.length && !b.data.workouts.length) return;
  await db.backups.add({ createdAt: Date.now(), data: JSON.stringify(b) });
  const all = await db.backups.orderBy('createdAt').primaryKeys();
  if (all.length > SNAPSHOT_KEEP) await db.backups.bulkDelete(all.slice(0, all.length - SNAPSHOT_KEEP));
}

/** Un instantané par jour maximum au lancement. */
export async function dailySnapshot() {
  const last = await getMeta<string>('lastSnapshotDay', '');
  if (last === todayISO()) return;
  await snapshot('quotidien');
  await setMeta('lastSnapshotDay', todayISO());
}

// ---------- Export ----------
export async function exportJSON() {
  const b = await buildBackup();
  await deliver(new Blob([JSON.stringify(b, null, 1)], { type: 'application/json' }), `overload-sauvegarde-${todayISO()}.json`);
  await setMeta('lastExport', Date.now());
}

const csvCell = (v: unknown) => {
  const s = v === undefined || v === null ? '' : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

export async function exportCSV() {
  const [exercises, workouts, wes, sets] = await Promise.all([db.exercises.toArray(), db.workouts.toArray(), db.workoutExercises.toArray(), db.sets.toArray()]);
  const exMap = new Map(exercises.map((e) => [e.id, e]));
  const wMap = new Map(workouts.map((w) => [w.id, w]));
  const weMap = new Map(wes.map((w) => [w.id, w]));
  const header = ['date', 'seance', 'exercice', 'groupe', 'serie', 'poids_kg', 'repetitions', 'volume_kg', 'difficulte', 'technique_ok', 'commentaire'];
  const rows = sets
    .filter((s) => s.done)
    .sort((a, b) => a.date.localeCompare(b.date) || a.createdAt - b.createdAt)
    .map((s) => {
      const e = exMap.get(s.exerciseId), w = wMap.get(s.workoutId), we = weMap.get(s.workoutExerciseId);
      return [s.date, w?.name, e?.name, e?.muscle, s.order + 1, String(s.weight).replace('.', ','), s.reps,
        String(s.weight * s.reps).replace('.', ','), we?.difficulty ?? '', we?.goodForm === undefined ? '' : we.goodForm ? 'oui' : 'non', we?.comment ?? '']
        .map(csvCell).join(';');
    });
  // BOM UTF-8 + séparateur ';' pour Excel FR
  await deliver(new Blob(['﻿' + [header.join(';'), ...rows].join('\n')], { type: 'text/csv;charset=utf-8' }), `overload-historique-${todayISO()}.csv`);
}

/** Partage natif (iOS : « Enregistrer dans Fichiers » → iCloud Drive) avec repli sur un téléchargement. */
async function deliver(blob: Blob, filename: string) {
  const file = new File([blob], filename, { type: blob.type });
  const nav = navigator as Navigator & { canShare?: (d: ShareData) => boolean };
  if (nav.canShare?.({ files: [file] }) && /iPhone|iPad|Android/i.test(navigator.userAgent)) {
    try {
      await nav.share({ files: [file], title: filename });
      return;
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
    }
  }
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

export async function readBackupFile(file: File): Promise<BackupFile> {
  const text = await file.text();
  const obj = JSON.parse(text);
  if (!validateBackup(obj)) throw new Error("Ce fichier n'est pas une sauvegarde Overload valide.");
  return obj;
}
