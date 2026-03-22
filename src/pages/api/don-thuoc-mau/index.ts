import { NextApiRequest, NextApiResponse } from "next";
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

type DonThuocMauInput = {
  ten_mau: string;
  mo_ta?: string;
  chuyen_khoa?: string;
  thuocs: {
    thuocid: number;
    soluong: number;
    ghi_chu?: string;
  }[];
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method === "GET") {
    try {
      const { chuyen_khoa } = req.query;

      let query = supabase
        .from("DonThuocMau")
        .select(`
          id,
          ten_mau,
          mo_ta,
          chuyen_khoa,
          created_at,
          chitiet:ChiTietDonThuocMau(
            id,
            thuocid,
            soluong,
            ghi_chu,
            thuoc:thuocid(
              id,
              tenthuoc,
              donvitinh,
              cachdung,
              giaban
            )
          )
        `)
        .eq("tenant_id", tenantId)
        .order("ten_mau", { ascending: true });

      if (chuyen_khoa) {
        query = query.eq("chuyen_khoa", chuyen_khoa as string);
      }

      const { data, error } = await query;

      if (error) {
        return res.status(400).json({ message: "Lỗi khi lấy đơn thuốc mẫu", error: error.message });
      }

      return res.status(200).json({ data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "POST") {
    try {
      const { ten_mau, mo_ta, chuyen_khoa, thuocs } = req.body as DonThuocMauInput;

      if (!ten_mau || !thuocs || thuocs.length === 0) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }

      // Validate thuocs
      for (const t of thuocs) {
        if (!t.thuocid || !Number.isInteger(t.soluong) || t.soluong <= 0) {
          return res.status(400).json({ 
            message: "Dữ liệu thuốc không hợp lệ", 
            details: `thuocid: ${t.thuocid}, soluong: ${t.soluong}` 
          });
        }
      }

      // Create template
      const { data: donthuocmau, error: mauError } = await supabase
        .from("DonThuocMau")
        .insert([{ ten_mau, mo_ta, chuyen_khoa, tenant_id: tenantId }])
        .select()
        .single();

      if (mauError) {
        return res.status(400).json({ message: "Lỗi khi tạo đơn thuốc mẫu", error: mauError.message });
      }

      // Create template details
      const chiTietInserts = thuocs.map((t) => ({
        donthuocmauid: donthuocmau.id,
        thuocid: t.thuocid,
        soluong: t.soluong,
        ghi_chu: t.ghi_chu
      }));

      const { error: chiTietError } = await supabase
        .from("ChiTietDonThuocMau")
        .insert(chiTietInserts);

      if (chiTietError) {
        // Rollback
        await supabase.from("DonThuocMau").delete().eq("id", donthuocmau.id);
        return res.status(400).json({ message: "Lỗi khi tạo chi tiết đơn thuốc mẫu", error: chiTietError.message });
      }

      return res.status(200).json({ message: "Đã tạo đơn thuốc mẫu", data: donthuocmau });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "PUT") {
    try {
      const { id, ten_mau, mo_ta, chuyen_khoa, thuocs } = req.body as DonThuocMauInput & { id: number };

      if (!id || !ten_mau || !thuocs || thuocs.length === 0) {
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }

      // Validate thuocs
      for (const t of thuocs) {
        if (!t.thuocid || !Number.isInteger(t.soluong) || t.soluong <= 0) {
          return res.status(400).json({ 
            message: "Dữ liệu thuốc không hợp lệ", 
            details: `thuocid: ${t.thuocid}, soluong: ${t.soluong}` 
          });
        }
      }

      // Update template
      const { data: donthuocmau, error: mauError } = await supabase
        .from("DonThuocMau")
        .update({ ten_mau, mo_ta, chuyen_khoa, updated_at: new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (mauError) {
        return res.status(400).json({ message: "Lỗi khi cập nhật đơn thuốc mẫu", error: mauError.message });
      }

      // Delete old details and create new ones
      await supabase.from("ChiTietDonThuocMau").delete().eq("donthuocmauid", id);

      const chiTietInserts = thuocs.map((t) => ({
        donthuocmauid: id,
        thuocid: t.thuocid,
        soluong: t.soluong,
        ghi_chu: t.ghi_chu
      }));

      const { error: chiTietError } = await supabase
        .from("ChiTietDonThuocMau")
        .insert(chiTietInserts);

      if (chiTietError) {
        return res.status(400).json({ message: "Lỗi khi cập nhật chi tiết đơn thuốc mẫu", error: chiTietError.message });
      }

      return res.status(200).json({ message: "Đã cập nhật đơn thuốc mẫu", data: donthuocmau });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const id = req.query.id;

      if (!id) {
        return res.status(400).json({ message: "Thiếu ID đơn thuốc mẫu" });
      }

      const { error } = await supabase.from("DonThuocMau").delete().eq("id", id);

      if (error) {
        return res.status(400).json({ message: "Lỗi khi xóa đơn thuốc mẫu", error: error.message });
      }

      return res.status(200).json({ message: "Đã xóa đơn thuốc mẫu" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  return res.status(405).json({ message: `Phương thức ${req.method} không được hỗ trợ` });
}
