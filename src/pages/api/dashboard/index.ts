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

    // Tenant-level dashboard CRM settings
    const { data: tenantRow } = await supabase
      .from('tenants')
      .select('settings')
      .eq('id', tenantId)
      .maybeSingle();

    const tenantSettings = (tenantRow as any)?.settings || {};
    const crmCfg = tenantSettings?.dashboard?.crm || {};
    const daysThresholdRaw = Number(crmCfg.daysThreshold);
    const crmLimitRaw = Number(crmCfg.limit);
    const crmOnlyHasPhone = crmCfg.onlyHasPhone === true;
    const crmPrioritizeHighValue = crmCfg.prioritizeHighValue !== false;
    const crmDaysThreshold = Number.isFinite(daysThresholdRaw) ? Math.min(Math.max(daysThresholdRaw, 30), 365) : 90;
    const crmLimit = Number.isFinite(crmLimitRaw) ? Math.min(Math.max(crmLimitRaw, 5), 100) : 20;

    // Run all queries in parallel
    const [
      choKhamRes,
      henHomNayRes,
      henCanXuLyRes,
      donKinhGanRes,
      benhnhanRes,
      lensLowRes,
      frameLowRes,
      lensOrderRes,
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
        .select('id, sph, cyl, add_power, ton_hien_tai, trang_thai_ton, HangTrong(ten_hang)')
        .eq('tenant_id', tenantId)
        .in('trang_thai_ton', ['HET', 'SAP_HET']),

      // 7. Gọng kính sắp hết / hết
      supabase
        .from('GongKinh')
        .select('id, ten_gong, mau_sac, ton_kho, muc_ton_can_co')
        .eq('tenant_id', tenantId)
        .not('trang_thai', 'eq', false),

      // 8. Tròng cần đặt / đang về
      supabase
        .from('lens_order')
        .select('trang_thai, so_luong_mieng')
        .eq('tenant_id', tenantId)
        .in('trang_thai', ['cho_dat', 'da_dat']),

      // 9. CRM: Bệnh nhân lâu chưa quay lại (>3 tháng)
      supabase
        .from('DonKinh')
        .select('benhnhanid, ngaykham, giatrong, giagong, benhnhan:BenhNhan(id, ten, dienthoai)')
        .eq('tenant_id', tenantId)
        .order('ngaykham', { ascending: false }),
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
      (f.ton_kho ?? 0) <= (f.muc_ton_can_co ?? 2)
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

    // Tròng cần đặt / đang về
    const lensOrderData = lensOrderRes.data || [];
    const trongCanDat = lensOrderData
      .filter((o: any) => o.trang_thai === 'cho_dat')
      .reduce((sum: number, o: any) => sum + (o.so_luong_mieng || 0), 0);
    const trongDangVe = lensOrderData
      .filter((o: any) => o.trang_thai === 'da_dat')
      .reduce((sum: number, o: any) => sum + (o.so_luong_mieng || 0), 0);

    // CRM: patients not returning >90 days
    const crmData = crmRes.data || [];
    const latestByPatient = new Map<string, any>();
    crmData.forEach((dk: any) => {
      const bnId = String(dk.benhnhanid || '');
      if (bnId && !latestByPatient.has(bnId)) {
        latestByPatient.set(bnId, dk);
      }
    });
    const thresholdDate = new Date(now.getTime() + 7 * 60 * 60 * 1000);
    thresholdDate.setDate(thresholdDate.getDate() - crmDaysThreshold);
    const thresholdDateStr = thresholdDate.toISOString().split('T')[0];
    const tierRank: Record<string, number> = { A: 1, B: 2, C: 3 };

    const crmKhachCanChamSoc = Array.from(latestByPatient.values())
      .filter((dk: any) => dk.ngaykham && dk.ngaykham < thresholdDateStr && dk.benhnhan)
      .filter((dk: any) => !crmOnlyHasPhone || !!dk.benhnhan?.dienthoai)
      .map((dk: any) => {
        const daysSince = Math.floor((new Date(todayStr).getTime() - new Date(dk.ngaykham).getTime()) / (1000 * 60 * 60 * 24));
        const latestOrderValue = (dk.giatrong || 0) + (dk.giagong || 0);
        const priorityScore = daysSince + (crmPrioritizeHighValue ? Math.min(latestOrderValue / 200000, 50) : 0);
        const priorityTier = priorityScore >= 140 ? 'A' : priorityScore >= 105 ? 'B' : 'C';
        return {
          id: dk.benhnhan.id,
          ten: dk.benhnhan.ten,
          dienthoai: dk.benhnhan.dienthoai,
          ngay_kham_cuoi: dk.ngaykham,
          so_ngay: daysSince,
          gia_tri_don_gan_nhat: latestOrderValue,
          uu_tien: Math.round(priorityScore),
          muc_uu_tien: priorityTier,
        };
      })
      .sort((a: any, b: any) => {
        const rankA = tierRank[a.muc_uu_tien] || 99;
        const rankB = tierRank[b.muc_uu_tien] || 99;
        if (rankA !== rankB) return rankA - rankB;
        if ((b.so_ngay || 0) !== (a.so_ngay || 0)) return (b.so_ngay || 0) - (a.so_ngay || 0);
        return (b.gia_tri_don_gan_nhat || 0) - (a.gia_tri_don_gan_nhat || 0);
      })
      .slice(0, crmLimit);

    // Map trạng thái chăm sóc theo bệnh nhân cho card CRM
    const crmPatientIds = crmKhachCanChamSoc.map((c: any) => c.id).filter(Boolean);
    let careStatusMap = new Map<number, any>();
    if (crmPatientIds.length > 0) {
      const { data: careRows, error: careErr } = await supabase
        .from('crm_care_status')
        .select('benhnhan_id, status, note, next_call_at, updated_at')
        .eq('tenant_id', tenantId)
        .in('benhnhan_id', crmPatientIds as number[]);
      if (!careErr && careRows) {
        careStatusMap = new Map<number, any>((careRows as any[]).map((r: any) => [r.benhnhan_id, r]));
      }
    }

    const crmWithStatus = crmKhachCanChamSoc.map((c: any) => ({
      ...c,
      care_status: careStatusMap.get(c.id)?.status || 'chua_lien_he',
      care_note: careStatusMap.get(c.id)?.note || '',
      next_call_at: careStatusMap.get(c.id)?.next_call_at || null,
      care_updated_at: careStatusMap.get(c.id)?.updated_at || null,
    }));

    const crmPrioritySummary = crmWithStatus.reduce((acc: any, c: any) => {
      const tier = c.muc_uu_tien || 'C';
      if (tier === 'A') acc.A += 1;
      else if (tier === 'B') acc.B += 1;
      else acc.C += 1;
      return acc;
    }, { A: 0, B: 0, C: 0 });

    res.status(200).json({
      today: todayStr,
      stats: {
        tongBenhNhan,
        choKham: choKhamCho.length,
        henHomNay: henHomNay.length,
        canXuLy: henCanXuLy.length,
        henTong: henHomNay.length + henCanXuLy.length,
        trongSapHet: lensAlerts.length,
        gongSapHet: frameAlerts.length,
        trongCanDat,
        trongDangVe,
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
      crm: crmWithStatus,
      crmMeta: {
        daysThreshold: crmDaysThreshold,
        limit: crmLimit,
        onlyHasPhone: crmOnlyHasPhone,
        prioritizeHighValue: crmPrioritizeHighValue,
        prioritySummary: crmPrioritySummary,
      },
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    res.status(500).json({ message: 'Lỗi khi tải dashboard', details: message });
  }
}
