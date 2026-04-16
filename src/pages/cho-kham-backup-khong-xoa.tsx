import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/ui/tabs';
import apiClient from '../lib/apiClient';
import axios from 'axios';
import { toast } from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import Link from 'next/link';
import { Trash2, RefreshCw } from 'lucide-react';

interface BenhNhan {
  id: number;
  ten: string;
  namsinh?: string;
  dienthoai?: string;
  diachi?: string;
  tuoi?: number;
}

interface ChoKham {
  id: number;
  benhnhanid: number;
  thoigian: string;
  trangthai: string;
  BenhNhan: BenhNhan;
}

interface DonThuoc {
  id: number;
  madonthuoc: string;
  chandoan: string;
  chuyenkhoa: string;
  ngay_kham: string;
  tongtien: number;
  trangthai_thanh_toan: string;
  sotien_da_thanh_toan: number;
}

interface DonKinh {
  id: number;
  madonkinh: string;
  benhnhanid: number;
  ngaykham: string;
  cauphai: number;
  truphai: number;
  trucphai: number;
  congphai: number;
  cautrai: number;
  trutrai: number;
  tructrai: number;
  congtrai: number;
  sokinh_moi_mp?: string;
  sokinh_moi_mt?: string;
  giatrong: number;
  giagong: number;
  no: number;
  sotien_da_thanh_toan: number;
  trangthai_thanh_toan: string;
}

interface ChiTietDonThuoc {
  thuoc: {
    id: number;
    tenthuoc: string;
  };
  soluong: number;
}

interface DienTien {
  id: number;
  ngay: string;
  noidung: string;
}

interface ChoKhamRecord {
  id: number;
  benhnhanid: number;
  thoigian: string;
  trangthai: string;
  avatar_url?: string;
  BenhNhan: {
    id: number;
    ten: string;
    dienthoai?: string;
    namsinh?: string;
    diachi?: string;
  };
}

export default function ChoKhamPage() {
  const { confirm } = useConfirm();
  const [danhSachCho, setDanhSachCho] = useState<ChoKham[]>([]);
  const [loading, setLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // States cho lịch sử khám bệnh
  const [selectedBenhNhanId, setSelectedBenhNhanId] = useState<number | null>(null);
  const [donThuocs, setDonThuocs] = useState<DonThuoc[]>([]);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]);
  const [chiTietDonThuocs, setChiTietDonThuocs] = useState<Record<number, ChiTietDonThuoc[]>>({});
  const [dienTiens, setDienTiens] = useState<Record<number, DienTien[]>>({});
  const [activeTab, setActiveTab] = useState<string>("don-thuoc");

  // Đặt tiêu đề trang
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Chờ khám';
    }
  }, []);

  const fetchDanhSachCho = useCallback(async (showToast = false) => {
    try {
      setRefreshing(true);
      const res = await apiClient.get('/api/cho-kham');
      if (res.data && res.data.data) {
        setDanhSachCho(res.data.data);
        setLastRefreshTime(new Date());
        setCountdown(30);
        if (showToast) {
          toast.success('Đã cập nhật danh sách');
        }
      }
    } catch (error) {
      console.error('Lỗi khi tải danh sách chờ:', error);
      // Chỉ hiển thị toast khi refresh thủ công
      if (showToast) {
        toast.error('Không thể tải danh sách chờ khám');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  // Auto refresh mỗi 30 giây
  useEffect(() => {
    // Fetch lần đầu
    fetchDanhSachCho();
    
    // Setup auto refresh interval
    refreshIntervalRef.current = setInterval(() => {
      fetchDanhSachCho();
    }, 30000);

    // Setup countdown interval
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      if (countdownIntervalRef.current) {
        clearInterval(countdownIntervalRef.current);
      }
    };
  }, [fetchDanhSachCho]);

  // Hàm refresh thủ công
  const handleManualRefresh = () => {
    fetchDanhSachCho(true);
  };

  // Fetch lịch sử khám bệnh
  const fetchDonThuoc = useCallback(async (benhnhanid: number): Promise<void> => {
    if (!benhnhanid || isNaN(benhnhanid)) {
      toast.error("Mã bệnh nhân không hợp lệ");
      setDonThuocs([]);
      setDonKinhs([]);
      setChiTietDonThuocs({});
      setDienTiens({});
      return;
    }
    try {
      const timestamp = Date.now();
      const resDon = await axios.get(`/api/don-thuoc?benhnhanid=${benhnhanid}&limit=20&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      const donThuocList: DonThuoc[] = resDon.data.data || [];
      setDonThuocs(donThuocList);

      const chiTietPromises = donThuocList.map((don) =>
        axios.get(`/api/chi-tiet-don-thuoc?donthuocid=${don.id}&_t=${timestamp}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        })
      );
      const chiTietResponses = await Promise.all(chiTietPromises);
      const chiTietMap: Record<number, ChiTietDonThuoc[]> = {};
      chiTietResponses.forEach((res, idx) => {
        const donId = donThuocList[idx].id;
        chiTietMap[donId] = res.data.data.map((item: ChiTietDonThuoc) => ({
          thuoc: { id: item.thuoc.id, tenthuoc: item.thuoc.tenthuoc },
          soluong: item.soluong,
        }));
      });
      setChiTietDonThuocs(chiTietMap);

      const resDienTien = await axios.get(`/api/dien-tien?benhnhanid=${benhnhanid}&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setDienTiens({ [benhnhanid]: resDienTien.data.data || [] });

      // Fetch đơn kính
      const resDonKinh = await axios.get(`/api/don-kinh?benhnhanid=${benhnhanid}&limit=20&_t=${timestamp}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setDonKinhs(resDonKinh.data.data || []);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi tải dữ liệu: ${message}`);
      setDonThuocs([]);
      setDonKinhs([]);
      setChiTietDonThuocs({});
      setDienTiens({});
    }
  }, []);

  const handleSelectBenhNhan = useCallback(
    (benhnhanid: number) => {
      if (!benhnhanid || isNaN(benhnhanid)) {
        toast.error('Mã bệnh nhân không hợp lệ');
        return;
      }
      if (selectedBenhNhanId === benhnhanid) {
        setSelectedBenhNhanId(null);
        setDonThuocs([]);
        setDonKinhs([]);
        setChiTietDonThuocs({});
        setDienTiens({});
        setActiveTab("don-thuoc");
      } else {
        setSelectedBenhNhanId(benhnhanid);
        setActiveTab("don-thuoc");
        fetchDonThuoc(benhnhanid);
      }
    },
    [selectedBenhNhanId, fetchDonThuoc]
  );

  // Xóa khỏi danh sách chờ
  const handleRemoveFromQueue = useCallback(async (choKhamId: number) => {
    if (!await confirm('Bạn có chắc muốn xóa bệnh nhân này khỏi danh sách chờ?')) return;
    
    try {
      await axios.delete(`/api/cho-kham?id=${choKhamId}`);
      toast.success('Đã xóa khỏi danh sách chờ');
      fetchDanhSachCho();
    } catch (error) {
      toast.error('Không thể xóa khỏi danh sách chờ');
    }
  }, []);

  const formatThoiGian = (thoigian: string) => {
    try {
      return format(new Date(thoigian), 'HH:mm - dd/MM/yyyy', { locale: vi });
    } catch {
      return thoigian;
    }
  };

  const calculateWaitTime = (thoigian: string) => {
    try {
      const now = new Date();
      const startTime = new Date(thoigian);
      const diffMs = now.getTime() - startTime.getTime();
      const diffMins = Math.floor(diffMs / 60000);
      
      if (diffMins < 60) {
        return `${diffMins} phút`;
      } else {
        const hours = Math.floor(diffMins / 60);
        const mins = diffMins % 60;
        return `${hours} giờ ${mins} phút`;
      }
    } catch {
      return 'N/A';
    }
  };

  // Format lịch sử khám và đơn thuốc
  const filteredDonThuocs = useMemo(() => {
    return donThuocs.map((don) => {
      const chiTiet = chiTietDonThuocs[don.id] || [];
      const dieuTri = chiTiet
        .map((ct) => `${ct.thuoc.tenthuoc} x ${ct.soluong}`)
        .join(', ') || '-';
      const dienTien = (dienTiens[selectedBenhNhanId!] || []).find(
        (dt: DienTien) => dt.ngay.slice(0, 10) === don.ngay_kham.slice(0, 10)
      );
      return {
        ...don,
        dieuTri,
        dienTien: dienTien ? dienTien.noidung : '-',
      };
    });
  }, [donThuocs, chiTietDonThuocs, dienTiens, selectedBenhNhanId]);

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <div className="p-4 lg:p-6">

          {/* Header */}
          <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-6">
            <div>
              <h1 className="text-2xl lg:text-3xl font-bold text-gray-900 mb-2">
                ⏱️ Danh sách chờ khám
              </h1>
              <p className="text-gray-600">
                Hiển thị bệnh nhân đang chờ khám - <strong>Click vào tên</strong> để xem lịch sử
              </p>
              {/* Auto refresh indicator */}
              <p className="text-sm text-gray-500 mt-1">
                {lastRefreshTime && (
                  <>
                    Cập nhật lúc: {format(lastRefreshTime, 'HH:mm:ss', { locale: vi })}
                    {' '} • Tự động cập nhật sau: <span className={`font-medium ${countdown <= 5 ? 'text-orange-500' : 'text-blue-500'}`}>{countdown}s</span>
                  </>
                )}
              </p>
            </div>
            <div className="flex gap-2 mt-4 md:mt-0">
              <Button
                onClick={handleManualRefresh}
                disabled={refreshing}
                className="bg-blue-600 hover:bg-blue-700 text-white"
              >
                {refreshing ? (
                  <>
                    <RefreshCw className="animate-spin -ml-1 mr-2 h-4 w-4 inline" />
                    Đang tải...
                  </>
                ) : (
                  <>
                    <RefreshCw className="-ml-1 mr-2 h-4 w-4 inline" />
                    Làm mới
                  </>
                )}
              </Button>
              <Link href="/benh-nhan">
                <Button variant="outline">
                  👥 Quản lý bệnh nhân
                </Button>
              </Link>
            </div>
          </div>

          {/* Thống kê nhanh */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Đang chờ</p>
                    <p className="text-3xl font-bold text-red-600">{danhSachCho.length}</p>
                  </div>
                  <div className="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">⏱️</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Trung bình chờ</p>
                    <p className="text-3xl font-bold text-orange-600">
                      {danhSachCho.length > 0
                        ? Math.round(
                            danhSachCho.reduce((sum, item) => {
                              const diffMs = new Date().getTime() - new Date(item.thoigian).getTime();
                              return sum + diffMs / 60000;
                            }, 0) / danhSachCho.length
                          )
                        : 0}
                      <span className="text-lg"> phút</span>
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-orange-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">⏰</span>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm text-gray-600">Cập nhật</p>
                    <p className="text-xl font-bold text-blue-600">
                      {format(new Date(), 'HH:mm:ss', { locale: vi })}
                    </p>
                  </div>
                  <div className="w-12 h-12 bg-blue-100 rounded-full flex items-center justify-center">
                    <span className="text-2xl">🕐</span>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Danh sách chờ */}
          <Card>
            <CardContent className="p-0">
              {danhSachCho.length === 0 ? (
                <div className="p-8 text-center">
                  <div className="text-6xl mb-4">✅</div>
                  <h3 className="text-xl font-semibold text-gray-900 mb-2">
                    Không có bệnh nhân đang chờ
                  </h3>
                  <p className="text-gray-600">
                    Tất cả bệnh nhân đã được khám hoặc chưa có ai đăng ký
                  </p>
                </div>
              ) : (
                <>
                  {/* Mobile view */}
                  <div className="block md:hidden">
                    {danhSachCho.map((item, index) => (
                      <div
                        key={item.id}
                        className={`p-4 border-b last:border-b-0 ${selectedBenhNhanId === item.benhnhanid ? 'bg-blue-50' : 'hover:bg-gray-50'}`}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center font-bold text-red-600">
                              {index + 1}
                            </div>
                            
                            {/* Mobile Card - Thêm avatar */}
                            <div 
                              onClick={() => handleSelectBenhNhan(item.benhnhanid)}
                              className="flex items-center gap-3 cursor-pointer"
                            >
                              {/* Avatar */}
                              {item.avatar_url ? (
                                <img 
                                  src={item.avatar_url} 
                                  alt={item.BenhNhan?.ten || 'Avatar'}
                                  className="w-14 h-14 rounded-full object-cover border-2 border-blue-200 shadow-sm flex-shrink-0"
                                />
                              ) : (
                                <div className="w-14 h-14 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-xl shadow-sm flex-shrink-0">
                                  {(item.BenhNhan.ten || '?').charAt(0).toUpperCase()}
                                </div>
                              )}
                              
                              {/* Thông tin */}
                              <div className="flex-1 min-w-0">
                                <h3 className="font-bold text-gray-900 text-lg truncate">
                                  {item.BenhNhan.ten}
                                </h3>
                                <p className="text-sm text-gray-500">
                                  Mã BN: {item.BenhNhan.id}
                                </p>
                                <p className="text-xs text-gray-400 mt-1">
                                  🕐 {formatThoiGian(item.thoigian)}
                                </p>
                              </div>
                            </div>
                          </div>
                          <Button 
                            size="sm" 
                            variant="ghost" 
                            className="text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => handleRemoveFromQueue(item.id)}
                          >
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                        <div className="grid grid-cols-2 gap-2 text-sm">
                          <div>
                            <span className="text-gray-500">Thời gian:</span>
                            <p className="font-medium">{formatThoiGian(item.thoigian)}</p>
                          </div>
                          <div>
                            <span className="text-gray-500">Đã chờ:</span>
                            <p className="font-medium text-orange-600">
                              {calculateWaitTime(item.thoigian)}
                            </p>
                          </div>
                        </div>
                        <div className="mt-3 flex gap-2">
                          <Link href={`/ke-don?bn=${item.benhnhanid}`} className="flex-1">
                            <Button size="sm" className="w-full bg-green-600 hover:bg-green-700">
                              🩺 Kê đơn
                            </Button>
                          </Link>
                          <Link href={`/ke-don-kinh?bn=${item.benhnhanid}`} className="flex-1">
                            <Button size="sm" className="w-full bg-blue-600 hover:bg-blue-700">
                              👓 Kính
                            </Button>
                          </Link>
                        </div>

                        {/* Medical History Mobile */}
                        {selectedBenhNhanId === item.benhnhanid && (
                          <div className="mt-3 pt-3 border-t">
                            <h3 className="font-medium text-sm mb-2">📋 Lịch sử khám bệnh</h3>
                            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
                              <TabsList className="grid w-full grid-cols-2">
                                <TabsTrigger value="don-thuoc">Đơn thuốc ({donThuocs.length})</TabsTrigger>
                                <TabsTrigger value="don-kinh">Đơn kính ({donKinhs.length})</TabsTrigger>
                              </TabsList>
                              
                              <TabsContent value="don-thuoc" className="mt-2">
                                {filteredDonThuocs.length === 0 ? (
                                  <p className="text-xs text-gray-500">Chưa có đơn thuốc nào.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {filteredDonThuocs.map((don) => (
                                      <div key={don.id} className="bg-yellow-50 border rounded p-2">
                                        <div className="text-xs text-gray-600 mb-1">
                                          {new Date(don.ngay_kham).toLocaleDateString('vi-VN')}
                                        </div>
                                        <div className="text-sm font-medium mb-1">{don.chandoan}</div>
                                        <div className="text-xs text-gray-700 mb-1">
                                          <strong>Điều trị:</strong> {don.dieuTri}
                                        </div>
                                        {don.dienTien !== '-' && (
                                          <div className="text-xs text-gray-700 mb-1">
                                            <strong>Diễn tiến:</strong> {don.dienTien}
                                          </div>
                                        )}
                                        <div className="text-sm font-medium text-blue-600">
                                          {(don.tongtien / 1000).toFixed(0)}k VND
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TabsContent>
                              
                              <TabsContent value="don-kinh" className="mt-2">
                                {donKinhs.length === 0 ? (
                                  <p className="text-xs text-gray-500">Chưa có đơn kính nào.</p>
                                ) : (
                                  <div className="space-y-2">
                                    {donKinhs.map((don) => (
                                      <div key={don.id} className="bg-blue-50 border rounded p-2">
                                        <div className="text-xs text-gray-600 mb-1">
                                          {new Date(don.ngaykham).toLocaleDateString('vi-VN')}
                                        </div>
                                        <div className="grid grid-cols-2 gap-2 text-xs mb-2">
                                          <div>
                                            <strong>Mắt phải:</strong><br/>
                                            S{don.cauphai || 0} C{don.truphai || 0} A{don.trucphai || 0}
                                          </div>
                                          <div>
                                            <strong>Mắt trái:</strong><br/>
                                            S{don.cautrai || 0} C{don.trutrai || 0} A{don.tructrai || 0}
                                          </div>
                                        </div>
                                        <div className="flex justify-between items-center">
                                          <div className="text-sm font-medium text-blue-600">
                                            {(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k VND
                                          </div>
                                          <div className="flex items-center gap-2">
                                            <span className="text-xs text-gray-600">Nợ:</span>
                                            <span className={`text-xs px-2 py-1 rounded ${
                                              (don.no || 0) === 0 
                                                ? 'bg-green-100 text-green-800' 
                                                : 'bg-red-100 text-red-800'
                                            }`}>
                                              {((don.no || 0) / 1000).toFixed(0)}k
                                            </span>
                                          </div>
                                        </div>
                                      </div>
                                    ))}
                                  </div>
                                )}
                              </TabsContent>
                            </Tabs>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>

                  {/* Desktop view */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="w-full">
                      <thead className="bg-gray-100 border-b">
                        <tr>
                          <th className="px-4 py-3 text-left text-sm font-semibold">STT</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Mã BN</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Họ và tên</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Thời gian đăng ký</th>
                          <th className="px-4 py-3 text-left text-sm font-semibold">Thời gian chờ</th>
                          <th className="px-4 py-3 text-center text-sm font-semibold">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody>
                        {danhSachCho.map((item, index) => (
                          <React.Fragment key={item.id}>
                            <tr className={`border-b ${selectedBenhNhanId === item.benhnhanid ? 'bg-blue-50' : 'hover:bg-gray-50'}`}>
                              <td className="px-4 py-3">
                                <div className="w-8 h-8 bg-red-100 rounded-full flex items-center justify-center font-bold text-red-600">
                                  {index + 1}
                                </div>
                              </td>
                              <td className="px-4 py-3 font-medium font-mono">
                                {item.BenhNhan.id}
                              </td>
                              {/* Avatar + Tên bệnh nhân - DESKTOP */}
                              <td className="px-4 py-3">
                                <button
                                  onClick={() => handleSelectBenhNhan(item.benhnhanid)}
                                  className="flex items-center gap-3 text-left hover:bg-gray-50 rounded-lg p-1 -m-1 transition-colors w-full"
                                >
                                  {/* Avatar */}
                                  <div className="flex-shrink-0">
                                    {item.avatar_url ? (
                                      <img 
                                        src={item.avatar_url} 
                                        alt={item.BenhNhan?.ten || 'Avatar'}
                                        className="w-12 h-12 rounded-full object-cover border-2 border-blue-200 shadow-sm"
                                      />
                                    ) : (
                                      <div className="w-12 h-12 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold text-lg shadow-sm">
                                        {(item.BenhNhan.ten || '?').charAt(0).toUpperCase()}
                                      </div>
                                    )}
                                  </div>
                                  
                                  {/* Thông tin */}
                                  <div className="flex-1 min-w-0">
                                    <p className="font-semibold text-gray-900 truncate">
                                      {item.BenhNhan.ten}
                                    </p>
                                    <p className="text-sm text-gray-500 truncate">
                                      Mã BN: {item.BenhNhan.id}
                                    </p>
                                  </div>
                                </button>
                              </td>
                              <td className="px-4 py-3 text-gray-600">
                                {formatThoiGian(item.thoigian)}
                              </td>
                              <td className="px-4 py-3">
                                <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-orange-100 text-orange-800">
                                  {calculateWaitTime(item.thoigian)}
                                </span>
                              </td>
                              <td className="px-4 py-3 text-center">
                                <div className="inline-flex items-center gap-2">
                                  <Link href={`/ke-don?bn=${item.benhnhanid}`}>
                                    <Button size="sm" className="bg-green-600 hover:bg-green-700">
                                      🩺 Kê đơn
                                    </Button>
                                  </Link>
                                  <Link href={`/ke-don-kinh?bn=${item.benhnhanid}`}>
                                    <Button size="sm" className="bg-blue-600 hover:bg-blue-700">
                                      👓 Kính
                                    </Button>
                                  </Link>
                                  <Button 
                                    size="sm" 
                                    variant="ghost" 
                                    className="text-red-600 hover:text-red-700 hover:bg-red-50"
                                    onClick={() => handleRemoveFromQueue(item.id)}
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </Button>
                                </div>
                              </td>
                            </tr>
                            
                            {/* Medical History Row - Desktop */}
                            {selectedBenhNhanId === item.benhnhanid && (
                              <tr>
                                <td colSpan={6} className="px-4 py-3 bg-yellow-50">
                                  <Card className="shadow-sm">
                                    <CardContent className="p-4">
                                      <h3 className="font-semibold mb-3">📋 Lịch sử khám bệnh - {item.BenhNhan.ten}</h3>
                                      <div className="flex gap-4">
                                        {/* Tabs Navigation - Vertical Layout */}
                                        <div className="flex flex-col gap-1 min-w-[120px]">
                                          <button
                                            onClick={() => setActiveTab('don-thuoc')}
                                            className={`px-3 py-2 text-xs rounded-md border transition-colors ${
                                              activeTab === 'don-thuoc'
                                                ? 'bg-white text-black border-gray-300 shadow-sm'
                                                : 'bg-yellow-100 text-gray-600 border-yellow-200 hover:bg-yellow-200'
                                            }`}
                                          >
                                            📋 Đơn thuốc ({donThuocs.length})
                                          </button>
                                          <button
                                            onClick={() => setActiveTab('don-kinh')}
                                            className={`px-3 py-2 text-xs rounded-md border transition-colors ${
                                              activeTab === 'don-kinh'
                                                ? 'bg-white text-black border-gray-300 shadow-sm'
                                                : 'bg-yellow-100 text-gray-600 border-yellow-200 hover:bg-yellow-200'
                                            }`}
                                          >
                                            👓 Đơn kính ({donKinhs.length})
                                          </button>
                                        </div>
                                        
                                        {/* Content Area */}
                                        <div className="flex-1">
                                          {activeTab === 'don-thuoc' ? (
                                            filteredDonThuocs.length === 0 ? (
                                              <p className="text-xs text-muted-foreground">Chưa có đơn thuốc nào.</p>
                                            ) : (
                                              <table className="min-w-full text-xs">
                                                <thead>
                                                  <tr className="border-b">
                                                    <th className="text-left py-1">Ngày khám</th>
                                                    <th className="text-left py-1">Chẩn đoán</th>
                                                    <th className="text-left py-1 max-w-[200px]">Điều trị</th>
                                                    <th className="text-left py-1 max-w-[200px]">Diễn tiến</th>
                                                    <th className="text-right py-1">Số tiền</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {filteredDonThuocs.map((don) => (
                                                    <tr key={don.id} className="border-b">
                                                      <td className="py-1">
                                                        {new Date(don.ngay_kham).toLocaleDateString('vi-VN')}
                                                      </td>
                                                      <td className="py-1">{don.chandoan}</td>
                                                      <td className="py-1 truncate max-w-[200px]">{don.dieuTri}</td>
                                                      <td className="py-1 truncate max-w-[200px]">{don.dienTien}</td>
                                                      <td className="text-right py-1">
                                                        {(don.tongtien / 1000).toFixed(0)}k
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            )
                                          ) : (
                                            donKinhs.length === 0 ? (
                                              <p className="text-xs text-muted-foreground">Chưa có đơn kính nào.</p>
                                            ) : (
                                              <table className="min-w-full text-xs">
                                                <thead>
                                                  <tr className="border-b">
                                                    <th className="text-left py-1">Ngày khám</th>
                                                    <th className="text-left py-1">Số kính</th>
                                                    <th className="text-right py-1">Giá tròng</th>
                                                    <th className="text-right py-1">Giá gọng</th>
                                                    <th className="text-right py-1">Tổng tiền</th>
                                                    <th className="text-right py-1">Nợ</th>
                                                  </tr>
                                                </thead>
                                                <tbody>
                                                  {donKinhs.map((don) => (
                                                    <tr key={don.id} className="border-b">
                                                      <td className="py-1">
                                                        {new Date(don.ngaykham).toLocaleDateString('vi-VN')}
                                                      </td>
                                                      <td className="py-1 text-xs">
                                                        MP: {don.sokinh_moi_mp || 'N/A'}, MT: {don.sokinh_moi_mt || 'N/A'}
                                                      </td>
                                                      <td className="text-right py-1">
                                                        {((don.giatrong || 0) / 1000).toFixed(0)}k
                                                      </td>
                                                      <td className="text-right py-1">
                                                        {((don.giagong || 0) / 1000).toFixed(0)}k
                                                      </td>
                                                      <td className="text-right py-1">
                                                        {(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k
                                                      </td>
                                                      <td className="text-right py-1">
                                                        <span className={`text-xs px-1 py-0.5 rounded ${
                                                          (don.no || 0) === 0 
                                                            ? 'bg-green-100 text-green-800' 
                                                            : 'bg-red-100 text-red-800'
                                                        }`}>
                                                          {((don.no || 0) / 1000).toFixed(0)}k
                                                        </span>
                                                      </td>
                                                    </tr>
                                                  ))}
                                                </tbody>
                                              </table>
                                            )
                                          )}
                                        </div>
                                      </div>
                                    </CardContent>
                                  </Card>
                                </td>
                              </tr>
                            )}
                          </React.Fragment>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>

          {/* Thông tin */}
          <div className="mt-6 p-4 bg-blue-50 border border-blue-200 rounded-lg">
            <div className="flex items-start">
              <div className="text-blue-600 mr-3 text-xl">ℹ️</div>
              <div className="text-sm text-blue-800">
                <p className="font-medium mb-1">Hướng dẫn:</p>
                <ul className="list-disc list-inside space-y-1">
                  <li>Danh sách tự động cập nhật mỗi 30 giây</li>
                  <li><strong>Click vào tên bệnh nhân</strong> để xem lịch sử khám bệnh</li>
                  <li>Nhấn "Kê đơn" để kê đơn thuốc, "Kính" để kê đơn kính</li>
                  <li>Nhấn <Trash2 className="w-3 h-3 inline text-red-600" /> để xóa khỏi danh sách chờ</li>
                </ul>
              </div>
            </div>
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}
