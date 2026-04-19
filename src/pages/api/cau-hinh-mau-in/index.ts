import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'print_config'))) return;
  const { tenantId } = ctx;

  if (req.method === 'GET') {
    try {
      const { data, error } = await supabase
        .from('cau_hinh_mau_in')
        .select('*')
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (error) throw error;

      // Defaults for all fields (handles existing rows missing new columns)
      const defaults = {
        tenant_id: tenantId,
        ten_cua_hang: '',
        dia_chi: '',
        dien_thoai: '',
        logo_url: '',
        hien_thi_logo: true,
        hien_thi_chan_doan: true,
        hien_thi_sokinh_cu: false,
        hien_thi_thiluc: true,
        hien_thi_pd: true,
        hien_thi_gong: true,
        hien_thi_trong: true,
        hien_thi_gia: false,
        hien_thi_ghi_chu: true,
        ghi_chu_cuoi: '',
        hien_thi_logo_thuoc: true,
        hien_thi_chan_doan_thuoc: true,
        hien_thi_gia_thuoc: false,
        hien_thi_ghi_chu_thuoc: true,
        ghi_chu_cuoi_thuoc: '',
        chuc_danh_nguoi_ky: '',
        ho_ten_nguoi_ky: '',
        chu_ky_url: '',
        hien_thi_nguoi_ky: true,
        hien_thi_nguoi_ky_thuoc: true,
        hien_thi_ngay_kham: true,
        hien_thi_ngay_kham_thuoc: true,
      };

      if (!data) {
        return res.status(200).json({ data: defaults });
      }

      // Merge defaults for any null/missing fields in existing rows
      const merged: Record<string, unknown> = { ...defaults };
      for (const [k, v] of Object.entries(data)) {
        if (v !== null && v !== undefined) merged[k] = v;
      }
      res.status(200).json({ data: merged });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: 'Lỗi khi lấy cấu hình mẫu in', details: message });
    }
  } else if (req.method === 'PUT') {
    try {
      const {
        ten_cua_hang,
        dia_chi,
        dien_thoai,
        logo_url,
        hien_thi_logo,
        hien_thi_chan_doan,
        hien_thi_sokinh_cu,
        hien_thi_thiluc,
        hien_thi_pd,
        hien_thi_gong,
        hien_thi_trong,
        hien_thi_gia,
        hien_thi_ghi_chu,
        ghi_chu_cuoi,
        hien_thi_logo_thuoc,
        hien_thi_chan_doan_thuoc,
        hien_thi_gia_thuoc,
        hien_thi_ghi_chu_thuoc,
        ghi_chu_cuoi_thuoc,
        chuc_danh_nguoi_ky,
        ho_ten_nguoi_ky,
        chu_ky_url,
        hien_thi_nguoi_ky,
        hien_thi_nguoi_ky_thuoc,
        hien_thi_ngay_kham,
        hien_thi_ngay_kham_thuoc,
      } = req.body;

      const payload = {
        tenant_id: tenantId,
        ten_cua_hang: ten_cua_hang || '',
        dia_chi: dia_chi || '',
        dien_thoai: dien_thoai || '',
        logo_url: logo_url || '',
        hien_thi_logo: hien_thi_logo ?? true,
        hien_thi_chan_doan: hien_thi_chan_doan ?? true,
        hien_thi_sokinh_cu: hien_thi_sokinh_cu ?? false,
        hien_thi_thiluc: hien_thi_thiluc ?? true,
        hien_thi_pd: hien_thi_pd ?? true,
        hien_thi_gong: hien_thi_gong ?? true,
        hien_thi_trong: hien_thi_trong ?? true,
        hien_thi_gia: hien_thi_gia ?? false,
        hien_thi_ghi_chu: hien_thi_ghi_chu ?? true,
        ghi_chu_cuoi: ghi_chu_cuoi || '',
        hien_thi_logo_thuoc: hien_thi_logo_thuoc ?? true,
        hien_thi_chan_doan_thuoc: hien_thi_chan_doan_thuoc ?? true,
        hien_thi_gia_thuoc: hien_thi_gia_thuoc ?? false,
        hien_thi_ghi_chu_thuoc: hien_thi_ghi_chu_thuoc ?? true,
        ghi_chu_cuoi_thuoc: ghi_chu_cuoi_thuoc || '',
        chuc_danh_nguoi_ky: chuc_danh_nguoi_ky || '',
        ho_ten_nguoi_ky: ho_ten_nguoi_ky || '',
        chu_ky_url: chu_ky_url || '',
        hien_thi_nguoi_ky: hien_thi_nguoi_ky ?? true,
        hien_thi_nguoi_ky_thuoc: hien_thi_nguoi_ky_thuoc ?? true,
        hien_thi_ngay_kham: hien_thi_ngay_kham ?? true,
        hien_thi_ngay_kham_thuoc: hien_thi_ngay_kham_thuoc ?? true,
        updated_at: new Date().toISOString(),
      };

      // Upsert: insert if not exists, update if exists
      const { data, error } = await supabase
        .from('cau_hinh_mau_in')
        .upsert(payload, { onConflict: 'tenant_id' })
        .select()
        .maybeSingle();

      if (error) throw error;

      res.status(200).json({ data, message: 'Đã lưu cấu hình mẫu in' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: 'Lỗi khi lưu cấu hình mẫu in', details: message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'PUT']);
    res.status(405).json({ message: `Phương thức ${req.method} không được phép` });
  }
}
