//src/pages/api/don-kinh/index.ts L1
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, checkTrialLimit, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requirePermission } from '../../../lib/permissions';
import { withDebtFields, calcDebt, calcKinhProfit } from '../../../lib/debt';

// Cache: whether FK columns exist in DonKinh table
let hasFkColumns: boolean | null = null;
async function checkFkColumns(): Promise<boolean> {
  if (hasFkColumns !== null) return hasFkColumns;
  try {
    const { error } = await supabase
      .from('DonKinh')
      .select('hang_trong_mp_id')
      .limit(0);
    hasFkColumns = !error;
  } catch {
    hasFkColumns = false;
  }
  return hasFkColumns;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = ctx;
  const { branchId } = branchAccess;

  if (req.method === 'GET') {
    try {
      const { benhnhanid, search, filterDate, filterNo } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 1000; // Default to larger pageSize for don-kinh
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;
      
      let query = supabase
        .from('DonKinh')
        .select(`*, benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi), branch:branches(id, ten_chi_nhanh)`, { count: "exact" })
        .eq('tenant_id', tenantId);

      // Branch filter (enterprise multi-branch)
      // Bỏ filter khi xem lịch sử 1 bệnh nhân cụ thể -> hiện lịch sử cross-branch
      if (branchId && !benhnhanid) {
        query = query.eq('branch_id', branchId);
      }
      
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
    if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
    // Kiểm tra giới hạn trial trước khi tạo đơn mới
    if (!(await checkTrialLimit(ctx, res))) return;
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
        ten_gong,
        no,
        sotien_da_thanh_toan,
        lai,
        pd_mp,
        pd_mt,
      } = req.body as Record<string, unknown>;

      if (!benhnhanid || !ngaykham) {
        return res.status(400).json({ message: 'Thiếu thông tin bắt buộc (benhnhanid hoặc ngaykham)' });
      }

      // Backward compatibility: if new cost fields not provided use ax_mp/ax_mt
  const lensCost = (req.body as any).gianhap_trong ?? 0;
  const frameCost = (req.body as any).gianhap_gong ?? 0;

      // Nhóm giá gọng: khi bán theo nhóm giá thay vì gọng cụ thể
      const nhom_gia_gong_id = (req.body as any).nhom_gia_gong_id ? parseInt((req.body as any).nhom_gia_gong_id) : null;

      // === Resolve FK IDs from text names ===
      const useFk = await checkFkColumns();
      const fkIds = useFk ? await resolveForeignKeys(supabase, tenantId, branchId, {
        hangtrong_mp: hangtrong_mp as string,
        hangtrong_mt: hangtrong_mt as string,
        ten_gong: ten_gong as string,
      }) : { hang_trong_mp_id: null, hang_trong_mt_id: null, gong_kinh_id: null };

      const insertPayload: Record<string, unknown> = {
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
            ten_gong: ten_gong || '',
            sotien_da_thanh_toan: sotien_da_thanh_toan || 0,
             no: (Number(giatrong) + Number(giagong) - Number(sotien_da_thanh_toan || 0)) > 0,
             // Profit unified
             lai: (typeof lai === 'number' && !isNaN(lai as number)) ? lai : calcKinhProfit(giatrong, giagong, lensCost, frameCost),
            pd_mp: pd_mp || '',
            pd_mt: pd_mt || '',
            tenant_id: tenantId,
            ...(branchId ? { branch_id: branchId } : {}),
      };
      if (useFk) {
        insertPayload.hang_trong_mp_id = fkIds.hang_trong_mp_id;
        insertPayload.hang_trong_mt_id = fkIds.hang_trong_mt_id;
        insertPayload.gong_kinh_id = fkIds.gong_kinh_id;
      }

      // Nhóm giá gọng: bán theo nhóm giá
      if (nhom_gia_gong_id) {
        insertPayload.nhom_gia_gong_id = nhom_gia_gong_id;
        // Snapshot giá vốn gọng từ gia_nhap_trung_binh của nhóm
        const { data: nhomGia } = await supabase
          .from('nhom_gia_gong')
          .select('gia_nhap_trung_binh')
          .eq('id', nhom_gia_gong_id)
          .eq('tenant_id', tenantId)
          .single();
        insertPayload.gia_von_gong = nhomGia?.gia_nhap_trung_binh ?? frameCost;
      } else {
        insertPayload.gia_von_gong = frameCost;
      }

      const insertDonKinh = (payload: Record<string, unknown>) =>
        supabase
          .from('DonKinh')
          .insert([payload])
          .select(`*, benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)`)
          .maybeSingle();

      let { data, error } = await insertDonKinh(insertPayload);

      // Defensive fallback: some deployments have an out-of-sync id sequence on DonKinh.
      // If that happens, retry once with an explicit id = max(id)+1.
      if (error?.code === '23505' && typeof error.message === 'string' && error.message.includes('donkinh_pkey')) {
        const { data: latestDon } = await supabase
          .from('DonKinh')
          .select('id')
          .order('id', { ascending: false })
          .limit(1)
          .maybeSingle();

        const fallbackId = Number(latestDon?.id || 0) + 1;
        const retry = await insertDonKinh({ ...insertPayload, id: fallbackId });
        data = retry.data;
        error = retry.error;
        if (!error) {
          console.warn(`[DonKinh] Sequence lệch, đã retry insert với id=${fallbackId}`);
        }
      }

      if (error) throw error;

      // === INVENTORY INTEGRATION ===
      const inventoryWarnings: string[] = [];
      if (data) {
        const donKinhId = data.id;
        try {
          const invResult = await processLensInventory(supabase, tenantId, branchId, donKinhId, {
            sokinh_moi_mp: sokinh_moi_mp as string,
            hangtrong_mp: hangtrong_mp as string,
            sokinh_moi_mt: sokinh_moi_mt as string,
            hangtrong_mt: hangtrong_mt as string,
            ten_gong: ten_gong as string,
            gong_kinh_id: fkIds.gong_kinh_id ?? undefined,
            nhom_gia_gong_id: nhom_gia_gong_id ?? undefined,
          });
          inventoryWarnings.push(...invResult.warnings);
        } catch (invErr) {
          console.error('⚠️ Inventory processing error:', invErr);
          inventoryWarnings.push('Lỗi xử lý kho: ' + (invErr instanceof Error ? invErr.message : String(invErr)));
        }
      }

      res.status(200).json({ data: data ? withDebtFields(data) : data, inventoryWarnings });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('Supabase POST error:', error);
      res.status(500).json({ message: 'Lỗi khi tạo đơn kính', details: message });
    }
  } else if (req.method === 'PUT') {
    if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
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
        ten_gong,
        no,
        sotien_da_thanh_toan,
        lai,
        pd_mp,
        pd_mt,
      } = req.body as Record<string, unknown>;

      if (!id || !benhnhanid || !ngaykham) {
        return res.status(400).json({ message: 'Thiếu thông tin bắt buộc để cập nhật (id, benhnhanid hoặc ngaykham)' });
      }

      // Costs fallback for PUT
  const lensCost = (req.body as any).gianhap_trong ?? 0;
  const frameCost = (req.body as any).gianhap_gong ?? 0;

      const nhom_gia_gong_id_put = (req.body as any).nhom_gia_gong_id ? parseInt((req.body as any).nhom_gia_gong_id) : null;

      // === Fetch old DonKinh to compare & reverse inventory ===
      let oldDonQuery = supabase
        .from('DonKinh')
        .select('hangtrong_mp, hangtrong_mt, sokinh_moi_mp, sokinh_moi_mt, ten_gong')
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (branchId) {
        oldDonQuery = oldDonQuery.eq('branch_id', branchId);
      }
      const { data: oldDon } = await oldDonQuery.single();

      // === Resolve FK IDs from text names ===
      const useFk = await checkFkColumns();
      const fkIds = useFk ? await resolveForeignKeys(supabase, tenantId, branchId, {
        hangtrong_mp: hangtrong_mp as string,
        hangtrong_mt: hangtrong_mt as string,
        ten_gong: ten_gong as string,
      }) : { hang_trong_mp_id: null, hang_trong_mt_id: null, gong_kinh_id: null };

      const updatePayload: Record<string, unknown> = {
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
          ten_gong: ten_gong || '',
       sotien_da_thanh_toan: sotien_da_thanh_toan || 0,
   no: (Number(giatrong) + Number(giagong) - Number(sotien_da_thanh_toan || 0)) > 0,
   lai: (typeof lai === 'number' && !isNaN(lai as number)) ? lai : calcKinhProfit(giatrong, giagong, lensCost, frameCost),
          pd_mp: pd_mp || '',
          pd_mt: pd_mt || '',
      };
      if (useFk) {
        updatePayload.hang_trong_mp_id = fkIds.hang_trong_mp_id;
        updatePayload.hang_trong_mt_id = fkIds.hang_trong_mt_id;
        updatePayload.gong_kinh_id = fkIds.gong_kinh_id;
      }

      // Nhóm giá gọng cho PUT
      if (nhom_gia_gong_id_put) {
        updatePayload.nhom_gia_gong_id = nhom_gia_gong_id_put;
        const { data: nhomGia } = await supabase
          .from('nhom_gia_gong')
          .select('gia_nhap_trung_binh')
          .eq('id', nhom_gia_gong_id_put)
          .eq('tenant_id', tenantId)
          .single();
        updatePayload.gia_von_gong = nhomGia?.gia_nhap_trung_binh ?? frameCost;
      } else {
        updatePayload.nhom_gia_gong_id = null;
        updatePayload.gia_von_gong = frameCost;
      }

      let updateQuery = supabase
        .from('DonKinh')
        .update(updatePayload)
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (branchId) {
        updateQuery = updateQuery.eq('branch_id', branchId);
      }
      const { data, error } = await updateQuery
  .select(`*, benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)`).maybeSingle();

      if (error) throw error;

      // === INVENTORY: Reverse old + process new if lens/frame changed ===
      const inventoryWarnings: string[] = [];
      if (data && oldDon) {
        const donKinhId = Number(id);
        const lensChanged = oldDon.hangtrong_mp !== (hangtrong_mp || '') ||
                            oldDon.hangtrong_mt !== (hangtrong_mt || '') ||
                            oldDon.sokinh_moi_mp !== (sokinh_moi_mp || '') ||
                            oldDon.sokinh_moi_mt !== (sokinh_moi_mt || '');
        const frameChanged = oldDon.ten_gong !== (ten_gong || '');

        if (lensChanged || frameChanged) {
          try {
            // Reverse old inventory
            await reverseInventory(supabase, tenantId, donKinhId);
            // Process new inventory
            const invResult = await processLensInventory(supabase, tenantId, branchId, donKinhId, {
              sokinh_moi_mp: sokinh_moi_mp as string,
              hangtrong_mp: hangtrong_mp as string,
              sokinh_moi_mt: sokinh_moi_mt as string,
              hangtrong_mt: hangtrong_mt as string,
              ten_gong: ten_gong as string,
              gong_kinh_id: fkIds.gong_kinh_id ?? undefined,
              nhom_gia_gong_id: nhom_gia_gong_id_put ?? undefined,
            });
            inventoryWarnings.push(...invResult.warnings);
          } catch (invErr) {
            console.error('⚠️ PUT inventory error:', invErr);
            inventoryWarnings.push('Lỗi xử lý kho khi sửa đơn: ' + (invErr instanceof Error ? invErr.message : String(invErr)));
          }
        }
      }

      res.status(200).json({ data: data ? withDebtFields(data) : data, inventoryWarnings });
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
      let currentQuery = supabase
        .from('DonKinh')
        .select('id, giatrong, giagong, sotien_da_thanh_toan, lai, gianhap_trong, gianhap_gong')
        .eq('id', id)
        .eq('tenant_id', tenantId);
      if (branchId) {
        currentQuery = currentQuery.eq('branch_id', branchId);
      }
      const { data: current, error: curErr } = await currentQuery.single();
      if (curErr || !current) {
        return res.status(404).json({ message: 'Không tìm thấy đơn kính' });
      }
      const total = (current.giatrong || 0) + (current.giagong || 0);
      const newPaidRaw = (current.sotien_da_thanh_toan || 0) + add_payment;
      const clampedPaid = Math.max(0, Math.min(newPaidRaw, total));
      const debtInfo = calcDebt(total, clampedPaid);
      const newProfit = calcKinhProfit(current.giatrong, current.giagong, (current as any).gianhap_trong || 0, (current as any).gianhap_gong || 0);

      let patchQuery = supabase
        .from('DonKinh')
        .update({
          sotien_da_thanh_toan: clampedPaid,
          no: debtInfo.isDebt,
          // Không thay đổi lai ở partial payment trừ khi muốn tái tính: để giữ logic nhất quán có thể giữ nguyên newProfit
          lai: newProfit,
        })
        .eq('id', id);
      if (branchId) {
        patchQuery = patchQuery.eq('branch_id', branchId);
      }
      const { data: updated, error: updErr } = await patchQuery
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
    if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
    try {
      const { id } = req.query;

      if (!id) return res.status(400).json({ message: 'Thiếu ID để xoá đơn kính' });

      let existingQuery = supabase
        .from('DonKinh')
        .select('id')
        .eq('id', Number(id))
        .eq('tenant_id', tenantId);
      if (branchId) {
        existingQuery = existingQuery.eq('branch_id', branchId);
      }
      const { data: existing } = await existingQuery.maybeSingle();
      if (!existing) {
        return res.status(404).json({ message: 'Không tìm thấy đơn kính' });
      }

      // === REVERSE INVENTORY before deleting ===
      try {
        await reverseInventory(supabase, tenantId, Number(id));
      } catch (invErr) {
        console.error('⚠️ DELETE reverse inventory error:', invErr);
        // Continue with delete even if reverse fails
      }

      let deleteQuery = supabase.from('DonKinh').delete().eq('id', Number(id)).eq('tenant_id', tenantId);
      if (branchId) {
        deleteQuery = deleteQuery.eq('branch_id', branchId);
      }
      const { error } = await deleteQuery;
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

// === HELPER: Resolve text names to FK IDs ===
async function resolveForeignKeys(
  db: typeof import('../../../lib/tenantApi').supabaseAdmin,
  tenantId: string,
  branchId: string | null,
  fields: { hangtrong_mp: string; hangtrong_mt: string; ten_gong: string }
) {
  const result: { hang_trong_mp_id: number | null; hang_trong_mt_id: number | null; gong_kinh_id: number | null } = {
    hang_trong_mp_id: null,
    hang_trong_mt_id: null,
    gong_kinh_id: null,
  };

  if (fields.hangtrong_mp) {
    const { data } = await db.from('HangTrong').select('id').eq('tenant_id', tenantId).eq('ten_hang', fields.hangtrong_mp).limit(1).maybeSingle();
    if (data) result.hang_trong_mp_id = data.id;
  }
  if (fields.hangtrong_mt) {
    if (fields.hangtrong_mt === fields.hangtrong_mp && result.hang_trong_mp_id) {
      result.hang_trong_mt_id = result.hang_trong_mp_id;
    } else {
      const { data } = await db.from('HangTrong').select('id').eq('tenant_id', tenantId).eq('ten_hang', fields.hangtrong_mt).limit(1).maybeSingle();
      if (data) result.hang_trong_mt_id = data.id;
    }
  }
  if (fields.ten_gong) {
    let gongQuery = db.from('GongKinh').select('id').eq('tenant_id', tenantId).eq('ten_gong', fields.ten_gong);
    if (branchId) gongQuery = gongQuery.eq('branch_id', branchId);
    const { data } = await gongQuery.limit(1).maybeSingle();
    if (data) result.gong_kinh_id = data.id;
  }
  return result;
}

// === HELPER: Reverse inventory exports for a DonKinh (for UPDATE/DELETE) ===
async function reverseInventory(
  db: typeof import('../../../lib/tenantApi').supabaseAdmin,
  tenantId: string,
  donKinhId: number
) {
  // 1. Reverse lens exports: add back stock
  const { data: lensExports } = await db
    .from('lens_export_sale')
    .select('id, lens_stock_id, so_luong')
    .eq('tenant_id', tenantId)
    .eq('don_kinh_id', donKinhId);

  if (lensExports && lensExports.length > 0) {
    for (const exp of lensExports) {
      // Atomic: cộng lại tồn kho tròng
      await db.rpc('adjust_lens_stock', { p_lens_stock_id: exp.lens_stock_id, p_delta: exp.so_luong });
    }
    // Delete old lens exports for this donkinh
    await db.from('lens_export_sale').delete().eq('tenant_id', tenantId).eq('don_kinh_id', donKinhId);
    console.log(`🔄 Hoàn kho ${lensExports.length} tròng cho đơn #${donKinhId}`);
  }

  // 2. Reverse frame exports: add back stock
  const { data: frameExports } = await db
    .from('frame_export')
    .select('id, gong_kinh_id, so_luong')
    .eq('tenant_id', tenantId)
    .eq('don_kinh_id', donKinhId);

  if (frameExports && frameExports.length > 0) {
    for (const exp of frameExports) {
      // Atomic: cộng lại tồn kho gọng
      await db.rpc('adjust_frame_stock', { p_gong_kinh_id: exp.gong_kinh_id, p_delta: exp.so_luong });
    }
    await db.from('frame_export').delete().eq('tenant_id', tenantId).eq('don_kinh_id', donKinhId);
    console.log(`🔄 Hoàn kho ${frameExports.length} gọng cho đơn #${donKinhId}`);
  }

  // 3. Delete pending lens orders for this donkinh
  await db.from('lens_order').delete().eq('tenant_id', tenantId).eq('don_kinh_id', donKinhId).in('trang_thai', ['cho_dat']);
}

// === HELPER: Process lens & frame inventory after DonKinh creation ===
async function processLensInventory(
  db: typeof import('../../../lib/tenantApi').supabaseAdmin,
  tenantId: string,
  branchId: string | null,
  donKinhId: number,
  fields: {
    sokinh_moi_mp: string;
    hangtrong_mp: string;
    sokinh_moi_mt: string;
    hangtrong_mt: string;
    ten_gong: string;
    gong_kinh_id?: number; // FK ID resolved trước, ưu tiên dùng thay vì tìm bằng tên
    nhom_gia_gong_id?: number; // Nếu bán theo nhóm giá, trừ tồn nhóm thay vì gọng cụ thể
  }
): Promise<{ warnings: string[] }> {
  const warnings: string[] = [];
  console.log(`📦 [Inventory] Bắt đầu xử lý kho cho đơn #${donKinhId}`, JSON.stringify(fields));

  const eyes: Array<{ sokinh: string; hangtrong: string; mat: 'phai' | 'trai'; label: string }> = [
    { sokinh: fields.sokinh_moi_mp, hangtrong: fields.hangtrong_mp, mat: 'phai', label: 'MP' },
    { sokinh: fields.sokinh_moi_mt, hangtrong: fields.hangtrong_mt, mat: 'trai', label: 'MT' },
  ];

  for (const eye of eyes) {
    if (!eye.sokinh || !eye.hangtrong) {
      console.log(`📦 [Inventory] ${eye.label}: Bỏ qua (sokinh="${eye.sokinh}", hangtrong="${eye.hangtrong}")`);
      continue;
    }

    const parsed = parseSoKinh(eye.sokinh);
    if (!parsed) {
      warnings.push(`⚠️ ${eye.label}: Không parse được số kính "${eye.sokinh}" (cần format: SPH/CYLxAXIS, ví dụ: -2.00/-1.50x180)`);
      console.log(`📦 [Inventory] ${eye.label}: parseSoKinh FAILED cho "${eye.sokinh}"`);
      continue;
    }
    console.log(`📦 [Inventory] ${eye.label}: parsed SPH=${parsed.sph} CYL=${parsed.cyl} ADD=${parsed.add_power ?? 'none'} từ "${eye.sokinh}"`);

    // Lookup HangTrong - try with kieu_quan_ly first, fallback to basic
    let ht: { id: number; kieu_quan_ly?: string; nha_cung_cap_id?: number } | null = null;
    const { data: htData, error: htErr } = await db
      .from('HangTrong')
      .select('id, kieu_quan_ly, nha_cung_cap_id')
      .eq('tenant_id', tenantId)
      .eq('ten_hang', eye.hangtrong)
      .limit(1)
      .maybeSingle();

    if (htErr) {
      // Column kieu_quan_ly may not exist - fallback to basic select
      console.log(`📦 [Inventory] ${eye.label}: HangTrong select lỗi (${htErr.message}), thử fallback`);
      const { data: htBasic } = await db
        .from('HangTrong')
        .select('id')
        .eq('tenant_id', tenantId)
        .eq('ten_hang', eye.hangtrong)
        .limit(1)
        .maybeSingle();
      if (htBasic) ht = { id: htBasic.id, kieu_quan_ly: 'SAN_KHO' };
    } else {
      ht = htData;
    }

    if (!ht) {
      warnings.push(`⚠️ ${eye.label}: Không tìm thấy hãng tròng "${eye.hangtrong}" trong danh mục. Chưa xử lý kho.`);
      console.log(`📦 [Inventory] ${eye.label}: HangTrong "${eye.hangtrong}" NOT FOUND`);
      continue;
    }
    console.log(`📦 [Inventory] ${eye.label}: HangTrong id=${ht.id}, kieu_quan_ly=${ht.kieu_quan_ly || 'N/A'}`);

    const kieuQuanLy = ht.kieu_quan_ly || 'SAN_KHO';

    if (kieuQuanLy === 'SAN_KHO') {
      let stockQuery = db
        .from('lens_stock')
        .select('id, ton_hien_tai')
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
        // Đa tròng: phân biệt mắt trái/phải
        stockQuery = stockQuery.eq('mat', eye.mat);
      } else {
        stockQuery = stockQuery.is('add_power', null);
      }
      const { data: stock, error: stockErr } = await stockQuery
        .limit(1)
        .maybeSingle();

      if (stockErr) {
        warnings.push(`⚠️ ${eye.label}: Lỗi truy vấn lens_stock: ${stockErr.message}`);
        console.log(`📦 [Inventory] ${eye.label}: lens_stock query ERROR:`, stockErr.message);
        continue;
      }

      if (stock) {
        const tonTruoc = stock.ton_hien_tai;
        const doInfo = `${parsed.sph}/${parsed.cyl}${parsed.add_power !== undefined ? ` ADD ${parsed.add_power}` : ''}`;
        if (tonTruoc <= 0) {
          warnings.push(`⚠️ ${eye.label}: Tròng ${eye.hangtrong} (${doInfo}) đã HẾT KHO (tồn: ${tonTruoc}). Vẫn xuất kho, tồn sẽ âm.`);
        } else if (tonTruoc <= 2) {
          warnings.push(`⚠️ ${eye.label}: Tròng ${eye.hangtrong} (${doInfo}) SẮP HẾT (tồn: ${tonTruoc})`);
        }

        // Insert export record (for audit trail + trigger may fire)
        const { error: expErr } = await db.from('lens_export_sale').insert({
          tenant_id: tenantId,
          lens_stock_id: stock.id,
          don_kinh_id: donKinhId,
          so_luong: 1,
          mat: eye.mat,
        });

        if (expErr) {
          // Export table insert failed — trừ kho atomic qua RPC
          console.log(`📦 [Inventory] ${eye.label}: lens_export_sale INSERT lỗi (${expErr.message}), trừ kho qua RPC`);
          warnings.push(`⚠️ ${eye.label}: Không ghi được phiếu xuất (${expErr.message}), đã trừ kho trực tiếp.`);
          await db.rpc('adjust_lens_stock', { p_lens_stock_id: stock.id, p_delta: -1 });
        } else {
          // Export inserted OK → trigger đã trừ kho
          console.log(`📦 [Inventory] ${eye.label}: ✅ Đã xuất kho tròng stock#${stock.id} (tồn trước: ${tonTruoc})`);
        }
      } else {
        // Không có tồn kho cho độ này → tạo đơn đặt tròng (lens_order) để hiện trong tab "Tròng cần đặt"
        const doInfo = `${parsed.sph}/${parsed.cyl}${parsed.add_power !== undefined ? ` ADD ${parsed.add_power}` : ''}`;
        console.log(`📦 [Inventory] ${eye.label}: lens_stock NOT FOUND cho HT#${ht.id} SPH=${parsed.sph} CYL=${parsed.cyl} ADD=${parsed.add_power ?? 'null'} → tạo lens_order`);
        const { error: autoOrderErr } = await db.from('lens_order').insert({
          tenant_id: tenantId,
          don_kinh_id: donKinhId,
          hang_trong_id: ht.id,
          so_luong_mieng: 1,
          sph: parsed.sph,
          cyl: parsed.cyl,
          add_power: parsed.add_power ?? null,
          mat: eye.mat,
          nha_cung_cap_id: ht.nha_cung_cap_id || null,
          trang_thai: 'cho_dat',
          ghi_chu: 'Tự động tạo - không có tồn kho cho độ này',
        });
        if (autoOrderErr) {
          warnings.push(`⚠️ ${eye.label}: Không có tồn kho ${eye.hangtrong} (${doInfo}) và lỗi tạo đơn đặt: ${autoOrderErr.message}`);
        } else {
          warnings.push(`📋 ${eye.label}: Tròng ${eye.hangtrong} (${doInfo}) chưa có trong kho → đã chuyển sang Tròng cần đặt`);
        }
      }
    } else if (kieuQuanLy === 'DAT_KHI_CO_KHACH') {
      const { error: orderErr } = await db.from('lens_order').insert({
        tenant_id: tenantId,
        don_kinh_id: donKinhId,
        hang_trong_id: ht.id,
        so_luong_mieng: 1,
        sph: parsed.sph,
        cyl: parsed.cyl,
        add_power: parsed.add_power ?? null,
        mat: eye.mat,
        nha_cung_cap_id: ht.nha_cung_cap_id || null,
        trang_thai: 'cho_dat',
      });
      if (orderErr) {
        warnings.push(`⚠️ ${eye.label}: Lỗi tạo đơn đặt tròng: ${orderErr.message}`);
        console.log(`📦 [Inventory] ${eye.label}: lens_order INSERT ERROR:`, orderErr.message);
      } else {
        warnings.push(`📋 ${eye.label}: Tròng ${eye.hangtrong} cần đặt (ĐẶT KHI CÓ KHÁCH)`);
        console.log(`📋 Tạo đơn đặt tròng ${eye.mat}: HT#${ht.id} SPH=${parsed.sph} CYL=${parsed.cyl} ADD=${parsed.add_power ?? 'null'}`);
      }
    }
  }

  // === Frame export ===
  if (fields.nhom_gia_gong_id) {
    // Bán theo nhóm giá → trừ tồn nhóm, không cần gọng cụ thể
    const { data: nhomGia } = await db
      .from('nhom_gia_gong')
      .select('id, ten_nhom, so_luong_ton')
      .eq('id', fields.nhom_gia_gong_id)
      .eq('tenant_id', tenantId)
      .single();

    if (nhomGia) {
      const tonTruoc = nhomGia.so_luong_ton || 0;
      if (tonTruoc <= 0) {
        warnings.push(`⚠️ Nhóm giá "${nhomGia.ten_nhom}" đã HẾT KHO (tồn: ${tonTruoc}). Vẫn xuất, tồn sẽ âm.`);
      } else if (tonTruoc <= 2) {
        warnings.push(`⚠️ Nhóm giá "${nhomGia.ten_nhom}" SẮP HẾT (tồn: ${tonTruoc})`);
      }
      await db.rpc('adjust_nhom_gia_stock', { p_nhom_id: nhomGia.id, p_delta: -1 });
      console.log(`📦 [Inventory] Nhóm giá: ✅ Đã trừ kho "${nhomGia.ten_nhom}" (tồn trước: ${tonTruoc})`);
    } else {
      warnings.push(`⚠️ Không tìm thấy nhóm giá gọng id=${fields.nhom_gia_gong_id}`);
    }
  } else if (fields.ten_gong || fields.gong_kinh_id) {
    // Ưu tiên dùng gong_kinh_id (FK) thay vì tìm bằng tên để tránh trùng/sai
    let gong: { id: number; ton_kho: number } | null = null;
    let gongErr: any = null;

    if (fields.gong_kinh_id) {
      let gongByIdQuery = db
        .from('GongKinh')
        .select('id, ton_kho')
        .eq('id', fields.gong_kinh_id)
        .eq('tenant_id', tenantId);
      if (branchId) {
        gongByIdQuery = gongByIdQuery.eq('branch_id', branchId);
      }
      const result = await gongByIdQuery.single();
      gong = result.data;
      gongErr = result.error;
    } else {
      // Fallback: tìm bằng tên (backward compat khi chưa có FK)
      let gongByNameQuery = db
        .from('GongKinh')
        .select('id, ton_kho')
        .eq('tenant_id', tenantId)
        .eq('ten_gong', fields.ten_gong);
      if (branchId) {
        gongByNameQuery = gongByNameQuery.eq('branch_id', branchId);
      }
      const result = await gongByNameQuery.limit(1).maybeSingle();
      gong = result.data;
      gongErr = result.error;
    }

    if (gongErr) {
      warnings.push(`⚠️ Lỗi tìm gọng "${fields.ten_gong}": ${gongErr.message}`);
      console.log(`📦 [Inventory] Gọng query ERROR:`, gongErr.message);
    } else if (gong) {
      const tonTruoc = gong.ton_kho || 0;
      if (tonTruoc <= 0) {
        warnings.push(`⚠️ Gọng "${fields.ten_gong}" đã HẾT KHO (tồn: ${tonTruoc}). Vẫn xuất kho, tồn sẽ âm.`);
      } else if (tonTruoc <= 2) {
        warnings.push(`⚠️ Gọng "${fields.ten_gong}" SẮP HẾT (tồn: ${tonTruoc})`);
      }

      // Insert frame export record (trigger sẽ trừ kho tự động)
      const { error: fExpErr } = await db.from('frame_export').insert({
        tenant_id: tenantId,
        gong_kinh_id: gong.id,
        don_kinh_id: donKinhId,
        so_luong: 1,
      });

      if (fExpErr) {
        // Export table failed → trừ kho atomic qua RPC
        console.log(`📦 [Inventory] Gọng: frame_export INSERT lỗi (${fExpErr.message}), trừ kho qua RPC`);
        warnings.push(`⚠️ Gọng: Không ghi được phiếu xuất (${fExpErr.message}), đã trừ kho trực tiếp.`);
        await db.rpc('adjust_frame_stock', { p_gong_kinh_id: gong.id, p_delta: -1 });
      } else {
        console.log(`📦 [Inventory] Gọng: ✅ Đã xuất kho "${fields.ten_gong}" (tồn trước: ${tonTruoc})`);
      }
    } else {
      console.log(`📦 [Inventory] Gọng "${fields.ten_gong}" (id=${fields.gong_kinh_id}) NOT FOUND trong GongKinh`);
    }
  }

  console.log(`📦 [Inventory] Hoàn tất. Warnings: ${warnings.length}`);
  return { warnings };
}
