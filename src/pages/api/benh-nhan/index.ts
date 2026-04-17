//src/pages/api/benh-nhan/index.ts giới, năm sinh
import { NextApiRequest, NextApiResponse } from "next";
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

// Định nghĩa interface cho dữ liệu bệnh nhân
interface BenhNhan {
  id: number;
  ten: string;
  namsinh: string; // dd/mm/yyyy hoặc yyyy - keep as string for compatibility
  dienthoai: string;
  diachi: string;
  tuoi?: number; // chỉ trả về khi xem danh sách
  created_at?: string; // ngày lập hồ sơ
  ngay_kham_gan_nhat?: string; // ngày khám gần nhất
}

// Định nghĩa interface cho lỗi Supabase
interface SupabaseError {
  message: string;
  code?: string;
  details?: string;
  hint?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<
    | { data: BenhNhan }
    | { data: BenhNhan[]; total: number }
    | { message: string; error?: string }
  >
) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return; // response đã được gửi bởi requireTenant
  const { tenantId } = ctx;

  // Handle GET requests
  if (req.method === "GET") {
    try {
      const benhnhanid = req.query.benhnhanid as string;
      const page = parseInt(req.query.page as string) || 1;
      const pageSize = parseInt(req.query.pageSize as string) || 100;
      const search = (req.query.search as string)?.toLowerCase() || "";
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      if (benhnhanid) {
        // Fetch a specific patient
        const { data, error } = await supabase
          .from("BenhNhan")
          .select("id, ten, namsinh, dienthoai, diachi")
          .eq("id", benhnhanid)
          .eq("tenant_id", tenantId)
          .single();

        if (error) {
          return res.status(400).json({ message: "Error fetching patient", error: error.message });
        }
        if (!data) {
          return res.status(404).json({ message: "Patient not found" });
        }
        // Không trả về tuổi khi xem chi tiết
        return res.status(200).json({ data });
      } else {
        // Fetch patient list with pagination and search
        let query = supabase
          .from("BenhNhan")
          .select("id, ten, namsinh, dienthoai, diachi, created_at", { count: "exact" })
          .eq("tenant_id", tenantId)
          .order("id", { ascending: false });

        if (search) {
          // Tìm kiếm thông minh: số → SĐT + tên, chữ → tên + địa chỉ
          const isNumeric = /^\d+$/.test(search.replace(/[\s.-]/g, ''));
          if (isNumeric) {
            const digits = search.replace(/\D/g, '');
            query = query.or(`dienthoai.ilike.%${digits}%,ten.ilike.%${search}%,id.eq.${digits}`);
          } else {
            query = query.or(`ten.ilike.%${search}%,diachi.ilike.%${search}%,dienthoai.ilike.%${search}%`);
          }
        }

        const { data, error, count } = await query.range(from, to);

        if (error) {
          return res.status(400).json({ message: "Error fetching patient list", error: error.message });
        }

        // Lấy ngày khám gần nhất cho tất cả bệnh nhân trong trang
        const patientIds = (data ?? []).map(bn => bn.id);
        let ngayKhamMap: Record<number, string | null> = {};
        
        if (patientIds.length > 0) {
          // Lấy ngày khám gần nhất từ DonThuoc
          const { data: donThuocDates } = await supabase
            .from("DonThuoc")
            .select("benhnhanid, ngay_kham")
            .in("benhnhanid", patientIds)
            .eq("tenant_id", tenantId)
            .order("ngay_kham", { ascending: false });

          // Lấy ngày khám gần nhất từ DonKinh
          const { data: donKinhDates } = await supabase
            .from("DonKinh")
            .select("benhnhanid, ngaykham")
            .in("benhnhanid", patientIds)
            .eq("tenant_id", tenantId)
            .order("ngaykham", { ascending: false });

          // Tính ngày khám gần nhất cho mỗi bệnh nhân
          for (const pid of patientIds) {
            const thuocDate = donThuocDates?.find(d => d.benhnhanid === pid)?.ngay_kham;
            const kinhDate = donKinhDates?.find(d => d.benhnhanid === pid)?.ngaykham;
            
            if (thuocDate && kinhDate) {
              ngayKhamMap[pid] = thuocDate > kinhDate ? thuocDate : kinhDate;
            } else {
              ngayKhamMap[pid] = thuocDate || kinhDate || null;
            }
          }
        }

        // Thêm trường tuổi và ngày khám gần nhất khi trả về danh sách
        const dataWithAge = (data ?? []).map((bn) => ({
          ...bn,
          tuoi: calcAge(bn.namsinh),
          ngay_kham_gan_nhat: ngayKhamMap[bn.id] || null,
        }));

        return res.status(200).json({ data: dataWithAge, total: count ?? 0 });
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "Server error", error: message });
    }
  }

  // Handle POST requests
  if (req.method === "POST") {
    try {
      const { ten, namsinh, dienthoai, diachi } = req.body as BenhNhan;

      if (!ten || !namsinh || !diachi) {
        return res.status(400).json({ message: "Name, birth date/year, and address are required" });
      }

      if (!isValidDateOrYear(namsinh)) {
        return res.status(400).json({ message: "Birth date must be in dd/mm/yyyy or yyyy format" });
      }

      // Xử lý namsinh: giữ nguyên string format vì DB thực tế lưu string
      const namsinhStr = namsinh.trim();

      // WORKAROUND cho primary key conflict: Tìm ID khả dụng
      let attempts = 0;
      const maxAttempts = 10;
      let lastError = null;

      while (attempts < maxAttempts) {
        try {
          // Lấy max ID hiện tại
          const { data: maxData } = await supabase
            .from("BenhNhan")
            .select("id")
            .order("id", { ascending: false })
            .limit(1);

          const maxId = maxData && maxData.length > 0 ? maxData[0].id : 0;
          const nextId = maxId + 1 + attempts; // Tăng dần để tránh conflict

          // Thử insert với ID cụ thể (id sẽ được dùng làm mã bệnh nhân)
          const { data, error } = await supabase
            .from("BenhNhan")
            .insert([{ 
              id: nextId,
              ten, 
              namsinh: namsinhStr,
              dienthoai, 
              diachi,
              tenant_id: tenantId
            }])
            .select()
            .single();

          if (error) {
            lastError = error;
            if (error.message.includes('duplicate key value violates unique constraint')) {
              attempts++;
              console.log(`Attempt ${attempts}: ID ${nextId} conflict, trying ${nextId + 1}...`);
              continue;
            } else {
              return res.status(400).json({ message: "Error adding patient", error: error.message });
            }
          }

          return res.status(200).json({ message: "Patient added successfully", data });
        } catch (insertError) {
          lastError = insertError;
          attempts++;
          console.log(`Attempt ${attempts}: Insert failed, retrying...`, insertError);
        }
      }

      // Nếu đã thử hết số lần mà vẫn lỗi
      const errorMessage = lastError && typeof lastError === 'object' && 'message' in lastError 
        ? (lastError as any).message 
        : "Unknown error";
      return res.status(400).json({ 
        message: `Error adding patient after ${attempts} attempts`, 
        error: errorMessage
      });

    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "Server error", error: message });
    }
  }

  // Handle PUT requests
  if (req.method === "PUT") {
    try {
      const { id, ten, namsinh, dienthoai, diachi } = req.body as BenhNhan;

      if (!id || !ten || !namsinh || !diachi) {
        return res.status(400).json({ message: "ID, name, birth date/year, and address are required" });
      }

      if (!isValidDateOrYear(namsinh)) {
        return res.status(400).json({ message: "Birth date must be in dd/mm/yyyy or yyyy format" });
      }

      // Xử lý namsinh: giữ nguyên string format vì DB thực tế lưu string  
      const namsinhStr = namsinh.trim();

      const { data, error } = await supabase
        .from("BenhNhan")
        .update({ 
          ten, 
          namsinh: namsinhStr, // Lưu string thay vì int
          dienthoai, 
          diachi 
        })
        .eq("id", id)
        .eq("tenant_id", tenantId)
        .select()
        .single();

      if (error) {
        return res.status(400).json({ message: "Error updating patient", error: error.message });
      }

      return res.status(200).json({ message: "Patient updated successfully", data });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "Server error", error: message });
    }
  }

  // Handle DELETE requests
  if (req.method === "DELETE") {
    try {
      const id = req.query.id as string;

      if (!id) {
        return res.status(400).json({ message: "Patient ID is required" });
      }

      // Đảm bảo ID là số hợp lệ
      const patientId = parseInt(id, 10);
      if (isNaN(patientId)) {
        return res.status(400).json({ message: "Invalid patient ID format" });
      }

      // XÓA CASCADE: Xóa theo thứ tự để tránh foreign key constraint
      
      // 1. Lấy danh sách đơn thuốc của bệnh nhân (trong tenant)
      const { data: donThuocs } = await supabase
        .from("DonThuoc")
        .select("id")
        .eq("benhnhanid", patientId)
        .eq("tenant_id", tenantId);

      if (donThuocs && donThuocs.length > 0) {
        const donThuocIds = donThuocs.map(dt => dt.id);
        
        // 2. Xóa chi tiết đơn thuốc
        const { error: deleteChiTietError } = await supabase
          .from("ChiTietDonThuoc")
          .delete()
          .in("donthuocid", donThuocIds);

        if (deleteChiTietError) {
          return res.status(400).json({ 
            message: "Error deleting prescription details", 
            error: deleteChiTietError.message 
          });
        }

        // 3. Xóa đơn thuốc
        const { error: deleteDonThuocError } = await supabase
          .from("DonThuoc")
          .delete()
          .eq("benhnhanid", patientId);

        if (deleteDonThuocError) {
          return res.status(400).json({ 
            message: "Error deleting prescriptions", 
            error: deleteDonThuocError.message 
          });
        }
      }

      // 4. Xóa diễn tiến bệnh (nếu có)
      const { error: deleteDienTienError } = await supabase
        .from("DienTien")
        .delete()
        .eq("benhnhanid", patientId);

      if (deleteDienTienError) {
        console.log("Warning: Could not delete DienTien records:", deleteDienTienError.message);
        // Không return error vì có thể table DienTien không tồn tại
      }

      // 5. Cuối cùng xóa bệnh nhân
      const { error: deleteBenhNhanError }: { error: SupabaseError | null } = await supabase
        .from("BenhNhan")
        .delete()
        .eq("id", patientId)
        .eq("tenant_id", tenantId);

      if (deleteBenhNhanError) {
        return res.status(400).json({ 
          message: "Error deleting patient", 
          error: deleteBenhNhanError.message 
        });
      }

      return res.status(200).json({ 
        message: "Patient and related records deleted successfully" 
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Unknown error";
      return res.status(500).json({ message: "Server error", error: message });
    }
  }

  return res.status(405).json({ message: `Method ${req.method} not allowed` });
}

// Hàm kiểm tra định dạng dd/mm/yyyy hoặc yyyy
function isValidDateOrYear(value: string): boolean {
  if (/^\d{4}$/.test(value)) return true;
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(value)) {
    const [d, m, y] = value.split("/").map(Number);
    const date = new Date(y, m - 1, d);
    return date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d;
  }
  return false;
}

// Hàm tính tuổi từ namsinh (năm hoặc dd/mm/yyyy)
function calcAge(namsinh: string | number): number {
  if (!namsinh) return 0;
  const now = new Date();
  
  // If namsinh is already a number (year), use it directly
  if (typeof namsinh === 'number') {
    return now.getFullYear() - namsinh;
  }
  
  // If namsinh is string, parse it
  const namsinhStr = String(namsinh);
  if (/^\d{4}$/.test(namsinhStr)) {
    return now.getFullYear() - parseInt(namsinhStr, 10);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(namsinhStr)) {
    const [d, m, y] = namsinhStr.split("/").map(Number);
    let age = now.getFullYear() - y;
    const birthdayThisYear = new Date(now.getFullYear(), m - 1, d);
    if (now < birthdayThisYear) age--;
    return age;
  }
  return 0;
}

