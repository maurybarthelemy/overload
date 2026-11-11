import type { MuscleGroup } from '../db/types';

const COLORS: Record<MuscleGroup, string> = {
  pectoraux: '#30D158', dos: '#0A84FF', epaules: '#FF9F0A', biceps: '#BF5AF2', triceps: '#FF375F',
  quadriceps: '#64D2FF', ischios: '#5E5CE6', fessiers: '#FF6482', mollets: '#FFD60A', abdominaux: '#AC8E68',
};
const ABBR: Record<MuscleGroup, string> = {
  pectoraux: 'PEC', dos: 'DOS', epaules: 'ÉPA', biceps: 'BIC', triceps: 'TRI',
  quadriceps: 'QUA', ischios: 'ISC', fessiers: 'FES', mollets: 'MOL', abdominaux: 'ABS',
};
export const muscleColor = (m: MuscleGroup) => COLORS[m] ?? '#888';

export function MuscleBadge({ muscle }: { muscle: MuscleGroup }) {
  const c = muscleColor(muscle);
  return <div className="muscle-ic" style={{ background: c + '22', color: c }}>{ABBR[muscle]}</div>;
}
