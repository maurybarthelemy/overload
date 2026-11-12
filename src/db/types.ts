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

/** Ligne d'un modèle de séance : ce que l'on PRÉVOIT de faire (jamais modifié par les séances réalisées). */
export interface ProgramItem {
  exerciseId: string;
  sets: number;
  reps: number;
  /** Charge de référence en kg (utilisée tant qu'il n'y a pas d'historique) */
  weight: number;
}

/** Jours : 0 = lundi … 6 = dimanche */
export const WEEKDAYS = ['Lundi', 'Mardi', 'Mercredi', 'Jeudi', 'Vendredi', 'Samedi', 'Dimanche'];
export const WEEKDAYS_SHORT = ['L', 'M', 'M', 'J', 'V', 'S', 'D'];
export const todayWeekday = () => (new Date().getDay() + 6) % 7;

/**
 * Modèle de séance permanent. Démarrer une séance en fait une COPIE :
 * modifier le modèle ne touche jamais aux séances passées, et inversement.
 */
export interface Program {
  id: string;
  name: string;
  /** Ordre des exercices (conservé pour compatibilité ; synchronisé avec items) */
  exerciseIds: string[];
  /** Détail prévu : séries / répétitions / charge (absent sur les anciens programmes) */
  items?: ProgramItem[];
  /** Jours de la semaine où la séance est programmée */
  days?: number[];
  /** Groupe(s) musculaire(s) travaillé(s), ex. « Bras / Épaules » */
  focus?: string;
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
  /** Entrée du carnet (poids notés hors séance guidée) : une par jour et par programme */
  quick?: boolean;
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
  /** Objectif copié depuis le modèle au démarrage (figé, non rétroactif) */
  targetSets?: number;
  targetReps?: number;
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
