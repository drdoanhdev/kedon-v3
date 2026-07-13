/**
 * API Admin: Thống kê lâm sàng theo từng phòng khám
 * GET ?from=&to= — số BN, đơn thuốc/kính, doanh thu, lãi + phân bổ theo tháng
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import { requireSuperAdmin } from '../../../lib/adminGuard';
import { supabaseAdmin } from '../../../lib/tenantApi';

type ClinicMetrics = {
  so_benh_nhan: number;
  so_don_thuoc: number;
  so_don_kinh: number;
  doanh_thu: number;
  lai: number;
};

type EmptyMetrics = ClinicMetrics;

function emptyMetrics(): EmptyMetrics {
  return {
    so_benh_nhan: 0,
    so_don_thuoc: 0,
    so_don_kinh: 0,
    doanh_thu: 0,
    lai: 0,
  };
}

function toMonthKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  const day = String(raw).split('T')[0];
  if (!/^\d{4}-\d{2}-\d{2}/.test(day)) return null;
  return day.slice(0, 7); // YYYY-MM
}

function inDateRange(
  raw: string | null | undefined,
  from: string | null,
  toExclusive: string | null
): boolean {
  if (!from && !toExclusive) return true;
  if (!raw) return false;
  const day = String(raw).split('T')[0];
  if (from && day < from) return false;
  if (toExclusive && day >= toExclusive) return false;
  return true;
}

/** Paginate past PostgREST 1000-row default */
async function getAllRecords<T>(
  buildQuery: () => { range: (from: number, to: number) => PromiseLike<{ data: T[] | null; error: { message: string } | null }> },
  tableName: string
): Promise<T[]> {
  const batchSize = 1000;
  const maxRecords = 50000;
  const allData: T[] = [];
  let start = 0;
  let hasMore = true;

  while (hasMore && allData.length < maxRecords) {
    const { data, error } = await buildQuery().range(start, start + batchSize - 1);
    if (error) {
      throw new Error(`Lỗi truy vấn ${tableName}: ${error.message}`);
    }
    if (data && data.length > 0) {
      allData.push(...data);
    }
    hasMore = !!(data && data.length === batchSize);
    start += batchSize;
  }

  return allData;
}

function addExclusiveDay(isoDate: string): string {
  const d = new Date(`${isoDate}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const admin = await requireSuperAdmin(req, res);
  if (!admin) return;

  if (req.method !== 'GET') {
    return res.status(405).json({ message: 'Method not allowed' });
  }

  try {
    const fromRaw = typeof req.query.from === 'string' ? req.query.from.trim() : '';
    const toRaw = typeof req.query.to === 'string' ? req.query.to.trim() : '';
    const from = /^\d{4}-\d{2}-\d{2}$/.test(fromRaw) ? fromRaw : null;
    const to = /^\d{4}-\d{2}-\d{2}$/.test(toRaw) ? toRaw : null;
    const toExclusive = to ? addExclusiveDay(to) : null;

    const { data: tenants, error: tenantsErr } = await supabaseAdmin
      .from('tenants')
      .select('id, name, code, status')
      .order('name');

    if (tenantsErr) {
      return res.status(500).json({ message: 'Lỗi tải phòng khám', error: tenantsErr.message });
    }

    const tenantList = tenants || [];
    const clinicMap = new Map<string, ClinicMetrics>();
    /** monthly per tenant: tenantId → month → metrics */
    const monthlyByTenant = new Map<string, Map<string, ClinicMetrics>>();

    for (const t of tenantList) {
      clinicMap.set(t.id, emptyMetrics());
      monthlyByTenant.set(t.id, new Map());
    }

    const applyPatch = (m: ClinicMetrics, patch: Partial<ClinicMetrics>) => {
      if (patch.so_benh_nhan) m.so_benh_nhan += patch.so_benh_nhan;
      if (patch.so_don_thuoc) m.so_don_thuoc += patch.so_don_thuoc;
      if (patch.so_don_kinh) m.so_don_kinh += patch.so_don_kinh;
      if (patch.doanh_thu) m.doanh_thu += patch.doanh_thu;
      if (patch.lai) m.lai += patch.lai;
    };

    const bumpClinic = (tenantId: string | null | undefined, patch: Partial<ClinicMetrics>) => {
      if (!tenantId || !clinicMap.has(tenantId)) return;
      applyPatch(clinicMap.get(tenantId)!, patch);
    };

    const bumpMonth = (
      tenantId: string | null | undefined,
      month: string | null,
      patch: Partial<ClinicMetrics>
    ) => {
      if (!tenantId || !month || !monthlyByTenant.has(tenantId)) return;
      const monthMap = monthlyByTenant.get(tenantId)!;
      if (!monthMap.has(month)) monthMap.set(month, emptyMetrics());
      applyPatch(monthMap.get(month)!, patch);
    };

    type BnRow = { tenant_id: string | null; created_at: string | null };
    type DtRow = { tenant_id: string | null; ngay_kham: string | null; tongtien: number | null; lai: number | null };
    type DkRow = {
      tenant_id: string | null;
      ngaykham: string | null;
      giatrong: number | null;
      giagong: number | null;
      lai: number | null;
    };

    const buildBn = () => {
      let q = supabaseAdmin.from('BenhNhan').select('tenant_id, created_at');
      if (from) q = q.gte('created_at', from);
      if (toExclusive) q = q.lt('created_at', toExclusive);
      return q;
    };
    const buildDt = () => {
      let q = supabaseAdmin.from('DonThuoc').select('tenant_id, ngay_kham, tongtien, lai');
      if (from) q = q.gte('ngay_kham', from);
      if (toExclusive) q = q.lt('ngay_kham', toExclusive);
      return q;
    };
    const buildDk = () => {
      let q = supabaseAdmin.from('DonKinh').select('tenant_id, ngaykham, giatrong, giagong, lai');
      if (from) q = q.gte('ngaykham', from);
      if (toExclusive) q = q.lt('ngaykham', toExclusive);
      return q;
    };

    const [benhNhan, donThuoc, donKinh] = await Promise.all([
      getAllRecords<BnRow>(buildBn as any, 'BenhNhan'),
      getAllRecords<DtRow>(buildDt as any, 'DonThuoc'),
      getAllRecords<DkRow>(buildDk as any, 'DonKinh'),
    ]);

    for (const row of benhNhan) {
      if (!inDateRange(row.created_at, from, toExclusive)) continue;
      bumpClinic(row.tenant_id, { so_benh_nhan: 1 });
      bumpMonth(row.tenant_id, toMonthKey(row.created_at), { so_benh_nhan: 1 });
    }

    for (const row of donThuoc) {
      if (!inDateRange(row.ngay_kham, from, toExclusive)) continue;
      const dt = Number(row.tongtien) || 0;
      const lai = Number(row.lai) || 0;
      bumpClinic(row.tenant_id, { so_don_thuoc: 1, doanh_thu: dt, lai });
      bumpMonth(row.tenant_id, toMonthKey(row.ngay_kham), { so_don_thuoc: 1, doanh_thu: dt, lai });
    }

    for (const row of donKinh) {
      if (!inDateRange(row.ngaykham, from, toExclusive)) continue;
      const dt = (Number(row.giatrong) || 0) + (Number(row.giagong) || 0);
      const lai = Number(row.lai) || 0;
      bumpClinic(row.tenant_id, { so_don_kinh: 1, doanh_thu: dt, lai });
      bumpMonth(row.tenant_id, toMonthKey(row.ngaykham), { so_don_kinh: 1, doanh_thu: dt, lai });
    }

    const clinics = tenantList
      .map((t) => {
        const m = clinicMap.get(t.id) || emptyMetrics();
        const monthMap = monthlyByTenant.get(t.id) || new Map();
        const monthly = Array.from(monthMap.entries())
          .map(([month, metrics]) => ({ month, ...metrics }))
          .sort((a, b) => b.month.localeCompare(a.month)); // mới → cũ
        return {
          tenant_id: t.id,
          name: t.name,
          code: t.code,
          status: t.status,
          ...m,
          monthly,
        };
      })
      .sort((a, b) => b.doanh_thu - a.doanh_thu);

    const totals = clinics.reduce(
      (acc, c) => {
        acc.so_benh_nhan += c.so_benh_nhan;
        acc.so_don_thuoc += c.so_don_thuoc;
        acc.so_don_kinh += c.so_don_kinh;
        acc.doanh_thu += c.doanh_thu;
        acc.lai += c.lai;
        return acc;
      },
      emptyMetrics()
    );

    return res.status(200).json({
      from,
      to,
      clinics,
      totals,
    });
  } catch (err: any) {
    return res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}
