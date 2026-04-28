// API: Check stock availability for lens + frame before prescription
// Used by ke-don-kinh frontend to show real-time stock status
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'inventory_lens'))) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  let { branchId } = branchAccess;

  // Safety fallback for frame/lens stock checks: prefer main active branch
  // instead of tenant-wide result when branch context is missing.
  if (!branchId) {
    const { data: mainBranch } = await supabase
      .from('branches')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('is_main', { ascending: false })
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    if (mainBranch?.id) {
      branchId = mainBranch.id;
    }
  }

  try {
    const { hang_trong, ten_gong, sokinh } = req.query;
    const result: {
      lens?: { kieu_quan_ly: string; ton_hien_tai: number | null; trang_thai: string };
      frame?: { ton_kho: number };
    } = {};

    // Check lens stock if hang_trong provided
    if (hang_trong) {
      let ht: { id: number; kieu_quan_ly?: string } | null = null;
      const { data: htData, error: htErr } = await supabase
        .from('HangTrong')
        .select('id, kieu_quan_ly')
        .eq('tenant_id', tenantId)
        .eq('ten_hang', hang_trong as string)
        .limit(1)
        .maybeSingle();

      if (htErr) {
        // kieu_quan_ly column may not exist — fallback
        const { data: htBasic } = await supabase
          .from('HangTrong')
          .select('id')
          .eq('tenant_id', tenantId)
          .eq('ten_hang', hang_trong as string)
          .limit(1)
          .maybeSingle();
        if (htBasic) ht = { id: htBasic.id, kieu_quan_ly: 'SAN_KHO' };
      } else {
        ht = htData;
      }

      if (ht) {
        const kieuQL = ht.kieu_quan_ly || 'SAN_KHO';
        if (kieuQL === 'DAT_KHI_CO_KHACH') {
          result.lens = { kieu_quan_ly: 'DAT_KHI_CO_KHACH', ton_hien_tai: null, trang_thai: 'DAT_HANG' };
        } else if (sokinh) {
          // Parse sokinh to get SPH/CYL/ADD
          const parsed = parseSoKinh(sokinh as string);
          if (parsed) {
            let stockQuery = supabase
              .from('lens_stock')
              .select('ton_hien_tai, trang_thai_ton')
              .eq('tenant_id', tenantId)
              .eq('hang_trong_id', ht.id)
              .eq('sph', parsed.sph)
              .eq('cyl', parsed.cyl);
            if (branchId) {
              stockQuery = stockQuery.eq('branch_id', branchId);
            }
            // Filter by add_power: match exact value or null for single-vision
            if (parsed.add_power !== undefined) {
              stockQuery = stockQuery.eq('add_power', parsed.add_power);
            } else {
              stockQuery = stockQuery.is('add_power', null);
            }
            const { data: stock } = await stockQuery
              .limit(1)
              .maybeSingle();

            result.lens = {
              kieu_quan_ly: 'SAN_KHO',
              ton_hien_tai: stock?.ton_hien_tai ?? 0,
              trang_thai: stock?.trang_thai_ton ?? 'CHUA_CO',
            };
          } else {
            result.lens = { kieu_quan_ly: 'SAN_KHO', ton_hien_tai: null, trang_thai: 'CHUA_NHAP_DO' };
          }
        } else {
          result.lens = { kieu_quan_ly: 'SAN_KHO', ton_hien_tai: null, trang_thai: 'CHUA_NHAP_DO' };
        }
      }
    }

    // Check frame stock if ten_gong provided
    if (ten_gong) {
      let gongQuery = supabase
        .from('GongKinh')
        .select('ton_kho')
        .eq('tenant_id', tenantId)
        .eq('ten_gong', ten_gong as string);

      if (branchId) {
        gongQuery = gongQuery.eq('branch_id', branchId);
      }

      const { data: gong } = await gongQuery.limit(1).maybeSingle();

      if (gong) {
        result.frame = { ton_kho: gong.ton_kho ?? 0 };
      }
    }

    return res.status(200).json(result);
  } catch (err: any) {
    console.error('check-stock error:', err);
    return res.status(500).json({ error: err.message });
  }
}

// === HELPER: Parse sokinh string → { sph, cyl, add_power? } ===
// Hỗ trợ nhiều format:
//   "-1.00/-0.50x180" (đầy đủ)
//   "-1.00" (chỉ SPH, không loạn → CYL=0)
//   "Plano" (không độ → SPH=0, CYL=0)
//   "Plano/-0.50x90" (Plano + loạn)
//   "-0.50 ADD +1.25" (đa tròng, chỉ SPH + ADD)
//   "-0.50/-1.00x180 ADD +1.25" (đa tròng đầy đủ)
function parseSoKinh(sokinh: string): { sph: number; cyl: number; add_power?: number } | null {
  if (!sokinh || !sokinh.trim()) return null;
  const s = sokinh.trim();

  // Tách phần ADD nếu có
  const addMatch = s.match(/\s+ADD\s+([+-]?\d+(?:\.\d{1,2})?)\s*$/i);
  const base = addMatch ? s.slice(0, addMatch.index).trim() : s;
  const addPower = addMatch ? parseFloat(addMatch[1]) : undefined;

  // Format đầy đủ: SPH/CYLxAXIS
  const fullMatch = base.match(/^(Plano|[+-]?\d+(?:\.\d{1,2})?)\s*\/\s*([-+]?\d+(?:\.\d{1,2})?)\s*x\s*(\d{1,3})$/i);
  if (fullMatch) {
    const sph = fullMatch[1].toLowerCase() === 'plano' ? 0 : parseFloat(fullMatch[1]);
    const cyl = parseFloat(fullMatch[2]);
    if (isNaN(sph) || isNaN(cyl)) return null;
    const result: { sph: number; cyl: number; add_power?: number } = { sph, cyl };
    if (addPower !== undefined && !isNaN(addPower)) result.add_power = addPower;
    return result;
  }

  // Chỉ SPH (không loạn): "-1.00", "+2.50", "0.00", "-3"
  const sphOnly = base.match(/^[+-]?\d+(?:\.\d{1,2})?$/);
  if (sphOnly) {
    const sph = parseFloat(base);
    if (isNaN(sph)) return null;
    const result: { sph: number; cyl: number; add_power?: number } = { sph, cyl: 0 };
    if (addPower !== undefined && !isNaN(addPower)) result.add_power = addPower;
    return result;
  }

  // Plano (không độ)
  if (/^plano$/i.test(base)) {
    const result: { sph: number; cyl: number; add_power?: number } = { sph: 0, cyl: 0 };
    if (addPower !== undefined && !isNaN(addPower)) result.add_power = addPower;
    return result;
  }

  return null;
}
