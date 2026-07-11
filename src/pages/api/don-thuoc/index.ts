//src/pages/api/don-thuoc/index.ts L1
import { NextApiRequest, NextApiResponse } from "next";
import { requireTenant, resolveBranchAccess, checkTrialLimit, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { requirePermission, userHasPermission } from '../../../lib/permissions';
import { withDebtFields, calcDebt } from '../../../lib/debt';

// === INVENTORY HELPERS ===

/** Xuất kho thuốc khi tạo/sửa đơn thuốc. Trừ tonkho qua trigger thuoc_xuat_don. */
async function processThuocInventory(
  tenantId: string,
  donThuocId: number,
  thuocs: { id: number; soluong: number }[]
): Promise<string[]> {
  const warnings: string[] = [];
  if (thuocs.length === 0) return warnings;

  const thuocIds = [...new Set(thuocs.map((t) => t.id))];
  const { data: thuocRows, error: fetchErr } = await supabase
    .from('Thuoc')
    .select('id, tonkho, tenthuoc, la_thu_thuat')
    .in('id', thuocIds)
    .eq('tenant_id', tenantId);

  if (fetchErr) {
    warnings.push(`Lỗi lấy tồn kho thuốc: ${fetchErr.message}`);
    return warnings;
  }

  const thuocMap = new Map((thuocRows || []).map((row) => [row.id, row]));
  const exportRows: { tenant_id: string; don_thuoc_id: number; thuoc_id: number; so_luong: number }[] = [];

  for (const t of thuocs) {
    const thuoc = thuocMap.get(t.id);
    if (thuoc?.la_thu_thuat) continue;

    const tonTruoc = thuoc?.tonkho ?? 0;
    const label = thuoc?.tenthuoc || `#${t.id}`;
    if (tonTruoc <= 0) {
      warnings.push(`⚠️ ${label}: HẾT KHO (tồn: ${tonTruoc}). Vẫn xuất kho, tồn sẽ âm.`);
    } else if (tonTruoc < t.soluong) {
      warnings.push(`⚠️ ${label}: Không đủ tồn (cần ${t.soluong}, tồn ${tonTruoc}). Vẫn xuất kho.`);
    }

    exportRows.push({
      tenant_id: tenantId,
      don_thuoc_id: donThuocId,
      thuoc_id: t.id,
      so_luong: t.soluong,
    });
  }

  if (exportRows.length === 0) return warnings;

  const { error: bulkErr } = await supabase.from('thuoc_xuat_don').insert(exportRows);
  if (bulkErr) {
    // Bảng chưa tồn tại hoặc lỗi bulk → trừ kho trực tiếp từng dòng qua RPC atomic
    // (adjust_thuoc_stock khóa hàng + ghi sổ kho, tránh race-condition so với
    // pattern đọc-rồi-ghi thủ công trước đây).
    await Promise.all(exportRows.map((row) =>
      supabase.rpc('adjust_thuoc_stock', {
        p_thuoc_id: row.thuoc_id,
        p_delta: -row.so_luong,
        p_ref_type: 'don_thuoc_fallback',
        p_ref_id: donThuocId,
      })
    ));
  }

  return warnings;
}

/** Hoàn kho thuốc khi sửa/xóa đơn thuốc. Cộng lại tonkho qua RPC atomic (không đọc-rồi-ghi thủ công). */
async function reverseThuocInventory(tenantId: string, donThuocId: number) {
  const { data: exports } = await supabase
    .from('thuoc_xuat_don')
    .select('id, thuoc_id, so_luong')
    .eq('tenant_id', tenantId)
    .eq('don_thuoc_id', donThuocId);

  if (exports && exports.length > 0) {
    const restoreByThuoc = new Map<number, number>();
    for (const exp of exports) {
      restoreByThuoc.set(exp.thuoc_id, (restoreByThuoc.get(exp.thuoc_id) || 0) + exp.so_luong);
    }

    await Promise.all([...restoreByThuoc.entries()].map(([thuocId, addQty]) =>
      supabase.rpc('adjust_thuoc_stock', {
        p_thuoc_id: thuocId,
        p_delta: addQty,
        p_ref_type: 'don_thuoc_reverse',
        p_ref_id: donThuocId,
      })
    ));

    await supabase.from('thuoc_xuat_don').delete()
      .eq('tenant_id', tenantId).eq('don_thuoc_id', donThuocId);
  }
}

type ThuocInput = {
  id: number;
  soluong: number;
  giaban: number;
  giavon?: number;
  gia_nguon?: string;
  donvitinh: string; // Chỉ để hiển thị, không lưu vào DB
  cachdung: string;
};

let chiTietPriceSnapshotSupported: boolean | null = null;

async function supportsChiTietPriceSnapshotColumns(): Promise<boolean> {
  if (chiTietPriceSnapshotSupported !== null) return chiTietPriceSnapshotSupported;

  const { error } = await supabase
    .from('ChiTietDonThuoc')
    .select('don_gia_ban, don_gia_von')
    .limit(1);

  if (!error) {
    chiTietPriceSnapshotSupported = true;
    return true;
  }

  // Backward-compatible with DBs chưa chạy V049
  if (error.code === '42703') {
    chiTietPriceSnapshotSupported = false;
    return false;
  }

  // Unknown errors: keep feature enabled and let insert fail explicitly if any.
  chiTietPriceSnapshotSupported = true;
  return true;
}

function normalizeMoney(v: unknown): number {
  return Math.max(0, Math.round(Number(v) || 0));
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
  const canViewRevenue = await userHasPermission(ctx, 'view_revenue');

  const sanitizeRevenueFields = <T extends Record<string, unknown> | null>(row: T): T => {
    if (!row || canViewRevenue) return row;
    const cloned = { ...(row as Record<string, unknown>) };
    delete (cloned as { lai?: unknown }).lai;
    return cloned as T;
  };

  if (req.method === "GET") {
    try {
      const { benhnhanid, search, filterDate, filterNo } = req.query;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 1000; // Default to larger pageSize for don-thuoc
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from("DonThuoc")
        .select(`
          id,
          madonthuoc,
          chandoan,
            ngay_kham,
          tongtien,
          no,
          sotien_da_thanh_toan,
          lai,
          trangthai_thanh_toan,
          benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi),
          branch:branches(id, ten_chi_nhanh)
        `, { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("ngay_kham", { ascending: false });

      // Branch filter (enterprise multi-branch)
      // Khi xem lịch sử của 1 bệnh nhân cụ thể -> bỏ filter branch để hiện lịch sử khám CROSS-BRANCH
      // (bệnh nhân có thể từng khám ở nhiều chi nhánh khác nhau).
      // Trường hợp list chung (không có benhnhanid) vẫn áp branch filter cho NV.
      if (branchId && !benhnhanid) {
        query = query.eq("branch_id", branchId);
      }

      if (benhnhanid) {
        query = query.eq("benhnhanid", benhnhanid as string);
        // Giới hạn số lượng đơn cũ để tránh quá tải (50 đơn gần nhất)
        const limit = parseInt(req.query.limit as string) || 50;
        const { data, error } = await query.limit(limit);
        if (error) {
          return res.status(400).json({ message: "Lỗi khi lấy đơn thuốc", error: error.message });
        }
        const processedData = Array.isArray(data)
          ? data.map((item) => sanitizeRevenueFields(withDebtFields(item) as Record<string, unknown>))
          : data ? sanitizeRevenueFields(withDebtFields(data as any) as Record<string, unknown>) : data;
        return res.status(200).json({ data: processedData });
      } else {
        // Áp dụng filter ngay trong Supabase query (tối ưu hơn)
        
        // Date filter - filter trực tiếp trong DB
        if (filterDate) {
          const nextDay = new Date(filterDate as string);
          nextDay.setDate(nextDay.getDate() + 1);
          query = query.gte('ngay_kham', filterDate as string)
                       .lt('ngay_kham', nextDay.toISOString().split('T')[0]);
        }
        
        // Search filter - KHÔNG thể filter trong query vì cần check nested benhnhan
        // Debt filter - KHÔNG thể filter trong query vì cần tính toán
        const needsMemoryFilter = !!(search || filterNo);
        
        if (needsMemoryFilter) {
          // Chỉ fetch khi cần filter phức tạp
          // Fetch theo chunks để tránh giới hạn 1000
          let allData: any[] = [];
          let currentFrom = 0;
          const chunkSize = 1000;
          
          // Fetch data theo chunks
          while (true) {
            const { data: chunk, error } = await query
              .range(currentFrom, currentFrom + chunkSize - 1);
            
            if (error) {
              return res.status(400).json({ message: "Lỗi khi lấy đơn thuốc", error: error.message });
            }
            
            if (!chunk || chunk.length === 0) break;
            
            allData = allData.concat(chunk);
            
            // Nếu chunk < chunkSize thì đã hết data
            if (chunk.length < chunkSize) break;
            
            currentFrom += chunkSize;
            
            // Giới hạn an toàn: tối đa 50k records
            if (allData.length >= 50000) break;
          }
          
          // Filter trong memory
          let filteredData = allData.filter((dt: any) => {
            // Search filter
            if (search) {
              const searchLower = (search as string).toLowerCase();
              const matchesSearch =
                (dt.benhnhan?.ten && dt.benhnhan.ten.toLowerCase().includes(searchLower)) ||
                (dt.benhnhan?.id && dt.benhnhan.id.toString().includes(searchLower)) ||
                (dt.benhnhan?.dienthoai && dt.benhnhan.dienthoai.includes(searchLower)) ||
                (dt.benhnhan?.diachi && dt.benhnhan.diachi.toLowerCase().includes(searchLower));
              if (!matchesSearch) return false;
            }
            
            // Debt filter
            if (filterNo === 'true') {
              const remaining = dt.tongtien - (dt.sotien_da_thanh_toan || 0);
              if (remaining <= 0) return false;
            }
            
            return true;
          });
          
          const finalCount = filteredData.length;
          // Phân trang sau khi filter
          const paginatedData = filteredData.slice(from, to + 1);
          
          const processedData = paginatedData.map((item) => sanitizeRevenueFields(withDebtFields(item) as Record<string, unknown>));
          return res.status(200).json({ data: processedData, total: finalCount });
        } else {
          // Không có search/filterNo - phân trang bình thường (nhanh)
          const { data, error, count } = await query.range(from, to);
          if (error) {
            return res.status(400).json({ message: "Lỗi khi lấy đơn thuốc", error: error.message });
          }
          const processedData = (data || []).map((item) => sanitizeRevenueFields(withDebtFields(item) as Record<string, unknown>));
          return res.status(200).json({ data: processedData, total: count ?? 0 });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "POST") {
    // RBAC: chỉ user có write_prescription mới được tạo đơn (V054).
    if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
    // Kiểm tra giới hạn trial trước khi tạo đơn mới
    if (!(await checkTrialLimit(ctx, res))) return;
    try {
      const { benhnhanid, chandoan, ngay_kham, thuocs, sotien_da_thanh_toan } = req.body;

      if (!benhnhanid || !chandoan || !thuocs || (thuocs as ThuocInput[]).length === 0) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }

      for (const t of thuocs as ThuocInput[]) {
        if (!t.id || !Number.isInteger(t.soluong) || t.soluong <= 0) {
          return res.status(400).json({ message: "Dữ liệu thuốc không hợp lệ", details: `thuocid: ${t.id}, soluong: ${t.soluong}` });
        }
        if (!Number.isFinite(Number(t.giaban)) || Number(t.giaban) < 0) {
          return res.status(400).json({ message: "Đơn giá bán không hợp lệ", details: `thuocid: ${t.id}, giaban: ${t.giaban}` });
        }
        if (t.giavon !== undefined && (!Number.isFinite(Number(t.giavon)) || Number(t.giavon) < 0)) {
          return res.status(400).json({ message: "Đơn giá vốn không hợp lệ", details: `thuocid: ${t.id}, giavon: ${t.giavon}` });
        }
      }

  const tongtien = (thuocs as ThuocInput[]).reduce((sum, t) => sum + t.soluong * normalizeMoney(t.giaban), 0);
  // Clamp số tiền đã thanh toán vào [0, tongtien] để tránh lớn hơn tổng tiền khi sửa đơn
  const paidRounded = Math.max(0, Math.min(Math.round((sotien_da_thanh_toan as number) || 0), tongtien));
  const no = paidRounded < tongtien;
      const trangthai_thanh_toan = paidRounded === 0 && tongtien > 0 ? 'nợ' : (paidRounded >= tongtien ? 'đã trả' : 'nợ');

      const thuocIds = (thuocs as ThuocInput[]).map(t => t.id);
      const { data: thuocDetails, error: thuocDetailsError } = await supabase
        .from('Thuoc')
        .select('id, gianhap, cachdung, donvitinh')
        .in('id', thuocIds);

      if (thuocDetailsError || !thuocDetails) {
        return res.status(400).json({ message: 'Lỗi khi lấy thông tin thuốc', error: thuocDetailsError?.message });
      }
      const gianhapMap = new Map(thuocDetails.map(t => [t.id, (t as { gianhap?: number }).gianhap || 0]));
      const lineCostMap = new Map((thuocs as ThuocInput[]).map(t => [t.id, normalizeMoney(t.giavon ?? gianhapMap.get(t.id) ?? 0)]));
      const lai = (thuocs as ThuocInput[]).reduce((sum, t) => {
        const lineSell = normalizeMoney(t.giaban);
        const lineCost = lineCostMap.get(t.id) || 0;
        return sum + t.soluong * (lineSell - lineCost);
      }, 0);

      const { data: donthuoc, error: donthuocError } = await supabase
        .from("DonThuoc")
        .insert([
          {
            benhnhanid,
            chandoan,
            ngay_kham: ngay_kham ? new Date(ngay_kham).toISOString() : new Date().toISOString(),
            tongtien,
            no,
            lai,
            sotien_da_thanh_toan: paidRounded,
            trangthai_thanh_toan,
            madonthuoc: `DT${Date.now().toString().slice(-6)}`,
            tenant_id: tenantId,
            ...(branchId ? { branch_id: branchId } : {}),
          },
        ])
        .select(`
          id,
          madonthuoc,
          chandoan,
          ngay_kham,
          tongtien,
          no,
          sotien_da_thanh_toan,
          lai,
          trangthai_thanh_toan,
          benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)
        `)
        .single();

      if (donthuocError) {
        return res.status(400).json({ message: "Lỗi khi tạo đơn thuốc", error: donthuocError.message });
      }

      const thuocDetailsMap = new Map(thuocDetails.map(t => [t.id, t]));
      const snapshotSupported = await supportsChiTietPriceSnapshotColumns();

      const chiTietInserts = (thuocs as ThuocInput[]).map((t) => {
        const details = thuocDetailsMap.get(t.id);
        if (!details) {
          // This case should ideally not happen if validation is correct
          throw new Error(`Không tìm thấy thông tin chi tiết cho thuốc ID: ${t.id}`);
        }
        const insertItem: Record<string, any> = {
          donthuocid: donthuoc.id,
          thuocid: t.id,
          soluong: t.soluong,
          // Bỏ qua cachdung và donvitinh, sẽ lấy từ bảng Thuoc khi cần
        };
        if (snapshotSupported) {
          insertItem.don_gia_ban = normalizeMoney(t.giaban);
          insertItem.don_gia_von = lineCostMap.get(t.id) || 0;
        }
        return insertItem;
      });

      const { error: chiTietError } = await supabase
        .from("ChiTietDonThuoc")
        .insert(chiTietInserts);

      if (chiTietError) {
        await supabase.from("DonThuoc").delete().eq("id", donthuoc.id);
        return res.status(400).json({ message: "Lỗi khi tạo chi tiết đơn thuốc", error: chiTietError.message });
      }

      // === INVENTORY: Trừ tồn kho thuốc ===
      let inventoryWarnings: string[] = [];
      try {
        inventoryWarnings = await processThuocInventory(
          tenantId,
          donthuoc.id,
          (thuocs as ThuocInput[]).filter(t => t.soluong > 0).map(t => ({ id: t.id, soluong: t.soluong })),
        );
      } catch (invErr) {
        console.error('⚠️ POST thuoc inventory error:', invErr);
        inventoryWarnings.push('Lỗi xử lý kho: ' + (invErr instanceof Error ? invErr.message : String(invErr)));
      }

      return res.status(200).json({
        message: "Đã tạo đơn thuốc",
        data: sanitizeRevenueFields(withDebtFields(donthuoc) as Record<string, unknown>),
        inventoryWarnings,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "PUT") {
    if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
    try {
      const { id, benhnhanid, chandoan, ngay_kham, thuocs, sotien_da_thanh_toan } = req.body;

      if (!id || !benhnhanid || !chandoan || !thuocs || (thuocs as ThuocInput[]).length === 0) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }

      // Validate thuocs
      for (const t of thuocs as ThuocInput[]) {
        if (!t.id || !Number.isInteger(t.soluong) || t.soluong <= 0) {
          return res.status(400).json({ message: "Dữ liệu thuốc không hợp lệ", details: `thuocid: ${t.id}, soluong: ${t.soluong}` });
        }
        if (!Number.isFinite(Number(t.giaban)) || Number(t.giaban) < 0) {
          return res.status(400).json({ message: "Đơn giá bán không hợp lệ", details: `thuocid: ${t.id}, giaban: ${t.giaban}` });
        }
        if (t.giavon !== undefined && (!Number.isFinite(Number(t.giavon)) || Number(t.giavon) < 0)) {
          return res.status(400).json({ message: "Đơn giá vốn không hợp lệ", details: `thuocid: ${t.id}, giavon: ${t.giavon}` });
        }
      }

  const tongtien = (thuocs as ThuocInput[]).reduce((sum, t) => sum + t.soluong * normalizeMoney(t.giaban), 0);
  // Clamp số tiền đã thanh toán khi cập nhật
  const paidRounded = Math.max(0, Math.min(Math.round((sotien_da_thanh_toan as number) || 0), tongtien));
  const no = paidRounded < tongtien;
      const trangthai_thanh_toan = paidRounded === 0 && tongtien > 0 ? 'nợ' : (paidRounded >= tongtien ? 'đã trả' : 'nợ');

      const thuocIdsUpdate = (thuocs as ThuocInput[]).map(t => t.id);
      const { data: thuocDetailsUpdate, error: thuocDetailsUpdateError } = await supabase
        .from('Thuoc')
        .select('id, gianhap, cachdung, donvitinh')
        .in('id', thuocIdsUpdate);
      if (thuocDetailsUpdateError || !thuocDetailsUpdate) {
        return res.status(400).json({ message: 'Lỗi khi lấy thông tin thuốc để cập nhật', error: thuocDetailsUpdateError?.message });
      }
      const gianhapMapUpdate = new Map(thuocDetailsUpdate.map(t => [t.id, (t as { gianhap?: number }).gianhap || 0]));
      const lineCostMapUpdate = new Map((thuocs as ThuocInput[]).map(t => [t.id, normalizeMoney(t.giavon ?? gianhapMapUpdate.get(t.id) ?? 0)]));
      const laiUpdate = (thuocs as ThuocInput[]).reduce((sum, t) => {
        const lineSell = normalizeMoney(t.giaban);
        const lineCost = lineCostMapUpdate.get(t.id) || 0;
        return sum + t.soluong * (lineSell - lineCost);
      }, 0);

    const { data: donthuoc, error: donthuocError } = await supabase
        .from("DonThuoc")
        .update({
          chandoan,
          ngay_kham: ngay_kham ? new Date(ngay_kham).toISOString() : null,
          tongtien,
          no,
  sotien_da_thanh_toan: paidRounded,
      lai: laiUpdate,
      trangthai_thanh_toan,
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select(`
          id,
          madonthuoc,
          chandoan,
          ngay_kham,
          tongtien,
          no,
          sotien_da_thanh_toan,
      lai,
          trangthai_thanh_toan,
          benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)
        `)
        .single();

      if (donthuocError) {
        return res.status(400).json({ message: "Lỗi khi cập nhật đơn thuốc", error: donthuocError.message });
      }

      await supabase.from("ChiTietDonThuoc").delete().eq("donthuocid", id);

      const thuocDetailsMap = new Map(thuocDetailsUpdate.map(t => [t.id, t]));
      const snapshotSupported = await supportsChiTietPriceSnapshotColumns();

      const chiTietInserts = (thuocs as ThuocInput[]).map((t) => {
        const details = thuocDetailsMap.get(t.id);
        if (!details) {
          throw new Error(`Không tìm thấy thông tin chi tiết cho thuốc ID: ${t.id} khi cập nhật`);
        }
        const insertItem: Record<string, any> = {
          donthuocid: id,
          thuocid: t.id,
          soluong: t.soluong,
          // Bỏ qua cachdung và donvitinh, sẽ lấy từ bảng Thuoc khi cần
        };
        if (snapshotSupported) {
          insertItem.don_gia_ban = normalizeMoney(t.giaban);
          insertItem.don_gia_von = lineCostMapUpdate.get(t.id) || 0;
        }
        return insertItem;
      });

      const { error: chiTietError } = await supabase
        .from("ChiTietDonThuoc")
        .insert(chiTietInserts);

      if (chiTietError) {
        return res.status(400).json({ message: "Lỗi khi cập nhật chi tiết đơn thuốc", error: chiTietError.message });
      }

      // === INVENTORY: Hoàn kho cũ → trừ kho mới ===
      let inventoryWarnings: string[] = [];
      try {
        await reverseThuocInventory(tenantId, id);
        inventoryWarnings = await processThuocInventory(
          tenantId,
          id,
          (thuocs as ThuocInput[]).filter(t => t.soluong > 0).map(t => ({ id: t.id, soluong: t.soluong })),
        );
      } catch (invErr) {
        console.error('⚠️ PUT thuoc inventory error:', invErr);
        inventoryWarnings.push('Lỗi xử lý kho khi sửa đơn: ' + (invErr instanceof Error ? invErr.message : String(invErr)));
      }

      return res.status(200).json({
        message: "Đã cập nhật đơn thuốc",
        data: sanitizeRevenueFields(withDebtFields(donthuoc) as Record<string, unknown>),
        inventoryWarnings,
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === 'PATCH') {
    // Cập nhật thanh toán từng phần: body { id, add_payment }
    try {
      const { id, add_payment } = req.body as { id?: number; add_payment?: number };
      if (!id || !add_payment || add_payment <= 0) {
        return res.status(400).json({ message: 'Thiếu hoặc sai tham số (id, add_payment)' });
      }

      const { data: current, error: curErr } = await supabase
        .from('DonThuoc')
        .select('id, tongtien, sotien_da_thanh_toan')
        .eq('id', id)
        .eq('tenant_id', tenantId)
        .single();
      if (curErr || !current) {
        return res.status(404).json({ message: 'Không tìm thấy đơn thuốc' });
      }
      const currentPaid = current.sotien_da_thanh_toan || 0;
      const newPaidRaw = currentPaid + add_payment;
      const clampedPaid = Math.max(0, Math.min(newPaidRaw, current.tongtien));
      const debtInfo = calcDebt(current.tongtien, clampedPaid);

      const { data: updated, error: updErr } = await supabase
        .from('DonThuoc')
        .update({
          sotien_da_thanh_toan: clampedPaid,
          no: debtInfo.isDebt,
          trangthai_thanh_toan: debtInfo.status,
        })
        .eq('id', id)
        .select(`
          id,
          madonthuoc,
          chandoan,
          ngay_kham,
          tongtien,
          no,
          sotien_da_thanh_toan,
          lai,
          trangthai_thanh_toan,
          benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)
        `)
        .single();

      if (updErr) {
        return res.status(400).json({ message: 'Lỗi cập nhật thanh toán', error: updErr.message });
      }

      return res.status(200).json({
        message: 'Đã cập nhật thanh toán',
        data: sanitizeRevenueFields(withDebtFields(updated) as Record<string, unknown>),
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "DELETE") {
    if (!(await requirePermission(ctx, res, 'write_prescription'))) return;
    try {
      const id = req.query.id;

      if (!id) {
        return res.status(400).json({ message: "Thiếu ID đơn thuốc" });
      }

      // === INVENTORY: Hoàn kho trước khi xóa đơn ===
      try {
        await reverseThuocInventory(tenantId, Number(id));
      } catch (invErr) {
        console.error('⚠️ DELETE thuoc reverse inventory error:', invErr);
      }

      await supabase.from("NoBenhNhan").delete().eq("donthuocid", id);
      await supabase.from("ChiTietDonThuoc").delete().eq("donthuocid", id);
      const { error } = await supabase.from("DonThuoc").delete().eq("id", id).eq("tenant_id", tenantId);

      if (error) {
        return res.status(400).json({ message: "Lỗi khi xóa đơn thuốc", error: error.message });
      }

      return res.status(200).json({ message: "Đã xóa đơn thuốc" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  return res.status(405).json({ message: `Phương thức ${req.method} không được hỗ trợ` });
}