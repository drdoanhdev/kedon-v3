import { NextApiRequest, NextApiResponse } from "next";
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const { tenantId } = tenant;
  const supabase = supabaseAdmin;

  if (req.method === "GET") {
    try {
      const { id } = req.query;

      if (!id) {
        return res.status(400).json({ message: "Thiếu ID đơn thuốc mẫu" });
      }

      // Get template with details
      const { data: template, error } = await supabase
        .from("DonThuocMau")
        .select(`
          id,
          ten_mau,
          mo_ta,
          chuyen_khoa,
          chitiet:ChiTietDonThuocMau(
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
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .single();

      if (error) {
        return res.status(400).json({ message: "Lỗi khi lấy đơn thuốc mẫu", error: error.message });
      }

      if (!template) {
        return res.status(404).json({ message: "Không tìm thấy đơn thuốc mẫu" });
      }

      // Transform data for prescription form
      const thuocs = template.chitiet?.map((item: any) => ({
        id: item.thuoc.id,
        tenthuoc: item.thuoc.tenthuoc,
        soluong: item.soluong,
        giaban: item.thuoc.giaban,
        donvitinh: item.thuoc.donvitinh,
        cachdung: item.thuoc.cachdung || '',
        ghi_chu: item.ghi_chu
      })) || [];

      return res.status(200).json({ 
        data: {
          template: {
            id: template.id,
            ten_mau: template.ten_mau,
            mo_ta: template.mo_ta,
            chuyen_khoa: template.chuyen_khoa
          },
          thuocs
        }
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  return res.status(405).json({ message: `Phương thức ${req.method} không được hỗ trợ` });
}
