// API: Nhập kho tròng kính từ Excel (batch)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export const config = { api: { bodyParser: { sizeLimit: '2mb' } } };

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  try {
    const { rows } = req.body as { rows: Array<{
      ten_hang: string; sph: number; cyl: number; add_power?: number | null;
      mat?: string | null;
      ton_dau_ky?: number; muc_ton_can_co?: number;
    }> };

    if (!rows || !Array.isArray(rows) || rows.length === 0) {
      return res.status(400).json({ error: 'Danh sách rows rỗng' });
    }
    if (rows.length > 500) {
      return res.status(400).json({ error: 'Tối đa 500 dòng mỗi lần nhập' });
    }

    // Lấy danh sách hãng tròng active của tenant
    const { data: hangTrongs } = await supabase
      .from('HangTrong')
      .select('id, ten_hang')
      .eq('tenant_id', tenantId)
      .eq('trang_thai', true);

    const htMap = new Map((hangTrongs || []).map(h => [h.ten_hang.toLowerCase().trim(), h.id]));

    const results: { success: number; skipped: number; errors: string[] } = {
      success: 0, skipped: 0, errors: [],
    };

    // Helper: "Plano"/"PL" = 0
    const parsePower = (v: any): number => {
      if (v === undefined || v === null) return NaN;
      const s = String(v).trim().toLowerCase();
      if (s === 'plano' || s === 'pl') return 0;
      return parseFloat(s);
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const lineNum = i + 2; // Excel row (header = row 1)

      const sph = parsePower(row.sph);
      if (!row.ten_hang || isNaN(sph)) {
        results.errors.push(`Dòng ${lineNum}: Thiếu tên hãng hoặc SPH không hợp lệ`);
        results.skipped++;
        continue;
      }

      const hangTrongId = htMap.get(row.ten_hang.toLowerCase().trim());
      if (!hangTrongId) {
        results.errors.push(`Dòng ${lineNum}: Không tìm thấy hãng "${row.ten_hang}" trong danh mục`);
        results.skipped++;
        continue;
      }

      const cyl = parsePower(row.cyl) || 0;
      const addRaw = row.add_power != null && row.add_power !== '' ? parsePower(row.add_power) : null;
      const addPower = (addRaw !== null && !isNaN(addRaw)) ? addRaw : null;
      const mat = (addPower != null && row.mat && ['trai', 'phai'].includes(row.mat)) ? row.mat : null;
      const tonDauKy = row.ton_dau_ky ?? 0;

      const { error } = await supabase.from('lens_stock').insert({
        tenant_id: tenantId,
        hang_trong_id: hangTrongId,
        sph: sph,
        cyl: cyl,
        add_power: addPower,
        mat: mat,
        ton_dau_ky: tonDauKy,
        ton_hien_tai: tonDauKy,
        muc_ton_can_co: row.muc_ton_can_co ?? 10,
      });

      if (error) {
        if (error.code === '23505') {
          results.errors.push(`Dòng ${lineNum}: Trùng (${row.ten_hang} SPH=${row.sph} CYL=${row.cyl ?? 0}) - bỏ qua`);
          results.skipped++;
        } else {
          results.errors.push(`Dòng ${lineNum}: ${error.message}`);
          results.skipped++;
        }
      } else {
        results.success++;
      }
    }

    return res.status(200).json(results);
  } catch (err: any) {
    console.error('lens-stock-import error:', err);
    return res.status(500).json({ error: err.message });
  }
}
