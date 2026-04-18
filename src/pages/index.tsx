import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import axios from 'axios';
import {
  Users, Clock, CalendarDays, Bell, AlertTriangle, Glasses,
  Pill, BarChart3, ChevronRight, Phone, RefreshCw, CheckCircle2,
  UserCheck, Package, Sparkles, HeartHandshake,
} from 'lucide-react';

/* ───────── Types ───────── */
interface TrialInfo {
  plan: string;
  trial: {
    daysRemaining: number;
    totalDays: number;
    usedPrescriptions: number;
    maxPrescriptions: number;
    prescriptionsRemaining: number;
    isExpired: boolean;
  };
}

interface KhoKinhAlert { id: number; ten: string; chi_tiet: string; ton_kho: number; trang_thai: string }

interface DashboardData {
  today: string;
  stats: {
    tongBenhNhan: number; choKham: number; henHomNay: number;
    canXuLy: number; henTong: number;
    trongSapHet: number; gongSapHet: number;
    trongCanDat: number; trongDangVe: number;
  };
  viecCanLam: { henQuaHan: any[]; donKinhNo: any[]; henCanXuLy: any[] };
  khoKinh: {
    trong: { het: KhoKinhAlert[]; sapHet: KhoKinhAlert[] };
    gong: { het: KhoKinhAlert[]; sapHet: KhoKinhAlert[] };
  };
  lichHomNay: any[];
  choKhamList: any[];
  crm: { id: number; ten: string; dienthoai: string; ngay_kham_cuoi: string; so_ngay: number }[];
}

/* ───────── Helpers ───────── */
function formatNgay(d: string): string {
  if (!d) return '';
  const p = d.split('-');
  return p.length === 3 ? `${p[2]}/${p[1]}/${p[0]}` : d;
}
function formatGio(t: string | null): string {
  return t ? t.substring(0, 5) : '';
}

/* ───────── Trial Banner ───────── */
function TrialBanner() {
  const [trial, setTrial] = useState<TrialInfo | null>(null);
  const { currentTenantId } = useAuth();

  useEffect(() => {
    if (!currentTenantId) return;
    (async () => {
      try {
        const { getAuthHeaders } = await import('../lib/fetchWithAuth');
        const headers = await getAuthHeaders();
        const res = await fetch('/api/tenants/trial', { headers });
        if (res.ok) setTrial(await res.json());
      } catch {}
    })();
  }, [currentTenantId]);

  if (!trial || trial.plan !== 'trial') return null;
  const { daysRemaining, totalDays, usedPrescriptions, maxPrescriptions, isExpired } = trial.trial;
  const dayPct = Math.round((daysRemaining / totalDays) * 100);
  const prescPct = Math.round((usedPrescriptions / maxPrescriptions) * 100);

  if (isExpired) {
    return (
      <div className="bg-red-50 border border-red-200 rounded-xl p-4 mb-4">
        <div className="flex items-center gap-2 mb-1">
          <AlertTriangle className="w-5 h-5 text-red-600" />
          <span className="font-semibold text-red-800">Gói dùng thử đã hết hạn</span>
        </div>
        <p className="text-red-700 text-sm mb-2">Vui lòng nâng cấp để tiếp tục sử dụng.</p>
        <Link href="/billing" className="inline-flex items-center px-3 py-1.5 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm font-medium">Nâng cấp ngay →</Link>
      </div>
    );
  }

  return (
    <div className="bg-gradient-to-r from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 mb-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <span className="text-lg">🎁</span>
          <span className="text-sm font-semibold text-blue-900">Gói dùng thử</span>
        </div>
        <Link href="/billing" className="text-xs text-blue-600 hover:text-blue-800 font-medium">Xem gói nâng cấp →</Link>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Còn lại</span>
            <span className="text-sm font-bold text-blue-700">{daysRemaining} ngày</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${dayPct > 30 ? 'bg-blue-500' : dayPct > 10 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${dayPct}%` }} />
          </div>
        </div>
        <div className="bg-white rounded-lg p-3 shadow-sm">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-gray-500">Đơn đã dùng</span>
            <span className="text-sm font-bold text-indigo-700">{usedPrescriptions}/{maxPrescriptions}</span>
          </div>
          <div className="w-full bg-gray-200 rounded-full h-1.5">
            <div className={`h-1.5 rounded-full ${prescPct < 70 ? 'bg-indigo-500' : prescPct < 90 ? 'bg-yellow-500' : 'bg-red-500'}`} style={{ width: `${Math.min(prescPct, 100)}%` }} />
          </div>
        </div>
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════ */
/*                  MAIN PAGE                 */
/* ═══════════════════════════════════════════ */
export default function HomePage() {
  const [data, setData] = useState<DashboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const { currentTenantId } = useAuth();

  const fetchDashboard = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`/api/dashboard?_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
      setData(res.data);
    } catch {} finally { setLoading(false); }
  };

  useEffect(() => { if (currentTenantId) fetchDashboard(); }, [currentTenantId]);

  const todayFmt = data?.today ? formatNgay(data.today) : new Date().toLocaleDateString('vi-VN');
  const s = data?.stats || {
    tongBenhNhan: 0,
    choKham: 0,
    henHomNay: 0,
    canXuLy: 0,
    henTong: 0,
    trongSapHet: 0,
    gongSapHet: 0,
    trongCanDat: 0,
    trongDangVe: 0,
  };
  const vcl = data?.viecCanLam || { henQuaHan: [], donKinhNo: [], henCanXuLy: [] };
  const kk = data?.khoKinh || { trong: { het: [], sapHet: [] }, gong: { het: [], sapHet: [] } };
  const lich = data?.lichHomNay || [];
  const ckList = data?.choKhamList || [];
  const crm = data?.crm || [];
  const totalVCL = vcl.henQuaHan.length + vcl.donKinhNo.length;

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-6xl mx-auto py-4 px-4 space-y-4">

          {/* ══════ HEADER ══════ */}
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-bold text-gray-800">Hôm nay, {todayFmt}</h1>
            <button onClick={fetchDashboard} disabled={loading} className="p-2 text-gray-400 hover:text-gray-600 transition-colors" title="Làm mới">
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <TrialBanner />

          {/* ══════ 2. TỔNG QUAN HÔM NAY — 6 stats ══════ */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <Link href="/benh-nhan" className="bg-white rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-blue-500">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-blue-50 rounded-lg flex items-center justify-center flex-shrink-0"><Users className="w-4.5 h-4.5 text-blue-600" /></div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-gray-800 leading-tight">{s.tongBenhNhan}</div>
                  <div className="text-[11px] text-gray-500 truncate">Bệnh nhân</div>
                </div>
              </div>
            </Link>
            <Link href="/cho-kham" className="bg-white rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-orange-500">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-orange-50 rounded-lg flex items-center justify-center flex-shrink-0"><Clock className="w-4.5 h-4.5 text-orange-600" /></div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-gray-800 leading-tight">{s.choKham}</div>
                  <div className="text-[11px] text-gray-500 truncate">Đang chờ</div>
                </div>
              </div>
            </Link>
            <Link href="/lich-hen" className="bg-white rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-green-500">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-green-50 rounded-lg flex items-center justify-center flex-shrink-0"><CalendarDays className="w-4.5 h-4.5 text-green-600" /></div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-gray-800 leading-tight">{s.henTong || (s.henHomNay + s.canXuLy)}</div>
                  <div className="text-[11px] text-gray-500 truncate">Lịch hẹn và nhắc lịch</div>
                  <div className="text-[10px] text-gray-400 truncate">Hôm nay {s.henHomNay} • Cần xử lý {s.canXuLy}</div>
                </div>
              </div>
            </Link>
            <Link href="/quan-ly-kho?tab=lens_order" className="bg-white rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-red-500">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-red-50 rounded-lg flex items-center justify-center flex-shrink-0"><Bell className="w-4.5 h-4.5 text-red-600" /></div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-gray-800 leading-tight">{s.trongCanDat}</div>
                  <div className="text-[11px] text-gray-500 truncate">Tròng cần đặt</div>
                  <div className="text-[10px] text-gray-400 truncate">Đang về {s.trongDangVe}</div>
                </div>
              </div>
            </Link>
            <Link href="/quan-ly-kho" className="bg-white rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-purple-500">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-purple-50 rounded-lg flex items-center justify-center flex-shrink-0"><Sparkles className="w-4.5 h-4.5 text-purple-600" /></div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-gray-800 leading-tight">{s.trongSapHet}</div>
                  <div className="text-[11px] text-gray-500 truncate">Tròng sắp hết</div>
                </div>
              </div>
            </Link>
            <Link href="/quan-ly-kinh" className="bg-white rounded-xl p-3.5 shadow-sm hover:shadow-md transition-shadow border-l-4 border-pink-500">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 bg-pink-50 rounded-lg flex items-center justify-center flex-shrink-0"><Glasses className="w-4.5 h-4.5 text-pink-600" /></div>
                <div className="min-w-0">
                  <div className="text-xl font-bold text-gray-800 leading-tight">{s.gongSapHet}</div>
                  <div className="text-[11px] text-gray-500 truncate">Gọng sắp hết</div>
                </div>
              </div>
            </Link>
          </div>

          {/* ══════ ROW 2: VIỆC CẦN LÀM + CẢNH BÁO KHO KÍNH ══════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* LEFT: Việc cần làm */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-red-50 flex items-center gap-2">
                <Bell className="w-4 h-4 text-red-600" />
                <span className="font-semibold text-sm text-red-800">Việc cần làm</span>
                {totalVCL > 0 && <span className="ml-auto text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">{totalVCL}</span>}
              </div>
              <div className="p-3 space-y-1.5 max-h-80 overflow-y-auto">
                {totalVCL === 0 && vcl.henCanXuLy.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                    <p className="text-sm">Không có việc cần xử lý!</p>
                  </div>
                ) : (
                  <>
                    {vcl.henQuaHan.map((h: any) => (
                      <Link key={`qh-${h.id}`} href="/lich-hen" className="flex items-center gap-3 p-2.5 rounded-lg bg-red-50 hover:bg-red-100 transition-colors">
                        <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800 truncate block">{h.ten_benhnhan}</span>
                          <span className="text-xs text-red-600">Quá hạn tái khám {formatNgay(h.ngay_hen)}</span>
                        </div>
                        {h.dienthoai && <a href={`tel:${h.dienthoai}`} onClick={e => e.stopPropagation()} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg"><Phone className="w-3.5 h-3.5" /></a>}
                      </Link>
                    ))}
                    {vcl.donKinhNo.map((dk: any) => (
                      <Link key={`no-${dk.id}`} href={dk.benhnhan?.id ? `/ke-don-kinh?bn=${dk.benhnhan.id}` : '#'} className="flex items-center gap-3 p-2.5 rounded-lg bg-yellow-50 hover:bg-yellow-100 transition-colors">
                        <Glasses className="w-4 h-4 text-yellow-600 flex-shrink-0" />
                        <div className="flex-1 min-w-0">
                          <span className="text-sm font-medium text-gray-800 truncate block">{dk.benhnhan?.ten || 'Không tên'}</span>
                          <span className="text-xs text-yellow-700">Đơn kính còn nợ {(((dk.giatrong || 0) + (dk.giagong || 0) - (dk.sotien_da_thanh_toan || 0)) / 1000).toFixed(0)}k</span>
                        </div>
                      </Link>
                    ))}
                    {vcl.henCanXuLy
                      .filter((h: any) => !vcl.henQuaHan.find((qh: any) => qh.id === h.id))
                      .slice(0, 3)
                      .map((h: any) => (
                        <Link key={`cx-${h.id}`} href="/lich-hen" className="flex items-center gap-3 p-2.5 rounded-lg bg-orange-50 hover:bg-orange-100 transition-colors">
                          <CalendarDays className="w-4 h-4 text-orange-500 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <span className="text-sm font-medium text-gray-800 truncate block">{h.ten_benhnhan}</span>
                            <span className="text-xs text-orange-600">Hẹn {formatNgay(h.ngay_hen)} — {h.ly_do}</span>
                          </div>
                        </Link>
                      ))}
                  </>
                )}
                {totalVCL > 0 && (
                  <Link href="/lich-hen" className="block text-center text-xs text-blue-600 hover:text-blue-800 font-medium pt-1">Xem chi tiết →</Link>
                )}
              </div>
            </div>

            {/* RIGHT: Cảnh báo kho kính */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-purple-50 flex items-center gap-2">
                <Glasses className="w-4 h-4 text-purple-600" />
                <span className="font-semibold text-sm text-purple-800">Cảnh báo kho kính</span>
                {(s.trongSapHet + s.gongSapHet) > 0 && (
                  <span className="ml-auto text-xs bg-purple-600 text-white px-2 py-0.5 rounded-full">{s.trongSapHet + s.gongSapHet}</span>
                )}
              </div>
              <div className="p-3 max-h-80 overflow-y-auto space-y-3">
                {(kk.trong.het.length + kk.trong.sapHet.length + kk.gong.het.length + kk.gong.sapHet.length) === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <CheckCircle2 className="w-8 h-8 mx-auto mb-2 text-green-400" />
                    <p className="text-sm">Kho kính ổn!</p>
                  </div>
                ) : (
                  <>
                    {/* TRÒNG */}
                    {(kk.trong.het.length + kk.trong.sapHet.length) > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Sparkles className="w-3.5 h-3.5 text-purple-500" />
                          <span className="text-xs font-semibold text-purple-700 uppercase tracking-wide">Tròng</span>
                        </div>
                        <div className="space-y-1">
                          {kk.trong.het.map((a) => (
                            <div key={`th-${a.id}`} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-red-50">
                              <span className="text-sm text-gray-800">{a.ten} <span className="text-gray-500">{a.chi_tiet}</span></span>
                              <span className="text-xs font-bold text-red-600">Hết</span>
                            </div>
                          ))}
                          {kk.trong.sapHet.map((a) => (
                            <div key={`ts-${a.id}`} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-yellow-50">
                              <span className="text-sm text-gray-800">{a.ten} <span className="text-gray-500">{a.chi_tiet}</span></span>
                              <span className="text-xs font-semibold text-yellow-700">Còn {a.ton_kho}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                    {/* GỌNG */}
                    {(kk.gong.het.length + kk.gong.sapHet.length) > 0 && (
                      <div>
                        <div className="flex items-center gap-1.5 mb-1.5">
                          <Glasses className="w-3.5 h-3.5 text-pink-500" />
                          <span className="text-xs font-semibold text-pink-700 uppercase tracking-wide">Gọng</span>
                        </div>
                        <div className="space-y-1">
                          {kk.gong.het.map((a) => (
                            <div key={`gh-${a.id}`} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-red-50">
                              <span className="text-sm text-gray-800">{a.ten} <span className="text-gray-500">{a.chi_tiet}</span></span>
                              <span className="text-xs font-bold text-red-600">Hết</span>
                            </div>
                          ))}
                          {kk.gong.sapHet.map((a) => (
                            <div key={`gs-${a.id}`} className="flex items-center justify-between px-2.5 py-1.5 rounded-lg bg-yellow-50">
                              <span className="text-sm text-gray-800">{a.ten} <span className="text-gray-500">{a.chi_tiet}</span></span>
                              <span className="text-xs font-semibold text-yellow-700">Còn {a.ton_kho}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </>
                )}
                <Link href="/quan-ly-kho" className="block text-center text-xs text-blue-600 hover:text-blue-800 font-medium pt-1">Nhập hàng →</Link>
              </div>
            </div>
          </div>

          {/* ══════ ROW 3: LỊCH HÔM NAY + CHỜ KHÁM ══════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* LEFT: Lịch hôm nay */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-green-50 flex items-center gap-2">
                <CalendarDays className="w-4 h-4 text-green-600" />
                <span className="font-semibold text-sm text-green-800">Lịch hôm nay</span>
                {lich.length > 0 && <span className="ml-auto text-xs bg-green-600 text-white px-2 py-0.5 rounded-full">{lich.length}</span>}
              </div>
              <div className="p-3 space-y-1 max-h-72 overflow-y-auto">
                {lich.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <CalendarDays className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">Không có lịch hẹn hôm nay</p>
                  </div>
                ) : (
                  lich.map((h: any) => (
                    <div key={h.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-gray-50 transition-colors">
                      <div className="text-xs font-mono font-bold text-blue-600 w-11 text-center flex-shrink-0">
                        {formatGio(h.gio_hen) || '—'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800 truncate block">{h.ten_benhnhan}</span>
                        <span className="text-xs text-gray-500">{h.ly_do}</span>
                      </div>
                      <div className="flex items-center gap-1 flex-shrink-0">
                        {h.trang_thai === 'da_den' ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-green-100 text-green-700 rounded-full">Đã đến</span>
                        ) : h.trang_thai === 'huy' ? (
                          <span className="text-[10px] px-1.5 py-0.5 bg-red-100 text-red-700 rounded-full">Hủy</span>
                        ) : (
                          <span className="text-[10px] px-1.5 py-0.5 bg-yellow-100 text-yellow-700 rounded-full">Chờ</span>
                        )}
                        {h.dienthoai && <a href={`tel:${h.dienthoai}`} className="p-1 text-green-600 hover:bg-green-100 rounded"><Phone className="w-3 h-3" /></a>}
                      </div>
                    </div>
                  ))
                )}
                <Link href="/lich-hen" className="block text-center text-xs text-blue-600 hover:text-blue-800 font-medium pt-1">Xem tất cả →</Link>
              </div>
            </div>

            {/* RIGHT: Đang chờ khám */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-orange-50 flex items-center gap-2">
                <Clock className="w-4 h-4 text-orange-600" />
                <span className="font-semibold text-sm text-orange-800">Đang chờ khám</span>
                {ckList.length > 0 && <span className="ml-auto text-xs bg-orange-600 text-white px-2 py-0.5 rounded-full">{ckList.length}</span>}
              </div>
              <div className="p-3 max-h-72 overflow-y-auto">
                {ckList.length === 0 ? (
                  <div className="text-center py-8 text-gray-400">
                    <UserCheck className="w-8 h-8 mx-auto mb-2" />
                    <p className="text-sm">Không có bệnh nhân chờ</p>
                  </div>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {ckList.map((ck: any) => (
                      <Link key={ck.id} href={ck.BenhNhan?.id ? `/ke-don-kinh?bn=${ck.BenhNhan.id}` : '/cho-kham'} className="flex items-center gap-2 px-3 py-2 bg-orange-50 rounded-lg hover:bg-orange-100 transition-colors">
                        <UserCheck className="w-3.5 h-3.5 text-orange-600" />
                        <span className="text-sm font-medium text-gray-800">{ck.BenhNhan?.ten || 'BN'}</span>
                      </Link>
                    ))}
                  </div>
                )}
                <Link href="/cho-kham" className="block text-center text-xs text-blue-600 hover:text-blue-800 font-medium pt-2">Mở phòng chờ →</Link>
              </div>
            </div>
          </div>

          {/* ══════ ROW 4: CRM + MODULE NHANH ══════ */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">

            {/* LEFT: CRM khách cần chăm sóc */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-teal-50 flex items-center gap-2">
                <HeartHandshake className="w-4 h-4 text-teal-600" />
                <span className="font-semibold text-sm text-teal-800">Khách cần chăm sóc</span>
                {crm.length > 0 && <span className="ml-auto text-xs bg-teal-600 text-white px-2 py-0.5 rounded-full">{crm.length}</span>}
              </div>
              <div className="p-3 space-y-1 max-h-64 overflow-y-auto">
                {crm.length === 0 ? (
                  <div className="text-center py-6 text-gray-400">
                    <HeartHandshake className="w-8 h-8 mx-auto mb-2 text-teal-300" />
                    <p className="text-sm">Tất cả khách hàng đều hoạt động!</p>
                  </div>
                ) : (
                  crm.map((c) => (
                    <Link key={c.id} href={`/ke-don-kinh?bn=${c.id}`} className="flex items-center gap-3 p-2 rounded-lg hover:bg-teal-50 transition-colors">
                      <div className="w-8 h-8 bg-teal-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <Users className="w-3.5 h-3.5 text-teal-600" />
                      </div>
                      <div className="flex-1 min-w-0">
                        <span className="text-sm font-medium text-gray-800 truncate block">{c.ten}</span>
                        <span className="text-xs text-gray-500">{c.so_ngay} ngày chưa quay lại</span>
                      </div>
                      {c.dienthoai && (
                        <a href={`tel:${c.dienthoai}`} onClick={e => e.stopPropagation()} className="p-1.5 text-green-600 hover:bg-green-100 rounded-lg flex-shrink-0">
                          <Phone className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </Link>
                  ))
                )}
              </div>
            </div>

            {/* RIGHT: Module nhanh */}
            <div className="bg-white rounded-xl shadow-sm overflow-hidden">
              <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                <Package className="w-4 h-4 text-gray-600" />
                <span className="font-semibold text-sm text-gray-800">Quản lý nhanh</span>
              </div>
              <div className="p-3 grid grid-cols-2 gap-2.5">
                {[
                  { href: '/benh-nhan', icon: Users, label: 'Bệnh nhân', bg: 'bg-blue-50', text: 'text-blue-600' },
                  { href: '/don-kinh', icon: Glasses, label: 'Đơn kính', bg: 'bg-purple-50', text: 'text-purple-600' },
                  { href: '/don-thuoc', icon: Pill, label: 'Đơn thuốc', bg: 'bg-green-50', text: 'text-green-600' },
                  { href: '/bao-cao', icon: BarChart3, label: 'Báo cáo', bg: 'bg-yellow-50', text: 'text-yellow-600' },
                  { href: '/quan-ly-kho', icon: Sparkles, label: 'Kho tròng', bg: 'bg-purple-50', text: 'text-purple-600' },
                  { href: '/quan-ly-kinh', icon: Glasses, label: 'Kho gọng', bg: 'bg-pink-50', text: 'text-pink-600' },
                ].map(({ href, icon: Icon, label, bg, text }) => (
                  <Link key={href} href={href} className="flex items-center gap-2.5 p-3 rounded-lg hover:bg-gray-50 transition-all group border border-gray-100">
                    <div className={`w-8 h-8 ${bg} rounded-lg flex items-center justify-center flex-shrink-0`}>
                      <Icon className={`w-4 h-4 ${text}`} />
                    </div>
                    <span className="text-sm font-medium text-gray-700 group-hover:text-gray-900">{label}</span>
                    <ChevronRight className="w-3.5 h-3.5 text-gray-300 ml-auto" />
                  </Link>
                ))}
              </div>
            </div>
          </div>

        </main>
      </div>
    </ProtectedRoute>
  );
}