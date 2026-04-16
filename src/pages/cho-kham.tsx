'use client';

import React, { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import apiClient from '../lib/apiClient';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { format } from 'date-fns';
import { vi } from 'date-fns/locale';
import Link from 'next/link';
import { Trash2, RefreshCw, Clock, Users, ChevronDown, ChevronUp, Stethoscope, Glasses, Phone, MapPin, Calendar } from 'lucide-react';
import { Input } from '../components/ui/input';

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
  avatar_url?: string;
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

function getWaitColor(thoigian: string): string {
  try {
    const diffMs = Date.now() - new Date(thoigian).getTime();
    const mins = Math.floor(diffMs / 60000);
    if (mins < 15) return 'text-green-700 bg-green-50 border-green-200';
    if (mins < 30) return 'text-yellow-700 bg-yellow-50 border-yellow-200';
    if (mins < 60) return 'text-orange-700 bg-orange-50 border-orange-200';
    return 'text-red-700 bg-red-50 border-red-200';
  } catch {
    return 'text-gray-600 bg-gray-50 border-gray-200';
  }
}

export default function ChoKhamPage() {
  const { confirm } = useConfirm();
  const [danhSachCho, setDanhSachCho] = useState<ChoKham[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState<Date | null>(null);
  const [countdown, setCountdown] = useState(30);
  const refreshIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const countdownIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const [search, setSearch] = useState('');

  // States cho lịch sử khám bệnh
  const [selectedBenhNhanId, setSelectedBenhNhanId] = useState<number | null>(null);
  const [donThuocs, setDonThuocs] = useState<DonThuoc[]>([]);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]);
  const [chiTietDonThuocs, setChiTietDonThuocs] = useState<Record<number, ChiTietDonThuoc[]>>({});
  const [dienTiens, setDienTiens] = useState<Record<number, DienTien[]>>({});
  const [activeTab, setActiveTab] = useState<string>('don-thuoc');

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
      if (showToast) {
        toast.error('Không thể tải danh sách chờ khám');
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchDanhSachCho();
    refreshIntervalRef.current = setInterval(() => {
      fetchDanhSachCho();
    }, 30000);
    countdownIntervalRef.current = setInterval(() => {
      setCountdown((prev) => (prev > 0 ? prev - 1 : 30));
    }, 1000);
    return () => {
      if (refreshIntervalRef.current) clearInterval(refreshIntervalRef.current);
      if (countdownIntervalRef.current) clearInterval(countdownIntervalRef.current);
    };
  }, [fetchDanhSachCho]);

  const handleManualRefresh = () => {
    fetchDanhSachCho(true);
  };

  const fetchDonThuoc = useCallback(async (benhnhanid: number): Promise<void> => {
    if (!benhnhanid || isNaN(benhnhanid)) {
      toast.error('Mã bệnh nhân không hợp lệ');
      setDonThuocs([]);
      setDonKinhs([]);
      setChiTietDonThuocs({});
      setDienTiens({});
      return;
    }
    try {
      const timestamp = Date.now();
      const headers = {
        'Cache-Control': 'no-cache, no-store, must-revalidate',
        'Pragma': 'no-cache',
        'Expires': '0',
      };

      const resDon = await axios.get(`/api/don-thuoc?benhnhanid=${benhnhanid}&limit=20&_t=${timestamp}`, { headers });
      const donThuocList: DonThuoc[] = resDon.data.data || [];
      setDonThuocs(donThuocList);

      const chiTietPromises = donThuocList.map((don) =>
        axios.get(`/api/chi-tiet-don-thuoc?donthuocid=${don.id}&_t=${timestamp}`, { headers })
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

      const resDienTien = await axios.get(`/api/dien-tien?benhnhanid=${benhnhanid}&_t=${timestamp}`, { headers });
      setDienTiens({ [benhnhanid]: resDienTien.data.data || [] });

      const resDonKinh = await axios.get(`/api/don-kinh?benhnhanid=${benhnhanid}&limit=20&_t=${timestamp}`, { headers });
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
        setActiveTab('don-thuoc');
      } else {
        setSelectedBenhNhanId(benhnhanid);
        setActiveTab('don-thuoc');
        fetchDonThuoc(benhnhanid);
      }
    },
    [selectedBenhNhanId, fetchDonThuoc]
  );

  const handleRemoveFromQueue = useCallback(async (choKhamId: number) => {
    if (!(await confirm('Bạn có chắc muốn xóa bệnh nhân này khỏi danh sách chờ?'))) return;
    try {
      await axios.delete(`/api/cho-kham?id=${choKhamId}`);
      toast.success('Đã xóa khỏi danh sách chờ');
      fetchDanhSachCho();
    } catch {
      toast.error('Không thể xóa khỏi danh sách chờ');
    }
  }, [confirm, fetchDanhSachCho]);

  const formatThoiGian = (thoigian: string) => {
    try {
      return format(new Date(thoigian), 'HH:mm', { locale: vi });
    } catch {
      return thoigian;
    }
  };

  const calculateWaitTime = (thoigian: string) => {
    try {
      const diffMs = Date.now() - new Date(thoigian).getTime();
      const diffMins = Math.floor(diffMs / 60000);
      if (diffMins < 60) return `${diffMins} phút`;
      const hours = Math.floor(diffMins / 60);
      const mins = diffMins % 60;
      return `${hours}h ${mins}p`;
    } catch {
      return 'N/A';
    }
  };

  const avgWaitMinutes = useMemo(() => {
    if (danhSachCho.length === 0) return 0;
    return Math.round(
      danhSachCho.reduce((sum, item) => {
        const diffMs = Date.now() - new Date(item.thoigian).getTime();
        return sum + diffMs / 60000;
      }, 0) / danhSachCho.length
    );
  }, [danhSachCho]);

  const filteredDanhSach = useMemo(() => {
    if (!search.trim()) return danhSachCho;
    const s = search.toLowerCase().trim();
    return danhSachCho.filter(
      (item) =>
        item.BenhNhan.ten.toLowerCase().includes(s) ||
        String(item.BenhNhan.id).includes(s) ||
        (item.BenhNhan.dienthoai && item.BenhNhan.dienthoai.includes(s))
    );
  }, [danhSachCho, search]);

  const filteredDonThuocs = useMemo(() => {
    return donThuocs.map((don) => {
      const chiTiet = chiTietDonThuocs[don.id] || [];
      const dieuTri =
        chiTiet.map((ct) => `${ct.thuoc.tenthuoc} x ${ct.soluong}`).join(', ') || '-';
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

  const renderHistoryPanel = (benhnhan: BenhNhan) => (
    <div className="border-t bg-gray-50 p-3 space-y-3">
      <div className="flex items-center justify-between">
        <h4 className="text-sm font-semibold text-gray-700">Lịch sử khám - {benhnhan.ten}</h4>
        <div className="flex gap-1">
          <button
            onClick={() => setActiveTab('don-thuoc')}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              activeTab === 'don-thuoc'
                ? 'bg-white text-gray-900 border-gray-300 shadow-sm font-medium'
                : 'text-gray-500 border-transparent hover:bg-gray-200'
            }`}
          >
            Đơn thuốc ({donThuocs.length})
          </button>
          <button
            onClick={() => setActiveTab('don-kinh')}
            className={`px-3 py-1 text-xs rounded-full border transition-colors ${
              activeTab === 'don-kinh'
                ? 'bg-white text-gray-900 border-gray-300 shadow-sm font-medium'
                : 'text-gray-500 border-transparent hover:bg-gray-200'
            }`}
          >
            Đơn kính ({donKinhs.length})
          </button>
        </div>
      </div>

      {activeTab === 'don-thuoc' ? (
        filteredDonThuocs.length === 0 ? (
          <p className="text-xs text-gray-400 py-4 text-center">Chưa có đơn thuốc nào</p>
        ) : (
          <div className="space-y-2">
            {filteredDonThuocs.map((don) => (
              <div key={don.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs text-gray-500">
                    {new Date(don.ngay_kham).toLocaleDateString('vi-VN')}
                  </span>
                  <span className="text-sm font-semibold text-emerald-600">
                    {(don.tongtien / 1000).toFixed(0)}k
                  </span>
                </div>
                <p className="text-sm font-medium text-gray-800 mb-1">{don.chandoan}</p>
                <p className="text-xs text-gray-500 truncate">{don.dieuTri}</p>
                {don.dienTien !== '-' && (
                  <p className="text-xs text-blue-600 mt-1 truncate">Diễn tiến: {don.dienTien}</p>
                )}
              </div>
            ))}
          </div>
        )
      ) : donKinhs.length === 0 ? (
        <p className="text-xs text-gray-400 py-4 text-center">Chưa có đơn kính nào</p>
      ) : (
        <div className="space-y-2">
          {donKinhs.map((don) => (
            <div key={don.id} className="bg-white rounded-lg border p-3 hover:shadow-sm transition-shadow">
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-gray-500">
                  {new Date(don.ngaykham).toLocaleDateString('vi-VN')}
                </span>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-blue-600">
                    {(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k
                  </span>
                  {(don.no || 0) > 0 && (
                    <span className="text-xs px-1.5 py-0.5 rounded bg-red-100 text-red-700">
                      Nợ {((don.no || 0) / 1000).toFixed(0)}k
                    </span>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-2 gap-3 text-xs text-gray-600">
                <div>
                  <span className="text-gray-400">MP:</span>{' '}
                  S{don.cauphai || 0} C{don.truphai || 0} A{don.trucphai || 0}
                </div>
                <div>
                  <span className="text-gray-400">MT:</span>{' '}
                  S{don.cautrai || 0} C{don.trutrai || 0} A{don.tructrai || 0}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        {/* Top header bar */}
        <div className="bg-white border-b px-4 py-3">
          <div className="max-w-7xl mx-auto flex flex-col md:flex-row md:items-center md:justify-between gap-3">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-semibold text-gray-900">Chờ khám</h1>
              <span className="text-xs text-gray-400">
                {lastRefreshTime && (
                  <>
                    Cập nhật {format(lastRefreshTime, 'HH:mm:ss', { locale: vi })}
                    {' '}· <span className={countdown <= 5 ? 'text-orange-500 font-medium' : ''}>{countdown}s</span>
                  </>
                )}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button
                onClick={handleManualRefresh}
                disabled={refreshing}
                size="sm"
                variant="outline"
              >
                <RefreshCw className={`w-4 h-4 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
                Làm mới
              </Button>
              <Link href="/benh-nhan">
                <Button size="sm" variant="outline">
                  <Users className="w-4 h-4 mr-1.5" />
                  Bệnh nhân
                </Button>
              </Link>
            </div>
          </div>
        </div>

        <div className="max-w-7xl mx-auto p-4 space-y-4">
          {/* Stat cards */}
          <div className="grid grid-cols-3 gap-3">
            <Card className="cursor-default">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-red-50 flex items-center justify-center">
                  <Users className="w-5 h-5 text-red-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Đang chờ</p>
                  <p className="text-2xl font-bold text-gray-900">{danhSachCho.length}</p>
                </div>
              </CardContent>
            </Card>
            <Card className="cursor-default">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-orange-50 flex items-center justify-center">
                  <Clock className="w-5 h-5 text-orange-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">TB chờ</p>
                  <p className="text-2xl font-bold text-gray-900">
                    {avgWaitMinutes}<span className="text-sm font-normal text-gray-400"> phút</span>
                  </p>
                </div>
              </CardContent>
            </Card>
            <Card className="cursor-default">
              <CardContent className="p-3 flex items-center gap-3">
                <div className="w-10 h-10 rounded-lg bg-blue-50 flex items-center justify-center">
                  <Calendar className="w-5 h-5 text-blue-500" />
                </div>
                <div>
                  <p className="text-xs text-gray-500">Hôm nay</p>
                  <p className="text-lg font-bold text-gray-900">
                    {format(new Date(), 'dd/MM', { locale: vi })}
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Search */}
          {danhSachCho.length > 0 && (
            <Input
              placeholder="Tìm theo tên, mã BN, SĐT..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full md:w-80"
            />
          )}

          {/* Queue list */}
          <Card>
            <CardContent className="p-0">
              {danhSachCho.length === 0 ? (
                <div className="py-16 text-center">
                  <div className="w-16 h-16 mx-auto mb-4 rounded-full bg-green-50 flex items-center justify-center">
                    <Users className="w-8 h-8 text-green-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-1">
                    Không có bệnh nhân đang chờ
                  </h3>
                  <p className="text-sm text-gray-500">
                    Tất cả bệnh nhân đã được khám hoặc chưa có ai đăng ký
                  </p>
                </div>
              ) : filteredDanhSach.length === 0 ? (
                <div className="py-12 text-center">
                  <p className="text-sm text-gray-500">Không tìm thấy bệnh nhân phù hợp</p>
                </div>
              ) : (
                <>
                  {/* Mobile view */}
                  <div className="block md:hidden divide-y">
                    {filteredDanhSach.map((item, index) => {
                      const isSelected = selectedBenhNhanId === item.benhnhanid;
                      return (
                        <div key={item.id} className={isSelected ? 'bg-blue-50/50' : ''}>
                          <div className="p-3">
                            <div className="flex items-center gap-3">
                              {/* STT + Avatar */}
                              <div className="relative flex-shrink-0">
                                <div className="absolute -top-1 -left-1 w-5 h-5 rounded-full bg-gray-800 text-white text-[10px] flex items-center justify-center font-medium z-10">
                                  {index + 1}
                                </div>
                                {item.avatar_url ? (
                                  <img
                                    src={item.avatar_url}
                                    alt={item.BenhNhan?.ten || 'Avatar'}
                                    className="w-11 h-11 rounded-full object-cover border-2 border-white shadow"
                                  />
                                ) : (
                                  <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-bold shadow">
                                    {(item.BenhNhan.ten || '?').charAt(0).toUpperCase()}
                                  </div>
                                )}
                              </div>

                              {/* Info */}
                              <div
                                className="flex-1 min-w-0 cursor-pointer"
                                onClick={() => handleSelectBenhNhan(item.benhnhanid)}
                              >
                                <p className="font-semibold text-gray-900 truncate text-sm">
                                  {item.BenhNhan.ten}
                                </p>
                                <div className="flex items-center gap-2 text-xs text-gray-400 mt-0.5">
                                  <span>#{item.BenhNhan.id}</span>
                                  {item.BenhNhan.dienthoai && (
                                    <>
                                      <span>·</span>
                                      <span>{item.BenhNhan.dienthoai}</span>
                                    </>
                                  )}
                                </div>
                              </div>

                              {/* Wait badge + actions */}
                              <div className="flex flex-col items-end gap-1.5">
                                <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full border font-medium ${getWaitColor(item.thoigian)}`}>
                                  <Clock className="w-3 h-3" />
                                  {calculateWaitTime(item.thoigian)}
                                </span>
                                <span className="text-[10px] text-gray-400">
                                  {formatThoiGian(item.thoigian)}
                                </span>
                              </div>
                            </div>

                            {/* Action buttons */}
                            <div className="mt-2.5 flex items-center gap-1.5">
                              <Link href={`/ke-don?bn=${item.benhnhanid}`} className="flex-1">
                                <Button size="sm" className="w-full h-8 text-xs bg-green-600 hover:bg-green-700">
                                  <Stethoscope className="w-3.5 h-3.5 mr-1" />
                                  Kê đơn
                                </Button>
                              </Link>
                              <Link href={`/ke-don-kinh?bn=${item.benhnhanid}`} className="flex-1">
                                <Button size="sm" className="w-full h-8 text-xs bg-blue-600 hover:bg-blue-700">
                                  <Glasses className="w-3.5 h-3.5 mr-1" />
                                  Kính
                                </Button>
                              </Link>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                onClick={() => handleRemoveFromQueue(item.id)}
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 w-8 p-0 text-gray-400 hover:text-blue-600"
                                onClick={() => handleSelectBenhNhan(item.benhnhanid)}
                              >
                                {isSelected ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                              </Button>
                            </div>
                          </div>

                          {/* History panel */}
                          {isSelected && renderHistoryPanel(item.BenhNhan)}
                        </div>
                      );
                    })}
                  </div>

                  {/* Desktop view */}
                  <div className="hidden md:block overflow-x-auto">
                    <table className="min-w-full text-sm">
                      <thead className="bg-gray-50 border-b">
                        <tr>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider w-10">STT</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Bệnh nhân</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Liên hệ</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Đăng ký</th>
                          <th className="px-3 py-2 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Thời gian chờ</th>
                          <th className="px-3 py-2 text-center text-xs font-medium text-gray-500 uppercase tracking-wider">Thao tác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {filteredDanhSach.map((item, index) => {
                          const isSelected = selectedBenhNhanId === item.benhnhanid;
                          return (
                            <React.Fragment key={item.id}>
                              <tr className={`transition-colors ${isSelected ? 'bg-blue-50/60' : 'hover:bg-gray-50'}`}>
                                <td className="px-3 py-2">
                                  <span className="inline-flex items-center justify-center w-7 h-7 rounded-full bg-gray-100 text-xs font-semibold text-gray-600">
                                    {index + 1}
                                  </span>
                                </td>
                                <td className="px-3 py-2">
                                  <button
                                    onClick={() => handleSelectBenhNhan(item.benhnhanid)}
                                    className="flex items-center gap-2.5 text-left rounded-md p-1 -m-1 transition-colors hover:bg-gray-100 w-full group"
                                  >
                                    <div className="flex-shrink-0">
                                      {item.avatar_url ? (
                                        <img
                                          src={item.avatar_url}
                                          alt={item.BenhNhan?.ten || 'Avatar'}
                                          className="w-9 h-9 rounded-full object-cover border border-gray-200"
                                        />
                                      ) : (
                                        <div className="w-9 h-9 rounded-full bg-gradient-to-br from-blue-400 to-blue-600 flex items-center justify-center text-white font-semibold text-sm">
                                          {(item.BenhNhan.ten || '?').charAt(0).toUpperCase()}
                                        </div>
                                      )}
                                    </div>
                                    <div className="min-w-0">
                                      <p className="font-medium text-gray-900 truncate group-hover:text-blue-600 transition-colors">
                                        {item.BenhNhan.ten}
                                      </p>
                                      <p className="text-xs text-gray-400">#{item.BenhNhan.id}</p>
                                    </div>
                                    {isSelected ? (
                                      <ChevronUp className="w-4 h-4 text-gray-400 ml-auto flex-shrink-0" />
                                    ) : (
                                      <ChevronDown className="w-4 h-4 text-gray-300 ml-auto flex-shrink-0 opacity-0 group-hover:opacity-100 transition-opacity" />
                                    )}
                                  </button>
                                </td>
                                <td className="px-3 py-2 text-gray-500">
                                  <div className="flex flex-col gap-0.5">
                                    {item.BenhNhan.dienthoai && (
                                      <span className="flex items-center gap-1 text-xs">
                                        <Phone className="w-3 h-3" />
                                        {item.BenhNhan.dienthoai}
                                      </span>
                                    )}
                                    {item.BenhNhan.diachi && (
                                      <span className="flex items-center gap-1 text-xs truncate max-w-[160px]">
                                        <MapPin className="w-3 h-3 flex-shrink-0" />
                                        {item.BenhNhan.diachi}
                                      </span>
                                    )}
                                  </div>
                                </td>
                                <td className="px-3 py-2 text-gray-500 text-xs">
                                  {formatThoiGian(item.thoigian)}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-flex items-center gap-1 text-xs px-2 py-1 rounded-full border font-medium ${getWaitColor(item.thoigian)}`}>
                                    <Clock className="w-3 h-3" />
                                    {calculateWaitTime(item.thoigian)}
                                  </span>
                                </td>
                                <td className="px-3 py-2 text-center">
                                  <div className="inline-flex items-center gap-1">
                                    <Link href={`/ke-don?bn=${item.benhnhanid}`}>
                                      <Button size="sm" className="h-7 px-2 text-xs bg-green-600 hover:bg-green-700">
                                        <Stethoscope className="w-3.5 h-3.5 mr-1" />
                                        Kê đơn
                                      </Button>
                                    </Link>
                                    <Link href={`/ke-don-kinh?bn=${item.benhnhanid}`}>
                                      <Button size="sm" className="h-7 px-2 text-xs bg-blue-600 hover:bg-blue-700">
                                        <Glasses className="w-3.5 h-3.5 mr-1" />
                                        Kính
                                      </Button>
                                    </Link>
                                    <Button
                                      size="sm"
                                      variant="ghost"
                                      className="h-7 w-7 p-0 text-gray-400 hover:text-red-600 hover:bg-red-50"
                                      onClick={() => handleRemoveFromQueue(item.id)}
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </Button>
                                  </div>
                                </td>
                              </tr>

                              {/* Expandable history row */}
                              {isSelected && (
                                <tr>
                                  <td colSpan={6} className="p-0">
                                    {renderHistoryPanel(item.BenhNhan)}
                                  </td>
                                </tr>
                              )}
                            </React.Fragment>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </ProtectedRoute>
  );
}
