import React, { useState, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '../components/ui/tabs';
import { BarChart } from '../components/ui/chart';
import { toast } from 'react-hot-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import ProtectedRoute from '../components/ProtectedRoute';
import Link from 'next/link';

// ═══════════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════════
interface CoCauItem { name: string; doanhthu: number; lai: number; no: number; count: number; pct: number }
interface DayData { day: string; doanhthu: number; lai: number; no: number; count: number }
interface MonthData { month: string; doanhthu: number; lai: number; no: number; count: number }
interface TopDrug { id: number; ten: string; doanhthu: number; lai: number; soluong: number }
interface ThuocAlert { id: number; ten: string; tonkho: number; mucMin: number }
interface HourData { hour: number; count: number }

interface SuperReport {
  taiChinh: {
    tongDT: number; tongLai: number; tongNo: number; tyLeLai: number;
    prevTongDT: number; prevTongLai: number;
    soSanhDT: number; soSanhLai: number;
    coCauDT: CoCauItem[];
    dtByDay: DayData[];
    dtByMonth: MonthData[];
    topDrugs: TopDrug[];
    aging: { under30: number; d30_60: number; d60_90: number; over90: number };
    soGiaoDich: number;
  };
  benhNhan: {
    tongBN: number; bnMoi: number; bnTrongKy: number; arpu: number;
    tyLeDenHen: number; henTotal: number; henDaDen: number; henHuy: number; henQuaHan: number;
    ageDist: Record<string, number>;
  };
  tonKho: {
    giaTriTonThuoc: number; giaTriTonGong: number; tongGiaTriTon: number;
    thuocSapHet: ThuocAlert[]; thuocHetHang: number;
    gongSapHet: number; gongHet: number; trongSapHet: number; trongHet: number;
    chiPhiNhap: number; soLuongHuy: number;
  };
  hieuSuat: {
    soLuotKham: number; donThuocTBNgay: number; donKinhTBNgay: number;
    tyLeThanhToanDu: number; visitByHour: HourData[];
    chuyenKhoa: { mat: number; tmh: number };
    soNgayCoDoanhThu: number; dtTBNgay: number;
  };
}

// ═══════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════
const fmtMoney = (v: number) => {
  if (v >= 1_000_000) return `${(v / 1_000_000).toFixed(1)}M`;
  if (v >= 1_000) return `${(v / 1_000).toFixed(0)}k`;
  return v.toString();
};

const fmtPct = (v: number) => `${v >= 0 ? '+' : ''}${v.toFixed(1)}%`;

const TrendBadge = ({ value }: { value: number }) => {
  if (value === 0) return <span className="text-xs text-gray-400">—</span>;
  const up = value > 0;
  return (
    <span className={`inline-flex items-center text-xs font-medium px-1.5 py-0.5 rounded-full ${up ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
      {up ? '↑' : '↓'} {Math.abs(value).toFixed(1)}%
    </span>
  );
};

// Mini donut chart (CSS-based)
const DonutChart = ({ data, colors }: { data: { label: string; value: number; color: string }[]; colors: string[] }) => {
  const total = data.reduce((s, d) => s + d.value, 0);
  if (total === 0) return <div className="text-gray-400 text-sm text-center py-8">Không có dữ liệu</div>;

  let cumPct = 0;
  const segments = data.map((d, i) => {
    const pct = (d.value / total) * 100;
    const start = cumPct;
    cumPct += pct;
    return { ...d, pct, start, color: colors[i % colors.length] };
  });

  const gradient = segments
    .map(s => `${s.color} ${s.start}% ${s.start + s.pct}%`)
    .join(', ');

  return (
    <div className="flex flex-col items-center gap-3">
      <div
        className="w-36 h-36 rounded-full relative"
        style={{ background: `conic-gradient(${gradient})` }}
      >
        <div className="absolute inset-4 bg-white rounded-full flex items-center justify-center">
          <div className="text-center">
            <div className="text-sm font-bold text-gray-700">{fmtMoney(total)}</div>
            <div className="text-[10px] text-gray-400">Tổng</div>
          </div>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-1 text-xs w-full">
        {segments.filter(s => s.pct > 0).map((s, i) => (
          <div key={i} className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ backgroundColor: s.color }} />
            <span className="text-gray-600 truncate flex-1">{s.label}</span>
            <span className="font-medium text-gray-800">{s.pct.toFixed(1)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
};

// Horizontal bar helper
const HBar = ({ label, value, maxValue, color, suffix = '' }: { label: string; value: number; maxValue: number; color: string; suffix?: string }) => (
  <div className="flex items-center gap-2 text-sm">
    <span className="w-20 text-gray-600 truncate text-xs">{label}</span>
    <div className="flex-1 bg-gray-100 rounded-full h-4 overflow-hidden">
      <div className="h-full rounded-full transition-all" style={{ width: `${maxValue > 0 ? Math.max((value / maxValue) * 100, 2) : 0}%`, backgroundColor: color }} />
    </div>
    <span className="w-16 text-right font-medium text-xs">{fmtMoney(value)}{suffix}</span>
  </div>
);

// KPI Card
const KpiCard = ({ label, value, sub, color = 'blue', trend }: { label: string; value: string; sub?: string; color?: string; trend?: number }) => {
  const colorMap: Record<string, string> = {
    blue: 'text-blue-600 bg-blue-50 border-blue-100',
    green: 'text-green-600 bg-green-50 border-green-100',
    red: 'text-red-600 bg-red-50 border-red-100',
    purple: 'text-purple-600 bg-purple-50 border-purple-100',
    orange: 'text-orange-600 bg-orange-50 border-orange-100',
    yellow: 'text-yellow-600 bg-yellow-50 border-yellow-100',
    cyan: 'text-cyan-600 bg-cyan-50 border-cyan-100',
  };
  return (
    <Card className={`border ${colorMap[color]?.split(' ').slice(2).join(' ') || 'border-gray-100'}`}>
      <CardContent className={`p-3 lg:p-4 ${colorMap[color]?.split(' ').slice(1, 2).join(' ') || ''}`}>
        <div className="flex items-start justify-between">
          <div>
            <div className={`text-xl lg:text-2xl font-bold ${colorMap[color]?.split(' ')[0] || ''}`}>{value}</div>
            <div className="text-xs text-gray-500 mt-0.5">{label}</div>
          </div>
          {trend !== undefined && <TrendBadge value={trend} />}
        </div>
        {sub && <div className="text-[11px] text-gray-400 mt-1">{sub}</div>}
      </CardContent>
    </Card>
  );
};

// ═══════════════════════════════════════════════════════════
// MAIN PAGE
// ═══════════════════════════════════════════════════════════
export default function BaoCaoSuperPage() {
  const currentDate = new Date();
  const [fromDate, setFromDate] = useState(format(startOfMonth(currentDate), 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState(format(endOfMonth(currentDate), 'yyyy-MM-dd'));
  const [report, setReport] = useState<SuperReport | null>(null);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState('overview');

  // Password protection
  const { user, signIn } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPasswordError('');
    if (!user?.email) { setPasswordError('Không tìm thấy email.'); setLoading(false); return; }
    try {
      const { error } = await signIn(user.email, password);
      if (!error) { setIsAuthenticated(true); toast.success('Xác thực thành công!'); }
      else { setPasswordError('Mật khẩu không đúng.'); setPassword(''); }
    } catch { setPasswordError('Lỗi xác thực.'); }
    setLoading(false);
  };

  const fetchReport = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiClient.get('/api/bao-cao-super', {
        params: { from: fromDate, to: toDate },
        timeout: 120000,
      });
      if (res.data?.data) {
        setReport(res.data.data);
        toast.success('Tải báo cáo thành công');
      } else {
        toast.error('Dữ liệu không hợp lệ');
      }
    } catch (error: any) {
      const msg = error?.response?.data?.message || error?.message || 'Lỗi không xác định';
      toast.error('Lỗi: ' + msg);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  const daysBetween = useMemo(() => {
    const d = Math.abs(new Date(toDate).getTime() - new Date(fromDate).getTime());
    return Math.ceil(d / 86400000);
  }, [fromDate, toDate]);

  // ── AUTH WALL ──
  if (!isAuthenticated) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center">
          <Card className="w-full max-w-md shadow-xl border-0">
            <CardContent className="p-8">
              <div className="text-center mb-6">
                <div className="mx-auto w-16 h-16 bg-gradient-to-br from-blue-500 to-purple-600 rounded-2xl flex items-center justify-center mb-4 shadow-lg">
                  <svg className="w-8 h-8 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                  </svg>
                </div>
                <h1 className="text-2xl font-bold text-gray-900 mb-1">Báo Cáo Tổng Hợp</h1>
                <p className="text-sm text-gray-500">Nhập mật khẩu để truy cập báo cáo</p>
              </div>
              <form onSubmit={handlePasswordSubmit} className="space-y-4">
                <div className="relative">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                    className="h-12 pr-12"
                    placeholder="Mật khẩu..."
                    required disabled={loading}
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600">
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      {showPassword
                        ? <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                        : <><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></>}
                    </svg>
                  </button>
                </div>
                {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
                <Button type="submit" className="w-full h-12 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white" disabled={loading}>
                  {loading ? 'Đang xác thực...' : 'Truy cập báo cáo'}
                </Button>
              </form>
            </CardContent>
          </Card>
        </div>
      </ProtectedRoute>
    );
  }

  const tc = report?.taiChinh;
  const bn = report?.benhNhan;
  const tk = report?.tonKho;
  const hs = report?.hieuSuat;

  const donutColors = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#06b6d4'];

  const chartDayData = tc?.dtByDay?.map(d => ({
    label: d.day.substring(5), // MM-DD
    value: d.lai,
    secondaryValue: d.doanhthu,
    tooltip: `${d.day}: DT ${fmtMoney(d.doanhthu)}, Lãi ${fmtMoney(d.lai)} (${d.count} GD)`,
  })) || [];

  const chartMonthData = tc?.dtByMonth?.map(d => ({
    label: d.month.substring(2), // YY-MM
    value: d.lai,
    secondaryValue: d.doanhthu,
    tooltip: `${d.month}: DT ${fmtMoney(d.doanhthu)}, Lãi ${fmtMoney(d.lai)} (${d.count} GD)`,
  })) || [];

  // ── MAIN RENDER ──
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50/30">
        <div className="p-3 lg:p-6 max-w-[1400px] mx-auto">

          {/* ── HEADER ── */}
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
            <div>
              <h1 className="text-xl lg:text-2xl font-bold text-gray-900">📊 Báo Cáo Tổng Hợp</h1>
              <p className="text-xs text-gray-500 mt-0.5">Phân tích đa chiều: Tài chính · Bệnh nhân · Tồn kho · Hiệu suất</p>
            </div>
            <div className="flex items-center gap-2">
              <Link href="/bao-cao" className="text-xs text-blue-600 hover:underline">← Báo cáo cũ</Link>
              <Button variant="outline" size="sm" onClick={() => { setIsAuthenticated(false); setPassword(''); }}>Đăng xuất</Button>
            </div>
          </div>

          {/* ── DATE PICKER ── */}
          <Card className="mb-4 border-0 shadow-sm">
            <CardContent className="p-3 lg:p-4">
              <div className="flex flex-col sm:flex-row gap-3 items-end">
                <div className="flex-1 sm:flex-initial">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Từ ngày</label>
                  <Input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)} className="w-full sm:w-40 h-10" disabled={loading} />
                </div>
                <div className="flex-1 sm:flex-initial">
                  <label className="text-xs font-medium text-gray-600 mb-1 block">Đến ngày</label>
                  <Input type="date" value={toDate} onChange={e => setToDate(e.target.value)} className="w-full sm:w-40 h-10" disabled={loading} />
                </div>
                <Button onClick={fetchReport} disabled={loading}
                  className="h-10 px-6 bg-gradient-to-r from-blue-600 to-purple-600 hover:from-blue-700 hover:to-purple-700 text-white w-full sm:w-auto">
                  {loading ? (
                    <><svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>Đang xử lý...</>
                  ) : '📊 Tải báo cáo'}
                </Button>
                {daysBetween > 90 && (
                  <span className="text-xs text-amber-600">⏰ {daysBetween} ngày — có thể chậm</span>
                )}
              </div>
            </CardContent>
          </Card>

          {/* ── NO DATA ── */}
          {!loading && !report && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-12 text-center">
                <div className="text-4xl mb-3">📈</div>
                <p className="text-gray-500">Chọn khoảng thời gian và nhấn <b>Tải báo cáo</b> để bắt đầu</p>
              </CardContent>
            </Card>
          )}

          {loading && (
            <Card className="border-0 shadow-sm">
              <CardContent className="p-12 text-center">
                <svg className="animate-spin mx-auto h-8 w-8 text-blue-500 mb-3" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
                <p className="text-gray-500">Đang tổng hợp dữ liệu...</p>
              </CardContent>
            </Card>
          )}

          {/* ── REPORT BODY ── */}
          {report && !loading && (
            <>
              {/* ═══ EXECUTIVE SUMMARY (always visible) ═══ */}
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-2 lg:gap-3 mb-4">
                <KpiCard label="Doanh thu" value={fmtMoney(tc!.tongDT)} trend={tc!.soSanhDT} color="blue" sub={`Kỳ trước: ${fmtMoney(tc!.prevTongDT)}`} />
                <KpiCard label="Lợi nhuận" value={fmtMoney(tc!.tongLai)} trend={tc!.soSanhLai} color="green" sub={`Biên LN: ${tc!.tyLeLai.toFixed(1)}%`} />
                <KpiCard label="Công nợ" value={fmtMoney(tc!.tongNo)} color="red" sub={`${tc!.soGiaoDich} giao dịch`} />
                <KpiCard label="Bệnh nhân" value={`${bn!.bnTrongKy}`} color="purple" sub={`Mới: ${bn!.bnMoi} | Tổng: ${bn!.tongBN}`} />
                <KpiCard label="Giá trị tồn kho" value={fmtMoney(tk!.tongGiaTriTon)} color="orange" sub={`Thuốc: ${fmtMoney(tk!.giaTriTonThuoc)}`} />
              </div>

              {/* ── ALERT BAR ── */}
              {(tk!.thuocHetHang > 0 || tk!.gongHet > 0 || tk!.trongHet > 0 || bn!.henQuaHan > 0) && (
                <div className="bg-red-50 border border-red-200 rounded-lg p-3 mb-4 text-sm">
                  <div className="flex items-start gap-2">
                    <span className="text-red-500 text-lg">⚠️</span>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-red-700">
                      {tk!.thuocHetHang > 0 && <span>{tk!.thuocHetHang} thuốc hết hàng</span>}
                      {tk!.gongHet > 0 && <span>{tk!.gongHet} gọng kính hết</span>}
                      {tk!.trongHet > 0 && <span>{tk!.trongHet} tròng kính hết</span>}
                      {bn!.henQuaHan > 0 && <span>{bn!.henQuaHan} hẹn quá hạn</span>}
                    </div>
                  </div>
                </div>
              )}

              {/* ═══ TABS ═══ */}
              <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
                <TabsList className="bg-white border shadow-sm w-full justify-start overflow-x-auto flex-nowrap">
                  <TabsTrigger value="overview" className="text-xs lg:text-sm data-[state=active]:bg-blue-50 data-[state=active]:text-blue-700">📋 Tổng quan</TabsTrigger>
                  <TabsTrigger value="finance" className="text-xs lg:text-sm data-[state=active]:bg-green-50 data-[state=active]:text-green-700">💰 Tài chính</TabsTrigger>
                  <TabsTrigger value="patients" className="text-xs lg:text-sm data-[state=active]:bg-purple-50 data-[state=active]:text-purple-700">👥 Bệnh nhân</TabsTrigger>
                  <TabsTrigger value="inventory" className="text-xs lg:text-sm data-[state=active]:bg-orange-50 data-[state=active]:text-orange-700">📦 Tồn kho</TabsTrigger>
                  <TabsTrigger value="performance" className="text-xs lg:text-sm data-[state=active]:bg-cyan-50 data-[state=active]:text-cyan-700">📈 Hiệu suất</TabsTrigger>
                </TabsList>

                {/* ═══ TAB: OVERVIEW ═══ */}
                <TabsContent value="overview">
                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
                    {/* Left: Donut + comparison */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">Cơ cấu doanh thu</h3>
                        <DonutChart
                          data={tc!.coCauDT.map(c => ({ label: c.name, value: c.doanhthu, color: '' }))}
                          colors={donutColors}
                        />
                      </CardContent>
                    </Card>

                    {/* Center: Chart */}
                    <Card className="border-0 shadow-sm lg:col-span-2">
                      <CardContent className="p-4">
                        {(tc!.dtByMonth?.length || 0) > 1 ? (
                          <BarChart data={chartMonthData} title="Doanh thu & Lãi theo tháng" valueLabel="VNĐ" color="purple" height={280} maxItems={12} stackedMode={true} />
                        ) : (
                          <BarChart data={chartDayData} title="Doanh thu & Lãi theo ngày" valueLabel="VNĐ" color="green" height={280} maxItems={31} stackedMode={true} />
                        )}
                      </CardContent>
                    </Card>
                  </div>

                  {/* Quick stats row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mt-4">
                    <KpiCard label="Lượt khám" value={`${hs!.soLuotKham}`} color="cyan" sub={`~${hs!.donThuocTBNgay} đơn thuốc/ngày`} />
                    <KpiCard label="Thanh toán đủ" value={`${hs!.tyLeThanhToanDu}%`} color="green" />
                    <KpiCard label="DT trung bình/ngày" value={fmtMoney(hs!.dtTBNgay)} color="blue" sub={`${hs!.soNgayCoDoanhThu} ngày có DT`} />
                    <KpiCard label="ARPU" value={fmtMoney(bn!.arpu)} color="purple" sub="Doanh thu TB/bệnh nhân" />
                  </div>

                  {/* Top drugs & Aging side by side */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">🏆 Top thuốc/thủ thuật doanh thu cao nhất</h3>
                        <div className="space-y-2">
                          {tc!.topDrugs.slice(0, 7).map((d, i) => (
                            <HBar key={d.id} label={`${i + 1}. ${d.ten}`} value={d.doanhthu} maxValue={tc!.topDrugs[0]?.doanhthu || 1} color={donutColors[i % donutColors.length]} />
                          ))}
                          {tc!.topDrugs.length === 0 && <p className="text-gray-400 text-sm">Không có dữ liệu</p>}
                        </div>
                      </CardContent>
                    </Card>

                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">📆 Phân tích công nợ theo tuổi nợ</h3>
                        <div className="space-y-3">
                          {[
                            { label: '< 30 ngày', value: tc!.aging.under30, color: '#22c55e' },
                            { label: '30-60 ngày', value: tc!.aging.d30_60, color: '#f59e0b' },
                            { label: '60-90 ngày', value: tc!.aging.d60_90, color: '#f97316' },
                            { label: '> 90 ngày', value: tc!.aging.over90, color: '#ef4444' },
                          ].map(a => (
                            <HBar key={a.label} label={a.label} value={a.value} maxValue={Math.max(tc!.aging.under30, tc!.aging.d30_60, tc!.aging.d60_90, tc!.aging.over90, 1)} color={a.color} />
                          ))}
                          <div className="border-t pt-2 flex justify-between text-sm">
                            <span className="text-gray-500">Tổng nợ</span>
                            <span className="font-bold text-red-600">{fmtMoney(tc!.tongNo)}</span>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ═══ TAB: FINANCE ═══ */}
                <TabsContent value="finance">
                  {/* KPI Row */}
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <KpiCard label="Doanh thu" value={fmtMoney(tc!.tongDT)} trend={tc!.soSanhDT} color="blue" />
                    <KpiCard label="Lợi nhuận" value={fmtMoney(tc!.tongLai)} trend={tc!.soSanhLai} color="green" />
                    <KpiCard label="Biên lợi nhuận" value={`${tc!.tyLeLai.toFixed(1)}%`} color="purple" />
                    <KpiCard label="Công nợ" value={fmtMoney(tc!.tongNo)} color="red" />
                  </div>

                  {/* Category breakdown table */}
                  <Card className="border-0 shadow-sm mb-4">
                    <CardContent className="p-4">
                      <h3 className="text-sm font-semibold text-gray-700 mb-3">Chi tiết theo hạng mục</h3>
                      {/* Mobile */}
                      <div className="block lg:hidden space-y-2">
                        {tc!.coCauDT.map((c, i) => (
                          <div key={i} className="bg-gray-50 rounded-lg p-3">
                            <div className="flex justify-between items-center mb-1">
                              <span className="font-medium text-sm">{c.name}</span>
                              <span className="text-xs text-gray-500">{c.count} đơn</span>
                            </div>
                            <div className="grid grid-cols-3 gap-2 text-xs">
                              <div><span className="text-gray-400">DT</span><div className="font-semibold text-blue-600">{fmtMoney(c.doanhthu)}</div></div>
                              <div><span className="text-gray-400">Lãi</span><div className="font-semibold text-green-600">{fmtMoney(c.lai)}</div></div>
                              <div><span className="text-gray-400">Biên</span><div className="font-semibold text-purple-600">{c.doanhthu > 0 ? (c.lai / c.doanhthu * 100).toFixed(1) : '0'}%</div></div>
                            </div>
                          </div>
                        ))}
                      </div>
                      {/* Desktop */}
                      <div className="hidden lg:block overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead className="bg-gray-50">
                            <tr>
                              <th className="text-left px-3 py-2 font-medium text-gray-600">Hạng mục</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">Số đơn</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">Doanh thu</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">Lãi</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">Biên LN</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">Tỷ trọng</th>
                              <th className="text-right px-3 py-2 font-medium text-gray-600">Nợ</th>
                            </tr>
                          </thead>
                          <tbody>
                            {tc!.coCauDT.map((c, i) => (
                              <tr key={i} className="border-b hover:bg-gray-50">
                                <td className="px-3 py-2 font-medium">{c.name}</td>
                                <td className="px-3 py-2 text-right">{c.count}</td>
                                <td className="px-3 py-2 text-right font-semibold text-blue-600">{fmtMoney(c.doanhthu)}</td>
                                <td className="px-3 py-2 text-right font-semibold text-green-600">{fmtMoney(c.lai)}</td>
                                <td className="px-3 py-2 text-right text-purple-600">{c.doanhthu > 0 ? (c.lai / c.doanhthu * 100).toFixed(1) : '0'}%</td>
                                <td className="px-3 py-2 text-right">{c.pct.toFixed(1)}%</td>
                                <td className="px-3 py-2 text-right text-red-600">{fmtMoney(c.no)}</td>
                              </tr>
                            ))}
                            <tr className="bg-yellow-50 font-bold">
                              <td className="px-3 py-2">Tổng cộng</td>
                              <td className="px-3 py-2 text-right">{tc!.soGiaoDich}</td>
                              <td className="px-3 py-2 text-right text-blue-600">{fmtMoney(tc!.tongDT)}</td>
                              <td className="px-3 py-2 text-right text-green-600">{fmtMoney(tc!.tongLai)}</td>
                              <td className="px-3 py-2 text-right text-purple-600">{tc!.tyLeLai.toFixed(1)}%</td>
                              <td className="px-3 py-2 text-right">100%</td>
                              <td className="px-3 py-2 text-right text-red-600">{fmtMoney(tc!.tongNo)}</td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Charts */}
                  <div className="grid grid-cols-1 gap-4">
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <BarChart data={chartDayData} title="Doanh thu & Lãi theo ngày (cam: DT, xanh: Lãi)" valueLabel="VNĐ" color="green" height={300} maxItems={31} stackedMode={true} />
                      </CardContent>
                    </Card>
                    {(tc!.dtByMonth?.length || 0) > 1 && (
                      <Card className="border-0 shadow-sm">
                        <CardContent className="p-4">
                          <BarChart data={chartMonthData} title="Doanh thu & Lãi theo tháng" valueLabel="VNĐ" color="purple" height={280} maxItems={12} stackedMode={true} />
                        </CardContent>
                      </Card>
                    )}
                  </div>

                  {/* Top drugs + Aging */}
                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">🏆 Top 10 thuốc doanh thu</h3>
                        <div className="space-y-2">
                          {tc!.topDrugs.map((d, i) => (
                            <div key={d.id} className="flex items-center gap-2 text-xs">
                              <span className="w-5 text-gray-400 text-right">{i + 1}</span>
                              <span className="flex-1 truncate">{d.ten}</span>
                              <span className="text-blue-600 font-medium w-16 text-right">{fmtMoney(d.doanhthu)}</span>
                              <span className="text-green-600 w-14 text-right">{fmtMoney(d.lai)}</span>
                              <span className="text-gray-400 w-10 text-right">×{d.soluong}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">📆 Tuổi nợ (Aging Report)</h3>
                        <div className="space-y-3">
                          {[
                            { label: '< 30 ngày', value: tc!.aging.under30, color: '#22c55e', bg: 'bg-green-50' },
                            { label: '30-60 ngày', value: tc!.aging.d30_60, color: '#f59e0b', bg: 'bg-amber-50' },
                            { label: '60-90 ngày', value: tc!.aging.d60_90, color: '#f97316', bg: 'bg-orange-50' },
                            { label: '> 90 ngày', value: tc!.aging.over90, color: '#ef4444', bg: 'bg-red-50' },
                          ].map(a => (
                            <div key={a.label} className={`flex items-center justify-between p-2 rounded-lg ${a.bg}`}>
                              <div className="flex items-center gap-2">
                                <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
                                <span className="text-sm text-gray-700">{a.label}</span>
                              </div>
                              <span className="text-sm font-bold" style={{ color: a.color }}>{fmtMoney(a.value)}</span>
                            </div>
                          ))}
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Monthly table */}
                  {(tc!.dtByMonth?.length || 0) > 1 && (
                    <Card className="border-0 shadow-sm mt-4">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">📊 Chi tiết theo tháng</h3>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead className="bg-purple-50">
                              <tr>
                                <th className="text-left px-3 py-2 font-medium">Tháng</th>
                                <th className="text-right px-3 py-2 font-medium">Giao dịch</th>
                                <th className="text-right px-3 py-2 font-medium">Doanh thu</th>
                                <th className="text-right px-3 py-2 font-medium">Lãi</th>
                                <th className="text-right px-3 py-2 font-medium">Biên LN</th>
                                <th className="text-right px-3 py-2 font-medium">Nợ</th>
                              </tr>
                            </thead>
                            <tbody>
                              {tc!.dtByMonth.map((m, i) => (
                                <tr key={i} className="border-b hover:bg-purple-50/50">
                                  <td className="px-3 py-2 font-medium">{m.month}</td>
                                  <td className="px-3 py-2 text-right">{m.count}</td>
                                  <td className="px-3 py-2 text-right text-blue-600 font-semibold">{fmtMoney(m.doanhthu)}</td>
                                  <td className="px-3 py-2 text-right text-green-600 font-semibold">{fmtMoney(m.lai)}</td>
                                  <td className="px-3 py-2 text-right text-purple-600">{m.doanhthu > 0 ? (m.lai / m.doanhthu * 100).toFixed(1) : '0'}%</td>
                                  <td className="px-3 py-2 text-right text-red-600">{fmtMoney(m.no)}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </TabsContent>

                {/* ═══ TAB: PATIENTS ═══ */}
                <TabsContent value="patients">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <KpiCard label="Tổng bệnh nhân" value={`${bn!.tongBN}`} color="purple" />
                    <KpiCard label="BN trong kỳ" value={`${bn!.bnTrongKy}`} color="blue" sub={`Mới: ${bn!.bnMoi}`} />
                    <KpiCard label="ARPU" value={fmtMoney(bn!.arpu)} color="green" sub="DT trung bình/BN" />
                    <KpiCard label="Tỷ lệ đến hẹn" value={`${bn!.tyLeDenHen.toFixed(1)}%`} color={bn!.tyLeDenHen >= 70 ? 'green' : bn!.tyLeDenHen >= 50 ? 'yellow' : 'red'} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Age distribution */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">👥 Phân bố độ tuổi bệnh nhân</h3>
                        <div className="space-y-2">
                          {Object.entries(bn!.ageDist).filter(([, v]) => v > 0).map(([label, value]) => (
                            <HBar key={label} label={label} value={value} maxValue={Math.max(...Object.values(bn!.ageDist))} color="#8b5cf6" suffix=" BN" />
                          ))}
                        </div>
                      </CardContent>
                    </Card>

                    {/* Appointment stats */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">📅 Thống kê lịch hẹn</h3>
                        {bn!.henTotal > 0 ? (
                          <div className="space-y-4">
                            <div className="grid grid-cols-2 gap-3">
                              <div className="bg-blue-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-blue-600">{bn!.henTotal}</div>
                                <div className="text-xs text-gray-500">Tổng lịch hẹn</div>
                              </div>
                              <div className="bg-green-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-green-600">{bn!.henDaDen}</div>
                                <div className="text-xs text-gray-500">Đã đến</div>
                              </div>
                              <div className="bg-red-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-red-600">{bn!.henQuaHan}</div>
                                <div className="text-xs text-gray-500">Quá hạn</div>
                              </div>
                              <div className="bg-gray-50 rounded-lg p-3 text-center">
                                <div className="text-2xl font-bold text-gray-600">{bn!.henHuy}</div>
                                <div className="text-xs text-gray-500">Đã hủy</div>
                              </div>
                            </div>
                            <div className="bg-gradient-to-r from-green-50 to-blue-50 rounded-lg p-3">
                              <div className="flex items-center justify-between">
                                <span className="text-sm text-gray-600">Tỷ lệ đến hẹn</span>
                                <span className="text-lg font-bold text-green-600">{bn!.tyLeDenHen.toFixed(1)}%</span>
                              </div>
                              <div className="mt-2 bg-gray-200 rounded-full h-3 overflow-hidden">
                                <div className="bg-gradient-to-r from-green-400 to-green-600 h-full rounded-full transition-all" style={{ width: `${bn!.tyLeDenHen}%` }} />
                              </div>
                            </div>
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm text-center py-6">Không có lịch hẹn trong kỳ</p>
                        )}
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ═══ TAB: INVENTORY ═══ */}
                <TabsContent value="inventory">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <KpiCard label="Giá trị tồn kho" value={fmtMoney(tk!.tongGiaTriTon)} color="orange" />
                    <KpiCard label="Chi phí nhập hàng" value={fmtMoney(tk!.chiPhiNhap)} color="blue" sub="Trong kỳ" />
                    <KpiCard label="Thuốc sắp hết" value={`${tk!.thuocSapHet.length}`} color={tk!.thuocSapHet.length > 0 ? 'yellow' : 'green'} sub={`Hết hàng: ${tk!.thuocHetHang}`} />
                    <KpiCard label="Hao hụt" value={`${tk!.soLuongHuy} sp`} color="red" sub="Hết hạn/hư hỏng" />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Drug alerts */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">💊 Thuốc sắp hết / cần nhập</h3>
                        {tk!.thuocSapHet.length > 0 ? (
                          <div className="space-y-2">
                            {tk!.thuocSapHet.map(t => (
                              <div key={t.id} className="flex items-center justify-between bg-amber-50 rounded-lg p-2.5 text-sm">
                                <span className="truncate flex-1 text-gray-700">{t.ten}</span>
                                <div className="flex items-center gap-3 text-xs">
                                  <span className={`font-bold ${t.tonkho <= 0 ? 'text-red-600' : 'text-amber-600'}`}>
                                    Tồn: {t.tonkho}
                                  </span>
                                  <span className="text-gray-400">Min: {t.mucMin}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <div className="text-center py-6">
                            <span className="text-3xl">✅</span>
                            <p className="text-sm text-gray-500 mt-2">Tất cả thuốc đều đủ tồn kho</p>
                          </div>
                        )}
                      </CardContent>
                    </Card>

                    {/* Inventory value breakdown */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">🏪 Giá trị tồn kho</h3>
                        <div className="space-y-4">
                          <div className="bg-blue-50 rounded-lg p-4">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">💊 Thuốc</span>
                              <span className="text-lg font-bold text-blue-600">{fmtMoney(tk!.giaTriTonThuoc)}</span>
                            </div>
                          </div>
                          <div className="bg-purple-50 rounded-lg p-4">
                            <div className="flex justify-between items-center">
                              <span className="text-sm text-gray-600">👓 Gọng kính</span>
                              <span className="text-lg font-bold text-purple-600">{fmtMoney(tk!.giaTriTonGong)}</span>
                            </div>
                          </div>
                          <div className="border-t pt-3 flex justify-between">
                            <span className="font-medium text-gray-700">Tổng giá trị</span>
                            <span className="font-bold text-orange-600 text-lg">{fmtMoney(tk!.tongGiaTriTon)}</span>
                          </div>

                          {/* Alerts summary */}
                          <div className="grid grid-cols-2 gap-2 text-xs">
                            <div className="bg-red-50 rounded p-2 text-center">
                              <div className="font-bold text-red-600">{tk!.trongHet}</div>
                              <div className="text-gray-500">Tròng hết</div>
                            </div>
                            <div className="bg-amber-50 rounded p-2 text-center">
                              <div className="font-bold text-amber-600">{tk!.trongSapHet}</div>
                              <div className="text-gray-500">Tròng sắp hết</div>
                            </div>
                            <div className="bg-red-50 rounded p-2 text-center">
                              <div className="font-bold text-red-600">{tk!.gongHet}</div>
                              <div className="text-gray-500">Gọng hết</div>
                            </div>
                            <div className="bg-amber-50 rounded p-2 text-center">
                              <div className="font-bold text-amber-600">{tk!.gongSapHet}</div>
                              <div className="text-gray-500">Gọng sắp hết</div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>
                </TabsContent>

                {/* ═══ TAB: PERFORMANCE ═══ */}
                <TabsContent value="performance">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-4">
                    <KpiCard label="Lượt khám" value={`${hs!.soLuotKham}`} color="cyan" sub={`${hs!.soNgayCoDoanhThu} ngày hoạt động`} />
                    <KpiCard label="Đơn thuốc TB/ngày" value={`${hs!.donThuocTBNgay}`} color="blue" />
                    <KpiCard label="Đơn kính TB/ngày" value={`${hs!.donKinhTBNgay}`} color="purple" />
                    <KpiCard label="Thanh toán đủ" value={`${hs!.tyLeThanhToanDu}%`} color={hs!.tyLeThanhToanDu >= 80 ? 'green' : hs!.tyLeThanhToanDu >= 60 ? 'yellow' : 'red'} />
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                    {/* Visit by hour */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">🕐 Lượt khám theo giờ (giờ cao điểm)</h3>
                        {hs!.visitByHour.length > 0 ? (
                          <div className="space-y-1.5">
                            {hs!.visitByHour.map(h => (
                              <HBar key={h.hour} label={`${h.hour}:00`} value={h.count} maxValue={Math.max(...hs!.visitByHour.map(x => x.count))} color="#06b6d4" suffix=" lượt" />
                            ))}
                          </div>
                        ) : (
                          <p className="text-gray-400 text-sm text-center py-6">Không có dữ liệu chờ khám</p>
                        )}
                      </CardContent>
                    </Card>

                    {/* Chuyen khoa breakdown */}
                    <Card className="border-0 shadow-sm">
                      <CardContent className="p-4">
                        <h3 className="text-sm font-semibold text-gray-700 mb-3">🏥 Phân bổ đơn thuốc theo chuyên khoa</h3>
                        <div className="space-y-4">
                          <DonutChart
                            data={[
                              { label: 'Mắt', value: hs!.chuyenKhoa.mat, color: '' },
                              { label: 'TMH', value: hs!.chuyenKhoa.tmh, color: '' },
                            ]}
                            colors={['#3b82f6', '#10b981']}
                          />
                          <div className="grid grid-cols-2 gap-3">
                            <div className="bg-blue-50 rounded-lg p-3 text-center">
                              <div className="text-xl font-bold text-blue-600">{hs!.chuyenKhoa.mat}</div>
                              <div className="text-xs text-gray-500">Đơn Mắt</div>
                            </div>
                            <div className="bg-green-50 rounded-lg p-3 text-center">
                              <div className="text-xl font-bold text-green-600">{hs!.chuyenKhoa.tmh}</div>
                              <div className="text-xs text-gray-500">Đơn TMH</div>
                            </div>
                          </div>
                        </div>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Daily revenue chart */}
                  <Card className="border-0 shadow-sm mt-4">
                    <CardContent className="p-4">
                      <BarChart data={chartDayData} title="Hoạt động theo ngày (DT & Lãi)" valueLabel="VNĐ" color="green" height={280} maxItems={31} stackedMode={true} />
                    </CardContent>
                  </Card>
                </TabsContent>
              </Tabs>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
