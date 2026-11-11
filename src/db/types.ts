export type MuscleGroup =
  | 'pectoraux' | 'dos' | 'epaules' | 'biceps' | 'triceps'
  | 'quadriceps' | 'ischios' | 'fessiers' | 'mollets' | 'abdominaux';

export const MUSCLES: { id: MuscleGroup; label: string }[] = [
  { id: 'pectoraux', label: 'Pectoraux' },
  { id: 'dos', label: 'Dos' },
  { id: 'epaules', label: 'Épaules' },
  { id: 'biceps', label: 'Biceps' },
  { id: 'triceps', label: 'Triceps' },
  { id: 'quadriceps', label: 'Quadriceps' },
  { id: 'ischios', label: 'Ischio-jambiers' },
  { id: 'fessiers', label: 'Fessiers' },
  { id: 'mollets', label: 'Mollets' },
  { id: 'abdominaux', label: 'Abdominaux' },
];
export const muscleLabel = (m: MuscleGroup) => MUSCLES.find((x) => x.id === m)?.label ?? m;
export const LOWER_BODY: MuscleGroup[] = ['quadriceps', 'ischios', 'fessiers', 'mollets'];

export interface Exercise {
  id: string;
  name: string;
  muscle: MuscleGroup;
  custom: boolean;
  /** Fourchette de répétitions visée (double progression) */
  repMin: number;
  repMax: number;
  /** Incrément de charge suggéré en kg */
  increment: number;
  favorite?: boolean;
  archived?: boolean;
  createdAt: number;
}

export interface Program {
  id: string;
  name: string;
  exerciseIds: string[];
  color: string;
  createdAt: number;
}

export interface Workout {
  id: string;
  name: string;
  /** Date de la séance, format YYYY-MM-DD */
  date: string;
  programId?: string;
  status: 'active' | 'done';
  notes?: string;
  startedAt: number;
  finishedAt?: number;
}

/** 1 = facile … 5 = échec */
export type Difficulty = 1 | 2 | 3 | 4 | 5;
export const DIFFICULTIES: { v: Difficulty; label: string }[] = [
  { v: 1, label: 'Facile' },
  { v: 2, label: 'Modéré' },
  { v: 3, label: 'Difficile' },
  { v: 4, label: 'Très dur' },
  { v: 5, label: 'Échec' },
];

/** Un exercice au sein d'une séance */
export interface WorkoutExercise {
  id: string;
  workoutId: string;
  exerciseId: string;
  order: number;
  difficulty?: Difficulty;
  /** Technique jugée propre par l'utilisateur */
  goodForm?: boolean;
  comment?: string;
}

export interface SetEntry {
  id: string;
  workoutExerciseId: string;
  workoutId: string;
  exerciseId: string;
  order: number;
  weight: number;
  reps: number;
  done: boolean;
  /** Date dénormalisée de la séance (YYYY-MM-DD) pour les analyses */
  date: string;
  createdAt: number;
}

export interface Backup {
  id?: number;
  createdAt: number;
  data: string;
}

export interface Meta {
  key: string;
  value: unknown;
}
