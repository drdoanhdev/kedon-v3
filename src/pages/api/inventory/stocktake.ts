// API: Kiểm kê kho (thuốc / gọng kính / nhóm giá gọng)
// Thay cho việc sửa tay ton_dau_ky/tonkho — ghi 1 giao dịch 'kiem_ke' minh bạch,
// có thể đối soát qua bảng stock_movement. Tròng kính dùng riêng ở
// PUT /api/inventory/lens-stock (body: { stocktake: true, ... }).
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, requireFeature, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

function parseRpcRow<T = any>(raw: any): T | null {
  if (!raw) return null;
  if (Array.isArray(raw)) return (raw[0] as T) ?? null;
  return raw as T;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId, userId } = ctx;
  const { branchId } = branchAccess;

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const { loai_hang, stock_ref_id, ton_thuc_te, ghi_chu } = req.body as {
      loai_hang: 'thuoc' | 'gong' | 'nhom_gia_gong';
      stock_ref_id: number;
      ton_thuc_te: number;
      ghi_chu?: string;
    };

    if (!['thuoc', 'gong', 'nhom_gia_gong'].includes(loai_hang)) {
      return res.status(400).json({ error: 'loai_hang phải là thuoc, gong hoặc nhom_gia_gong' });
    }

    const featureKey = loai_hang === 'thuoc' ? 'inventory_drug' : 'inventory_lens';
    if (!(await requireFeature(ctx, res, featureKey, 'manage_inventory'))) return;
    const stockRefId = parseInt(String(stock_ref_id), 10);
    const tonThucTe = parseInt(String(ton_thuc_te), 10);
    if (!Number.isFinite(stockRefId) || !Number.isFinite(tonThucTe) || tonThucTe < 0) {
      return res.status(400).json({ error: 'stock_ref_id và ton_thuc_te (>= 0) là bắt buộc' });
    }

    // Xác thực bản ghi thuộc tenant/chi nhánh trước khi kiểm kê
    const tableByLoai: Record<string, { table: string; select: string }> = {
      thuoc: { table: 'Thuoc', select: 'id, branch_id' },
      gong: { table: 'GongKinh', select: 'id, branch_id' },
      nhom_gia_gong: { table: 'nhom_gia_gong', select: 'id' },
    };
    const cfg = tableByLoai[loai_hang];
    let checkQuery = supabase.from(cfg.table).select(cfg.select).eq('id', stockRefId).eq('tenant_id', tenantId);
    if (branchId && loai_hang !== 'nhom_gia_gong') checkQuery = checkQuery.eq('branch_id', branchId);
    const { data: record } = await checkQuery.single();
    if (!record) return res.status(404).json({ error: 'Không tìm thấy bản ghi kho' });

    const { data: rpcData, error: rpcError } = await supabase.rpc('record_stocktake', {
      p_tenant_id: tenantId,
      p_branch_id: (record as any).branch_id || branchId || null,
      p_loai_hang: loai_hang,
      p_stock_ref_id: stockRefId,
      p_ton_thuc_te: tonThucTe,
      p_ghi_chu: ghi_chu || 'Kiểm kê kho',
      p_nguoi_thuc_hien: userId || null,
    });
    if (rpcError) throw rpcError;

    return res.status(200).json({ message: 'Đã ghi nhận kiểm kê', result: parseRpcRow(rpcData) });
  } catch (err: any) {
    console.error('stocktake error:', err);
    return res.status(500).json({ error: err.message });
  }
}
