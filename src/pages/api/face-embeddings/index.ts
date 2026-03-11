import type { NextApiRequest, NextApiResponse } from \"next\";\nimport { requireTenant, supabaseAdmin } from '../../../lib/tenantApi';

// /api/face-embeddings
export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const supabase = supabaseAdmin;
  // ============================
  // 📌 1. LẤY DANH SÁCH EMBEDDINGS (GET)
  // ============================
  if (req.method === "GET") {
    try {
      const { data, error } = await supabase
        .from("face_embeddings")
        .select(
          `id, patient_id, created_at, updated_at,
           BenhNhan(id, ten, dienthoai)`
        )
        .order("created_at", { ascending: false });

      if (error) return res.status(400).json({ message: error.message });

      // Đếm số lượng embedding và format data
      const formattedData = data.map((item: any) => ({
        id: item.id,
        patient_id: item.patient_id,
        patient: item.BenhNhan,
        created_at: item.created_at,
        updated_at: item.updated_at,
        has_embedding: true,
      }));

      return res.status(200).json({
        success: true,
        count: formattedData.length,
        data: formattedData,
      });
    } catch (error: any) {
      return res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }

  // ============================
  // 📌 2. XÓA EMBEDDING (DELETE)
  // ============================
  if (req.method === "DELETE") {
    const { patient_id } = req.query;

    if (!patient_id) {
      return res.status(400).json({ message: "Thiếu patient_id" });
    }

    try {
      const { error } = await supabase
        .from("face_embeddings")
        .delete()
        .eq("patient_id", patient_id);

      if (error) {
        return res.status(500).json({ message: "Lỗi khi xóa", error });
      }

      return res.status(200).json({
        success: true,
        message: "Đã xóa embedding",
      });
    } catch (error: any) {
      return res.status(500).json({ message: "Lỗi server", error: error.message });
    }
  }

  // ============================
  // 📌 3. KIỂM TRA EMBEDDING TỒN TẠI (HEAD)
  // ============================
  if (req.method === "HEAD") {
    const { patient_id } = req.query;

    if (!patient_id) {
      return res.status(400).json({ message: "Thiếu patient_id" });
    }

    try {
      const { data } = await supabase
        .from("face_embeddings")
        .select("id")
        .eq("patient_id", patient_id)
        .maybeSingle();

      if (data) {
        return res.status(200).end();
      } else {
        return res.status(404).end();
      }
    } catch (error: any) {
      return res.status(500).end();
    }
  }

  // ===============================
  // ❌ PHƯƠNG THỨC KHÔNG HỖ TRỢ
  // ===============================
  return res.status(405).json({ message: `Phương thức ${req.method} không được hỗ trợ` });
}
