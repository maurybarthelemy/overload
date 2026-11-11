export const pad = (n: number) => String(n).padStart(2, '0');
export const toISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
export const todayISO = () => toISO(new Date());
export const parseISO = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};
export const daysBetween = (a: string, b: string) => Math.round((parseISO(b).getTime() - parseISO(a).getTime()) / 86400000);

const fmtLong = new Intl.DateTimeFormat('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
const fmtShort = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short' });
const fmtFull = new Intl.DateTimeFormat('fr-FR', { day: 'numeric', month: 'short', year: 'numeric' });
export const formatDateLong = (s: string) => cap(fmtLong.format(parseISO(s)));
export const formatDateShort = (s: string) => fmtShort.format(parseISO(s));
export const formatDateFull = (s: string) => fmtFull.format(parseISO(s));
export const cap = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

export function relativeDay(s: string) {
  const d = daysBetween(s, todayISO());
  if (d === 0) return "Aujourd'hui";
  if (d === 1) return 'Hier';
  if (d < 7) return `Il y a ${d} jours`;
  if (d < 30) return `Il y a ${Math.round(d / 7)} sem.`;
  return formatDateFull(s);
}

const nf = new Intl.NumberFormat('fr-FR', { maximumFractionDigits: 2 });
export const kg = (n: number) => `${nf.format(n)} kg`;
export const num = (n: number) => nf.format(n);
export const compact = (n: number) =>
  n >= 10000 ? `${nf.format(Math.round(n / 100) / 10)} t` : `${nf.format(Math.round(n))} kg`;

/** Lundi de la semaine (ISO) */
export function weekStart(s: string) {
  const d = parseISO(s);
  const day = (d.getDay() + 6) % 7;
  d.setDate(d.getDate() - day);
  return toISO(d);
}
export function addDays(s: string, n: number) {
  const d = parseISO(s);
  d.setDate(d.getDate() + n);
  return toISO(d);
}
export const durationMin = (a: number, b: number) => Math.max(1, Math.round((b - a) / 60000));
