//src/pages/api/ke-don/index.ts L1
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, resolveBranchAccess, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';

type ThuocInput = {
  id: number;
  soluong: number;
  giaban: number;
  donvitinh: string; // Chỉ để hiển thị, không lưu vào DB
  cachdung: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const branchAccess = await resolveBranchAccess(tenant, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;
  const { tenantId } = tenant;
  const { branchId } = branchAccess;
  const supabase = supabaseAdmin;

  if (req.method !== 'POST') {
    return res.status(405).json({ message: `Phương thức ${req.method} không được hỗ trợ` });
  }

  try {
    const { benhnhanid, chandoan, chuyen_khoa, thuocs, trangthai_thanh_toan } = req.body as {
      benhnhanid: number;
      chandoan: string;
      chuyen_khoa: string;
      thuocs: ThuocInput[];
      trangthai_thanh_toan?: string;
    };

    if (!benhnhanid || !chandoan || !chuyen_khoa || !thuocs || !Array.isArray(thuocs)) {
      return res.status(400).json({ message: 'Thiếu hoặc dữ liệu không hợp lệ' });
    }

    // Validate thuocs
    for (const t of thuocs) {
      if (!t.id || !Number.isInteger(t.soluong) || t.soluong <= 0) {
        return res.status(400).json({ message: "Dữ liệu thuốc không hợp lệ", details: `thuocid: ${t.id}, soluong: ${t.soluong}` });
      }
    }

    const tongtien = (thuocs as ThuocInput[]).reduce((sum, t) => sum + t.soluong * t.giaban, 0);

    const newDonThuoc = {
      madonthuoc: `DT${Date.now()}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`,
      benhnhanid,
      chandoan,
      chuyen_khoa,
      ngaylap: new Date().toISOString(),
      tongtien,
      trangthai_thanh_toan: trangthai_thanh_toan || 'đã trả',
      tenant_id: tenantId,
      ...(branchId ? { branch_id: branchId } : {}),
    };

    const { data: newDonThuocData, error: insertDonThuocError } = await supabase
      .from('DonThuoc')
      .insert(newDonThuoc)
      .select('id, madonthuoc, benhnhanid, chandoan, chuyen_khoa, ngaylap, tongtien, trangthai_thanh_toan')
      .single();

    if (insertDonThuocError || !newDonThuocData) {
      return res.status(400).json({
        message: 'Lỗi khi tạo đơn thuốc mới',
        error: insertDonThuocError?.message,
        details: insertDonThuocError?.details,
      });
    }

    // Lấy thông tin thuốc gốc để so sánh cách dùng
    const thuocIds = thuocs.map(t => t.id);
    const { data: dsThuoc, error: thuocError } = await supabase
      .from('Thuoc')
      .select('id, cachdung')
      .in('id', thuocIds);

    if (thuocError) {
      return res.status(400).json({ message: 'Lỗi khi lấy thông tin thuốc', error: thuocError.message });
    }

    const chiTietToInsert = thuocs.map((t) => {
      // Lấy thông tin thuốc gốc để so sánh cách dùng
      const thuocGoc = dsThuoc?.find(thuoc => thuoc.id === t.id);
      
      const chiTiet: any = {
        donthuocid: newDonThuocData.id,
        thuocid: t.id,
        soluong: t.soluong,
        // Không lưu donvitinh nữa - luôn lấy từ bảng Thuoc
      };

      // Chỉ lưu cachdung nếu khác với mặc định
      if (t.cachdung && thuocGoc && t.cachdung.trim() !== thuocGoc.cachdung.trim()) {
        chiTiet.cachdung = t.cachdung;
      }

      return chiTiet;
    });

    const { error: insertChiTietError } = await supabase
      .from('ChiTietDonThuoc')
      .insert(chiTietToInsert);

    if (insertChiTietError) {
      return res.status(400).json({
        message: 'Lỗi khi tạo chi tiết đơn thuốc mới',
        error: insertChiTietError.message,
        details: insertChiTietError.details,
      });
    }

    if (trangthai_thanh_toan === 'nợ') {
      const trangThaiNo = 'chưa trả';
      const { error: insertNoError } = await supabase
        .from('NoBenhNhan')
        .insert({
          benhnhanid,
          donthuocid: newDonThuocData.id,
          sotienno: tongtien,
          ngayno: new Date().toISOString(),
          trangthai: trangThaiNo,
          sotientra: 0,
        });

      if (insertNoError) {
        return res.status(400).json({
          message: 'Lỗi khi ghi nợ',
          error: insertNoError.message,
          details: insertNoError.details,
        });
      }
    }

    return res.status(200).json({ message: 'Đã tạo đơn thuốc', data: newDonThuocData });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('Server error:', error);
    return res.status(500).json({
      message: 'Lỗi server',
      error: message,
      details: (error instanceof Error && 'details' in error) ? (error as { details?: string }).details : 'Không có chi tiết lỗi',
    });
  }
}