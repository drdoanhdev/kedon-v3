'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { SimplePagination } from '../components/ui/pagination';
import { BarChart } from '../components/ui/chart';
import { Toaster, toast } from 'react-hot-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import ProtectedRoute from '../components/ProtectedRoute';
import { AxiosError } from 'axios';
import { Download, TrendingUp, AlertCircle } from 'lucide-react';

interface BaoCaoItem {
  id: number;
  ngay: string;
  doanhthu: number;
  lai: number;
  no: number;
  benhnhan?: {
    ten: string;
    id: number;
    namsinh: string;
    tuoi?: number;
  };
}

interface BaoCao {
  mat: {
    doanhthu_thuoc: number;
    doanhthu_thuthuat: number;
    lai_thuoc: number;
    lai_thuthuat: number;
    no_thuoc: number;
    no_thuthuat: number;
  };
  tmh: {
    doanhthu_thuoc: number;
    doanhthu_thuthuat: number;
    lai_thuoc: number;
    lai_thuthuat: number;
    no_thuoc: number;
    no_thuthuat: number;
  };
  kinh: {
    doanhthu: number;
    lai: number;
    no: number;
  };
  chi_tiet: {
    mat: { thuoc: BaoCaoItem[]; thuthuat: BaoCaoItem[] };
    tmh: { thuoc: BaoCaoItem[]; thuthuat: BaoCaoItem[] };
    kinh: BaoCaoItem[];
  };
}

type ChiTietRow = BaoCaoItem & { type: string };

export default function BaoCaoAdvancedPage() {
  const currentDate = new Date();
  const startOfCurrentMonth = startOfMonth(currentDate);
  const endOfCurrentMonth = endOfMonth(currentDate);

  const [baoCao, setBaoCao] = useState<BaoCao | null>(null);
  const [fromDate, setFromDate] = useState<string>(format(startOfCurrentMonth, 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(endOfCurrentMonth, 'yyyy-MM-dd'));
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState(false);
  const [showCache, setShowCache] = useState(false);

  const { user, signIn } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const rowsPerPage = 10;

  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Báo cáo Nâng cao';
    }
  }, []);

  const getCacheKey = useCallback(() => {
    return `baoCao_${fromDate}_${toDate}`;
  }, [fromDate, toDate]);

  const getCachedData = useCallback(() => {
    try {
      const cacheKey = getCacheKey();
      const cached = localStorage.getItem(cacheKey);
      if (cached) return JSON.parse(cached);
    } catch (err) {
      console.error('Cache read error:', err);
    }
    return null;
  }, [getCacheKey]);

  const setCachedData = useCallback((data: BaoCao) => {
    try {
      const cacheKey = getCacheKey();
      localStorage.setItem(cacheKey, JSON.stringify(data));
      setShowCache(true);
    } catch (err) {
      console.error('Cache write error:', err);
    }
  }, [getCacheKey]);

  const fetchBaoCao = useCallback(async (forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = getCachedData();
      if (cached) {
        setBaoCao(cached);
        setShowCache(true);
        toast.success('Dữ liệu từ cache (bấm Refresh để cập nhật)');
        return;
      }
    }

    setLoading(true);
    try {
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      
      const res = await apiClient.get('/api/bao-cao', {
        params: { from: fromDate, to: toDate, _t: timestamp, _r: random },
        timeout: 120000
      });

      if (res.data?.data) {
        setBaoCao(res.data.data);
        setCachedData(res.data.data);
        setShowCache(false);
        toast.success('Tải báo cáo thành công');
      } else {
        toast.error('Dữ liệu báo cáo không hợp lệ');
        setBaoCao(null);
      }
    } catch (error: unknown) {
      if (error instanceof AxiosError) {
        let errorMessage = error.response?.data?.message || error.message || 'Lỗi không xác định';
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          errorMessage = 'Quá thời gian xử lý! Hãy thử giảm khoảng thời gian (tối đa 3 tháng)';
        }
        toast.error('Lỗi: ' + errorMessage);
      } else {
        toast.error('Lỗi không xác định khi tải báo cáo');
      }
      setBaoCao(null);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate, getCachedData, setCachedData]);

  const handlePasswordSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setPasswordError('');
    if (!user?.email) {
      setPasswordError('Không tìm thấy email người dùng.');
      setLoading(false);
      return;
    }
    try {
      const { error } = await signIn(user.email, password);
      if (!error) {
        setIsAuthenticated(true);
        setPasswordError('');
        toast.success('Xác thực lại thành công!');
      } else {
        setPasswordError('Mật khẩu không đúng.');
        setPassword('');
        toast.error('Sai mật khẩu');
      }
    } catch (err) {
      setPasswordError('Có lỗi xảy ra.');
    }
    setLoading(false);
  };

  // ============ CALCULATIONS (TRƯỚC if !isAuthenticated) ============
  const chiTiet: ChiTietRow[] = baoCao
    ? [
        ...baoCao.chi_tiet.mat.thuoc.map((item) => ({ ...item, type: 'Thuốc' })),
        ...baoCao.chi_tiet.mat.thuthuat.map((item) => ({ ...item, type: 'Thủ thuật' })),
        ...baoCao.chi_tiet.tmh.thuoc.map((item) => ({ ...item, type: 'Thuốc' })),
        ...baoCao.chi_tiet.tmh.thuthuat.map((item) => ({ ...item, type: 'Thủ thuật' })),
        ...baoCao.chi_tiet.kinh.map((item) => ({ ...item, type: 'Kính' })),
      ].sort((a, b) => new Date(b.ngay).getTime() - new Date(a.ngay).getTime())
    : [];

  const tongDoanhthu = chiTiet.reduce((sum, item) => sum + item.doanhthu, 0);
  const tongLai = chiTiet.reduce((sum, item) => sum + item.lai, 0);
  const tongNo = chiTiet.reduce((sum, item) => sum + item.no, 0);
  const tongTyLeLai = tongDoanhthu > 0 ? ((tongLai / tongDoanhthu) * 100).toFixed(2) : '0';

  const thuocStats = chiTiet.filter((item) => item.type === 'Thuốc').reduce((acc, item) => ({
    doanhthu: acc.doanhthu + item.doanhthu,
    lai: acc.lai + item.lai,
    no: acc.no + item.no,
  }), { doanhthu: 0, lai: 0, no: 0 });

  const thuthuatStats = chiTiet.filter((item) => item.type === 'Thủ thuật').reduce((acc, item) => ({
    doanhthu: acc.doanhthu + item.doanhthu,
    lai: acc.lai + item.lai,
    no: acc.no + item.no,
  }), { doanhthu: 0, lai: 0, no: 0 });

  const kinhStats = chiTiet.filter((item) => item.type === 'Kính').reduce((acc, item) => ({
    doanhthu: acc.doanhthu + item.doanhthu,
    lai: acc.lai + item.lai,
    no: acc.no + item.no,
  }), { doanhthu: 0, lai: 0, no: 0 });

  const pieChartData = [
    { name: 'Thuốc', value: thuocStats.doanhthu, color: '#3b82f6' },
    { name: 'Thủ thuật', value: thuthuatStats.doanhthu, color: '#10b981' },
    { name: 'Kính', value: kinhStats.doanhthu, color: '#a855f7' },
  ].filter(item => item.value > 0);

  const doanhThuTheoNgay = chiTiet.reduce((acc, item) => {
    const ngay = new Date(item.ngay).toLocaleDateString('vi-VN');
    if (!acc[ngay]) acc[ngay] = { ngay, doanhthu: 0, lai: 0, no: 0, count: 0 };
    acc[ngay].doanhthu += item.doanhthu;
    acc[ngay].lai += item.lai;
    acc[ngay].no += item.no;
    acc[ngay].count += 1;
    return acc;
  }, {} as Record<string, { ngay: string; doanhthu: number; lai: number; no: number; count: number }>);

  const trendData = Object.values(doanhThuTheoNgay)
    .sort((a, b) => {
      const dateA = new Date(a.ngay.split('/').reverse().join('-'));
      const dateB = new Date(b.ngay.split('/').reverse().join('-'));
      return dateA.getTime() - dateB.getTime();
    })
    .map((item) => ({
      label: item.ngay,
      value: item.lai,
      secondaryValue: item.doanhthu,
      tooltip: `${item.ngay}: Lãi ${(item.lai / 1000).toFixed(0)}k`
    }));

  const topCustomers = useMemo(() => {
    const customerMap: Record<number, { name: string; id: number; tongtien: number; giaodich: number }> = {};
    chiTiet.forEach(item => {
      if (item.benhnhan) {
        if (!customerMap[item.benhnhan.id]) {
          customerMap[item.benhnhan.id] = { name: item.benhnhan.ten, id: item.benhnhan.id, tongtien: 0, giaodich: 0 };
        }
        customerMap[item.benhnhan.id].tongtien += item.doanhthu;
        customerMap[item.benhnhan.id].giaodich += 1;
      }
    });
    return Object.values(customerMap).sort((a, b) => b.tongtien - a.tongtien).slice(0, 10);
  }, [chiTiet]);

  const paymentStats = useMemo(() => {
    const daTra = tongDoanhthu - tongNo;
    return {
      daTra: daTra > 0 ? daTra : 0,
      no: tongNo > 0 ? tongNo : 0,
      tyLe: tongDoanhthu > 0 ? {
        daTra: ((daTra / tongDoanhthu) * 100).toFixed(1),
        no: ((tongNo / tongDoanhthu) * 100).toFixed(1)
      } : { daTra: '0', no: '0' }
    };
  }, [tongDoanhthu, tongNo]);

  const overdueAlerts = useMemo(() => {
    const overdueCustomers: Record<string, { count: number; totalNo: number; names: string[] }> = {};
    const today = new Date();
    chiTiet.forEach(item => {
      if (item.no > 0 && item.benhnhan) {
        const itemDate = new Date(item.ngay);
        const daysDiff = Math.floor((today.getTime() - itemDate.getTime()) / (1000 * 60 * 60 * 24));
        if (daysDiff > 30) {
          const key = item.benhnhan.id;
          if (!overdueCustomers[key]) overdueCustomers[key] = { count: 0, totalNo: 0, names: [] };
          overdueCustomers[key].count += 1;
          overdueCustomers[key].totalNo += item.no;
          if (!overdueCustomers[key].names.includes(item.benhnhan.ten)) {
            overdueCustomers[key].names.push(item.benhnhan.ten);
          }
        }
      }
    });
    return Object.entries(overdueCustomers)
      .map(([id, data]) => ({
        customerId: parseInt(id),
        customerName: data.names[0],
        totalNo: data.totalNo,
        transactionCount: data.count
      }))
      .sort((a, b) => b.totalNo - a.totalNo);
  }, [chiTiet]);

  const totalPages = Math.ceil(chiTiet.length / rowsPerPage);
  const paginatedChiTiet = useMemo(() => {
    return chiTiet.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);
  }, [chiTiet, currentPage, rowsPerPage]);

  const handleExportPDF = useCallback(() => {
    const doc = `BÁO CÁO DOANH THU VÀ LÃI (NÂNG CAO)
=====================================
Kỳ báo cáo: ${fromDate} đến ${toDate}
Ngày xuất: ${new Date().toLocaleString('vi-VN')}

TỔNG HỢP
========
Tổng doanh thu: ${(tongDoanhthu / 1000).toFixed(0)}k
Tổng lãi: ${(tongLai / 1000).toFixed(0)}k
Tổng nợ: ${(tongNo / 1000).toFixed(0)}k
Tỷ lệ lãi: ${tongTyLeLai}%

PHÂN LOẠI
=========
Thuốc: ${(thuocStats.doanhthu / 1000).toFixed(0)}k / Lãi: ${(thuocStats.lai / 1000).toFixed(0)}k
Thủ thuật: ${(thuthuatStats.doanhthu / 1000).toFixed(0)}k / Lãi: ${(thuthuatStats.lai / 1000).toFixed(0)}k
Kính: ${(kinhStats.doanhthu / 1000).toFixed(0)}k / Lãi: ${(kinhStats.lai / 1000).toFixed(0)}k

TOP 10 BỆNH NHÂN
================
${topCustomers.map((c, i) => `${i + 1}. ${c.name}: ${(c.tongtien / 1000).toFixed(0)}k`).join('\n')}
    `;
    const element = document.createElement('a');
    element.setAttribute('href', 'data:text/plain;charset=utf-8,' + encodeURIComponent(doc));
    element.setAttribute('download', `bao-cao-${fromDate}_to_${toDate}.txt`);
    element.style.display = 'none';
    document.body.appendChild(element);
    element.click();
    document.body.removeChild(element);
    toast.success('Đã xuất báo cáo');
  }, [fromDate, toDate, tongDoanhthu, tongLai, tongNo, tongTyLeLai, thuocStats, thuthuatStats, kinhStats, topCustomers]);

  if (!isAuthenticated) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-full max-w-md p-6">
            <Toaster position="top-right" />
            <Card className="shadow-lg">
              <CardContent className="p-8">
                <div className="text-center mb-6">
                  <h1 className="text-2xl font-bold mb-2">Xác thực Báo cáo</h1>
                  <p className="text-sm text-gray-600">Nhập mật khẩu để tiếp tục</p>
                </div>
                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <Input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); setPasswordError(''); }}
                    placeholder="Mật khẩu"
                    required
                    disabled={loading}
                  />
                  {passwordError && <p className="text-sm text-red-600">{passwordError}</p>}
                  <Button type="submit" className="w-full" disabled={loading}>
                    {loading ? 'Đang xác thực...' : 'Xác thực'}
                  </Button>
                </form>
              </CardContent>
            </Card>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="p-4 lg:p-6">
          <Toaster position="top-right" />

          <div className="flex justify-between items-center mb-6">
            <div>
              <h1 className="text-3xl font-bold">📊 Báo Cáo Nâng Cao</h1>
              <p className="text-sm text-gray-600 mt-1">Phân tích chi tiết doanh thu & lãi</p>
            </div>
            <Button variant="outline" size="sm" onClick={() => { setIsAuthenticated(false); setPassword(''); }}>
              Đăng xuất
            </Button>
          </div>

          <div className="flex flex-col md:flex-row gap-3 mb-6">
            <Input type="date" value={fromDate} onChange={(e) => setFromDate(e.target.value)} className="md:w-40" />
            <Input type="date" value={toDate} onChange={(e) => setToDate(e.target.value)} className="md:w-40" />
            <Button onClick={() => fetchBaoCao(false)} disabled={loading} className="md:flex-1">
              {loading ? 'Tải...' : 'Xem báo cáo'}
            </Button>
            <Button onClick={() => fetchBaoCao(true)} disabled={loading} variant="secondary">
              Refresh
            </Button>
            <Button onClick={handleExportPDF} variant="outline" size="sm">
              <Download className="w-4 h-4 mr-1" />
              Xuất
            </Button>
            {showCache && <div className="text-xs text-blue-600 flex items-center">💾 Cache</div>}
          </div>

          {!loading && !baoCao && (
            <div className="mb-4 p-4 bg-amber-50 border border-amber-200 rounded">
              <p className="text-amber-700">Chọn khoảng thời gian và bấm "Xem báo cáo"</p>
            </div>
          )}

          {baoCao && (
            <>
              {/* TỔNG HỢP */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
                <Card><CardContent className="p-4"><div className="text-2xl font-bold text-blue-600">{(tongDoanhthu / 1000).toFixed(0)}k</div><div className="text-sm text-gray-600">Tổng doanh thu</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-bold text-green-600">{(tongLai / 1000).toFixed(0)}k</div><div className="text-sm text-gray-600">Tổng lãi</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-bold text-red-600">{(tongNo / 1000).toFixed(0)}k</div><div className="text-sm text-gray-600">Tổng nợ</div></CardContent></Card>
                <Card><CardContent className="p-4"><div className="text-2xl font-bold text-purple-600">{tongTyLeLai}%</div><div className="text-sm text-gray-600">Tỷ lệ lãi</div></CardContent></Card>
              </div>

              {/* PHÂN BỐ + THANH TOÁN */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 mb-6">
                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Phân bố theo loại</h3>
                    <div className="space-y-2">
                      {pieChartData.map((item) => {
                        const percent = tongDoanhthu > 0 ? ((item.value / tongDoanhthu) * 100).toFixed(1) : '0';
                        return (
                          <div key={item.name} className="flex justify-between items-center">
                            <div className="flex items-center gap-2">
                              <div className="w-3 h-3 rounded-full" style={{ backgroundColor: item.color }}></div>
                              <span className="text-sm">{item.name}</span>
                            </div>
                            <div className="text-right"><div className="font-semibold">{(item.value / 1000).toFixed(0)}k</div><div className="text-xs text-gray-500">{percent}%</div></div>
                          </div>
                        );
                      })}
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-4">
                    <h3 className="font-semibold mb-3">Tình hình thanh toán</h3>
                    <div className="space-y-3">
                      <div>
                        <div className="flex justify-between mb-1"><span className="text-sm">Đã trả</span><span className="text-sm font-semibold">{paymentStats.tyLe.daTra}%</span></div>
                        <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-green-500 h-2 rounded-full" style={{ width: `${parseFloat(paymentStats.tyLe.daTra)}%` }}></div></div>
                      </div>
                      <div>
                        <div className="flex justify-between mb-1"><span className="text-sm">Nợ</span><span className="text-sm font-semibold">{paymentStats.tyLe.no}%</span></div>
                        <div className="w-full bg-gray-200 rounded-full h-2"><div className="bg-red-500 h-2 rounded-full" style={{ width: `${parseFloat(paymentStats.tyLe.no)}%` }}></div></div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </div>

              {/* TOP CUSTOMERS */}
              <Card className="mb-6">
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">👥 Top 10 bệnh nhân</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100">
                        <tr><th className="px-4 py-2 text-left">STT</th><th className="px-4 py-2 text-left">Tên</th><th className="px-4 py-2 text-right">Chi tiêu</th></tr>
                      </thead>
                      <tbody>
                        {topCustomers.map((customer, idx) => (
                          <tr key={customer.id} className="border-b hover:bg-gray-50">
                            <td className="px-4 py-2">{idx + 1}</td>
                            <td className="px-4 py-2">{customer.name}</td>
                            <td className="px-4 py-2 text-right font-semibold">{(customer.tongtien / 1000).toFixed(0)}k</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </CardContent>
              </Card>

              {/* OVERDUE */}
              {overdueAlerts.length > 0 && (
                <Card className="mb-6 border-red-200 bg-red-50">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-3">
                      <AlertCircle className="w-5 h-5 text-red-600" />
                      <h3 className="font-semibold text-red-700">⚠️ Nợ quá hạn ({'>'}30 ngày)</h3>
                    </div>
                    <div className="space-y-2">
                      {overdueAlerts.map((alert) => (
                        <div key={alert.customerId} className="bg-white p-3 rounded border border-red-200">
                          <div className="flex justify-between">
                            <div><div className="font-semibold text-red-700">{alert.customerName}</div><div className="text-xs text-gray-600">{alert.transactionCount} giao dịch</div></div>
                            <div className="text-right font-semibold text-red-600">{(alert.totalNo / 1000).toFixed(0)}k</div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </CardContent>
                </Card>
              )}

              {/* CHI TIẾT */}
              <Card>
                <CardContent className="p-4">
                  <h3 className="font-semibold mb-3">Chi tiết ({chiTiet.length} giao dịch)</h3>
                  <div className="overflow-x-auto">
                    <table className="min-w-full text-xs lg:text-sm">
                      <thead className="bg-gray-100"><tr><th className="px-2 py-2 text-left">Ngày</th><th className="px-2 py-2 text-left">BN</th><th className="px-2 py-2 text-left">Loại</th><th className="px-2 py-2 text-right">DT</th><th className="px-2 py-2 text-right">Lãi</th></tr></thead>
                      <tbody>
                        {paginatedChiTiet.map((item, idx) => (
                          <tr key={idx} className="border-b hover:bg-gray-50">
                            <td className="px-2 py-2">{new Date(item.ngay).toLocaleDateString('vi-VN')}</td>
                            <td className="px-2 py-2">{item.benhnhan?.ten || '-'}</td>
                            <td className="px-2 py-2">{item.type}</td>
                            <td className="px-2 py-2 text-right">{(item.doanhthu / 1000).toFixed(0)}k</td>
                            <td className="px-2 py-2 text-right">{(item.lai / 1000).toFixed(0)}k</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                  <SimplePagination currentPage={currentPage} totalPages={totalPages} onPageChange={setCurrentPage} className="mt-4" />
                </CardContent>
              </Card>
            </>
          )}
        </div>
      </div>
    </ProtectedRoute>
  );
}
