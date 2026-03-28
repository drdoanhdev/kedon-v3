import { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin as supabase, setNoCacheHeaders } from '../../../lib/tenantApi';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;
  const { tenantId } = ctx;

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).end(`Method ${req.method} Not Allowed`);
  }

  try {
    const now = new Date();
    const todayStart = new Date(now.getTime() + 7 * 60 * 60 * 1000); // UTC+7
    const todayStr = todayStart.toISOString().split('T')[0];

    // Run all queries in parallel
    const [
      choKhamRes,
      henHomNayRes,
      henCanXuLyRes,
      donKinhGanRes,
      benhnhanRes,
      lensLowRes,
      frameLowRes,
      crmRes,
    ] = await Promise.all([
      // 1. Chờ khám hôm nay
      supabase
        .from('ChoKham')
        .select('id, benhnhanid, thoigian, trangthai, BenhNhan:benhnhanid(id, ten, dienthoai)', { count: 'exact' })
        .eq('tenant_id', tenantId)
        .gte('thoigian', todayStr)
        .lt('thoigian', todayStr + 'T23:59:59')
        .order('thoigian', { ascending: true }),

      // 2. Lịch hẹn hôm nay
      supabase
        .from('hen_kham_lai')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('ngay_hen', todayStr)
        .order('gio_hen', { ascending: true, nullsFirst: false }),

      // 3. Lịch hẹn cần xử lý (chờ, quá hạn)
      supabase
        .from('hen_kham_lai')
        .select('*')
        .eq('tenant_id', tenantId)
        .eq('trang_thai', 'cho')
        .lte('ngay_hen', todayStr)
        .order('ngay_hen', { ascending: true })
        .limit(20),

      // 4. Đơn kính gần đây - chưa giao / cần theo dõi
      supabase
        .from('DonKinh')
        .select('id, benhnhanid, ngaykham, ghichu, giatrong, giagong, sotien_da_thanh_toan, benhnhan:BenhNhan(id, ten, dienthoai)')
        .eq('tenant_id', tenantId)
        .order('ngaykham', { ascending: false })
        .limit(10),

      // 5. Tổng bệnh nhân
      supabase
        .from('BenhNhan')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', tenantId),

      // 6. Tròng kính sắp hết / hết
      supabase
        .from('lens_stock')
        .select('id, sph, cyl, add_power, ton_hien_tai, muc_ton_toi_thieu, trang_thai_ton, HangTrong(ten_hang)')
        .eq('tenant_id', tenantId)
        .in('trang_thai_ton', ['HET', 'SAP_HET']),

      // 7. Gọng kính sắp hết / hết
      supabase
        .from('GongKinh')
        .select('id, ten_gong, mau_sac, ton_kho, muc_ton_toi_thieu')
        .eq('tenant_id', tenantId)
        .not('trang_thai', 'eq', false),

      // 8. CRM: Bệnh nhân lâu chưa quay lại (>3 tháng)
      supabase
        .from('DonKinh')
        .select('benhnhanid, ngaykham, benhnhan:BenhNhan(id, ten, dienthoai)')
        .eq('tenant_id', tenantId)
        .order('ngaykham', { ascending: false })
        .limit(200),
    ]);

    // Process data
    const choKham = choKhamRes.data || [];
    const choKhamCho = choKham.filter((c: any) => c.trangthai === 'chờ');
    const henHomNay = henHomNayRes.data || [];
    const henCanXuLy = henCanXuLyRes.data || [];
    const donKinhGan = donKinhGanRes.data || [];
    const tongBenhNhan = benhnhanRes.count || 0;

    // Đơn kính còn nợ
    const donKinhNo = donKinhGan.filter((dk: any) => {
      const tong = (dk.giatrong || 0) + (dk.giagong || 0);
      const daTT = dk.sotien_da_thanh_toan || 0;
      return tong > daTT && tong > 0;
    });

    // Hẹn quá hạn (ngày hẹn < hôm nay, vẫn chờ)
    const henQuaHan = henCanXuLy.filter((h: any) => h.ngay_hen < todayStr);

    // Tròng kính alerts
    const lensAlerts = (lensLowRes.data || []).map((item: any) => ({
      id: item.id,
      ten: item.HangTrong?.ten_hang || '',
      chi_tiet: `${item.sph >= 0 ? '+' : ''}${item.sph}${item.cyl ? `/${item.cyl}` : ''}`,
      ton_kho: item.ton_hien_tai,
      trang_thai: item.trang_thai_ton,
    }));
    const lensHet = lensAlerts.filter((a: any) => a.trang_thai === 'HET');
    const lensSapHet = lensAlerts.filter((a: any) => a.trang_thai === 'SAP_HET');

    // Gọng kính alerts
    const frameAlertsAll = (frameLowRes.data || []).filter((f: any) =>
      (f.ton_kho ?? 0) <= (f.muc_ton_toi_thieu ?? 2)
    );
    const frameAlerts = frameAlertsAll.map((item: any) => ({
      id: item.id,
      ten: item.ten_gong,
      chi_tiet: item.mau_sac || '',
      ton_kho: item.ton_kho ?? 0,
      trang_thai: (item.ton_kho ?? 0) <= 0 ? 'HET' : 'SAP_HET',
    }));
    const frameHet = frameAlerts.filter((a: any) => a.trang_thai === 'HET');
    const frameSapHet = frameAlerts.filter((a: any) => a.trang_thai === 'SAP_HET');

    // CRM: patients not returning >90 days
    const crmData = crmRes.data || [];
    const latestByPatient = new Map<number, any>();
    crmData.forEach((dk: any) => {
      const bnId = dk.benhnhanid;
      if (bnId && !latestByPatient.has(bnId)) {
        latestByPatient.set(bnId, dk);
      }
    });
    const threeMonthsAgo = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    threeMonthsAgo.setDate(threeMonthsAgo.getDate() - 90);
    const threeMonthsStr = threeMonthsAgo.toISOString().split('T')[0];
    const crmKhachCanChamSoc = Array.from(latestByPatient.values())
      .filter((dk: any) => dk.ngaykham && dk.ngaykham < threeMonthsStr && dk.benhnhan)
      .map((dk: any) => {
        const daysSince = Math.floor((new Date(todayStr).getTime() - new Date(dk.ngaykham).getTime()) / (1000 * 60 * 60 * 24));
        return {
          id: dk.benhnhan.id,
          ten: dk.benhnhan.ten,
          dienthoai: dk.benhnhan.dienthoai,
          ngay_kham_cuoi: dk.ngaykham,
          so_ngay: daysSince,
        };
      })
      .sort((a: any, b: any) => b.so_ngay - a.so_ngay)
      .slice(0, 10);

    res.status(200).json({
      today: todayStr,
      stats: {
        tongBenhNhan,
        choKham: choKhamCho.length,
        henHomNay: henHomNay.length,
        canXuLy: henCanXuLy.length,
        trongSapHet: lensAlerts.length,
        gongSapHet: frameAlerts.length,
      },
      viecCanLam: {
        henQuaHan: henQuaHan.slice(0, 5),
        donKinhNo: donKinhNo.slice(0, 5),
        henCanXuLy: henCanXuLy.slice(0, 5),
      },
      khoKinh: {
        trong: { het: lensHet.slice(0, 8), sapHet: lensSapHet.slice(0, 8) },
        gong: { het: frameHet.slice(0, 8), sapHet: frameSapHet.slice(0, 8) },
      },
      lichHomNay: henHomNay.slice(0, 10),
      choKhamList: choKhamCho.slice(0, 10),
      crm: crmKhachCanChamSoc,
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Lỗi khi tải dashboard', details: message });
  }
}
