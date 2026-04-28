// API: Điều chuyển kho giữa chi nhánh (branch_transfers)
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

type TransferCompletionResult = {
  sourceItemId: number;
  destinationItemId: number;
  unitCost: number;
};

const parsePositiveInt = (value: any): number => {
  const n = Number.parseInt(String(value), 10);
  return Number.isFinite(n) && n > 0 ? n : 0;
};

const parseRpcNumber = (raw: any): number | null => {
  if (typeof raw === 'number') return raw;
  if (Array.isArray(raw) && typeof raw[0] === 'number') return raw[0];
  if (Array.isArray(raw) && raw[0] && typeof raw[0] === 'object') {
    const firstVal = Object.values(raw[0])[0];
    return typeof firstVal === 'number' ? firstVal : null;
  }
  return null;
};

function buildLensDestinationQuery(transfer: any, srcStock: any) {
  let query = supabase
    .from('lens_stock')
    .select('id')
    .eq('tenant_id', transfer.tenant_id)
    .eq('branch_id', transfer.to_branch_id)
    .eq('hang_trong_id', srcStock.hang_trong_id)
    .eq('sph', srcStock.sph)
    .eq('cyl', srcStock.cyl);

  if (srcStock.add_power === null || srcStock.add_power === undefined) query = query.is('add_power', null);
  else query = query.eq('add_power', srcStock.add_power);

  if (srcStock.mat === null || srcStock.mat === undefined) query = query.is('mat', null);
  else query = query.eq('mat', srcStock.mat);

  return query;
}

async function validateSourceAvailability(tenantId: string, fromBranchId: string, loai: string, itemId: number, soLuong: number) {
  if (loai === 'vat_tu') return;

  if (loai === 'lens') {
    const { data, error } = await supabase
      .from('lens_stock')
      .select('id, ton_hien_tai')
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .eq('branch_id', fromBranchId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Không tìm thấy tồn kho tròng ở chi nhánh gửi');
    if ((data.ton_hien_tai ?? 0) < soLuong) throw new Error('Tồn kho tròng ở chi nhánh gửi không đủ');
    return;
  }

  if (loai === 'thuoc') {
    const { data, error } = await supabase
      .from('Thuoc')
      .select('id, tonkho')
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .eq('branch_id', fromBranchId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Không tìm thấy thuốc ở chi nhánh gửi');
    if ((data.tonkho ?? 0) < soLuong) throw new Error('Tồn kho thuốc ở chi nhánh gửi không đủ');
    return;
  }

  if (loai === 'gong') {
    const { data, error } = await supabase
      .from('GongKinh')
      .select('id, ton_kho')
      .eq('id', itemId)
      .eq('tenant_id', tenantId)
      .eq('branch_id', fromBranchId)
      .maybeSingle();

    if (error) throw error;
    if (!data) throw new Error('Không tìm thấy gọng ở chi nhánh gửi');
    if ((data.ton_kho ?? 0) < soLuong) throw new Error('Tồn kho gọng ở chi nhánh gửi không đủ');
    return;
  }

  throw new Error('Loại hàng chưa được hỗ trợ điều chuyển');
}

async function recordInventoryTransferLog(transfer: any, result: TransferCompletionResult) {
  const { error } = await supabase
    .from('branch_transfer_inventory_logs')
    .insert({
      transfer_id: transfer.id,
      tenant_id: transfer.tenant_id,
      loai: transfer.loai,
      from_branch_id: transfer.from_branch_id,
      to_branch_id: transfer.to_branch_id,
      source_item_id: result.sourceItemId,
      destination_item_id: result.destinationItemId,
      so_luong: transfer.so_luong,
      don_gia: result.unitCost,
      ten_san_pham: transfer.ten_san_pham || null,
      ghi_chu: transfer.ghi_chu || null,
    });

  // Backward-compatible: ignore when V050 log table is not deployed yet.
  if (error && error.code !== '42P01') {
    console.warn('branch transfer audit log warning:', error.message);
  }
}

async function completeLensTransfer(tenantId: string, transfer: any, itemId: number, soLuong: number): Promise<TransferCompletionResult> {
  const { data: srcStock, error: srcErr } = await supabase
    .from('lens_stock')
    .select('id, hang_trong_id, sph, cyl, add_power, mat, ton_hien_tai, muc_ton_can_co')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .eq('branch_id', transfer.from_branch_id)
    .maybeSingle();

  if (srcErr) throw srcErr;
  if (!srcStock) throw new Error('Không tìm thấy tồn kho tròng ở chi nhánh gửi');
  if ((srcStock.ton_hien_tai ?? 0) < soLuong) throw new Error('Tồn kho tròng ở chi nhánh gửi không đủ');

  const { data: deductedRaw, error: deductErr } = await supabase.rpc('adjust_lens_stock', {
    p_lens_stock_id: itemId,
    p_delta: -soLuong,
  });

  if (deductErr) throw deductErr;
  const deductedTon = parseRpcNumber(deductedRaw);
  if (typeof deductedTon === 'number' && deductedTon < 0) {
    await supabase.rpc('adjust_lens_stock', { p_lens_stock_id: itemId, p_delta: soLuong });
    throw new Error('Điều chuyển bị từ chối vì tồn kho tròng không đủ');
  }

  const destQuery = buildLensDestinationQuery({ ...transfer, tenant_id: tenantId }, srcStock);

  const { data: destStock, error: destErr } = await destQuery.maybeSingle();
  if (destErr) {
    await supabase.rpc('adjust_lens_stock', { p_lens_stock_id: itemId, p_delta: soLuong });
    throw destErr;
  }

  if (destStock) {
    const { error: addDestErr } = await supabase.rpc('adjust_lens_stock', {
      p_lens_stock_id: destStock.id,
      p_delta: soLuong,
    });
    if (addDestErr) {
      await supabase.rpc('adjust_lens_stock', { p_lens_stock_id: itemId, p_delta: soLuong });
      throw addDestErr;
    }
    return {
      sourceItemId: itemId,
      destinationItemId: Number(destStock.id),
      unitCost: Math.max(0, Math.round(Number(transfer.don_gia) || 0)),
    };
  }

  const { data: insertedDest, error: insertDestErr } = await supabase
    .from('lens_stock')
    .insert({
      tenant_id: tenantId,
      branch_id: transfer.to_branch_id,
      hang_trong_id: srcStock.hang_trong_id,
      sph: srcStock.sph,
      cyl: srcStock.cyl,
      add_power: srcStock.add_power,
      mat: srcStock.mat,
      ton_dau_ky: 0,
      ton_hien_tai: soLuong,
      muc_ton_can_co: srcStock.muc_ton_can_co ?? 10,
    })
    .select('id')
    .single();

  if (insertDestErr) {
    // Handle race-condition insert conflicts by re-reading destination row and incrementing it.
    if (insertDestErr.code === '23505' && typeof insertDestErr.message === 'string' && insertDestErr.message.includes('lens_stock_unique_combo')) {
      const { data: retriedDest } = await buildLensDestinationQuery({ ...transfer, tenant_id: tenantId }, srcStock).maybeSingle();
      if (retriedDest?.id) {
        const { error: addRetriedErr } = await supabase.rpc('adjust_lens_stock', {
          p_lens_stock_id: retriedDest.id,
          p_delta: soLuong,
        });
        if (addRetriedErr) {
          await supabase.rpc('adjust_lens_stock', { p_lens_stock_id: itemId, p_delta: soLuong });
          throw addRetriedErr;
        }
        return {
          sourceItemId: itemId,
          destinationItemId: Number(retriedDest.id),
          unitCost: Math.max(0, Math.round(Number(transfer.don_gia) || 0)),
        };
      }

      await supabase.rpc('adjust_lens_stock', { p_lens_stock_id: itemId, p_delta: soLuong });
      throw new Error('Schema lens_stock hiện chưa hỗ trợ unique theo chi nhánh. Vui lòng chạy migration V051_fix_lens_stock_unique_per_branch.sql');
    }

    await supabase.rpc('adjust_lens_stock', { p_lens_stock_id: itemId, p_delta: soLuong });
    throw insertDestErr;
  }

  return {
    sourceItemId: itemId,
    destinationItemId: Number(insertedDest.id),
    unitCost: Math.max(0, Math.round(Number(transfer.don_gia) || 0)),
  };
}

async function completeThuocTransfer(tenantId: string, transfer: any, itemId: number, soLuong: number): Promise<TransferCompletionResult> {
  const { data: srcThuoc, error: srcErr } = await supabase
    .from('Thuoc')
    .select('*')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .eq('branch_id', transfer.from_branch_id)
    .maybeSingle();

  if (srcErr) throw srcErr;
  if (!srcThuoc) throw new Error('Không tìm thấy thuốc ở chi nhánh gửi');

  const srcTon = srcThuoc.tonkho ?? 0;
  if (srcTon < soLuong) throw new Error('Tồn kho thuốc ở chi nhánh gửi không đủ');

  const { error: deductErr } = await supabase
    .from('Thuoc')
    .update({ tonkho: srcTon - soLuong })
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .eq('branch_id', transfer.from_branch_id);

  if (deductErr) throw deductErr;

  let destQuery = supabase
    .from('Thuoc')
    .select('id, tonkho')
    .eq('tenant_id', tenantId)
    .eq('branch_id', transfer.to_branch_id);

  if (srcThuoc.mathuoc) {
    destQuery = destQuery.eq('mathuoc', srcThuoc.mathuoc);
  } else {
    destQuery = destQuery.eq('tenthuoc', srcThuoc.tenthuoc || '').eq('donvitinh', srcThuoc.donvitinh || '');
  }

  const { data: destThuoc, error: destErr } = await destQuery.maybeSingle();

  if (destErr) {
    await supabase.from('Thuoc').update({ tonkho: srcTon }).eq('id', itemId).eq('tenant_id', tenantId);
    throw destErr;
  }

  if (destThuoc) {
    const { error: addErr } = await supabase
      .from('Thuoc')
      .update({ tonkho: (destThuoc.tonkho ?? 0) + soLuong })
      .eq('id', destThuoc.id)
      .eq('tenant_id', tenantId)
      .eq('branch_id', transfer.to_branch_id);

    if (addErr) {
      await supabase.from('Thuoc').update({ tonkho: srcTon }).eq('id', itemId).eq('tenant_id', tenantId);
      throw addErr;
    }
    return {
      sourceItemId: itemId,
      destinationItemId: Number(destThuoc.id),
      unitCost: Math.max(0, Math.round(Number(transfer.don_gia) || Number(srcThuoc.gianhap) || 0)),
    };
  }

  const { id, tenant_id, branch_id, tonkho, ...clone } = srcThuoc;
  const { data: insertedDest, error: insertErr } = await supabase
    .from('Thuoc')
    .insert({
      ...clone,
      tenant_id: tenantId,
      branch_id: transfer.to_branch_id,
      tonkho: soLuong,
    })
    .select('id')
    .single();

  if (insertErr) {
    await supabase.from('Thuoc').update({ tonkho: srcTon }).eq('id', itemId).eq('tenant_id', tenantId);
    throw insertErr;
  }

  return {
    sourceItemId: itemId,
    destinationItemId: Number(insertedDest.id),
    unitCost: Math.max(0, Math.round(Number(transfer.don_gia) || Number(srcThuoc.gianhap) || 0)),
  };
}

async function completeGongTransfer(tenantId: string, transfer: any, itemId: number, soLuong: number): Promise<TransferCompletionResult> {
  const { data: srcGong, error: srcErr } = await supabase
    .from('GongKinh')
    .select('*')
    .eq('id', itemId)
    .eq('tenant_id', tenantId)
    .eq('branch_id', transfer.from_branch_id)
    .maybeSingle();

  if (srcErr) throw srcErr;
  if (!srcGong) throw new Error('Không tìm thấy gọng ở chi nhánh gửi');

  const srcTon = srcGong.ton_kho ?? 0;
  if (srcTon < soLuong) throw new Error('Tồn kho gọng ở chi nhánh gửi không đủ');

  const { data: deductedRaw, error: deductErr } = await supabase.rpc('adjust_frame_stock', {
    p_gong_kinh_id: itemId,
    p_delta: -soLuong,
  });

  if (deductErr) throw deductErr;
  const deductedTon = parseRpcNumber(deductedRaw);
  if (typeof deductedTon === 'number' && deductedTon < 0) {
    await supabase.rpc('adjust_frame_stock', { p_gong_kinh_id: itemId, p_delta: soLuong });
    throw new Error('Điều chuyển bị từ chối vì tồn kho gọng không đủ');
  }

  let destQuery = supabase
    .from('GongKinh')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('branch_id', transfer.to_branch_id);

  if (srcGong.ma_gong) destQuery = destQuery.eq('ma_gong', srcGong.ma_gong);
  else {
    destQuery = destQuery.eq('ten_gong', srcGong.ten_gong || '');
    if (srcGong.mau_sac === null || srcGong.mau_sac === undefined) destQuery = destQuery.is('mau_sac', null);
    else destQuery = destQuery.eq('mau_sac', srcGong.mau_sac);
  }

  const { data: destGong, error: destErr } = await destQuery.maybeSingle();
  if (destErr) {
    await supabase.rpc('adjust_frame_stock', { p_gong_kinh_id: itemId, p_delta: soLuong });
    throw destErr;
  }

  if (destGong) {
    const { error: addErr } = await supabase.rpc('adjust_frame_stock', {
      p_gong_kinh_id: destGong.id,
      p_delta: soLuong,
    });
    if (addErr) {
      await supabase.rpc('adjust_frame_stock', { p_gong_kinh_id: itemId, p_delta: soLuong });
      throw addErr;
    }
    return {
      sourceItemId: itemId,
      destinationItemId: Number(destGong.id),
      unitCost: Math.max(0, Math.round(Number(transfer.don_gia) || Number(srcGong.gia_nhap) || 0)),
    };
  }

  const { id, tenant_id, branch_id, ton_kho, ...clone } = srcGong;
  const { data: insertedDest, error: insertErr } = await supabase
    .from('GongKinh')
    .insert({
      ...clone,
      tenant_id: tenantId,
      branch_id: transfer.to_branch_id,
      ton_kho: soLuong,
    })
    .select('id')
    .single();

  if (insertErr) {
    await supabase.rpc('adjust_frame_stock', { p_gong_kinh_id: itemId, p_delta: soLuong });
    throw insertErr;
  }

  return {
    sourceItemId: itemId,
    destinationItemId: Number(insertedDest.id),
    unitCost: Math.max(0, Math.round(Number(transfer.don_gia) || Number(srcGong.gia_nhap) || 0)),
  };
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'branch_transfer', 'manage_inventory'))) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId, userId } = ctx;
  const { branchId } = branchAccess;
  const isAdminRole = ctx.role === 'owner' || ctx.role === 'admin';

  try {
    // GET: Lấy danh sách phiếu điều chuyển
    if (req.method === 'GET') {
      const { status, from_branch_id, to_branch_id, loai, page = '1', limit = '50' } = req.query;
      const pageNum = Math.max(1, parseInt(page as string));
      const limitNum = Math.min(100, parseInt(limit as string));
      const offset = (pageNum - 1) * limitNum;

      let query = supabase
        .from('branch_transfers')
        .select(`
          *,
          from_branch:branches!branch_transfers_from_branch_id_fkey(id, ten_chi_nhanh),
          to_branch:branches!branch_transfers_to_branch_id_fkey(id, ten_chi_nhanh)
        `, { count: 'exact' })
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .range(offset, offset + limitNum - 1);

      if (status) query = query.eq('status', status);
      if (from_branch_id) query = query.eq('from_branch_id', from_branch_id);
      if (to_branch_id) query = query.eq('to_branch_id', to_branch_id);
      if (loai) query = query.eq('loai', loai);
      if (branchId) query = query.or(`from_branch_id.eq.${branchId},to_branch_id.eq.${branchId}`);

      const { data, error, count } = await query;
      if (error) throw error;
      return res.status(200).json({ data: data || [], total: count || 0, page: pageNum, limit: limitNum });
    }

    // POST: Tạo phiếu điều chuyển mới
    if (req.method === 'POST') {
      const { from_branch_id, to_branch_id, loai, item_id, ten_san_pham, so_luong, don_gia, ghi_chu } = req.body;
      const itemId = Number.parseInt(String(item_id), 10);
      const soLuong = parsePositiveInt(so_luong);

      if (!from_branch_id || !to_branch_id || !loai || !item_id || !so_luong || Number.isNaN(itemId)) {
        return res.status(400).json({ error: 'Thiếu thông tin: from_branch_id, to_branch_id, loai, item_id, so_luong' });
      }

      if (from_branch_id === to_branch_id) {
        return res.status(400).json({ error: 'Chi nhánh gửi và nhận phải khác nhau' });
      }

      if (soLuong <= 0) {
        return res.status(400).json({ error: 'Số lượng phải lớn hơn 0' });
      }

      if (branchId && !isAdminRole && from_branch_id !== branchId) {
        return res.status(403).json({ error: 'Bạn chỉ được tạo phiếu xuất từ chi nhánh đang được phân công' });
      }

      // Kiểm tra 2 branch thuộc cùng tenant
      const { data: branches } = await supabase
        .from('branches')
        .select('id')
        .eq('tenant_id', tenantId)
        .in('id', [from_branch_id, to_branch_id]);

      if (!branches || branches.length !== 2) {
        return res.status(400).json({ error: 'Chi nhánh không hợp lệ' });
      }

      try {
        await validateSourceAvailability(tenantId, from_branch_id, loai, itemId, soLuong);
      } catch (e: any) {
        return res.status(400).json({ error: e?.message || 'Không thể tạo phiếu do tồn kho nguồn không hợp lệ' });
      }

      const { data, error } = await supabase
        .from('branch_transfers')
        .insert({
          tenant_id: tenantId,
          from_branch_id,
          to_branch_id,
          loai,
          item_id: String(itemId),
          ten_san_pham: ten_san_pham || null,
          so_luong: soLuong,
          don_gia: don_gia ? parseInt(don_gia) : 0,
          ghi_chu: ghi_chu || null,
          status: 'pending',
          nguoi_tao: userId,
        })
        .select(`
          *,
          from_branch:branches!branch_transfers_from_branch_id_fkey(id, ten_chi_nhanh),
          to_branch:branches!branch_transfers_to_branch_id_fkey(id, ten_chi_nhanh)
        `)
        .single();

      if (error) throw error;
      return res.status(201).json(data);
    }

    // PUT: Duyệt / Từ chối / Hoàn thành phiếu điều chuyển
    if (req.method === 'PUT') {
      const { id, action } = req.body; // action: 'approve' | 'reject' | 'complete' | 'cancel'

      if (!id || !action) {
        return res.status(400).json({ error: 'Thiếu id và action' });
      }

      // Lấy phiếu hiện tại
      const { data: transfer } = await supabase
        .from('branch_transfers')
        .select('*')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .maybeSingle();

      if (!transfer) return res.status(404).json({ error: 'Không tìm thấy phiếu điều chuyển' });
      if (branchId && !isAdminRole && transfer.from_branch_id !== branchId && transfer.to_branch_id !== branchId) {
        return res.status(403).json({ error: 'Bạn không có quyền xử lý phiếu điều chuyển này' });
      }

      // Validate state transitions
      const validTransitions: Record<string, string[]> = {
        pending: ['approved', 'rejected', 'cancelled'],
        approved: ['completed', 'cancelled'],
      };

      const newStatusMap: Record<string, string> = {
        approve: 'approved',
        reject: 'rejected',
        complete: 'completed',
        cancel: 'cancelled',
      };

      const newStatus = newStatusMap[action];
      if (!newStatus) return res.status(400).json({ error: 'Action không hợp lệ' });

      const allowed = validTransitions[transfer.status];
      if (!allowed || !allowed.includes(newStatus)) {
        return res.status(400).json({ error: `Không thể chuyển từ ${transfer.status} sang ${newStatus}` });
      }

      // Khi hoàn thành: chốt trạng thái trước để tránh đã trừ/cộng kho nhưng fail update status
      if (newStatus === 'completed') {
        const completedAt = new Date().toISOString();
        const itemId = Number.parseInt(String(transfer.item_id), 10);
        const soLuong = parsePositiveInt(transfer.so_luong);
        if (Number.isNaN(itemId) || soLuong <= 0) {
          return res.status(400).json({ error: 'Phiếu điều chuyển có dữ liệu item/so_luong không hợp lệ' });
        }

        const { data: completedTransfer, error: completeErr } = await supabase
          .from('branch_transfers')
          .update({
            status: 'completed',
            nguoi_duyet: userId,
            completed_at: completedAt,
          })
          .eq('id', id)
          .eq('tenant_id', tenantId)
          .eq('status', transfer.status)
          .select(`
            *,
            from_branch:branches!branch_transfers_from_branch_id_fkey(id, ten_chi_nhanh),
            to_branch:branches!branch_transfers_to_branch_id_fkey(id, ten_chi_nhanh)
          `)
          .maybeSingle();

        if (completeErr) throw completeErr;
        if (!completedTransfer) {
          return res.status(409).json({ error: 'Phiếu đã được xử lý bởi yêu cầu khác, vui lòng tải lại' });
        }

        try {
          let completionResult: TransferCompletionResult | null = null;

          if (transfer.loai === 'lens') completionResult = await completeLensTransfer(tenantId, transfer, itemId, soLuong);
          else if (transfer.loai === 'thuoc') completionResult = await completeThuocTransfer(tenantId, transfer, itemId, soLuong);
          else if (transfer.loai === 'gong') completionResult = await completeGongTransfer(tenantId, transfer, itemId, soLuong);
          else if (transfer.loai === 'vat_tu') {
            // Vat tu currently does not mutate inventory tables.
          } else {
            throw new Error('Loại hàng chưa được hỗ trợ hoàn thành điều chuyển');
          }

          if (completionResult) {
            await recordInventoryTransferLog(transfer, completionResult);
          }
        } catch (stockErr: any) {
          const { error: rollbackStatusErr } = await supabase
            .from('branch_transfers')
            .update({ status: 'approved', completed_at: null })
            .eq('id', id)
            .eq('tenant_id', tenantId)
            .eq('status', 'completed');

          if (rollbackStatusErr) {
            throw new Error(`Cập nhật kho thất bại và không thể rollback trạng thái phiếu: ${rollbackStatusErr.message}`);
          }
          throw stockErr;
        }

        return res.status(200).json(completedTransfer);
      }

      const { data, error } = await supabase
        .from('branch_transfers')
        .update({
          status: newStatus,
          nguoi_duyet: userId,
        })
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .eq('status', transfer.status)
        .select(`
          *,
          from_branch:branches!branch_transfers_from_branch_id_fkey(id, ten_chi_nhanh),
          to_branch:branches!branch_transfers_to_branch_id_fkey(id, ten_chi_nhanh)
        `)
        .maybeSingle();

      if (error) throw error;
      if (!data) {
        return res.status(409).json({ error: 'Phiếu đã được xử lý bởi yêu cầu khác, vui lòng tải lại' });
      }
      return res.status(200).json(data);
    }

    return res.status(405).json({ error: 'Method not allowed' });
  } catch (err: any) {
    console.error('branch-transfers API error:', err);
    return res.status(500).json({ error: err.message || 'Lỗi server' });
  }
}
