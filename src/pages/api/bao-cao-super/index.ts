import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);
  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') {
    return res.status(405).json({ message: `Method ${req.method} not allowed` });
  }

  const { from, to } = req.query;
  if (!from || !to) {
    return res.status(400).json({ message: 'Thiếu tham số from hoặc to' });
  }

  try {
    const fromStr = from as string;
    const toDate = new Date(to as string);
    toDate.setDate(toDate.getDate() + 1);
    const toStr = toDate.toISOString().split('T')[0];

    // ---- Calculate previous period for comparison ----
    const fromD = new Date(fromStr);
    const toD = new Date(to as string);
    const periodMs = toD.getTime() - fromD.getTime();
    const prevTo = new Date(fromD.getTime() - 1);
    const prevFrom = new Date(prevTo.getTime() - periodMs);
    const prevFromStr = prevFrom.toISOString().split('T')[0];
    const prevToD = new Date(prevTo);
    prevToD.setDate(prevToD.getDate() + 1);
    const prevToStr = prevToD.toISOString().split('T')[0];

    // ===================== PARALLEL QUERIES =====================
    const [
      donThuocRes, donThuocPrevRes,
      donKinhRes, donKinhPrevRes,
      benhNhanRes, benhNhanNewRes,
      choKhamRes,
      henKhamRes,
      thuocRes,
      lensStockRes, gongKinhRes,
      thuocNhapRes, thuocHuyRes,
    ] = await Promise.all([
      // Current period
      supabase.from('DonThuoc')
        .select('id, ngay_kham, tongtien, sotien_da_thanh_toan, chuyen_khoa, benhnhanid, lai')
        .eq('tenant_id', tenantId)
        .gte('ngay_kham', fromStr).lt('ngay_kham', toStr),

      // Previous period 
      supabase.from('DonThuoc')
        .select('id, tongtien, sotien_da_thanh_toan, lai')
        .eq('tenant_id', tenantId)
        .gte('ngay_kham', prevFromStr).lt('ngay_kham', prevToStr),

      // Current period glasses 
      supabase.from('DonKinh')
        .select('id, ngaykham, giatrong, giagong, sotien_da_thanh_toan, lai, benhnhanid')
        .eq('tenant_id', tenantId)
        .gte('ngaykham', fromStr).lt('ngaykham', toStr),

      // Previous period glasses
      supabase.from('DonKinh')
        .select('id, giatrong, giagong, sotien_da_thanh_toan, lai')
        .eq('tenant_id', tenantId)
        .gte('ngaykham', prevFromStr).lt('ngaykham', prevToStr),

      // Total patients
      supabase.from('BenhNhan')
        .select('id, namsinh', { count: 'exact' })
        .eq('tenant_id', tenantId),

      // New patients this period (approximate via first DonThuoc)
      supabase.from('BenhNhan')
        .select('id', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .gte('created_at', fromStr).lt('created_at', toStr),

      // ChoKham in period
      supabase.from('ChoKham')
        .select('id, thoigian, trangthai')
        .eq('tenant_id', tenantId)
        .gte('thoigian', fromStr).lt('thoigian', toStr),

      // Appointments in period
      supabase.from('hen_kham_lai')
        .select('id, ngay_hen, trang_thai')
        .eq('tenant_id', tenantId)
        .gte('ngay_hen', fromStr).lte('ngay_hen', to as string),

      // Thuoc (drugs) with stock
      supabase.from('Thuoc')
        .select('id, tenthuoc, donvitinh, giaban, gianhap, tonkho, muc_ton_toi_thieu, la_thu_thuat')
        .eq('tenant_id', tenantId)
        .eq('ngung_kinh_doanh', false),

      // Lens stock alerts
      supabase.from('lens_stock')
        .select('id, sph, cyl, ton_hien_tai, trang_thai_ton, HangTrong:hang_trong_id(ten_hang)')
        .eq('tenant_id', tenantId)
        .in('trang_thai_ton', ['HET', 'SAP_HET']),

      // Frame stock
      supabase.from('GongKinh')
        .select('id, ten_gong, gia_nhap, gia_ban, ton_kho, muc_ton_can_co')
        .eq('tenant_id', tenantId)
        .not('trang_thai', 'eq', false),

      // Drug imports in period
      supabase.from('thuoc_nhap_kho')
        .select('id, thuoc_id, so_luong, don_gia, thanh_tien, ngay_nhap')
        .eq('tenant_id', tenantId)
        .gte('ngay_nhap', fromStr).lt('ngay_nhap', toStr),

      // Drug wastage in period
      supabase.from('thuoc_huy')
        .select('id, thuoc_id, so_luong, ly_do, ngay_huy')
        .eq('tenant_id', tenantId)
        .gte('ngay_huy', fromStr).lt('ngay_huy', toStr),
    ]);

    const donThuocs = donThuocRes.data || [];
    const donThuocsPrev = donThuocPrevRes.data || [];
    const donKinhs = donKinhRes.data || [];
    const donKinhsPrev = donKinhPrevRes.data || [];
    const benhNhans = benhNhanRes.data || [];
    const benhNhanNew = benhNhanNewRes.count || 0;
    const choKhams = choKhamRes.data || [];
    const henKhams = henKhamRes.data || [];
    const thuocs = thuocRes.data || [];
    const lensAlerts = lensStockRes.data || [];
    const gongKinhs = gongKinhRes.data || [];
    const thuocNhaps = thuocNhapRes.data || [];
    const thuocHuys = thuocHuyRes.data || [];

    // Get chi tiet don thuoc for drug-level analysis
    const donThuocIds = donThuocs.map((d: any) => d.id);
    let chiTietThuocs: any[] = [];
    if (donThuocIds.length > 0) {
      const batches = [];
      for (let i = 0; i < donThuocIds.length; i += 200) {
        batches.push(donThuocIds.slice(i, i + 200));
      }
      for (const batch of batches) {
        const { data } = await supabase.from('ChiTietDonThuoc')
          .select('donthuocid, soluong, thuoc:thuocid(id, tenthuoc, giaban, gianhap, donvitinh, la_thu_thuat)')
          .in('donthuocid', batch);
        if (data) chiTietThuocs = chiTietThuocs.concat(data);
      }
    }

    // ===================== MODULE 1: TAI CHINH =====================
    // Current period financials
    const dtThuoc = donThuocs.reduce((s: number, d: any) => s + (d.tongtien || 0), 0);
    const noThuoc = donThuocs.reduce((s: number, d: any) => s + Math.max(0, (d.tongtien || 0) - (d.sotien_da_thanh_toan || 0)), 0);
    const dtKinh = donKinhs.reduce((s: number, d: any) => s + ((d.giatrong || 0) + (d.giagong || 0)), 0);
    const laiKinh = donKinhs.reduce((s: number, d: any) => s + (d.lai || 0), 0);
    const noKinh = donKinhs.reduce((s: number, d: any) => {
      const t = (d.giatrong || 0) + (d.giagong || 0);
      return s + Math.max(0, t - (d.sotien_da_thanh_toan || 0));
    }, 0);

    // Compute lai thuoc from chi tiet
    const laiThuocFromDetail = chiTietThuocs.reduce((s: number, ct: any) => {
      if (!ct.thuoc) return s;
      return s + ct.soluong * ((ct.thuoc.giaban || 0) - (ct.thuoc.gianhap || 0));
    }, 0);

    const tongDT = dtThuoc + dtKinh;
    const tongLai = laiThuocFromDetail + laiKinh;
    const tongNo = noThuoc + noKinh;

    // Previous period
    const prevDtThuoc = donThuocsPrev.reduce((s: number, d: any) => s + (d.tongtien || 0), 0);
    const prevDtKinh = donKinhsPrev.reduce((s: number, d: any) => s + ((d.giatrong || 0) + (d.giagong || 0)), 0);
    const prevTongDT = prevDtThuoc + prevDtKinh;
    const prevLaiThuoc = donThuocsPrev.reduce((s: number, d: any) => s + (d.lai || 0), 0);
    const prevLaiKinh = donKinhsPrev.reduce((s: number, d: any) => s + (d.lai || 0), 0);
    const prevTongLai = prevLaiThuoc + prevLaiKinh;

    // Revenue by category with breakdown
    const dtByCategory: Record<string, { doanhthu: number; lai: number; no: number; count: number }> = {
      'Thuốc Mắt': { doanhthu: 0, lai: 0, no: 0, count: 0 },
      'Thuốc TMH': { doanhthu: 0, lai: 0, no: 0, count: 0 },
      'Thủ thuật Mắt': { doanhthu: 0, lai: 0, no: 0, count: 0 },
      'Thủ thuật TMH': { doanhthu: 0, lai: 0, no: 0, count: 0 },
      'Kính': { doanhthu: 0, lai: 0, no: 0, count: 0 },
    };

    donThuocs.forEach((don: any) => {
      const ck = don.chuyen_khoa === 'Mắt' ? 'Mắt' : 'TMH';
      const chiTiets = chiTietThuocs.filter((ct: any) => ct.donthuocid === don.id && ct.thuoc);
      const thuocList = chiTiets.filter((ct: any) => !ct.thuoc.la_thu_thuat && ct.thuoc.donvitinh !== 'lần');
      const ttList = chiTiets.filter((ct: any) => ct.thuoc.la_thu_thuat || ct.thuoc.donvitinh === 'lần');

      const dtT = thuocList.reduce((s: number, ct: any) => s + ct.soluong * ct.thuoc.giaban, 0);
      const dtTT = ttList.reduce((s: number, ct: any) => s + ct.soluong * ct.thuoc.giaban, 0);
      const laiT = thuocList.reduce((s: number, ct: any) => s + ct.soluong * (ct.thuoc.giaban - (ct.thuoc.gianhap || 0)), 0);
      const laiTT = ttList.reduce((s: number, ct: any) => s + ct.soluong * (ct.thuoc.giaban - (ct.thuoc.gianhap || 0)), 0);
      const noTotal = Math.max(0, (don.tongtien || 0) - (don.sotien_da_thanh_toan || 0));
      const noT = don.tongtien ? (dtT / don.tongtien) * noTotal : 0;
      const noTT = don.tongtien ? (dtTT / don.tongtien) * noTotal : 0;

      if (dtT > 0) {
        dtByCategory[`Thuốc ${ck}`].doanhthu += dtT;
        dtByCategory[`Thuốc ${ck}`].lai += laiT;
        dtByCategory[`Thuốc ${ck}`].no += noT;
        dtByCategory[`Thuốc ${ck}`].count += 1;
      }
      if (dtTT > 0) {
        dtByCategory[`Thủ thuật ${ck}`].doanhthu += dtTT;
        dtByCategory[`Thủ thuật ${ck}`].lai += laiTT;
        dtByCategory[`Thủ thuật ${ck}`].no += noTT;
        dtByCategory[`Thủ thuật ${ck}`].count += 1;
      }
    });

    donKinhs.forEach((don: any) => {
      const t = (don.giatrong || 0) + (don.giagong || 0);
      dtByCategory['Kính'].doanhthu += t;
      dtByCategory['Kính'].lai += (don.lai || 0);
      dtByCategory['Kính'].no += Math.max(0, t - (don.sotien_da_thanh_toan || 0));
      dtByCategory['Kính'].count += 1;
    });

    // Revenue by day
    const dtByDay: Record<string, { doanhthu: number; lai: number; no: number; count: number }> = {};
    donThuocs.forEach((d: any) => {
      const day = (d.ngay_kham || '').split('T')[0];
      if (!day) return;
      if (!dtByDay[day]) dtByDay[day] = { doanhthu: 0, lai: 0, no: 0, count: 0 };
      dtByDay[day].doanhthu += (d.tongtien || 0);
      dtByDay[day].no += Math.max(0, (d.tongtien || 0) - (d.sotien_da_thanh_toan || 0));
      dtByDay[day].count += 1;
    });
    // Add lai from chi tiet
    chiTietThuocs.forEach((ct: any) => {
      if (!ct.thuoc) return;
      const don = donThuocs.find((d: any) => d.id === ct.donthuocid);
      if (!don) return;
      const day = (don.ngay_kham || '').split('T')[0];
      if (!day || !dtByDay[day]) return;
      dtByDay[day].lai += ct.soluong * ((ct.thuoc.giaban || 0) - (ct.thuoc.gianhap || 0));
    });
    donKinhs.forEach((d: any) => {
      const day = (d.ngaykham || '').split('T')[0];
      if (!day) return;
      if (!dtByDay[day]) dtByDay[day] = { doanhthu: 0, lai: 0, no: 0, count: 0 };
      dtByDay[day].doanhthu += (d.giatrong || 0) + (d.giagong || 0);
      dtByDay[day].lai += (d.lai || 0);
      dtByDay[day].no += Math.max(0, ((d.giatrong || 0) + (d.giagong || 0)) - (d.sotien_da_thanh_toan || 0));
      dtByDay[day].count += 1;
    });
    const dtByDayArray = Object.entries(dtByDay)
      .map(([day, v]) => ({ day, ...v }))
      .sort((a, b) => a.day.localeCompare(b.day));

    // Revenue by month
    const dtByMonth: Record<string, { doanhthu: number; lai: number; no: number; count: number }> = {};
    dtByDayArray.forEach(d => {
      const m = d.day.substring(0, 7); // YYYY-MM
      if (!dtByMonth[m]) dtByMonth[m] = { doanhthu: 0, lai: 0, no: 0, count: 0 };
      dtByMonth[m].doanhthu += d.doanhthu;
      dtByMonth[m].lai += d.lai;
      dtByMonth[m].no += d.no;
      dtByMonth[m].count += d.count;
    });
    const dtByMonthArray = Object.entries(dtByMonth)
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month));

    // Top selling drugs
    const drugSales: Record<number, { id: number; ten: string; doanhthu: number; lai: number; soluong: number }> = {};
    chiTietThuocs.forEach((ct: any) => {
      if (!ct.thuoc) return;
      const tid = ct.thuoc.id;
      if (!drugSales[tid]) {
        drugSales[tid] = { id: tid, ten: ct.thuoc.tenthuoc || '', doanhthu: 0, lai: 0, soluong: 0 };
      }
      drugSales[tid].doanhthu += ct.soluong * (ct.thuoc.giaban || 0);
      drugSales[tid].lai += ct.soluong * ((ct.thuoc.giaban || 0) - (ct.thuoc.gianhap || 0));
      drugSales[tid].soluong += ct.soluong;
    });
    const topDrugs = Object.values(drugSales)
      .sort((a, b) => b.doanhthu - a.doanhthu)
      .slice(0, 10);

    // Debt aging
    const now = new Date();
    const aging = { under30: 0, d30_60: 0, d60_90: 0, over90: 0 };
    [...donThuocs, ...donKinhs].forEach((d: any) => {
      const dateField = d.ngay_kham || d.ngaykham;
      const total = d.tongtien || ((d.giatrong || 0) + (d.giagong || 0));
      const paid = d.sotien_da_thanh_toan || 0;
      const debt = Math.max(0, total - paid);
      if (debt <= 0) return;
      const daysSince = Math.floor((now.getTime() - new Date(dateField).getTime()) / 86400000);
      if (daysSince < 30) aging.under30 += debt;
      else if (daysSince < 60) aging.d30_60 += debt;
      else if (daysSince < 90) aging.d60_90 += debt;
      else aging.over90 += debt;
    });

    // ===================== MODULE 2: BENH NHAN =====================
    const uniqueBNThuoc = new Set(donThuocs.map((d: any) => d.benhnhanid).filter(Boolean));
    const uniqueBNKinh = new Set(donKinhs.map((d: any) => d.benhnhanid).filter(Boolean));
    const uniqueBN = new Set([...uniqueBNThuoc, ...uniqueBNKinh]);
    const arpu = uniqueBN.size > 0 ? tongDT / uniqueBN.size : 0;

    // Returning patients (have orders in both previous AND current period)
    const prevBNIds = new Set([
      ...donThuocsPrev.map((d: any) => d.id), // Note: prev doesn't have benhnhanid selected
    ]);

    // Age distribution
    const currentYear = now.getFullYear();
    const ageDist: Record<string, number> = { '0-18': 0, '19-30': 0, '31-45': 0, '46-60': 0, '60+': 0, 'N/A': 0 };
    benhNhans.forEach((bn: any) => {
      if (!bn.namsinh) { ageDist['N/A']++; return; }
      const birthYear = parseInt(bn.namsinh);
      if (isNaN(birthYear)) { ageDist['N/A']++; return; }
      const age = currentYear - birthYear;
      if (age <= 18) ageDist['0-18']++;
      else if (age <= 30) ageDist['19-30']++;
      else if (age <= 45) ageDist['31-45']++;
      else if (age <= 60) ageDist['46-60']++;
      else ageDist['60+']++;
    });

    // Appointment stats
    const totalHen = henKhams.length;
    const henDaDen = henKhams.filter((h: any) => h.trang_thai === 'da_den').length;
    const henHuy = henKhams.filter((h: any) => h.trang_thai === 'huy').length;
    const henQuaHan = henKhams.filter((h: any) => h.trang_thai === 'qua_han' || (h.trang_thai === 'cho' && h.ngay_hen < now.toISOString().split('T')[0])).length;
    const tyLeDenHen = totalHen > 0 ? (henDaDen / totalHen * 100) : 0;

    // Top spending patients
    const bnSpending: Record<number, number> = {};
    donThuocs.forEach((d: any) => {
      if (d.benhnhanid) bnSpending[d.benhnhanid] = (bnSpending[d.benhnhanid] || 0) + (d.tongtien || 0);
    });
    donKinhs.forEach((d: any) => {
      if (d.benhnhanid) bnSpending[d.benhnhanid] = (bnSpending[d.benhnhanid] || 0) + (d.giatrong || 0) + (d.giagong || 0);
    });

    // ===================== MODULE 3: TON KHO =====================
    const thuocTonKho = thuocs.filter((t: any) => !t.la_thu_thuat);
    const giaTriTonThuoc = thuocTonKho.reduce((s: number, t: any) => s + ((t.tonkho || 0) * (t.gianhap || 0)), 0);
    const thuocSapHet = thuocTonKho.filter((t: any) => (t.tonkho || 0) > 0 && (t.tonkho || 0) <= (t.muc_ton_toi_thieu || 10));
    const thuocHetHang = thuocTonKho.filter((t: any) => (t.tonkho || 0) <= 0);

    const giaTriTonGong = gongKinhs.reduce((s: number, g: any) => s + ((g.ton_kho || 0) * (g.gia_nhap || 0)), 0);
    const gongSapHet = gongKinhs.filter((g: any) => (g.ton_kho ?? 0) <= (g.muc_ton_can_co ?? 2) && (g.ton_kho ?? 0) > 0);
    const gongHet = gongKinhs.filter((g: any) => (g.ton_kho ?? 0) <= 0);

    const chiPhiNhap = thuocNhaps.reduce((s: number, n: any) => s + (n.thanh_tien || (n.so_luong * n.don_gia) || 0), 0);
    const soLuongHuy = thuocHuys.reduce((s: number, h: any) => s + (h.so_luong || 0), 0);

    // ===================== MODULE 4: HIEU SUAT =====================
    const soLuotKham = choKhams.length;
    const soNgay = dtByDayArray.length || 1;
    const donThuocTBNgay = donThuocs.length / soNgay;
    const donKinhTBNgay = donKinhs.length / soNgay;
    const tyLeThanhToanDu = (() => {
      const total = donThuocs.length + donKinhs.length;
      if (total === 0) return 0;
      const paid = donThuocs.filter((d: any) => (d.sotien_da_thanh_toan || 0) >= (d.tongtien || 0)).length
        + donKinhs.filter((d: any) => (d.sotien_da_thanh_toan || 0) >= ((d.giatrong || 0) + (d.giagong || 0))).length;
      return (paid / total) * 100;
    })();

    // Visits by hour
    const visitByHour: Record<number, number> = {};
    choKhams.forEach((ck: any) => {
      if (!ck.thoigian) return;
      const h = new Date(ck.thoigian).getHours();
      visitByHour[h] = (visitByHour[h] || 0) + 1;
    });
    const visitByHourArray = Object.entries(visitByHour)
      .map(([h, count]) => ({ hour: parseInt(h), count: count as number }))
      .sort((a, b) => a.hour - b.hour);

    // By chuyen_khoa
    const matCount = donThuocs.filter((d: any) => d.chuyen_khoa === 'Mắt').length;
    const tmhCount = donThuocs.filter((d: any) => d.chuyen_khoa !== 'Mắt').length;

    // ===================== RESPONSE =====================
    res.status(200).json({
      data: {
        // Module 1: Financial
        taiChinh: {
          tongDT, tongLai, tongNo,
          tyLeLai: tongDT > 0 ? (tongLai / tongDT * 100) : 0,
          prevTongDT, prevTongLai,
          soSanhDT: prevTongDT > 0 ? ((tongDT - prevTongDT) / prevTongDT * 100) : 0,
          soSanhLai: prevTongLai > 0 ? ((tongLai - prevTongLai) / prevTongLai * 100) : 0,
          coCauDT: Object.entries(dtByCategory)
            .filter(([, v]) => v.doanhthu > 0)
            .map(([name, v]) => ({ name, ...v, pct: tongDT > 0 ? (v.doanhthu / tongDT * 100) : 0 })),
          dtByDay: dtByDayArray,
          dtByMonth: dtByMonthArray,
          topDrugs,
          aging,
          soGiaoDich: donThuocs.length + donKinhs.length,
        },
        // Module 2: Patient & CRM
        benhNhan: {
          tongBN: benhNhanRes.count || 0,
          bnMoi: benhNhanNew,
          bnTrongKy: uniqueBN.size,
          arpu,
          tyLeDenHen,
          henTotal: totalHen,
          henDaDen, henHuy, henQuaHan,
          ageDist,
        },
        // Module 3: Inventory
        tonKho: {
          giaTriTonThuoc,
          giaTriTonGong,
          tongGiaTriTon: giaTriTonThuoc + giaTriTonGong,
          thuocSapHet: thuocSapHet.slice(0, 10).map((t: any) => ({
            id: t.id, ten: t.tenthuoc, tonkho: t.tonkho, mucMin: t.muc_ton_toi_thieu,
          })),
          thuocHetHang: thuocHetHang.length,
          gongSapHet: gongSapHet.length,
          gongHet: gongHet.length,
          trongSapHet: lensAlerts.filter((l: any) => l.trang_thai_ton === 'SAP_HET').length,
          trongHet: lensAlerts.filter((l: any) => l.trang_thai_ton === 'HET').length,
          chiPhiNhap,
          soLuongHuy,
        },
        // Module 4: Performance
        hieuSuat: {
          soLuotKham,
          donThuocTBNgay: Math.round(donThuocTBNgay * 10) / 10,
          donKinhTBNgay: Math.round(donKinhTBNgay * 10) / 10,
          tyLeThanhToanDu: Math.round(tyLeThanhToanDu * 10) / 10,
          visitByHour: visitByHourArray,
          chuyenKhoa: { mat: matCount, tmh: tmhCount },
          soNgayCoDoanhThu: dtByDayArray.length,
          dtTBNgay: dtByDayArray.length > 0 ? tongDT / dtByDayArray.length : 0,
        },
      },
      meta: { from: fromStr, to: to as string, generatedAt: new Date().toISOString() },
    });
  } catch (error) {
    const err = error as Error;
    console.error('Lỗi API bao-cao-super:', err);
    res.status(500).json({ message: 'Lỗi server', error: err.message });
  }
}
