/**
 * KSCT UI helpers — an toàn cho client bundle (không chứa bảng AL / công thức tiến triển).
 */
export type TxKey =
  | 'atropine_001'
  | 'atropine_0025'
  | 'atropine_005'
  | 'orthok'
  | 'defocus_spectacles';

export type TxMode = 'mono' | 'combine';

export type SimPoint = { age: number; al: number; se: number };

export interface KsctSimResult {
  al0: number;
  ratio: number;
  riskMult: number;
  pctWeight: number;
  pctLabel: string;
  sex: 'female' | 'male';
  control: SimPoint[];
  redA: { al: number; se: number; label: string };
  redB: { al: number; se: number; label: string };
  seriesA: SimPoint[];
  seriesB: SimPoint[];
  highRisk: { pct: number; label: string; color: string };
  retinaMult: number;
  refBands: { p10: number[]; p50: number[]; p95: number[] };
}

/** Parse SPH/CYL from sokinh string → spherical equivalent (SER = SPH + CYL/2). */
export function serFromSoKinh(sokinh: string | null | undefined): number | null {
  if (!sokinh || !sokinh.trim()) return null;
  const s = sokinh.trim();
  const addMatch = s.match(/\s+ADD\s+([+-]?\d+(?:\.\d{1,2})?)\s*$/i);
  const base = addMatch ? s.slice(0, addMatch.index).trim() : s;

  const fullMatch = base.match(
    /^(Plano|[+-]?\d+(?:\.\d{1,2})?)\s*\/\s*([-+]?\d+(?:\.\d{1,2})?)\s*x\s*(\d{1,3})$/i
  );
  if (fullMatch) {
    const sph = fullMatch[1].toLowerCase() === 'plano' ? 0 : parseFloat(fullMatch[1]);
    const cyl = parseFloat(fullMatch[2]);
    if (Number.isNaN(sph) || Number.isNaN(cyl)) return null;
    return +(sph + cyl / 2).toFixed(2);
  }

  const sphOnly = base.match(/^[+-]?\d+(?:\.\d{1,2})?$/);
  if (sphOnly) {
    const sph = parseFloat(base);
    if (Number.isNaN(sph)) return null;
    return +sph.toFixed(2);
  }

  if (/^plano$/i.test(base)) return 0;

  return null;
}

/** Prefer the more myopic (more negative) SER between MP and MT. */
export function worseSerFromDon(mp?: string | null, mt?: string | null): number | null {
  const serMp = serFromSoKinh(mp);
  const serMt = serFromSoKinh(mt);
  if (serMp == null && serMt == null) return null;
  if (serMp == null) return serMt;
  if (serMt == null) return serMp;
  return Math.min(serMp, serMt);
}

export const TX_PRIMARY_OPTIONS: { value: TxKey; label: string }[] = [
  { value: 'atropine_001', label: 'Atropine nồng độ thấp 0.01%' },
  { value: 'atropine_0025', label: 'Atropine nồng độ thấp 0.025%' },
  { value: 'atropine_005', label: 'Atropine nồng độ thấp 0.05%' },
  { value: 'orthok', label: 'Kính áp tròng đêm Ortho-K' },
  { value: 'defocus_spectacles', label: 'Kính gọng kiểm soát cận thị (DIMS/HAL)' },
];

export const TX_COMBINE_OPTIONS: { value: TxKey; label: string }[] = [
  { value: 'atropine_001', label: 'Atropine nồng độ thấp 0.01%' },
  { value: 'atropine_0025', label: 'Atropine nồng độ thấp 0.025%' },
  { value: 'atropine_005', label: 'Atropine nồng độ thấp 0.05%' },
  { value: 'defocus_spectacles', label: 'Kính gọng kiểm soát cận thị (DIMS/HAL)' },
];
