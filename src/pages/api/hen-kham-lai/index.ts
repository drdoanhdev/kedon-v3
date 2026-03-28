import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method === 'GET') {
    try {
      const { from: fromDate, to: toDate, trang_thai, benhnhanid } = req.query;

      let query = supabase
        .from('hen_kham_lai')
        .select('*')
        .eq('tenant_id', tenantId)
        .order('ngay_hen', { ascending: true })
        .order('gio_hen', { ascending: true, nullsFirst: false });

      if (fromDate) query = query.gte('ngay_hen', fromDate as string);
      if (toDate) query = query.lte('ngay_hen', toDate as string);
      if (trang_thai && trang_thai !== 'tat_ca') query = query.eq('trang_thai', trang_thai as string);
      if (benhnhanid) query = query.eq('benhnhanid', Number(benhnhanid));

      const { data, error } = await query;
      if (error) throw error;

      res.status(200).json({ data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: 'Lỗi khi lấy lịch hẹn', details: message });
    }
  } else if (req.method === 'POST') {
    try {
      const { benhnhanid, donkinhid, ten_benhnhan, dienthoai, ngay_hen, gio_hen, ly_do, ghichu } = req.body;

      if (!benhnhanid || !ngay_hen) {
        return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (benhnhanid, ngay_hen)' });
      }

      const { data, error } = await supabase
        .from('hen_kham_lai')
        .insert([{
          tenant_id: tenantId,
          benhnhanid: Number(benhnhanid),
          donkinhid: donkinhid ? Number(donkinhid) : null,
          ten_benhnhan: ten_benhnhan || '',
          dienthoai: dienthoai || '',
          ngay_hen,
          gio_hen: gio_hen || null,
          ly_do: ly_do || '',
          ghichu: ghichu || '',
          trang_thai: 'cho',
        }])
        .select()
        .single();

      if (error) throw error;
      res.status(200).json({ data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: 'Lỗi khi tạo lịch hẹn', details: message });
    }
  } else if (req.method === 'PUT' || req.method === 'PATCH') {
    try {
      const { id, trang_thai, ngay_hen, gio_hen, ly_do, ghichu } = req.body;

      if (!id) {
        return res.status(400).json({ message: 'Thiếu ID lịch hẹn' });
      }

      const updateData: Record<string, unknown> = {};
      if (trang_thai !== undefined) updateData.trang_thai = trang_thai;
      if (ngay_hen !== undefined) updateData.ngay_hen = ngay_hen;
      if (gio_hen !== undefined) updateData.gio_hen = gio_hen;
      if (ly_do !== undefined) updateData.ly_do = ly_do;
      if (ghichu !== undefined) updateData.ghichu = ghichu;

      const { data, error } = await supabase
        .from('hen_kham_lai')
        .update(updateData)
        .eq('id', Number(id))
        .eq('tenant_id', tenantId)
        .select()
        .single();

      if (error) throw error;
      res.status(200).json({ data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: 'Lỗi khi cập nhật lịch hẹn', details: message });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ message: 'Thiếu ID lịch hẹn' });
      }

      const { error } = await supabase
        .from('hen_kham_lai')
        .delete()
        .eq('id', Number(id))
        .eq('tenant_id', tenantId);

      if (error) throw error;
      res.status(200).json({ message: 'Đã xóa lịch hẹn' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(500).json({ message: 'Lỗi khi xóa lịch hẹn', details: message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'PATCH', 'DELETE']);
    res.status(405).end(`Method ${req.method} Not Allowed`);
  }
}
