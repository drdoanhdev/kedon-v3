/** Parse namsinh (yyyy hoặc dd/mm/yyyy) thành timestamp để so sánh. */
export function parseNgaySinhForSort(val: string | number | undefined | null): number {
  if (val === undefined || val === null) return 0;
  if (typeof val === 'number') {
    return new Date(val, 0, 1).getTime();
  }
  const s = val.trim();
  if (/^\d{4}$/.test(s)) {
    return new Date(parseInt(s, 10), 0, 1).getTime();
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(s)) {
    const [d, m, y] = s.split('/').map((p) => parseInt(p, 10));
    return new Date(y, m - 1, d).getTime();
  }
  const t = Date.parse(s);
  return isNaN(t) ? 0 : t;
}
