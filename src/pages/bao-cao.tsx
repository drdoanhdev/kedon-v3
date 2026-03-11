import React, { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import apiClient from '../lib/apiClient';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Pagination, SimplePagination } from '../components/ui/pagination';
import { BarChart } from '../components/ui/chart';
import { Toaster, toast } from 'react-hot-toast';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { vi } from 'date-fns/locale';
import ProtectedRoute from '../components/ProtectedRoute';
import { AxiosError } from 'axios';

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

export default function BaoCaoPage() {
  // Tính toán ngày đầu tháng và cuối tháng hiện tại
  const currentDate = new Date();
  const startOfCurrentMonth = startOfMonth(currentDate);
  const endOfCurrentMonth = endOfMonth(currentDate);

  const [baoCao, setBaoCao] = useState<BaoCao | null>(null);
  const [fromDate, setFromDate] = useState<string>(format(startOfCurrentMonth, 'yyyy-MM-dd'));
  const [toDate, setToDate] = useState<string>(format(endOfCurrentMonth, 'yyyy-MM-dd'));
  const [currentPage, setCurrentPage] = useState<number>(1);
  const [loading, setLoading] = useState(false);

  // Password protection states
  const { user, signIn } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  const rowsPerPage = 10;

  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Báo cáo';
    }
  }, []);

  // Tính số ngày giữa fromDate và toDate
  const daysBetween = useMemo(() => {
    if (!fromDate || !toDate) return 0;
    const start = new Date(fromDate);
    const end = new Date(toDate);
    const diffTime = Math.abs(end.getTime() - start.getTime());
    return Math.ceil(diffTime / (1000 * 60 * 60 * 24));
  }, [fromDate, toDate]);

  const isLongPeriod = daysBetween > 90; // Cảnh báo nếu > 3 tháng
  const isVeryLongPeriod = daysBetween > 180; // Cảnh báo mạnh nếu > 6 tháng
  const isMultiMonth = daysBetween > 31; // Hiển thị biểu đồ theo tháng nếu > 1 tháng

  const handlePasswordSubmit = async (e: React.FormEvent) => {
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
        setPasswordError('Mật khẩu không đúng. Vui lòng thử lại.');
        setPassword('');
        toast.error('Mật khẩu không đúng');
      }
    } catch (err) {
      setPasswordError('Có lỗi xảy ra khi xác thực lại.');
    }
    setLoading(false);
  };

  const fetchBaoCao = useCallback(async () => {
    setLoading(true);
    try {
      console.log('🔄 Fetching báo cáo with params:', { from: fromDate, to: toDate });

      // Force fresh data - không dùng cache
      const res = await apiClient.get('/api/bao-cao', {
        params: {
          from: fromDate,
          to: toDate,
          // apiClient đã tự động thêm _t và _r
        },
        timeout: 120000 // 2 phút timeout
      });

      console.log('Kết quả API:', res.data);
      console.log('Chi tiết data structure:', res.data?.data?.chi_tiet);

      if (res.data && res.data.data) {
        setBaoCao(res.data.data);
        setCurrentPage(1);
        toast.success('Tải báo cáo thành công');
      } else {
        console.log('Dữ liệu trả về không hợp lệ:', res.data);
        toast.error('Dữ liệu báo cáo không hợp lệ');
        setBaoCao(null);
      }
    } catch (error: unknown) {
      console.error('❌ Lỗi khi gọi API bao-cao:', error);
      if (error instanceof AxiosError) {
        let errorMessage = error.response?.data?.message || error.message || 'Lỗi không xác định';
        
        // Xử lý lỗi timeout
        if (error.code === 'ECONNABORTED' || error.message.includes('timeout')) {
          errorMessage = 'Quá thời gian xử lý! Hãy thử:\n• Giảm khoảng thời gian (tối đa 3 tháng)\n• Chọn chuyên khoa cụ thể\n• Thử lại vào lúc ít người dùng';
        }
        
        console.error('Chi tiết lỗi:', error.response?.data);
        toast.error('Lỗi khi tải báo cáo: ' + errorMessage);
      } else {
        toast.error('Lỗi không xác định khi tải báo cáo');
      }
      setBaoCao(null);
    } finally {
      setLoading(false);
    }
  }, [fromDate, toDate]);

  // If not authenticated, show password form
  if (!isAuthenticated) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-full max-w-md p-6">
            <Toaster position="top-right" />

            <Card className="shadow-lg">
              <CardContent className="p-6 lg:p-8">
                <div className="text-center mb-6">
                  <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mb-2">Xác thực lại truy cập Báo cáo</h1>
                  <p className="text-sm text-gray-600">Vui lòng nhập lại mật khẩu tài khoản để tiếp tục</p>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setPasswordError('');
                        }}
                        className="w-full h-12 pr-12"
                        placeholder="Nhập lại mật khẩu tài khoản..."
                        required
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {passwordError && (
                      <p className="mt-2 text-sm text-red-600">{passwordError}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                    disabled={loading}
                  >
                    {loading ? 'Đang xác thực...' : 'Xác thực lại'}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-xs text-gray-500">
                    Báo cáo chứa thông tin tài chính nhạy cảm
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  // Hàm chuyển đổi từ yyyy-MM-dd sang dd/mm/yyyy
  const formatDisplayDate = (dateString: string) => {
    const date = new Date(dateString);
    return format(date, 'dd/MM/yyyy', { locale: vi });
  };

  // Hàm chuyển đổi từ dd/mm/yyyy sang yyyy-MM-dd
  const formatInputDate = (dateString: string) => {
    const parts = dateString.split('/');
    if (parts.length === 3) {
      return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
    }
    return dateString;
  };

  const chiTiet: ChiTietRow[] = baoCao
    ? [
        ...baoCao.chi_tiet.mat.thuoc.map((item) => ({ ...item, type: 'Thuốc' })),
        ...baoCao.chi_tiet.mat.thuthuat.map((item) => ({ ...item, type: 'Thủ thuật' })),
        ...baoCao.chi_tiet.tmh.thuoc.map((item) => ({ ...item, type: 'Thuốc' })),
        ...baoCao.chi_tiet.tmh.thuthuat.map((item) => ({ ...item, type: 'Thủ thuật' })),
        ...baoCao.chi_tiet.kinh.map((item) => ({ ...item, type: 'Kính' })),
      ].sort((a, b) => new Date(b.ngay).getTime() - new Date(a.ngay).getTime())
    : [];

  // Nhóm doanh thu theo ngày
  const doanhThuTheoNgay = chiTiet.reduce((acc, item) => {
    const ngay = new Date(item.ngay).toLocaleDateString('vi-VN');
    if (!acc[ngay]) {
      acc[ngay] = { ngay, doanhthu: 0, lai: 0, no: 0, soLuongGiaoDich: 0 };
    }
    acc[ngay].doanhthu += item.doanhthu;
    acc[ngay].lai += item.lai;
    acc[ngay].no += item.no;
    acc[ngay].soLuongGiaoDich += 1;
    return acc;
  }, {} as Record<string, { ngay: string; doanhthu: number; lai: number; no: number; soLuongGiaoDich: number }>);

  // Chuyển thành array và sắp xếp theo ngày
  const doanhThuTheoNgayArray = Object.values(doanhThuTheoNgay).sort((a, b) => {
    const dateA = new Date(a.ngay.split('/').reverse().join('-'));
    const dateB = new Date(b.ngay.split('/').reverse().join('-'));
    return dateB.getTime() - dateA.getTime(); // Sắp xếp từ mới nhất đến cũ nhất
  });

  // Nhóm lãi theo tháng
  const laiTheoThang = chiTiet.reduce((acc, item) => {
    const date = new Date(item.ngay);
    const thang = `${String(date.getMonth() + 1).padStart(2, '0')}/${date.getFullYear()}`;
    if (!acc[thang]) {
      acc[thang] = { thang, lai: 0, doanhthu: 0, no: 0, soLuongGiaoDich: 0 };
    }
    acc[thang].lai += item.lai;
    acc[thang].doanhthu += item.doanhthu;
    acc[thang].no += item.no;
    acc[thang].soLuongGiaoDich += 1;
    return acc;
  }, {} as Record<string, { thang: string; lai: number; doanhthu: number; no: number; soLuongGiaoDich: number }>);

  // Chuyển thành array và sắp xếp theo tháng
  const laiTheoThangArray = Object.values(laiTheoThang).sort((a, b) => {
    const [monthA, yearA] = a.thang.split('/').map(Number);
    const [monthB, yearB] = b.thang.split('/').map(Number);
    const dateA = new Date(yearA, monthA - 1);
    const dateB = new Date(yearB, monthB - 1);
    return dateB.getTime() - dateA.getTime(); // Sắp xếp từ mới nhất đến cũ nhất
  });

  // Chuẩn bị dữ liệu cho biểu đồ lãi theo ngày
  const laiTheoNgayChartData = doanhThuTheoNgayArray.map(item => ({
    label: item.ngay,
    value: item.lai,
    secondaryValue: item.doanhthu,
    tooltip: `${item.ngay}: Lãi ${(item.lai / 1000).toFixed(0)}k VNĐ, Doanh thu ${(item.doanhthu / 1000).toFixed(0)}k VNĐ (${item.soLuongGiaoDich} giao dịch)`
  }));

  // Chuẩn bị dữ liệu cho biểu đồ lãi theo tháng  
  const laiTheoThangChartData = laiTheoThangArray.map(item => ({
    label: item.thang,
    value: item.lai,
    secondaryValue: item.doanhthu,
    tooltip: `${item.thang}: Lãi ${(item.lai / 1000).toFixed(0)}k VNĐ, Doanh thu ${(item.doanhthu / 1000).toFixed(0)}k VNĐ (${item.soLuongGiaoDich} giao dịch)`
  }));

  // Debug info
  console.log('Chi tiết items:', chiTiet.length);
  console.log('Doanh thu theo ngày:', doanhThuTheoNgayArray.length);
  console.log('Sample data:', doanhThuTheoNgayArray.slice(0, 3));
  console.log('Lãi theo tháng:', laiTheoThangArray.length);

  const totalPages = Math.ceil(doanhThuTheoNgayArray.length / rowsPerPage);
  const paginated = doanhThuTheoNgayArray.slice((currentPage - 1) * rowsPerPage, currentPage * rowsPerPage);

  // Tổng hợp
  const tongDoanhthu = chiTiet.reduce((sum, item) => sum + item.doanhthu, 0);
  const tongLai = chiTiet.reduce((sum, item) => sum + item.lai, 0);
  const tongNo = chiTiet.reduce((sum, item) => sum + item.no, 0);
  const tongTyLeLai = tongDoanhthu > 0 ? ((tongLai / tongDoanhthu) * 100).toFixed(2) : '0';

  // Tính toán cho từng loại (Thuốc, Thủ thuật, Kính)
  const thuocStats = chiTiet
    .filter((item) => item.type === 'Thuốc')
    .reduce(
      (acc, item) => ({
        doanhthu: acc.doanhthu + item.doanhthu,
        lai: acc.lai + item.lai,
        no: acc.no + item.no,
      }),
      { doanhthu: 0, lai: 0, no: 0 }
    );

  const thuthuatStats = chiTiet
    .filter((item) => item.type === 'Thủ thuật')
    .reduce(
      (acc, item) => ({
        doanhthu: acc.doanhthu + item.doanhthu,
        lai: acc.lai + item.lai,
        no: acc.no + item.no,
      }),
      { doanhthu: 0, lai: 0, no: 0 }
    );

  const kinhStats = chiTiet
    .filter((item) => item.type === 'Kính')
    .reduce(
      (acc, item) => ({
        doanhthu: acc.doanhthu + item.doanhthu,
        lai: acc.lai + item.lai,
        no: acc.no + item.no,
      }),
      { doanhthu: 0, lai: 0, no: 0 }
    );

  // Main report content (only shown after authentication)
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="p-4 lg:p-6">
          <Toaster position="top-right" />

          {/* Header with logout option */}
          <div className="flex justify-between items-center mb-4">
            <h1 className="text-xl lg:text-2xl font-semibold">Báo Cáo Doanh Thu và Lãi</h1>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setIsAuthenticated(false);
                setPassword('');
                toast.success('Đã đăng xuất');
              }}
              className="text-gray-600 hover:text-gray-800"
            >
              <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
              </svg>
              Đăng xuất
            </Button>
          </div>

          {/* Mobile Controls */}
          <div className="block md:hidden space-y-4 mb-6 p-3 bg-white rounded-lg shadow">
            <div className="space-y-3">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Từ ngày:</label>
                <Input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="w-full h-12"
                  disabled={loading}
                />
              </div>

              <div>
                <label className="text-sm font-medium text-gray-700 mb-1 block">Đến ngày:</label>
                <Input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="w-full h-12"
                  disabled={loading}
                />
              </div>

              <Button
                onClick={fetchBaoCao}
                disabled={loading}
                className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-5 w-5 text-white" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang xử lý...
                  </>
                ) : (
                  '📊 Tổng hợp báo cáo'
                )}
              </Button>
            </div>

            {/* Cảnh báo khoảng thời gian dài */}
            {isLongPeriod && (
              <div className={`p-3 rounded-lg border-l-4 ${isVeryLongPeriod 
                ? 'bg-red-50 border-red-400 text-red-800' 
                : 'bg-amber-50 border-amber-400 text-amber-800'
              }`}>
                <div className="flex items-start">
                  <div className="flex-shrink-0">
                    {isVeryLongPeriod ? '⚠️' : '⏰'}
                  </div>
                  <div className="ml-2 text-sm">
                    <p className="font-medium">
                      {isVeryLongPeriod 
                        ? 'Cảnh báo: Khoảng thời gian rất dài!' 
                        : 'Thông báo: Khoảng thời gian dài'
                      }
                    </p>
                    <p className="mt-1">
                      Đang yêu cầu dữ liệu {daysBetween} ngày 
                      {isVeryLongPeriod 
                        ? '. Có thể mất 1-2 phút hoặc timeout. Khuyến nghị ≤ 3 tháng.'
                        : '. Có thể mất 30-60 giây.'
                      }
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Desktop Controls */}
          <div className="hidden lg:flex flex-col md:flex-row gap-4 mb-6 p-4 bg-white rounded-lg shadow">
            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Từ ngày:</label>
              <Input
                type="date"
                value={fromDate}
                onChange={(e) => setFromDate(e.target.value)}
                className="w-40"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col">
              <label className="text-sm font-medium text-gray-700 mb-1">Đến ngày:</label>
              <Input
                type="date"
                value={toDate}
                onChange={(e) => setToDate(e.target.value)}
                className="w-40"
                disabled={loading}
              />
            </div>

            <div className="flex flex-col justify-end">
              <Button
                onClick={fetchBaoCao}
                disabled={loading}
                className="h-10 bg-blue-600 hover:bg-blue-700 text-white font-medium px-6"
              >
                {loading ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white inline" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Đang xử lý...
                  </>
                ) : (
                  '📊 Tổng hợp báo cáo'
                )}
              </Button>
            </div>
          </div>

          {/* Cảnh báo khoảng thời gian dài - Desktop */}
          {isLongPeriod && (
            <div className={`hidden md:block mb-6 p-4 rounded-lg border-l-4 ${isVeryLongPeriod 
              ? 'bg-red-50 border-red-400 text-red-800' 
              : 'bg-amber-50 border-amber-400 text-amber-800'
            }`}>
              <div className="flex items-start">
                <div className="flex-shrink-0 text-xl">
                  {isVeryLongPeriod ? '⚠️' : '⏰'}
                </div>
                <div className="ml-3">
                  <p className="font-medium text-base">
                    {isVeryLongPeriod 
                      ? 'Cảnh báo: Khoảng thời gian rất dài!' 
                      : 'Thông báo: Khoảng thời gian dài'
                    }
                  </p>
                  <p className="mt-1 text-sm">
                    Đang yêu cầu dữ liệu {daysBetween} ngày 
                    {isVeryLongPeriod 
                      ? '. Có thể mất 1-2 phút hoặc timeout. Khuyến nghị chọn khoảng thời gian ≤ 3 tháng để đảm bảo tốc độ.'
                      : '. Có thể mất 30-60 giây để xử lý.'
                    }
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Debug info */}
          {loading && (
            <div className="mb-4 p-4 bg-blue-50 rounded">
              <p>Đang tải dữ liệu...</p>
            </div>
          )}

          {!loading && !baoCao && (
            <div className="mb-4 p-4 bg-red-50 rounded">
              <p>Không có dữ liệu hoặc có lỗi xảy ra. Vui lòng kiểm tra console để biết thêm chi tiết.</p>
            </div>
          )}

          {/* Tổng hợp nhanh */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 mb-6">
            <Card>
              <CardContent className="p-3 lg:p-4">
                <div className="text-xl lg:text-2xl font-bold text-blue-600">{(tongDoanhthu / 1000).toFixed(0)}k</div>
                <div className="text-xs lg:text-sm text-gray-600">Tổng doanh thu</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 lg:p-4">
                <div className="text-xl lg:text-2xl font-bold text-green-600">{(tongLai / 1000).toFixed(0)}k</div>
                <div className="text-xs lg:text-sm text-gray-600">Tổng lãi</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 lg:p-4">
                <div className="text-xl lg:text-2xl font-bold text-red-600">{(tongNo / 1000).toFixed(0)}k</div>
                <div className="text-xs lg:text-sm text-gray-600">Tổng nợ</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-3 lg:p-4">
                <div className="text-xl lg:text-2xl font-bold text-purple-600">{tongTyLeLai}%</div>
                <div className="text-xs lg:text-sm text-gray-600">Tỷ lệ lãi</div>
              </CardContent>
            </Card>
          </div>

          {baoCao && (
            <div className="mb-6">
              <h2 className="text-base lg:text-lg font-semibold mb-2">Tổng hợp chi tiết</h2>

              {/* Mobile Card Layout */}
              <div className="block md:hidden space-y-3">
                <Card>
                  <CardContent className="p-3">
                    <h3 className="font-semibold text-sm mb-2 text-blue-600">Thuốc</h3>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500">Doanh thu</div>
                        <div className="font-semibold">{(thuocStats.doanhthu / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Lãi</div>
                        <div className="font-semibold text-green-600">{(thuocStats.lai / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Nợ</div>
                        <div className="font-semibold text-red-600">{(thuocStats.no / 1000).toFixed(0)}k</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-3">
                    <h3 className="font-semibold text-sm mb-2 text-green-600">Thủ thuật</h3>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500">Doanh thu</div>
                        <div className="font-semibold">{(thuthuatStats.doanhthu / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Lãi</div>
                        <div className="font-semibold text-green-600">{(thuthuatStats.lai / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Nợ</div>
                        <div className="font-semibold text-red-600">{(thuthuatStats.no / 1000).toFixed(0)}k</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card>
                  <CardContent className="p-3">
                    <h3 className="font-semibold text-sm mb-2 text-purple-600">Kính</h3>
                    <div className="grid grid-cols-3 gap-2 text-xs">
                      <div>
                        <div className="text-gray-500">Doanh thu</div>
                        <div className="font-semibold">{(kinhStats.doanhthu / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Lãi</div>
                        <div className="font-semibold text-green-600">{(kinhStats.lai / 1000).toFixed(0)}k</div>
                      </div>
                      <div>
                        <div className="text-gray-500">Nợ</div>
                        <div className="font-semibold text-red-600">{(kinhStats.no / 1000).toFixed(0)}k</div>
                      </div>
                    </div>
                  </CardContent>
                </Card>

                <Card className="bg-yellow-50 border-yellow-200">
                  <CardContent className="p-3">
                    <h3 className="font-semibold text-sm mb-2 text-yellow-700">Tổng tỷ lệ lãi</h3>
                    <div className="text-xl font-bold text-yellow-700">{tongTyLeLai}%</div>
                  </CardContent>
                </Card>
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block">
                <Card>
                  <CardContent className="p-0">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-100 border-b">
                        <tr>
                          <th className="px-4 py-2 text-left">Hạng mục</th>
                          <th className="px-4 py-2 text-right">Doanh thu (nghìn)</th>
                          <th className="px-4 py-2 text-right">Lãi (nghìn)</th>
                          <th className="px-4 py-2 text-right">Nợ (nghìn)</th>
                        </tr>
                      </thead>
                      <tbody>
                        <tr className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2">Thuốc</td>
                          <td className="px-4 py-2 text-right">{(thuocStats.doanhthu / 1000).toFixed(0)}k</td>
                          <td className="px-4 py-2 text-right">{(thuocStats.lai / 1000).toFixed(0)}k</td>
                          <td className="px-4 py-2 text-right">{(thuocStats.no / 1000).toFixed(0)}k</td>
                        </tr>
                        <tr className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2">Thủ thuật</td>
                          <td className="px-4 py-2 text-right">{(thuthuatStats.doanhthu / 1000).toFixed(0)}k</td>
                          <td className="px-4 py-2 text-right">{(thuthuatStats.lai / 1000).toFixed(0)}k</td>
                          <td className="px-4 py-2 text-right">{(thuthuatStats.no / 1000).toFixed(0)}k</td>
                        </tr>
                        <tr className="border-b hover:bg-gray-50">
                          <td className="px-4 py-2">Kính</td>
                          <td className="px-4 py-2 text-right">{(kinhStats.doanhthu / 1000).toFixed(0)}k</td>
                          <td className="px-4 py-2 text-right">{(kinhStats.lai / 1000).toFixed(0)}k</td>
                          <td className="px-4 py-2 text-right">{(kinhStats.no / 1000).toFixed(0)}k</td>
                        </tr>
                        <tr className="border-b hover:bg-gray-50 font-semibold bg-yellow-50">
                          <td className="px-4 py-2">Tổng tỷ lệ lãi</td>
                          <td className="px-4 py-2 text-right" colSpan={3}>{tongTyLeLai}%</td>
                        </tr>
                      </tbody>
                    </table>
                  </CardContent>
                </Card>
              </div>
            </div>
          )}

          <Card>
            <CardContent className="p-0">
              <h2 className="text-base lg:text-lg font-semibold mb-2 px-3 lg:px-4 pt-3 lg:pt-4">Lãi theo ngày ({doanhThuTheoNgayArray.length} ngày)</h2>

              {/* Biểu đồ lãi theo ngày */}
              <div className="px-3 lg:px-4 pb-4">
                <BarChart
                  data={laiTheoNgayChartData}
                  title="Biểu đồ Doanh thu & Lãi theo ngày (nghìn VNĐ) - Cột cam: Doanh thu, Cột xanh: Lãi"
                  valueLabel="VNĐ"
                  color="green"
                  height={300}
                  maxItems={31}
                  showSecondaryValue={false}
                  stackedMode={true}
                />
              </div>

              {/* Biểu đồ lãi theo tháng - chỉ hiện khi > 1 tháng */}
              {isMultiMonth && laiTheoThangArray.length > 1 && (
                <div className="px-3 lg:px-4 pb-4 border-t pt-4">
                  <BarChart
                    data={laiTheoThangChartData}
                    title="Biểu đồ Doanh thu & Lãi theo tháng (nghìn VNĐ) - Cột cam: Doanh thu, Cột xanh: Lãi"
                    valueLabel="VNĐ"
                    color="purple"
                    height={280}
                    maxItems={12}
                    showSecondaryValue={false}
                    stackedMode={true}
                  />
                </div>
              )}

              {/* Bảng doanh thu/lãi theo tháng - chỉ hiện khi > 1 tháng */}
              {isMultiMonth && laiTheoThangArray.length > 1 && (
                <div className="px-3 lg:px-4 pb-4 border-t pt-4">
                  <h3 className="text-lg font-semibold mb-3">📊 Báo cáo theo tháng</h3>
                  
                  {/* Mobile cards cho bảng tháng */}
                  <div className="block md:hidden space-y-2">
                    {laiTheoThangArray.map((item, index) => (
                      <Card key={`month-${item.thang}-${index}`} className="border">
                        <CardContent className="p-3">
                          <div className="flex justify-between items-start mb-2">
                            <div>
                              <h4 className="font-semibold text-sm">Tháng {item.thang}</h4>
                              <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800 mt-1">
                                {item.soLuongGiaoDich} giao dịch
                              </div>
                            </div>
                            <div className="text-right">
                              <div className="text-base font-semibold text-blue-600">
                                {(item.doanhthu / 1000).toFixed(0)}k
                              </div>
                              <div className="text-xs text-purple-600">
                                {item.doanhthu > 0 ? ((item.lai / item.doanhthu) * 100).toFixed(1) : '0.0'}%
                              </div>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 gap-3 text-xs">
                            <div>
                              <span className="text-gray-500">Lãi:</span>
                              <span className="font-semibold text-green-600 ml-1">{(item.lai / 1000).toFixed(0)}k</span>
                            </div>
                            <div>
                              <span className="text-gray-500">Nợ:</span>
                              <span className="font-semibold text-red-600 ml-1">{(item.no / 1000).toFixed(0)}k</span>
                            </div>
                          </div>
                        </CardContent>
                      </Card>
                    ))}
                  </div>

                  {/* Desktop table cho bảng tháng */}
                  <div className="hidden md:block">
                    <table className="min-w-full text-sm bg-white rounded-lg overflow-hidden shadow">
                      <thead className="bg-purple-100 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left font-semibold">Tháng</th>
                          <th className="px-4 py-3 text-center font-semibold">Số giao dịch</th>
                          <th className="px-4 py-3 text-right font-semibold">Doanh thu (nghìn)</th>
                          <th className="px-4 py-3 text-right font-semibold">Lãi (nghìn)</th>
                          <th className="px-4 py-3 text-right font-semibold">Tỷ lệ lãi (%)</th>
                          <th className="px-4 py-3 text-right font-semibold">Nợ (nghìn)</th>
                        </tr>
                      </thead>
                      <tbody>
                        {laiTheoThangArray.map((item, index) => (
                          <tr key={`month-row-${item.thang}-${index}`} className="border-b hover:bg-purple-50">
                            <td className="px-4 py-3 font-medium">Tháng {item.thang}</td>
                            <td className="px-4 py-3 text-center">
                              <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-purple-100 text-purple-800">
                                {item.soLuongGiaoDich}
                              </span>
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-blue-600">
                              {(item.doanhthu / 1000).toFixed(0)}k
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-green-600">
                              {(item.lai / 1000).toFixed(0)}k
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-purple-600">
                              {item.doanhthu > 0 ? ((item.lai / item.doanhthu) * 100).toFixed(1) : '0.0'}%
                            </td>
                            <td className="px-4 py-3 text-right font-semibold text-red-600">
                              {(item.no / 1000).toFixed(0)}k
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Divider giữa báo cáo tháng và báo cáo ngày */}
              {isMultiMonth && laiTheoThangArray.length > 1 && (
                <div className="px-3 lg:px-4 pb-4">
                  <hr className="border-gray-300" />
                  <h3 className="text-lg font-semibold mt-4 mb-3">📅 Chi tiết theo ngày</h3>
                </div>
              )}

              {/* Mobile Card Layout for Daily Revenue */}
              <div className="block md:hidden px-3 space-y-3 mb-4">
                {paginated.map((item, index) => (
                  <Card key={`${item.ngay}-${index}`} className="border">
                    <CardContent className="p-3">
                      <div className="flex justify-between items-start mb-2">
                        <div>
                          <h3 className="font-semibold text-sm">{item.ngay}</h3>
                          <div className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-blue-100 text-blue-800 mt-1">
                            {item.soLuongGiaoDich} giao dịch
                          </div>
                        </div>
                        <div className="text-right">
                          <div className="text-base font-semibold text-blue-600">
                            {(item.doanhthu / 1000).toFixed(0)}k
                          </div>
                          <div className="text-xs text-purple-600">
                            {item.doanhthu > 0 ? ((item.lai / item.doanhthu) * 100).toFixed(1) : '0.0'}%
                          </div>
                        </div>
                      </div>
                      <div className="grid grid-cols-2 gap-3 text-xs">
                        <div>
                          <span className="text-gray-500">Lãi:</span>
                          <span className="font-semibold text-green-600 ml-1">{(item.lai / 1000).toFixed(0)}k</span>
                        </div>
                        <div>
                          <span className="text-gray-500">Nợ:</span>
                          <span className="font-semibold text-red-600 ml-1">{(item.no / 1000).toFixed(0)}k</span>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                ))}
                {paginated.length === 0 && (
                  <Card>
                    <CardContent className="p-6 text-center text-gray-500">
                      {loading ? 'Đang tải...' : 'Không có dữ liệu cho khoảng thời gian này'}
                    </CardContent>
                  </Card>
                )}
              </div>

              {/* Desktop Table Layout */}
              <div className="hidden md:block">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-4 py-2 text-left">Ngày</th>
                      <th className="px-4 py-2 text-center">Số giao dịch</th>
                      <th className="px-4 py-2 text-right">Doanh thu (nghìn)</th>
                      <th className="px-4 py-2 text-right">Lãi (nghìn)</th>
                      <th className="px-4 py-2 text-right">Nợ (nghìn)</th>
                      <th className="px-4 py-2 text-right">Tỷ lệ lãi (%)</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((item, index) => (
                      <tr key={`${item.ngay}-${index}`} className="border-b hover:bg-gray-50">
                        <td className="px-4 py-2 font-medium">{item.ngay}</td>
                        <td className="px-4 py-2 text-center">
                          <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800">
                            {item.soLuongGiaoDich}
                          </span>
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-blue-600">
                          {(item.doanhthu / 1000).toFixed(0)}k
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-green-600">
                          {(item.lai / 1000).toFixed(0)}k
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-red-600">
                          {(item.no / 1000).toFixed(0)}k
                        </td>
                        <td className="px-4 py-2 text-right font-semibold text-purple-600">
                          {item.doanhthu > 0 ? ((item.lai / item.doanhthu) * 100).toFixed(1) : '0.0'}%
                        </td>
                      </tr>
                    ))}
                    {paginated.length === 0 && (
                      <tr>
                        <td colSpan={6} className="px-4 py-4 text-center text-gray-500">
                          {loading ? 'Đang tải...' : 'Không có dữ liệu cho khoảng thời gian này'}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Tổng kết cuối bảng */}
              {doanhThuTheoNgayArray.length > 0 && (
                <div className="border-t bg-gray-50 p-3 lg:p-4">
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4 text-sm">
                    <div className="text-center">
                      <div className="font-semibold text-blue-600">{doanhThuTheoNgayArray.length}</div>
                      <div className="text-gray-600 text-xs lg:text-sm">Ngày có doanh thu</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-blue-600">
                        {doanhThuTheoNgayArray.reduce((sum, item) => sum + item.soLuongGiaoDich, 0)}
                      </div>
                      <div className="text-gray-600 text-xs lg:text-sm">Tổng giao dịch</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-green-600">
                        {(doanhThuTheoNgayArray.reduce((sum, item) => sum + item.doanhthu, 0) / 1000).toFixed(0)}k
                      </div>
                      <div className="text-gray-600 text-xs lg:text-sm">Tổng doanh thu</div>
                    </div>
                    <div className="text-center">
                      <div className="font-semibold text-purple-600">
                        {doanhThuTheoNgayArray.length > 0
                          ? (doanhThuTheoNgayArray.reduce((sum, item) => sum + item.doanhthu, 0) / doanhThuTheoNgayArray.length / 1000).toFixed(0)
                          : '0'
                        }k
                      </div>
                      <div className="text-gray-600 text-xs lg:text-sm">Trung bình/ngày</div>
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Mobile Pagination */}
          <div className="block md:hidden mt-4">
            <SimplePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>

          {/* Desktop Pagination */}
          <div className="hidden md:block mt-4">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
            />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}