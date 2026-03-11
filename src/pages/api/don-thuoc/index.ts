//src/pages/api/don-thuoc/index.ts L1
import { NextApiRequest, NextApiResponse } from "next";
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';
import { withDebtFields, calcDebt } from '../../../lib/debt';

type ThuocInput = {
  id: number;
  soluong: number;
  giaban: number;
  donvitinh: string; // Chỉ để hiển thị, không lưu vào DB
  cachdung: string;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

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
          benhnhan:BenhNhan(id, ten, namsinh, dienthoai, diachi)
        `, { count: "exact" })
        .eq("tenant_id", tenantId)
        .order("ngay_kham", { ascending: false });

      if (benhnhanid) {
        query = query.eq("benhnhanid", benhnhanid as string);
        // Giới hạn số lượng đơn cũ để tránh quá tải (50 đơn gần nhất)
        const limit = parseInt(req.query.limit as string) || 50;
        const { data, error } = await query.limit(limit);
        if (error) {
          return res.status(400).json({ message: "Lỗi khi lấy đơn thuốc", error: error.message });
        }
        const processedData = Array.isArray(data)
          ? data.map((item) => withDebtFields(item))
          : data ? withDebtFields(data as any) : data;
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
          
          const processedData = paginatedData.map((item) => withDebtFields(item));
          return res.status(200).json({ data: processedData, total: finalCount });
        } else {
          // Không có search/filterNo - phân trang bình thường (nhanh)
          const { data, error, count } = await query.range(from, to);
          if (error) {
            return res.status(400).json({ message: "Lỗi khi lấy đơn thuốc", error: error.message });
          }
          const processedData = (data || []).map((item) => withDebtFields(item));
          return res.status(200).json({ data: processedData, total: count ?? 0 });
        }
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "POST") {
    try {
      console.log('🔍 POST /api/don-thuoc - Request body:', JSON.stringify(req.body, null, 2));
      
      const { benhnhanid, chandoan, ngay_kham, thuocs, sotien_da_thanh_toan } = req.body;

      console.log('🔍 Extracted values:', { benhnhanid, chandoan, thuocs_count: thuocs?.length, sotien_da_thanh_toan });

      if (!benhnhanid || !chandoan || !thuocs || (thuocs as ThuocInput[]).length === 0) {
        console.log('❌ Validation failed:', { benhnhanid, chandoan, thuocs_length: thuocs?.length });
        return res.status(400).json({ message: "Thiếu thông tin bắt buộc" });
      }

      // Validate thuocs
      console.log('🔍 Validating thuocs:', thuocs);
      for (const t of thuocs as ThuocInput[]) {
        console.log('🔍 Validating thuoc:', { id: t.id, soluong: t.soluong, isInteger: Number.isInteger(t.soluong) });
        if (!t.id || !Number.isInteger(t.soluong) || t.soluong <= 0) {
          console.log('❌ Thuoc validation failed:', t);
          return res.status(400).json({ message: "Dữ liệu thuốc không hợp lệ", details: `thuocid: ${t.id}, soluong: ${t.soluong}` });
        }
      }

  const tongtien = (thuocs as ThuocInput[]).reduce((sum, t) => sum + t.soluong * t.giaban, 0);
  // Clamp số tiền đã thanh toán vào [0, tongtien] để tránh lớn hơn tổng tiền khi sửa đơn
  const paidRounded = Math.max(0, Math.min(Math.round((sotien_da_thanh_toan as number) || 0), tongtien));
  const no = paidRounded < tongtien;
      const trangthai_thanh_toan = paidRounded === 0 && tongtien > 0 ? 'nợ' : (paidRounded >= tongtien ? 'đã trả' : 'nợ');

      console.log('🔍 About to insert DonThuoc:', { benhnhanid, chandoan, tongtien, no });

      // Lấy thông tin gianhap để tính lãi trước khi insert
      const thuocIds = (thuocs as ThuocInput[]).map(t => t.id);
      const { data: thuocDetailsForProfit, error: thuocDetailsForProfitError } = await supabase
        .from('Thuoc')
        .select('id, gianhap')
        .in('id', thuocIds);

      if (thuocDetailsForProfitError) {
        return res.status(400).json({ message: 'Lỗi khi lấy gian nhập thuốc', error: thuocDetailsForProfitError.message });
      }
      const gianhapMap = new Map((thuocDetailsForProfit || []).map(t => [t.id, (t as any).gianhap || 0]));
      const lai = (thuocs as ThuocInput[]).reduce((sum, t) => sum + t.soluong * (t.giaban - (gianhapMap.get(t.id) || 0)), 0);

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
        console.log('❌ DonThuoc insert error:', donthuocError);
        return res.status(400).json({ message: "Lỗi khi tạo đơn thuốc", error: donthuocError.message });
      }

      console.log('✅ DonThuoc inserted successfully:', donthuoc);

      // Lấy thông tin chi tiết (bao gồm cachdung, donvitinh) từ bảng Thuoc (không cần gianhap nữa)
      const { data: thuocDetails, error: thuocDetailsError } = await supabase
        .from('Thuoc')
        .select('id, cachdung, donvitinh')
        .in('id', thuocIds);

      if (thuocDetailsError || !thuocDetails) {
        console.log('❌ Error fetching thuoc details:', thuocDetailsError);
        // Rollback the DonThuoc insertion
        await supabase.from("DonThuoc").delete().eq("id", donthuoc.id);
        return res.status(400).json({ message: "Lỗi khi lấy thông tin thuốc", error: thuocDetailsError?.message });
      }

      const thuocDetailsMap = new Map(thuocDetails.map(t => [t.id, t]));

      const chiTietInserts = (thuocs as ThuocInput[]).map((t) => {
        const details = thuocDetailsMap.get(t.id);
        if (!details) {
          // This case should ideally not happen if validation is correct
          throw new Error(`Không tìm thấy thông tin chi tiết cho thuốc ID: ${t.id}`);
        }
        return {
          donthuocid: donthuoc.id,
          thuocid: t.id,
          soluong: t.soluong,
          // Bỏ qua cachdung và donvitinh, sẽ lấy từ bảng Thuoc khi cần
        };
      });

      console.log('🔍 About to insert ChiTietDonThuoc:', chiTietInserts);

      const { error: chiTietError } = await supabase
        .from("ChiTietDonThuoc")
        .insert(chiTietInserts);

      if (chiTietError) {
        console.log('❌ ChiTietDonThuoc insert error:', chiTietError);
        await supabase.from("DonThuoc").delete().eq("id", donthuoc.id);
        return res.status(400).json({ message: "Lỗi khi tạo chi tiết đơn thuốc", error: chiTietError.message });
      }

      console.log('✅ ChiTietDonThuoc inserted successfully');
  return res.status(200).json({ message: "Đã tạo đơn thuốc", data: withDebtFields(donthuoc) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "PUT") {
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
      }

  const tongtien = (thuocs as ThuocInput[]).reduce((sum, t) => sum + t.soluong * t.giaban, 0);
  // Clamp số tiền đã thanh toán khi cập nhật
  const paidRounded = Math.max(0, Math.min(Math.round((sotien_da_thanh_toan as number) || 0), tongtien));
  const no = paidRounded < tongtien;
      const trangthai_thanh_toan = paidRounded === 0 && tongtien > 0 ? 'nợ' : (paidRounded >= tongtien ? 'đã trả' : 'nợ');

      // Lấy gianhap để tính lại lãi khi update
      const thuocIdsUpdate = (thuocs as ThuocInput[]).map(t => t.id);
      const { data: thuocDetailsProfitUpdate, error: thuocDetailsProfitUpdateError } = await supabase
        .from('Thuoc')
        .select('id, gianhap')
        .in('id', thuocIdsUpdate);
      if (thuocDetailsProfitUpdateError) {
        return res.status(400).json({ message: 'Lỗi khi lấy gian nhập thuốc để cập nhật', error: thuocDetailsProfitUpdateError.message });
      }
      const gianhapMapUpdate = new Map((thuocDetailsProfitUpdate || []).map(t => [t.id, (t as any).gianhap || 0]));
      const laiUpdate = (thuocs as ThuocInput[]).reduce((sum, t) => sum + t.soluong * (t.giaban - (gianhapMapUpdate.get(t.id) || 0)), 0);

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

      // Lấy thông tin chi tiết (bao gồm cachdung, donvitinh) từ bảng Thuoc
      const thuocIds = (thuocs as ThuocInput[]).map(t => t.id);
      const { data: thuocDetails, error: thuocDetailsError } = await supabase
        .from('Thuoc')
        .select('id, cachdung, donvitinh')
        .in('id', thuocIds);

      if (thuocDetailsError || !thuocDetails) {
        console.log('❌ Error fetching thuoc details for update:', thuocDetailsError);
        // Note: We don't rollback the DonThuoc update here, but you might want to handle this case
        return res.status(400).json({ message: "Lỗi khi lấy thông tin thuốc để cập nhật", error: thuocDetailsError?.message });
      }

      const thuocDetailsMap = new Map(thuocDetails.map(t => [t.id, t]));

      const chiTietInserts = (thuocs as ThuocInput[]).map((t) => {
        const details = thuocDetailsMap.get(t.id);
        if (!details) {
          throw new Error(`Không tìm thấy thông tin chi tiết cho thuốc ID: ${t.id} khi cập nhật`);
        }
        return {
          donthuocid: id,
          thuocid: t.id,
          soluong: t.soluong,
          // Bỏ qua cachdung và donvitinh, sẽ lấy từ bảng Thuoc khi cần
        };
      });

      const { error: chiTietError } = await supabase
        .from("ChiTietDonThuoc")
        .insert(chiTietInserts);

      if (chiTietError) {
        return res.status(400).json({ message: "Lỗi khi cập nhật chi tiết đơn thuốc", error: chiTietError.message });
      }

      return res.status(200).json({ message: "Đã cập nhật đơn thuốc", data: withDebtFields(donthuoc) });
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

      return res.status(200).json({ message: 'Đã cập nhật thanh toán', data: withDebtFields(updated) });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      return res.status(500).json({ message: "Lỗi server", error: message });
    }
  }

  if (req.method === "DELETE") {
    try {
      const id = req.query.id;

      if (!id) {
        return res.status(400).json({ message: "Thiếu ID đơn thuốc" });
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