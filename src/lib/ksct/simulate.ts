/** Myopia-control (KSCT) progression simulation — ported from tien-luong-phac-do-ksct (3).html
 *
 * AL percentiles: Sanz Diez et al. 2022, Sci Rep 12:4850 (CC-BY), Chinese schoolchildren Wuhan n=14,760.
 * Progression rate tracks the child's own AL percentile (higher percentile → faster elongation).
 * D/mm ≈ 2.3. Risk factors are relative to default sliders (outdoor 1.5h, nearwork 3h → ×1.0).
 */

export const D_PER_MM = 2.3;

export type SexKey = 'female' | 'male';
export type PctKey = 'p10' | 'p50' | 'p95';

export type TxKey =
  | 'atropine_001'
  | 'atropine_0025'
  | 'atropine_005'
  | 'orthok'
  | 'defocus_spectacles';

export type TxMode = 'mono' | 'combine';

const AL_PERCENTILES: Record<
  SexKey,
  Record<number, Record<PctKey, number>>
> = {
  female: {
    6: { p10: 21.47, p50: 22.52, p95: 23.86 },
    9: { p10: 22.56, p50: 23.75, p95: 25.29 },
    12: { p10: 22.98, p50: 24.23, p95: 25.84 },
    15: { p10: 23.21, p50: 24.49, p95: 26.14 },
  },
  male: {
    6: { p10: 21.91, p50: 22.98, p95: 24.35 },
    9: { p10: 23.04, p50: 24.25, p95: 25.81 },
    12: { p10: 23.51, p50: 24.79, p95: 26.42 },
    15: { p10: 23.76, p50: 25.07, p95: 26.74 },
  },
};

const AL_AGES = [6, 9, 12, 15] as const;

export function sexFromUi(sex: 'boy' | 'girl'): SexKey {
  return sex === 'girl' ? 'female' : 'male';
}

/** Interpolated AL percentile (mm) at a given age for sex. */
export function alPercentile(age: number, sex: SexKey, pct: PctKey): number {
  const tbl = AL_PERCENTILES[sex];
  if (age <= 6) {
    const r = (tbl[9][pct] - tbl[6][pct]) / 3;
    return tbl[6][pct] - r * (6 - age);
  }
  if (age >= 15) {
    const r = (tbl[15][pct] - tbl[12][pct]) / 3;
    return tbl[15][pct] + r * 0.4 * (age - 15);
  }
  for (let i = 0; i < AL_AGES.length - 1; i++) {
    const a1 = AL_AGES[i];
    const a2 = AL_AGES[i + 1];
    if (age >= a1 && age <= a2) {
      const t = (age - a1) / (a2 - a1);
      return tbl[a1][pct] + t * (tbl[a2][pct] - tbl[a1][pct]);
    }
  }
  return tbl[15][pct];
}

/** Untreated annual AL elongation (mm/yr) at a given percentile band. */
export function rateAtBand(age: number, sex: SexKey, pct: PctKey): number {
  const h = 0.05;
  const a1 = alPercentile(Math.max(2, age - h), sex, pct);
  const a2 = alPercentile(Math.min(18, age + h), sex, pct);
  return Math.max(0.005, (a2 - a1) / (2 * h));
}

/**
 * Scales progression vs P50 by the child's own AL percentile weight.
 * ~P83 → ~1.4× median rate (calibration for early-onset / accelerated cases).
 */
export function severityMultiplier(pctWeight: number): number {
  const k = 1.07;
  const m = 1 + k * (pctWeight - 0.5);
  return Math.max(0.35, Math.min(2.6, m));
}

/** pctWeight: 0=P10, 0.5=P50, 1=P95 (may extrapolate beyond). */
export function baseALRate(age: number, sex: SexKey, pctWeight = 0.5): number {
  return rateAtBand(age, sex, 'p50') * severityMultiplier(pctWeight);
}

/** Map patient AL onto P10–P50–P95 scale (0=P10, 0.5=P50, 1=P95). */
export function alToPctWeight(al: number, age: number, sex: SexKey): number {
  const p10 = alPercentile(age, sex, 'p10');
  const p50 = alPercentile(age, sex, 'p50');
  const p95 = alPercentile(age, sex, 'p95');
  if (al <= p50) return (0.5 * (al - p10)) / (p50 - p10);
  return 0.5 + (0.5 * (al - p50)) / (p95 - p50);
}

/** Display label e.g. P50, P83 from pctWeight. */
export function pctWeightLabel(pctWeight: number): string {
  return `P${Math.round(Math.min(99, Math.max(1, 10 + pctWeight * 85)))}`;
}

export const TX: Record<TxKey, { label: string; se: number; al: number }> = {
  atropine_001: { label: 'Atropine 0.01%', se: 0.25, al: 0.15 },
  atropine_0025: { label: 'Atropine 0.025%', se: 0.4, al: 0.3 },
  atropine_005: { label: 'Atropine 0.05%', se: 0.65, al: 0.5 },
  orthok: { label: 'Ortho-K', se: 0.5, al: 0.4 },
  // Lam et al. 2020, 2-yr RCT, Br J Ophthalmol
  defocus_spectacles: { label: 'Kính gọng KSCT (DIMS/HAL)', se: 0.52, al: 0.62 },
};

const COMBO_OVERRIDE: Record<string, { se: number; al: number }> = {
  'atropine_001+orthok': { se: 0.64, al: 0.6 },
};

function comboKey(a: string, b: string): string {
  return [a, b].sort().join('+');
}

export function getReduction(
  mode: TxMode,
  primary: TxKey,
  combine: TxKey
): { se: number; al: number; label: string } {
  if (mode === 'mono' || !combine) {
    return { se: TX[primary].se, al: TX[primary].al, label: TX[primary].label };
  }
  const key = comboKey(primary, combine);
  if (COMBO_OVERRIDE[key]) {
    return {
      se: COMBO_OVERRIDE[key].se,
      al: COMBO_OVERRIDE[key].al,
      label: `${TX[primary].label} + ${TX[combine].label}`,
    };
  }
  const p = TX[primary];
  const c = TX[combine];
  return {
    se: 1 - (1 - p.se) * (1 - c.se),
    al: 1 - (1 - p.al) * (1 - c.al),
    label: `${p.label} + ${c.label}`,
  };
}

/**
 * Risk-factor multiplier. Defaults (outdoor=1.5, nearwork=3, normal lag, 0 parents, Cr=7.8)
 * yield exactly 1.0 — only deviations move the multiplier.
 */
export function riskMultiplier(params: {
  accLagHigh: boolean;
  parentMyopia: number;
  cr: number;
  outdoor: number;
  nearwork: number;
}): number {
  let m = 1.0;
  if (params.accLagHigh) m *= 1.15;
  const parentMult = [1.0, 1.15, 1.35][params.parentMyopia || 0] ?? 1.0;
  m *= parentMult;
  const cr = params.cr || 7.8;
  if (cr < 7.6) m *= 1.08;
  else if (cr > 8.2) m *= 0.96;
  const outdoor = Number.isNaN(params.outdoor) ? 1.5 : params.outdoor;
  m *= Math.max(0.75, Math.min(1.15, 1 - (outdoor - 1.5) * 0.1));
  const nearwork = Number.isNaN(params.nearwork) ? 3 : params.nearwork;
  m *= Math.max(0.85, Math.min(1.2, 1 + (nearwork - 3) * 0.04));
  return Math.max(0.5, Math.min(1.8, m));
}

export type SimPoint = { age: number; al: number; se: number };

export function simulateSeries(
  age0: number,
  al0: number,
  se0: number,
  redAL: number,
  redSE: number,
  riskMult: number,
  sex: SexKey,
  pctWeight: number
): SimPoint[] {
  const pts: SimPoint[] = [{ age: age0, al: al0, se: se0 }];
  let age = age0;
  let al = al0;
  let se = se0;
  const step = 0.5;
  while (age < 18 - 1e-6) {
    const base = baseALRate(age, sex, pctWeight) * riskMult;
    const rAL = base * (1 - redAL);
    const rSE = base * D_PER_MM * (1 - redSE);
    al += rAL * step;
    se -= rSE * step;
    age = Math.min(18, +(age + step).toFixed(2));
    pts.push({ age, al: +al.toFixed(3), se: +se.toFixed(3) });
  }
  return pts;
}

/**
 * AL0: manual, or P50 minus SER/D_PER_MM
 * (SER=0 sits on P50; no POP_MEAN_SE offset — avoids biasing younger children).
 */
export function resolveAL0(
  age0: number,
  ser0: number,
  sex: SexKey,
  manualAL?: number | null
): number {
  if (manualAL != null && !Number.isNaN(manualAL) && manualAL > 0) {
    return +manualAL.toFixed(2);
  }
  return +(alPercentile(age0, sex, 'p50') - ser0 / D_PER_MM).toFixed(2);
}

/** High-myopia risk from adjusted control trajectory (risk factors already in SE18). */
export function calcHighMyopiaRisk(controlSE18: number): {
  pct: number;
  label: string;
  color: string;
} {
  const pct = Math.round(Math.max(0, Math.min(96, (Math.abs(controlSE18) - 2) * 7)));
  const label = pct < 25 ? 'Thấp' : pct < 55 ? 'Trung bình' : 'Cao';
  const color = pct < 25 ? '#10b981' : pct < 55 ? '#f59e0b' : '#ef4444';
  return { pct, label, color };
}

/**
 * Retinal detachment relative risk from final SE — Ogawa & Tanaka ORs
 * (as summarized in Review of Myopia Management): 3.1 (<-3D), 9.0 (-3..-6D), 21.5 (>-9D).
 */
export function calcRetinaRiskMultiplier(controlSE18: number): number {
  const seAbs = Math.abs(controlSE18);
  if (seAbs < 3) return 3.1;
  if (seAbs < 6) return 9.0;
  if (seAbs < 9) return 9.0 + ((seAbs - 6) / 3) * (21.5 - 9.0);
  return 21.5;
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
