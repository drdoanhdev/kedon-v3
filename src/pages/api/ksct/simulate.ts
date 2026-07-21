/**
 * KSCT progression simulation — server-side (không lộ bảng/công thức trong browser bundle).
 * POST /api/ksct/simulate
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, setNoCacheHeaders } from '../../../lib/tenantApi';
import { getRateLimitIp, rateLimit } from '../../../lib/rateLimit';
import {
  alPercentile,
  alToPctWeight,
  calcHighMyopiaRisk,
  calcRetinaRiskMultiplier,
  getReduction,
  pctWeightLabel,
  resolveAL0,
  riskMultiplier,
  sexFromUi,
  simulateSeries,
  type TxKey,
  type TxMode,
} from '../../../lib/ksct/simulate';

const TX_KEYS = new Set([
  'atropine_001',
  'atropine_0025',
  'atropine_005',
  'orthok',
  'defocus_spectacles',
]);

function asTxKey(v: unknown, fallback: TxKey): TxKey {
  return typeof v === 'string' && TX_KEYS.has(v) ? (v as TxKey) : fallback;
}

function asTxMode(v: unknown, fallback: TxMode): TxMode {
  return v === 'mono' || v === 'combine' ? v : fallback;
}

function clampNum(v: unknown, min: number, max: number, fallback: number): number {
  const n = typeof v === 'number' ? v : Number(v);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST']);
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  const ip = getRateLimitIp(req);
  const rl = rateLimit(`ksct:${ctx.tenantId}:${ip}`, 60, 60_000);
  if (!rl.allowed) {
    res.setHeader('Retry-After', String(rl.retryAfterSec));
    return res.status(429).json({ error: 'Quá nhiều yêu cầu mô phỏng' });
  }

  const body = req.body || {};
  const sexUi = body.sex === 'girl' ? 'girl' : 'boy';
  const age = clampNum(body.age, 2, 18, 8);
  const ser = clampNum(body.ser, -20, 5, -2.5);
  const cr = clampNum(body.cr, 6, 9, 7.8);
  const parentMyopia = clampNum(body.parentMyopia, 0, 2, 0);
  const outdoor = clampNum(body.outdoor, 0, 12, 1.5);
  const nearwork = clampNum(body.nearwork, 0, 16, 3);
  const accLagHigh = body.accLag === 'high' || body.accLagHigh === true;
  const manualRaw =
    body.alManual === '' || body.alManual == null ? null : Number(body.alManual);
  const manual =
    manualRaw != null && Number.isFinite(manualRaw) && manualRaw > 0 ? manualRaw : null;

  const modeA = asTxMode(body.modeA, 'mono');
  const primaryA = asTxKey(body.primaryA, 'atropine_0025');
  const combineA = asTxKey(body.combineA, 'atropine_001');
  const modeB = asTxMode(body.modeB, 'combine');
  const primaryB = asTxKey(body.primaryB, 'orthok');
  const combineB = asTxKey(body.combineB, 'atropine_001');

  const sexKey = sexFromUi(sexUi);
  const al0 = resolveAL0(age, ser, sexKey, manual);
  const ratio = al0 / cr;
  const pctWeight = alToPctWeight(al0, age, sexKey);
  const riskMult = riskMultiplier({
    accLagHigh,
    parentMyopia,
    cr,
    outdoor,
    nearwork,
  });

  const control = simulateSeries(age, al0, ser, 0, 0, riskMult, sexKey, pctWeight);
  const redA = getReduction(modeA, primaryA, combineA);
  const redB = getReduction(modeB, primaryB, combineB);
  const seriesA = simulateSeries(age, al0, ser, redA.al, redA.se, riskMult, sexKey, pctWeight);
  const seriesB = simulateSeries(age, al0, ser, redB.al, redB.se, riskMult, sexKey, pctWeight);

  const controlSE18 = control[control.length - 1].se;
  const highRisk = calcHighMyopiaRisk(controlSE18);
  const retinaMult = calcRetinaRiskMultiplier(controlSE18);

  const refBands = {
    p10: control.map((p) => +alPercentile(p.age, sexKey, 'p10').toFixed(2)),
    p50: control.map((p) => +alPercentile(p.age, sexKey, 'p50').toFixed(2)),
    p95: control.map((p) => +alPercentile(p.age, sexKey, 'p95').toFixed(2)),
  };

  return res.status(200).json({
    success: true,
    data: {
      al0,
      ratio,
      riskMult,
      pctWeight,
      pctLabel: pctWeightLabel(pctWeight),
      sex: sexKey,
      control,
      redA,
      redB,
      seriesA,
      seriesB,
      highRisk,
      retinaMult,
      refBands,
    },
  });
}
