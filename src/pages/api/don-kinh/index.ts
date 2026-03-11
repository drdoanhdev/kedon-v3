//src/pages/api/don-kinh/index.ts L1
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { withDebtFields, calcDebt, calcKinhProfit } from '../../../lib/debt';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method === 'GET') {
    try {
      const { benhnhanid, search, filterDate, filterNo } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 1000; // Default to larger pageSize for don-kinh
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      let query = supabase
        .from('DonKinh')
        .select(`*, benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)`, { count: "exact" })
        .eq('tenant_id', tenantId);
      
      // Nếu có benhnhanid thì filter theo đó
      if (benhnhanid) {
        query = query.eq('benhnhanid', Number(benhnhanid));
        // Giới hạn số lượng đơn cũ để tránh quá tải (50 đơn gần nhất)
        const limit = parseInt(req.query.limit as string) || 50;
        query = query
          .order('ngaykham', { ascending: false })
          .order('id', { ascending: false })
          .limit(limit);
        const { data, error } = await query;
        if (error) throw error;
        const processed = Array.isArray(data) ? data.map(d => withDebtFields(d)) : data ? withDebtFields(data as any) : data;
        res.status(200).json({ data: processed });
      } else {
        // Apply filters
        query = query
          .order('ngaykham', { ascending: false })
          .order('id', { ascending: false });
        
        // Date filter - filter trực tiếp trong DB
        if (filterDate) {
          const nextDay = new Date(filterDate as string);
          nextDay.setDate(nextDay.getDate() + 1);
          query = query.gte('ngaykham', filterDate as string)
                       .lt('ngaykham', nextDay.toISOString().split('T')[0]);
        }
        
        const needsMemoryFilter = !!(search || filterNo);
        
        if (needsMemoryFilter) {
          // Fetch theo chunks
          let allData: any[] = [];
          let currentFrom = 0;
          const chunkSize = 1000;
          
          while (true) {
            const { data: chunk, error } = await query
              .range(currentFrom, currentFrom + chunkSize - 1);
            
            if (error) throw error;
            if (!chunk || chunk.length === 0) break;
            
            allData = allData.concat(chunk);
            if (chunk.length < chunkSize) break;
            
            currentFrom += chunkSize;
            if (allData.length >= 50000) break;
          }
          
          // Filter trong memory
          let filteredData = allData.filter((dk: any) => {
            // Search filter
            if (search) {
              const searchLower = (search as string).toLowerCase();
              const matchesSearch =
                (dk.benhnhan?.ten && dk.benhnhan.ten.toLowerCase().includes(searchLower)) ||
                (dk.benhnhan?.id && dk.benhnhan.id.toString().includes(searchLower)) ||
                (dk.benhnhan?.dienthoai && dk.benhnhan.dienthoai.includes(searchLower)) ||
                (dk.benhnhan?.diachi && dk.benhnhan.diachi.toLowerCase().includes(searchLower));
              if (!matchesSearch) return false;
            }
            
            // Debt filter
            if (filterNo === 'true') {
              const remaining = (dk.giatrong || 0) + (dk.giagong || 0) - (dk.sotien_da_thanh_toan || 0);
              if (remaining <= 0) return false;
            }
            
            return true;
          });
          
          const finalCount = filteredData.length;
          const paginatedData = filteredData.slice(from, to + 1);
          const processed = paginatedData.map(d => withDebtFields(d));
          res.status(200).json({ data: processed, total: finalCount });
        } else {
          // Không có search/filterNo - phân trang bình thường
          const { data, error, count } = await query.range(from, to);
          if (error) throw error;
          const processed = Array.isArray(data) ? data.map(d => withDebtFields(d)) : data ? withDebtFields(data as any) : data;
          res.status(200).json({ data: processed, total: count ?? 0 });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Supabase GET error:', error);
      res.status(500).json({ message: 'Lỗi khi lấy dữ liệu đơn kính', details: message });
    }
  } else if (req.method === 'POST') {
    try {
      const {
        benhnhanid,
        chandoan,
        ngaykham,
        giatrong,
        giagong,
        ghichu,
        thiluc_khongkinh_mp,
        thiluc_kinhcu_mp,
        thiluc_kinhmoi_mp,
        sokinh_cu_mp,
        sokinh_moi_mp,
        hangtrong_mp,
        thiluc_khongkinh_mt,
        thiluc_kinhcu_mt,
        thiluc_kinhmoi_mt,
        sokinh_cu_mt,
        sokinh_moi_mt,
        hangtrong_mt,
        no,
        sotien_da_thanh_toan,
        lai,
      } = req.body as Record<string, unknown>;

      if (!benhnhanid || !ngaykham) {
        return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (benhnhanid hoặc ngaykham)' });
      }
      // Tìm ID cao nhất và dùng ID tiếp theo để tránh conflict
      const { data: maxIdData } = await supabase
        .from('DonKinh')
        .select('id')
        .order('id', { ascending: false })
        .limit(1);
      
      const nextId = (maxIdData?.[0]?.id || 0) + 1;
      console.log(`🔧 Sử dụng ID mới: ${nextId}`);

      // Backward compatibility: if new cost fields not provided use ax_mp/ax_mt
  const lensCost = (req.body as any).gianhap_trong ?? 0;
  const frameCost = (req.body as any).gianhap_gong ?? 0;
      const { data, error } = await supabase
        .from('DonKinh')
        .insert([
          {
            id: nextId, // Chỉ định ID cụ thể
            benhnhanid,
            chandoan: (chandoan as string) || '',
            ngaykham,
            giatrong,
            giagong,
             gianhap_trong: lensCost,
             gianhap_gong: frameCost,
            ghichu: ghichu || '',
            thiluc_khongkinh_mp: thiluc_khongkinh_mp || '',
            thiluc_kinhcu_mp: thiluc_kinhcu_mp || '',
            thiluc_kinhmoi_mp: thiluc_kinhmoi_mp || '',
            sokinh_cu_mp: sokinh_cu_mp || '',
            sokinh_moi_mp: sokinh_moi_mp || '',
            hangtrong_mp: hangtrong_mp || '',
            thiluc_khongkinh_mt: thiluc_khongkinh_mt || '',
            thiluc_kinhcu_mt: thiluc_kinhcu_mt || '',
            thiluc_kinhmoi_mt: thiluc_kinhmoi_mt || '',
            sokinh_cu_mt: sokinh_cu_mt || '',
            sokinh_moi_mt: sokinh_moi_mt || '',
            hangtrong_mt: hangtrong_mt || '',
            sotien_da_thanh_toan: sotien_da_thanh_toan || 0,
             no: (Number(giatrong) + Number(giagong) - Number(sotien_da_thanh_toan || 0)) > 0,
             // Profit unified
             lai: (typeof lai === 'number' && !isNaN(lai as number)) ? lai : calcKinhProfit(giatrong, giagong, lensCost, frameCost),
            tenant_id: tenantId,
          },
        ])
  .select(`*, benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)`).maybeSingle();

      if (error) throw error;
      res.status(200).json({ data: data ? withDebtFields(data) : data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Supabase POST error:', error);
      res.status(500).json({ message: 'Lỗi khi tạo đơn kính', details: message });
    }
  } else if (req.method === 'PUT') {
    try {
      const {
        id,
        benhnhanid,
        chandoan,
        ngaykham,
        giatrong,
        giagong,
        ghichu,
        thiluc_khongkinh_mp,
        thiluc_kinhcu_mp,
        thiluc_kinhmoi_mp,
        sokinh_cu_mp,
        sokinh_moi_mp,
        hangtrong_mp,
        thiluc_khongkinh_mt,
        thiluc_kinhcu_mt,
        thiluc_kinhmoi_mt,
        sokinh_cu_mt,
        sokinh_moi_mt,
        hangtrong_mt,
        no,
        sotien_da_thanh_toan,
        lai,
      } = req.body as Record<string, unknown>;

      if (!id || !benhnhanid || !ngaykham) {
        return res.status(400).json({ message: 'Thiếu thông tin bắt buộc để cập nhật (id, benhnhanid hoặc ngaykham)' });
      }

      // Costs fallback for PUT
  const lensCost = (req.body as any).gianhap_trong ?? 0;
  const frameCost = (req.body as any).gianhap_gong ?? 0;
      const { data, error } = await supabase
        .from('DonKinh')
        .update({
          benhnhanid,
          chandoan: (chandoan as string) || '',
          ngaykham,
          giatrong,
          giagong,
            gianhap_trong: (req.body as any).gianhap_trong ?? 0,
            gianhap_gong: (req.body as any).gianhap_gong ?? 0,
          ghichu: ghichu || '',
          thiluc_khongkinh_mp: thiluc_khongkinh_mp || '',
          thiluc_kinhcu_mp: thiluc_kinhcu_mp || '',
          thiluc_kinhmoi_mp: thiluc_kinhmoi_mp || '',
          sokinh_cu_mp: sokinh_cu_mp || '',
          sokinh_moi_mp: sokinh_moi_mp || '',
          hangtrong_mp: hangtrong_mp || '',
          thiluc_khongkinh_mt: thiluc_khongkinh_mt || '',
          thiluc_kinhcu_mt: thiluc_kinhcu_mt || '',
          thiluc_kinhmoi_mt: thiluc_kinhmoi_mt || '',
          sokinh_cu_mt: sokinh_cu_mt || '',
          sokinh_moi_mt: sokinh_moi_mt || '',
          hangtrong_mt: hangtrong_mt || '',
       sotien_da_thanh_toan: sotien_da_thanh_toan || 0,
   no: (Number(giatrong) + Number(giagong) - Number(sotien_da_thanh_toan || 0)) > 0,
   lai: (typeof lai === 'number' && !isNaN(lai as number)) ? lai : calcKinhProfit(giatrong, giagong, lensCost, frameCost),
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
  .select(`*, benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)`).maybeSingle();

      if (error) throw error;
      res.status(200).json({ data: data ? withDebtFields(data) : data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Supabase PUT error:', error);
      res.status(500).json({ message: 'Lỗi khi cập nhật đơn kính', details: message });
    }
  } else if (req.method === 'PATCH') {
    // Partial payment update: { id, add_payment }
    try {
      const { id, add_payment } = req.body as { id?: number; add_payment?: number };
      if (!id || !add_payment || add_payment <= 0) {
        return res.status(400).json({ message: 'Thiếu hoặc sai tham số (id, add_payment)' });
      }
      const { data: current, error: curErr } = await supabase
        .from('DonKinh')
        .select('id, giatrong, giagong, sotien_da_thanh_toan, lai, gianhap_trong, gianhap_gong')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      if (curErr || !current) {
        return res.status(404).json({ message: 'Không tìm thấy đơn kính' });
      }
      const total = (current.giatrong || 0) + (current.giagong || 0);
      const newPaidRaw = (current.sotien_da_thanh_toan || 0) + add_payment;
      const clampedPaid = Math.max(0, Math.min(newPaidRaw, total));
      const debtInfo = calcDebt(total, clampedPaid);
      const newProfit = calcKinhProfit(current.giatrong, current.giagong, (current as any).gianhap_trong || 0, (current as any).gianhap_gong || 0);

      const { data: updated, error: updErr } = await supabase
        .from('DonKinh')
        .update({
          sotien_da_thanh_toan: clampedPaid,
          no: debtInfo.isDebt,
          // Không thay đổi lai ở partial payment trừ khi muốn tái tính: để giữ logic nhất quán có thể giữ nguyên newProfit
          lai: newProfit,
        })
        .eq('id', id)
        .select(`*, benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)`) // include relations
        .maybeSingle();

      if (updErr) {
        return res.status(400).json({ message: 'Lỗi cập nhật thanh toán', error: updErr.message });
      }
      return res.status(200).json({ message: 'Đã cập nhật thanh toán', data: updated ? withDebtFields(updated) : updated });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Supabase PATCH error:', error);
      res.status(500).json({ message: 'Lỗi khi cập nhật thanh toán đơn kính', details: message });
    }
  } else if (req.method === 'DELETE') {
    try {
      const { id } = req.query;

      if (!id) return res.status(400).json({ message: 'Thiếu ID để xoá đơn kính' });

      const { error } = await supabase.from('DonKinh').delete().eq('id', Number(id)).eq('tenant_id', tenantId);
      if (error) throw error;

      res.status(200).json({ message: 'Đã xoá đơn kính' });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Supabase DELETE error:', error);
      res.status(500).json({ message: 'Lỗi khi xoá đơn kính', details: message });
    }
  } else {
    res.setHeader('Allow', ['GET', 'POST', 'PUT', 'DELETE']);
    res.status(405).json({ message: `Phương thức ${req.method} không được phép` });
  }
}
