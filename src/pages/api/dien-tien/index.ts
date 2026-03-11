//src/pages/api/dien-tien/index.ts L1
import { NextApiRequest, NextApiResponse } from "next";
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  const { method } = req;

  if (method === "GET") {
    const benhnhanid = req.query.benhnhanid as string;
    if (!benhnhanid) {
      return res.status(400).json({ message: "Thiếu ID bệnh nhân" });
    }

    try {
      const { data, error } = await supabase
        .from("DienTien")
        .select("id, ngay, noidung")
        .eq("benhnhanid", benhnhanid)
        .eq("tenant_id", tenantId)
        .order("ngay", { ascending: false });

      if (error) {
        return res.status(400).json({ message: "Lỗi khi truy vấn diễn tiến", error: error.message });
      }

      return res.status(200).json({ data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (method === "POST") {
    const { benhnhanid, noidung, ngay } = req.body as { benhnhanid: number; noidung: string; ngay?: string };

    if (!benhnhanid || !noidung) {
      return res.status(400).json({ message: "Thiếu thông tin diễn tiến" });
    }

    try {
      const { data, error } = await supabase
        .from("DienTien")
        .insert([{ benhnhanid, noidung, ngay: ngay || new Date().toISOString(), tenant_id: tenantId }])
        .select()
        .single();

      if (error) {
        return res.status(400).json({ message: "Lỗi khi thêm diễn tiến", error: error.message });
      }

      return res.status(200).json({ message: "Đã thêm diễn tiến", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (method === "PUT") {
    const { id, noidung, ngay } = req.body as { id: number; noidung: string; ngay?: string };

    if (!id || !noidung) {
      return res.status(400).json({ message: "Thiếu thông tin để sửa diễn tiến" });
    }

    try {
      const { data, error } = await supabase
        .from("DienTien")
        .update({ noidung, ngay: ngay || new Date().toISOString() })
        .eq("id", id)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ message: "Lỗi khi sửa diễn tiến", error: error.message });
      }

      return res.status(200).json({ message: "Đã sửa diễn tiến", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (method === "DELETE") {
    const id = req.query.id as string;

    if (!id) {
      return res.status(400).json({ message: "Thiếu ID diễn tiến" });
    }

    try {
      const { error } = await supabase.from("DienTien").delete().eq("id", id);

      if (error) {
        return res.status(400).json({ message: "Lỗi khi xoá diễn tiến", error: error.message });
      }

      return res.status(200).json({ message: "Đã xoá diễn tiến" });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  return res.status(405).json({ message: `Phương thức ${method} không được hỗ trợ` });
}