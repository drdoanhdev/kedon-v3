import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

type CareStatus = 'chua_lien_he' | 'da_goi' | 'hen_goi_lai' | 'da_chot_lich';
type PriorityTier = 'A' | 'B' | 'C';

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

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

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

    const [donKinhRes, overdueHenRes, careRes] = await Promise.all([
      supabase
        .from('DonKinh')
        .select('benhnhanid, ngaykham, giatrong, giagong, benhnhan:BenhNhan(id, ten, dienthoai)')
        .eq('tenant_id', tenantId)
        .order('ngaykham', { ascending: false }),

      supabase
        .from('hen_kham_lai')
        .select('benhnhanid')
        .eq('tenant_id', tenantId)
        .eq('trang_thai', 'cho')
        .lt('ngay_hen', todayStr),

      supabase
        .from('crm_care_status')
        .select('benhnhan_id, status, note, next_call_at, updated_at')
        .eq('tenant_id', tenantId),
    ]);

    const donKinhData = donKinhRes.data || [];
    const overdueData = overdueHenRes.data || [];
    const careData = careRes.data || [];

    const latestByPatient = new Map<string, any>();
    const patientStatsById = new Map<string, { totalValue: number; serviceCount: number }>();

    donKinhData.forEach((dk: any) => {
      const bnId = String(dk.benhnhanid || '');
      if (!bnId) return;

      const orderValue = (dk.giatrong || 0) + (dk.giagong || 0);
      const prev = patientStatsById.get(bnId) || { totalValue: 0, serviceCount: 0 };
      patientStatsById.set(bnId, {
        totalValue: prev.totalValue + orderValue,
        serviceCount: prev.serviceCount + 1,
      });

      if (!latestByPatient.has(bnId)) {
        latestByPatient.set(bnId, dk);
      }
    });

    const overdueByPatient = new Map<string, number>();
    overdueData.forEach((row: any) => {
      const bnId = String(row.benhnhanid || '');
      if (!bnId) return;
      overdueByPatient.set(bnId, (overdueByPatient.get(bnId) || 0) + 1);
    });

    const careByPatient = new Map<number, any>();
    careData.forEach((row: any) => {
      careByPatient.set(row.benhnhan_id, row);
    });

    const thresholdDate = new Date(todayStart);
    thresholdDate.setDate(thresholdDate.getDate() - crmDaysThreshold);
    const thresholdDateStr = thresholdDate.toISOString().split('T')[0];

    const tierRank: Record<string, number> = { A: 1, B: 2, C: 3 };

    let customers = Array.from(latestByPatient.values())
      .filter((dk: any) => dk.ngaykham && dk.ngaykham < thresholdDateStr && dk.benhnhan)
      .filter((dk: any) => !effectiveOnlyHasPhone || !!dk.benhnhan?.dienthoai)
      .map((dk: any) => {
        const bnId = String(dk.benhnhanid || '');
        const patientStats = patientStatsById.get(bnId) || { totalValue: 0, serviceCount: 0 };
        const overdueCount = overdueByPatient.get(bnId) || 0;
        const daysSince = Math.floor((new Date(todayStr).getTime() - new Date(dk.ngaykham).getTime()) / (1000 * 60 * 60 * 24));
        const latestOrderValue = (dk.giatrong || 0) + (dk.giagong || 0);

        const latestValueBonus = crmPrioritizeHighValue ? Math.min(latestOrderValue / crmValuePerPoint, crmValueBonusCap) : 0;
        const lifetimeValueBonus = Math.min(patientStats.totalValue / crmLifetimeValuePerPoint, crmLifetimeValueBonusCap);
        const serviceCountBonus = Math.min(patientStats.serviceCount * crmServiceCountPoint, crmServiceCountBonusCap);
        const overdueBonus = Math.min(overdueCount * crmOverduePoint, crmOverdueBonusCap);

        const score = daysSince + latestValueBonus + lifetimeValueBonus + serviceCountBonus + overdueBonus;
        const tier: PriorityTier = score >= crmPriorityAThreshold ? 'A' : score >= crmPriorityBThreshold ? 'B' : 'C';

        const care = careByPatient.get(dk.benhnhan.id);
        const careStatusVal = (care?.status || 'chua_lien_he') as CareStatus;

        return {
          id: dk.benhnhan.id,
          ten: dk.benhnhan.ten,
          dienthoai: dk.benhnhan.dienthoai,
          ngay_kham_cuoi: dk.ngaykham,
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
      });

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

    return res.status(200).json({
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
    });
  } catch (error: any) {
    return res.status(500).json({ message: 'Lỗi tải dữ liệu CRM', details: error?.message || String(error) });
  }
}
