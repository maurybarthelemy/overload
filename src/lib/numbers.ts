/** Accepte « 42,5 » comme « 42.5 » (clavier iOS français). */
export const parseNum = (s: string) => {
  const n = parseFloat(String(s).replace(',', '.').replace(/[^\d.-]/g, ''));
  return Number.isFinite(n) ? n : 0;
};
export const showNum = (n: number) => (Number.isFinite(n) ? String(Math.round(n * 100) / 100).replace('.', ',') : '');
