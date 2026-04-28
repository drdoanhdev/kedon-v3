import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

type CareStatus = 'chua_lien_he' | 'da_goi' | 'hen_goi_lai' | 'da_chot_lich';
type PriorityTier = 'A' | 'B' | 'C';

const RESPONSE_CACHE = new Map<string, { expiresAt: number; payload: any }>();
const CACHE_TTL_MS = 30 * 1000;
const IN_CHUNK_SIZE = 500;

function toNumber(val: unknown, fallback: number): number {
  const n = Number(val);
  return Number.isFinite(n) ? n : fallback;
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(Math.max(n, min), max);
}

function parseBool(val: unknown): boolean | undefined {
  if (typeof val !== 'string') return undefined;
  if (val === '1' || val.toLowerCase() === 'true') return true;
  if (val === '0' || val.toLowerCase() === 'false') return false;
  return undefined;
}

function normalizeQueryVal(val: string | string[] | undefined): string | undefined {
  return Array.isArray(val) ? val[0] : val;
}

function chunkArray<T>(arr: T[], size: number): T[][] {
  if (arr.length === 0) return [];
  const chunks: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    chunks.push(arr.slice(i, i + size));
  }
  return chunks;
}

async function fetchAllRows(table: string, select: string, tenantId: string, branchId?: string | null): Promise<any[]> {
  const PAGE_SIZE = 1000;
  let all: any[] = [];
  let from = 0;
  while (true) {
    let query = supabase
      .from(table)
      .select(select)
      .eq('tenant_id', tenantId);
    if (branchId) query = query.eq('branch_id', branchId);
    const { data, error } = await query.range(from, from + PAGE_SIZE - 1);
    if (error || !data || data.length === 0) break;
    all = all.concat(data);
    if (data.length < PAGE_SIZE) break;
    from += PAGE_SIZE;
  }
  return all;
}

function maybeServeCached(res: NextApiResponse, cacheKey: string): boolean {
  const cached = RESPONSE_CACHE.get(cacheKey);
  if (!cached) return false;
  if (Date.now() > cached.expiresAt) {
    RESPONSE_CACHE.delete(cacheKey);
    return false;
  }
  res.status(200).json(cached.payload);
  return true;
}

function setCached(cacheKey: string, payload: any): void {
  RESPONSE_CACHE.set(cacheKey, {
    expiresAt: Date.now() + CACHE_TTL_MS,
    payload,
  });

  // Keep cache bounded for long-lived warm instances.
  if (RESPONSE_CACHE.size > 200) {
    for (const [k, v] of RESPONSE_CACHE) {
      if (Date.now() > v.expiresAt) RESPONSE_CACHE.delete(k);
    }
  }
}

function toDateMs(val: unknown): number {
  if (!val) return NaN;
  const ms = new Date(String(val)).getTime();
  return Number.isFinite(ms) ? ms : NaN;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'crm', 'manage_crm'))) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ message: `Method ${req.method} Not Allowed` });
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    const todayStr = todayStart.toISOString().split('T')[0];

    const page = clamp(toNumber(normalizeQueryVal(req.query.page), 1), 1, 100000);
    const pageSize = clamp(toNumber(normalizeQueryVal(req.query.pageSize), 20), 5, 100);
    const search = (normalizeQueryVal(req.query.search) || '').trim().toLowerCase();
    const careStatus = normalizeQueryVal(req.query.careStatus) as CareStatus | 'all' | undefined;
    const priority = normalizeQueryVal(req.query.priority) as PriorityTier | 'all' | undefined;
    const sortBy = (normalizeQueryVal(req.query.sortBy) || 'priority') as 'priority' | 'days' | 'latestValue' | 'lifetimeValue' | 'score';
    const sortDir = (normalizeQueryVal(req.query.sortDir) || 'desc') as 'asc' | 'desc';

    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();

    const tenantSettings = (tenantRow as any)?.settings || {};
    const crmCfg = tenantSettings?.dashboard?.crm || {};

    const crmDaysThreshold = clamp(toNumber(crmCfg.daysThreshold, 90), 30, 365);
    const cfgOnlyHasPhone = crmCfg.onlyHasPhone === true;
    const crmPrioritizeHighValue = crmCfg.prioritizeHighValue !== false;
    const crmPriorityAThreshold = clamp(toNumber(crmCfg.priorityAThreshold, 140), 60, 400);
    const crmPriorityBThresholdRaw = clamp(toNumber(crmCfg.priorityBThreshold, 105), 30, 300);
    const crmPriorityBThreshold = Math.min(crmPriorityBThresholdRaw, crmPriorityAThreshold - 1);

    const crmValuePerPoint = clamp(toNumber(crmCfg.valuePerPoint, 200000), 50000, 2000000);
    const crmValueBonusCap = clamp(toNumber(crmCfg.valueBonusCap, 50), 0, 200);
    const crmLifetimeValuePerPoint = clamp(toNumber(crmCfg.lifetimeValuePerPoint, 1500000), 100000, 10000000);
    const crmLifetimeValueBonusCap = clamp(toNumber(crmCfg.lifetimeValueBonusCap, 35), 0, 200);
    const crmServiceCountPoint = clamp(toNumber(crmCfg.serviceCountPoint, 3), 0, 20);
    const crmServiceCountBonusCap = clamp(toNumber(crmCfg.serviceCountBonusCap, 25), 0, 200);
    const crmOverduePoint = clamp(toNumber(crmCfg.overduePoint, 15), 0, 100);
    const crmOverdueBonusCap = clamp(toNumber(crmCfg.overdueBonusCap, 40), 0, 300);

    const onlyHasPhoneQuery = parseBool(normalizeQueryVal(req.query.onlyHasPhone));
    const effectiveOnlyHasPhone = typeof onlyHasPhoneQuery === 'boolean' ? onlyHasPhoneQuery : cfgOnlyHasPhone;

    const cacheKey = JSON.stringify({
      tenantId,
      branchId: branchId || 'all',
      page,
      pageSize,
      search,
      careStatus: careStatus || 'all',
      priority: priority || 'all',
      sortBy,
      sortDir,
      onlyHasPhone: effectiveOnlyHasPhone,
      cfg: {
        crmDaysThreshold,
        crmPrioritizeHighValue,
        crmPriorityAThreshold,
        crmPriorityBThreshold,
        crmValuePerPoint,
        crmValueBonusCap,
        crmLifetimeValuePerPoint,
        crmLifetimeValueBonusCap,
        crmServiceCountPoint,
        crmServiceCountBonusCap,
        crmOverduePoint,
        crmOverdueBonusCap,
      },
    });
    if (maybeServeCached(res, cacheKey)) return;

    const donKinhData: any[] = await fetchAllRows('DonKinh', 'benhnhanid, ngaykham, giatrong, giagong', tenantId, branchId);

    const latestKinhByPatient = new Map<string, { benhnhanid: string; ngay_kham_cuoi: string; ngay_kham_cuoi_ms: number; gia_tri_don_gan_nhat: number }>();
    const patientStatsById = new Map<string, { totalValue: number; serviceCount: number }>();

    donKinhData.forEach((dk: any) => {
      const patientIdNum = Number(dk.benhnhanid);
      if (!Number.isFinite(patientIdNum) || patientIdNum <= 0) return;

      const latestVisitMs = toDateMs(dk.ngaykham);
      if (!Number.isFinite(latestVisitMs)) return;

      const bnId = String(patientIdNum);
      const orderValue = toNumber(dk.giatrong, 0) + toNumber(dk.giagong, 0);
      const prev = patientStatsById.get(bnId) || { totalValue: 0, serviceCount: 0 };
      patientStatsById.set(bnId, {
        totalValue: prev.totalValue + orderValue,
        serviceCount: prev.serviceCount + 1,
      });

      const prevLatest = latestKinhByPatient.get(bnId);
      if (!prevLatest || latestVisitMs > prevLatest.ngay_kham_cuoi_ms) {
        latestKinhByPatient.set(bnId, {
          benhnhanid: bnId,
          ngay_kham_cuoi: dk.ngaykham,
          ngay_kham_cuoi_ms: latestVisitMs,
          gia_tri_don_gan_nhat: orderValue,
        });
      }
    });

    const thresholdDate = new Date(todayStart);
    thresholdDate.setDate(thresholdDate.getDate() - crmDaysThreshold);
    const thresholdDateMs = thresholdDate.getTime();
    const tierRank: Record<string, number> = { A: 1, B: 2, C: 3 };

    const candidateIds = Array.from(latestKinhByPatient.values())
      .filter((s: any) => Number.isFinite(s.ngay_kham_cuoi_ms) && s.ngay_kham_cuoi_ms < thresholdDateMs)
      .map((s: any) => Number(s.benhnhanid))
      .filter((id: number) => Number.isFinite(id));

    if (candidateIds.length === 0) {
      const emptyPayload = {
        items: [],
        pagination: {
          page: 1,
          pageSize,
          total: 0,
          totalPages: 1,
        },
        summary: {
          priority: { A: 0, B: 0, C: 0 },
          careStatus: { chua_lien_he: 0, da_goi: 0, hen_goi_lai: 0, da_chot_lich: 0 },
        },
        filters: {
          search,
          careStatus: careStatus || 'all',
          priority: priority || 'all',
          onlyHasPhone: effectiveOnlyHasPhone,
          sortBy,
          sortDir,
        },
        scoringConfig: {
          daysThreshold: crmDaysThreshold,
          priorityAThreshold: crmPriorityAThreshold,
          priorityBThreshold: crmPriorityBThreshold,
          valuePerPoint: crmValuePerPoint,
          valueBonusCap: crmValueBonusCap,
          lifetimeValuePerPoint: crmLifetimeValuePerPoint,
          lifetimeValueBonusCap: crmLifetimeValueBonusCap,
          serviceCountPoint: crmServiceCountPoint,
          serviceCountBonusCap: crmServiceCountBonusCap,
          overduePoint: crmOverduePoint,
          overdueBonusCap: crmOverdueBonusCap,
        },
      };
      setCached(cacheKey, emptyPayload);
      return res.status(200).json(emptyPayload);
    }

    const idChunks = chunkArray(candidateIds, IN_CHUNK_SIZE);

    const benhNhanQueries = idChunks.map((chunk) => {
      let q = supabase
        .from('BenhNhan')
        .select('id, ten, dienthoai')
        .eq('tenant_id', tenantId)
        .in('id', chunk);
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    });

    const overdueQueries = idChunks.map((chunk) => {
      let q = supabase
        .from('hen_kham_lai')
        .select('benhnhanid')
        .eq('tenant_id', tenantId)
        .eq('trang_thai', 'cho')
        .lt('ngay_hen', todayStr)
        .in('benhnhanid', chunk);
      if (branchId) q = q.eq('branch_id', branchId);
      return q;
    });

    const careQueries = idChunks.map((chunk) =>
      supabase
        .from('crm_care_status')
        .select('benhnhan_id, status, note, next_call_at, updated_at')
        .eq('tenant_id', tenantId)
        .in('benhnhan_id', chunk)
    );

    const [benhNhanResults, overdueResults, careResults] = await Promise.all([
      Promise.all(benhNhanQueries),
      Promise.all(overdueQueries),
      Promise.all(careQueries),
    ]);

    const benhNhanMap = new Map<number, { id: number; ten: string; dienthoai?: string }>();
    benhNhanResults.forEach((r) => {
      (r.data || []).forEach((bn: any) => {
        benhNhanMap.set(Number(bn.id), bn);
      });
    });

    const overdueByPatient = new Map<string, number>();
    overdueResults.forEach((r) => {
      (r.data || []).forEach((row: any) => {
        const bnId = String(row.benhnhanid || '');
        if (!bnId) return;
        overdueByPatient.set(bnId, (overdueByPatient.get(bnId) || 0) + 1);
      });
    });

    const careByPatient = new Map<number, any>();
    careResults.forEach((r) => {
      (r.data || []).forEach((row: any) => {
        careByPatient.set(row.benhnhan_id, row);
      });
    });

    let customers = Array.from(latestKinhByPatient.values())
      .filter((s: any) => Number.isFinite(s.ngay_kham_cuoi_ms) && s.ngay_kham_cuoi_ms < thresholdDateMs)
      .map((s: any) => {
        const patientId = Number(s.benhnhanid);
        const benhnhan = benhNhanMap.get(patientId);
        if (!benhnhan) return null;
        const bnId = String(s.benhnhanid || '');
        const patientStats = patientStatsById.get(bnId) || { totalValue: 0, serviceCount: 0 };
        const overdueCount = overdueByPatient.get(bnId) || 0;
        const daysSince = Math.max(0, Math.floor((new Date(todayStr).getTime() - s.ngay_kham_cuoi_ms) / (1000 * 60 * 60 * 24)));
        const latestOrderValue = Number(s.gia_tri_don_gan_nhat || 0);

        const latestValueBonus = crmPrioritizeHighValue ? Math.min(latestOrderValue / crmValuePerPoint, crmValueBonusCap) : 0;
        const lifetimeValueBonus = Math.min(patientStats.totalValue / crmLifetimeValuePerPoint, crmLifetimeValueBonusCap);
        const serviceCountBonus = Math.min(patientStats.serviceCount * crmServiceCountPoint, crmServiceCountBonusCap);
        const overdueBonus = Math.min(overdueCount * crmOverduePoint, crmOverdueBonusCap);

        const score = daysSince + latestValueBonus + lifetimeValueBonus + serviceCountBonus + overdueBonus;
        const tier: PriorityTier = score >= crmPriorityAThreshold ? 'A' : score >= crmPriorityBThreshold ? 'B' : 'C';

        const care = careByPatient.get(patientId);
        const careStatusVal = (care?.status || 'chua_lien_he') as CareStatus;

        return {
          id: patientId,
          ten: benhnhan.ten,
          dienthoai: benhnhan.dienthoai,
          ngay_kham_cuoi: s.ngay_kham_cuoi,
          so_ngay: daysSince,
          gia_tri_don_gan_nhat: latestOrderValue,
          tong_gia_tri_dich_vu: patientStats.totalValue,
          so_lan_su_dung_dich_vu: patientStats.serviceCount,
          so_hen_qua_han: overdueCount,
          uu_tien: Math.round(score),
          muc_uu_tien: tier,
          care_status: careStatusVal,
          care_note: care?.note || '',
          next_call_at: care?.next_call_at || null,
          care_updated_at: care?.updated_at || null,
        };
      })
      .filter((c: any) => !!c)
      .filter((c: any) => !effectiveOnlyHasPhone || !!c.dienthoai);

    if (search) {
      customers = customers.filter((c: any) =>
        (c.ten || '').toLowerCase().includes(search) ||
        (c.dienthoai || '').toLowerCase().includes(search)
      );
    }

    if (careStatus && careStatus !== 'all') {
      customers = customers.filter((c: any) => c.care_status === careStatus);
    }

    if (priority && priority !== 'all') {
      customers = customers.filter((c: any) => c.muc_uu_tien === priority);
    }

    customers.sort((a: any, b: any) => {
      let cmp = 0;
      if (sortBy === 'priority') {
        const rankA = tierRank[a.muc_uu_tien] || 99;
        const rankB = tierRank[b.muc_uu_tien] || 99;
        cmp = rankA - rankB;
        if (cmp === 0) cmp = (b.so_ngay || 0) - (a.so_ngay || 0);
      } else if (sortBy === 'days') {
        cmp = (a.so_ngay || 0) - (b.so_ngay || 0);
      } else if (sortBy === 'latestValue') {
        cmp = (a.gia_tri_don_gan_nhat || 0) - (b.gia_tri_don_gan_nhat || 0);
      } else if (sortBy === 'lifetimeValue') {
        cmp = (a.tong_gia_tri_dich_vu || 0) - (b.tong_gia_tri_dich_vu || 0);
      } else if (sortBy === 'score') {
        cmp = (a.uu_tien || 0) - (b.uu_tien || 0);
      }
      if (cmp === 0) cmp = (a.ten || '').localeCompare(b.ten || '');
      return sortDir === 'desc' ? -cmp : cmp;
    });

    const total = customers.length;
    const totalPages = Math.max(Math.ceil(total / pageSize), 1);
    const safePage = Math.min(page, totalPages);
    const start = (safePage - 1) * pageSize;
    const items = customers.slice(start, start + pageSize);

    const summary = customers.reduce((acc: any, c: any) => {
      acc.priority[c.muc_uu_tien] = (acc.priority[c.muc_uu_tien] || 0) + 1;
      acc.careStatus[c.care_status] = (acc.careStatus[c.care_status] || 0) + 1;
      return acc;
    }, {
      priority: { A: 0, B: 0, C: 0 },
      careStatus: { chua_lien_he: 0, da_goi: 0, hen_goi_lai: 0, da_chot_lich: 0 },
    });

    const responsePayload = {
      items,
      pagination: {
        page: safePage,
        pageSize,
        total,
        totalPages,
      },
      summary,
      filters: {
        search,
        careStatus: careStatus || 'all',
        priority: priority || 'all',
        onlyHasPhone: effectiveOnlyHasPhone,
        sortBy,
        sortDir,
      },
      scoringConfig: {
        daysThreshold: crmDaysThreshold,
        priorityAThreshold: crmPriorityAThreshold,
        priorityBThreshold: crmPriorityBThreshold,
        valuePerPoint: crmValuePerPoint,
        valueBonusCap: crmValueBonusCap,
        lifetimeValuePerPoint: crmLifetimeValuePerPoint,
        lifetimeValueBonusCap: crmLifetimeValueBonusCap,
        serviceCountPoint: crmServiceCountPoint,
        serviceCountBonusCap: crmServiceCountBonusCap,
        overduePoint: crmOverduePoint,
        overdueBonusCap: crmOverdueBonusCap,
      },
    };

    setCached(cacheKey, responsePayload);
    return res.status(200).json(responsePayload);
  } catch (error: any) {
    return res.status(500).json({ message: 'Lỗi tải dữ liệu CRM', details: error?.message || String(error) });
  }
}
