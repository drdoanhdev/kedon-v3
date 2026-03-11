//src/pages/api/bao-cao/index.ts L1
import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

type ChiTietItem = {
  id: number;
  ngay: string;
  doanhthu: number;
  lai: number;
  no: number;
};

type DonThuoc = {
  id: number;
  ngay_kham: string;
  tongtien: number;
  sotien_da_thanh_toan: number;
  chuyen_khoa: string;
};

type DonKinh = {
  id: number;
  ngaykham: string;
  giatrong?: number;
  giagong?: number;
  no?: boolean;
  sotien_da_thanh_toan?: number;
  lai?: number;
};

type ChiTietThuoc = {
  donthuocid: number;
  soluong: number;
  thuoc: {
    giaban: number;
    gianhap?: number;
    donvitinh: string;
    la_thu_thuat?: boolean;
  };
};

// Hàm helper để lấy tất cả dữ liệu (vượt qua giới hạn 1000 records)
const getAllRecords = async <T>(query: any, tableName: string, timestamp: number): Promise<T[]> => {
  const batchSize = 1000;
  let allData: T[] = [];
  let start = 0;
  let hasMore = true;
  let maxRecords = 50000; // Giới hạn tối đa để tránh timeout

  while (hasMore && allData.length < maxRecords) {
    const { data, error, count } = await query
      .range(start, start + batchSize - 1);
    
    if (error) {
      console.error(`Lỗi truy vấn ${tableName}:`, error);
      throw new Error(`Lỗi truy vấn ${tableName}: ${error.message}`);
    }
    
    if (data && data.length > 0) {
      allData = allData.concat(data);
      console.log(`📦 [${timestamp}] ${tableName} batch ${Math.floor(start/batchSize) + 1}: ${data.length} records (total: ${allData.length})`);
    }
    
    hasMore = data && data.length === batchSize;
    start += batchSize;
    
    // Tránh vòng lặp vô hạn và timeout
    if (start > maxRecords) {
      console.warn(`⚠️ [${timestamp}] Reached maximum query limit for ${tableName} (${maxRecords} records)`);
      break;
    }
  }

  if (allData.length >= maxRecords) {
    console.warn(`⚠️ [${timestamp}] Warning: ${tableName} data truncated at ${maxRecords} records`);
  }

  console.log(`✅ [${timestamp}] Completed ${tableName} query: ${allData.length} total records`);
  return allData;
};

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  // Xác thực tenant
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;
  
  if (req.method !== 'GET') {
    return res.status(405).json({ message: `Phương thức ${req.method} không được hỗ trợ` });
  }

  const { from, to, chuyen_khoa } = req.query;

  if (!from || !to) {
    return res.status(400).json({ message: 'Thiếu tham số from hoặc to' });
  }

  try {
    const timestamp = Date.now();
    console.log(`🔄 [${timestamp}] Starting fresh báo cáo query - From: ${from}, To: ${to}, Chuyên khoa: ${chuyen_khoa}`);
    
    // Tính toán ngày kết thúc: thêm 1 ngày để bao gồm toàn bộ ngày cuối
    // Ví dụ: nếu to = '2025-11-30', sẽ query đến < '2025-12-01' (tức là bao gồm cả 30/11)
    const toDate = new Date(to as string);
    toDate.setDate(toDate.getDate() + 1);
    const toDateInclusive = toDate.toISOString().split('T')[0]; // Format: YYYY-MM-DD
    
    console.log(`📅 [${timestamp}] Date range adjusted: ${from} to ${toDateInclusive} (exclusive, includes all of ${to})`);
    
    // Lấy đơn thuốc
    let queryThuoc = supabase
      .from('DonThuoc')
      .select('id, ngay_kham, tongtien, sotien_da_thanh_toan, chuyen_khoa')
      .eq('tenant_id', tenantId)
      .gte('ngay_kham', from as string)
      .lt('ngay_kham', toDateInclusive);

    if (chuyen_khoa) {
      queryThuoc = queryThuoc.eq('chuyen_khoa', chuyen_khoa as string);
    }

    console.log(`🔄 [${timestamp}] Querying DonThuoc (all records)...`);
    const donThuocs = await getAllRecords<DonThuoc>(queryThuoc, 'DonThuoc', timestamp);
    console.log(`✅ [${timestamp}] DonThuoc found:`, donThuocs?.length || 0, 'records (total)');

    // Lấy chi tiết đơn thuốc và thông tin thuốc
    const donThuocIds = (donThuocs as DonThuoc[]).map((don) => don.id);
    let chiTietThuocs: ChiTietThuoc[] = [];
    if (donThuocIds.length > 0) {
      console.log(`🔄 [${timestamp}] Querying ChiTietDonThuoc for ${donThuocIds.length} don thuocs...`);
      
      // Chia nhỏ danh sách IDs để tránh giới hạn URL
      const idBatches = [];
      const batchSize = 100; // Giảm batch size cho IN query
      for (let i = 0; i < donThuocIds.length; i += batchSize) {
        idBatches.push(donThuocIds.slice(i, i + batchSize));
      }
      
      for (const idBatch of idBatches) {
        const queryChiTiet = supabase
          .from('ChiTietDonThuoc')
          .select('donthuocid, soluong, thuoc:thuocid(giaban, gianhap, donvitinh, la_thu_thuat)')
          .in('donthuocid', idBatch);
        
        const batchData = await getAllRecords<ChiTietThuoc>(queryChiTiet, `ChiTietDonThuoc-batch-${idBatches.indexOf(idBatch) + 1}`, timestamp);
        chiTietThuocs = chiTietThuocs.concat(batchData);
      }
      
      console.log(`✅ [${timestamp}] ChiTietDonThuoc found:`, chiTietThuocs?.length || 0, 'records (total)');
    }

    // Lấy đơn kính
    console.log(`🔄 [${timestamp}] Querying DonKinh (all records)...`);
    const queryKinh = supabase
      .from('DonKinh')
      .select('id, ngaykham, giatrong, giagong, no, sotien_da_thanh_toan, lai')
      .eq('tenant_id', tenantId)
      .gte('ngaykham', from as string)
      .lt('ngaykham', toDateInclusive);

    const donKinhs = await getAllRecords<DonKinh>(queryKinh, 'DonKinh', timestamp);
    console.log(`✅ [${timestamp}] DonKinh found:`, donKinhs?.length || 0, 'records (total)');

    // Tổng hợp dữ liệu
    const baoCao = {
      mat: {
        doanhthu_thuoc: 0,
        doanhthu_thuthuat: 0,
        lai_thuoc: 0,
        lai_thuthuat: 0,
        no_thuoc: 0,
        no_thuthuat: 0,
      },
      tmh: {
        doanhthu_thuoc: 0,
        doanhthu_thuthuat: 0,
        lai_thuoc: 0,
        lai_thuthuat: 0,
        no_thuoc: 0,
        no_thuthuat: 0,
      },
      kinh: {
        doanhthu: (donKinhs as DonKinh[]).reduce((sum, don) => sum + (don.giatrong || 0) + (don.giagong || 0), 0),
        lai: (donKinhs as DonKinh[]).reduce((sum, don) => sum + (don.lai || 0), 0),
        no: (donKinhs as DonKinh[]).reduce((sum, don) => {
          const tongTien = (don.giatrong || 0) + (don.giagong || 0);
          return sum + Math.max(0, tongTien - (don.sotien_da_thanh_toan || 0));
        }, 0),
      },
      chi_tiet: {
        mat: { thuoc: [] as ChiTietItem[], thuthuat: [] as ChiTietItem[] },
        tmh: { thuoc: [] as ChiTietItem[], thuthuat: [] as ChiTietItem[] },
        kinh: [] as ChiTietItem[],
      },
    };

    // Xử lý thuốc và thủ thuật
    (donThuocs as DonThuoc[]).forEach((don) => {
      const chuyenKhoa = don.chuyen_khoa === 'Mắt' ? 'mat' : 'tmh';
      const chiTiets = chiTietThuocs.filter((ct) => ct.donthuocid === don.id && ct.thuoc);
      // Phân biệt thủ thuật dựa vào trường la_thu_thuat hoặc donvitinh === 'lần'
      const thuocList = chiTiets.filter((ct) => ct.thuoc && !ct.thuoc.la_thu_thuat && ct.thuoc.donvitinh !== 'lần');
      const thuthuatList = chiTiets.filter((ct) => ct.thuoc && (ct.thuoc.la_thu_thuat || ct.thuoc.donvitinh === 'lần'));

      const doanhthuThuoc = thuocList.reduce((sum, ct) => sum + ct.soluong * ct.thuoc.giaban, 0);
      const doanhthuThuthuat = thuthuatList.reduce((sum, ct) => sum + ct.soluong * ct.thuoc.giaban, 0);
      const laiThuoc = thuocList.reduce((sum, ct) => sum + ct.soluong * (ct.thuoc.giaban - (ct.thuoc.gianhap || 0)), 0);
      const laiThuthuat = thuthuatList.reduce((sum, ct) => sum + ct.soluong * (ct.thuoc.giaban - (ct.thuoc.gianhap || 0)), 0);

      const no = don.tongtien - (don.sotien_da_thanh_toan || 0);
      const noThuoc = don.tongtien ? (doanhthuThuoc / don.tongtien) * no : 0;
      const noThuthuat = don.tongtien ? (doanhthuThuthuat / don.tongtien) * no : 0;

      baoCao[chuyenKhoa].doanhthu_thuoc += doanhthuThuoc;
      baoCao[chuyenKhoa].doanhthu_thuthuat += doanhthuThuthuat;
      baoCao[chuyenKhoa].lai_thuoc += laiThuoc;
      baoCao[chuyenKhoa].lai_thuthuat += laiThuthuat;
      baoCao[chuyenKhoa].no_thuoc += noThuoc;
      baoCao[chuyenKhoa].no_thuthuat += noThuthuat;

      if (doanhthuThuoc > 0) {
        baoCao.chi_tiet[chuyenKhoa].thuoc.push({
          id: don.id,
          ngay: don.ngay_kham,
          doanhthu: doanhthuThuoc,
          lai: laiThuoc,
          no: noThuoc,
        });
      }
      if (doanhthuThuthuat > 0) {
        baoCao.chi_tiet[chuyenKhoa].thuthuat.push({
          id: don.id,
          ngay: don.ngay_kham,
          doanhthu: doanhthuThuthuat,
          lai: laiThuthuat,
          no: noThuthuat,
        });
      }
    });

    // Xử lý chi tiết kính
    baoCao.chi_tiet.kinh = (donKinhs as DonKinh[]).map((don) => {
      const tongTien = (don.giatrong || 0) + (don.giagong || 0);
      const soTienNo = tongTien - (don.sotien_da_thanh_toan || 0);
      
      return {
        id: don.id,
        ngay: don.ngaykham,
        doanhthu: tongTien,
        lai: don.lai || 0,
        no: Math.max(0, soTienNo),
      };
    });

    // Log request info
    console.log(`✅ [${timestamp}] API báo cáo completed successfully:`, {
      method: req.method,
      query: req.query,
      timestamp: new Date().toISOString(),
      processTime: Date.now() - timestamp,
      totalDonThuoc: donThuocs?.length || 0,
      totalDonKinh: donKinhs?.length || 0,
      totalChiTiet: chiTietThuocs?.length || 0
    });

    // Set final no-cache headers
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate, max-age=0, s-maxage=0, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('X-Fresh-Data', 'true');
    res.setHeader('X-Generated-At', new Date().toISOString());
    
    return res.status(200).json({ 
      data: baoCao,
      meta: {
        timestamp: Date.now(),
        fresh: true,
        generatedAt: new Date().toISOString()
      }
    });
  } catch (error) {
    const err = error as Error;
    console.error('Lỗi trong API bao-cao:', err);
    return res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}