//src/pages/api/chi-tet-don-thuoc/index.ts L1
import { NextApiRequest, NextApiResponse } from "next";
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';

let supportsPriceSnapshotColumnsCache: boolean | null = null;

async function supportsPriceSnapshotColumns(): Promise<boolean> {
  if (supportsPriceSnapshotColumnsCache !== null) return supportsPriceSnapshotColumnsCache;

  const { error } = await supabaseAdmin
    .from('ChiTietDonThuoc')
    .select('don_gia_ban, don_gia_von')
    .limit(1);

  if (!error) {
    supportsPriceSnapshotColumnsCache = true;
    return true;
  }

  // DB chưa chạy V049
  if (error.code === '42703') {
    supportsPriceSnapshotColumnsCache = false;
    return false;
  }

  supportsPriceSnapshotColumnsCache = true;
  return true;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const tenant = await requireTenant(req, res);
  if (!tenant) return;
  const { tenantId } = tenant;
  const supabase = supabaseAdmin;

  if (req.method === "GET") {
    try {
      const donthuocid = req.query.donthuocid as string;

      if (!donthuocid) {
        return res.status(400).json({ message: "Thiếu donthuocid" });
      }

      // Verify DonThuoc belongs to this tenant
      const { data: donThuoc, error: dtError } = await supabase
        .from("DonThuoc")
        .select("id")
        .eq("id", donthuocid)
        .eq("tenant_id", tenantId)
        .maybeSingle();

      if (dtError || !donThuoc) {
        return res.status(404).json({ message: "Không tìm thấy đơn thuốc" });
      }

      const includeSnapshot = await supportsPriceSnapshotColumns();
      const selectColumns = includeSnapshot
        ? `
          id,
          donthuocid,
          thuocid,
          soluong,
          don_gia_ban,
          don_gia_von,
          thuoc:thuocid (
            id,
            tenthuoc,
            donvitinh,
            cachdung,
            giaban,
            gianhap,
            soluongmacdinh
          )
        `
        : `
          id,
          donthuocid,
          thuocid,
          soluong,
          thuoc:thuocid (
            id,
            tenthuoc,
            donvitinh,
            cachdung,
            giaban,
            gianhap,
            soluongmacdinh
          )
        `;

      const { data, error } = await supabase
        .from("ChiTietDonThuoc")
        .select(selectColumns)
        .eq("donthuocid", donthuocid);

      if (error) {
        return res.status(400).json({ message: "Lỗi khi lấy chi tiết đơn thuốc", error: error.message });
      }

      if (!data || (Array.isArray(data) && data.length === 0)) {
        return res.status(404).json({ message: "Không tìm thấy chi tiết đơn thuốc" });
      }

      // Xử lý dữ liệu: donvitinh và cachdung luôn lấy từ bảng Thuoc gốc
      const processedData = data?.map(item => {
        const thuocInfo = Array.isArray(item.thuoc) ? item.thuoc[0] : item.thuoc;
        const snapshotSell = typeof (item as any).don_gia_ban === 'number'
          ? (item as any).don_gia_ban
          : (thuocInfo?.giaban || 0);
        const snapshotCost = typeof (item as any).don_gia_von === 'number'
          ? (item as any).don_gia_von
          : (thuocInfo?.gianhap || 0);
        return {
          ...item,
          don_gia_ban: snapshotSell,
          don_gia_von: snapshotCost,
          thuoc: {
            ...(thuocInfo || {}),
            giaban: snapshotSell,
            gianhap: snapshotCost,
            gia_nguon: 'snapshot_line',
          },
          donvitinh: thuocInfo?.donvitinh || '', // Luôn từ bảng Thuoc
          cachdung: thuocInfo?.cachdung || '' // Luôn từ bảng Thuoc
        };
      });

      return res.status(200).json({ data: processedData });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  return res.status(405).json({ message: `Phương thức ${req.method} không được hỗ trợ` });
}