//src/pages/don-thuoc.tsx
'use client';

import React, { useState, useEffect, useCallback, useMemo, FormEvent } from 'react';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Pagination, SimplePagination } from '../components/ui/pagination';
import { Pencil, Trash2, Settings, Wallet } from 'lucide-react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import Link from 'next/link';
import { format } from 'date-fns';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';

interface DonThuoc {
  id: number;
  madonthuoc: string;
  benhnhan: {
    id: number;
    ten: string | null;
    namsinh: string | null; // sửa lại kiểu string để nhận yyyy hoặc dd/mm/yyyy
    dienthoai: string | null;
    diachi: string | null;
    tuoi?: number; // thêm trường tuổi nếu có
  };
  chandoan: string;
  ngay_kham: string;
  tongtien: number;
  sotien_da_thanh_toan: number;
  no: boolean;
  lai?: number;
  con_no?: number; // trường mới backend trả về
}

interface ChiTietDonThuoc {
  thuoc: {
    id: number;
    tenthuoc: string;
  };
  soluong: number;
  donvitinh: string;
  cachdung: string;
}

// Hàm tính tuổi từ namsinh (yyyy hoặc dd/mm/yyyy)
function calcAge(namsinh: string | null): number | "" {
  if (!namsinh) return "";
  const now = new Date();
  if (/^\d{4}$/.test(namsinh)) {
    return now.getFullYear() - parseInt(namsinh, 10);
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(namsinh)) {
    const [d, m, y] = namsinh.split("/").map(Number);
    let age = now.getFullYear() - y;
    const birthdayThisYear = new Date(now.getFullYear(), m - 1, d);
    if (now < birthdayThisYear) age--;
    return age;
  }
  return "";
}

export default function DonThuocPage() {
  const { confirm } = useConfirm();
  const [donThuocs, setDonThuocs] = useState<DonThuoc[]>([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [filterNo, setFilterNo] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [chiTietDonThuocs, setChiTietDonThuocs] = useState<{ [donthuocid: number]: ChiTietDonThuoc[] }>({});
  const [selectedDonThuocId, setSelectedDonThuocId] = useState<number | null>(null);
  // Profit reveal via system password
  const [showProfit, setShowProfit] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState('');
  const [passwordError, setPasswordError] = useState('');
  // Partial payment dialog state
  const [payDialogOpen, setPayDialogOpen] = useState(false);
  const [payDonId, setPayDonId] = useState<number | null>(null);
  const [payAmount, setPayAmount] = useState(''); // nhập theo nghìn
  const { user, signIn } = useAuth();

  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Đơn thuốc';
    }
  }, []);

  // Debounce search input (chờ 500ms sau khi user ngừng gõ)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
    }, 500);

    return () => clearTimeout(timer);
  }, [search]);

  const handleSettingsClick = () => {
    if (showProfit) {
      setShowProfit(false);
      toast.success('Đã ẩn cột lãi');
    } else {
      setShowPasswordDialog(true);
    }
  };

  const handleUnlock = useCallback(async (e: FormEvent) => {
    e.preventDefault();
    if (!user?.email) {
      setPasswordError('Không tìm thấy email người dùng');
      return;
    }
    try {
      const { error } = await signIn(user.email, passwordInput);
      if (!error) {
        setShowProfit(true);
        setShowPasswordDialog(false);
        setPasswordInput('');
        setPasswordError('');
        toast.success('Đã mở khóa cột lãi');
      } else {
        setPasswordError('Mật khẩu không đúng');
        toast.error('Sai mật khẩu');
      }
    } catch {
      setPasswordError('Lỗi xác thực');
    }
  }, [passwordInput, signIn, user?.email]);

  // Fetch danh sách đơn thuốc với pagination
  useEffect(() => {
    const fetchDonThuocs = async () => {
      try {
        // Thêm cache-busting parameters
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        
        // Build URL với search/filter parameters
        const params = new URLSearchParams({
          page: currentPage.toString(),
          pageSize: rowsPerPage.toString(),
          _t: timestamp.toString(),
          _r: random
        });
        
        if (searchDebounced && searchDebounced.trim()) params.append('search', searchDebounced.trim());
        if (filterDate) params.append('filterDate', filterDate);
        if (filterNo) params.append('filterNo', 'true');
        
        const res = await axios.get(`/api/don-thuoc?${params.toString()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        const data: DonThuoc[] = res.data.data || [];
        // Kiểm tra và lọc dữ liệu không hợp lệ
        const validData = data.filter((dt: DonThuoc) => 
          dt && dt.benhnhan && (dt.benhnhan.ten === null || typeof dt.benhnhan.ten === 'string')
        );
        setDonThuocs(validData);
        setTotal(res.data.total || 0);
        if (data.length !== validData.length) {
          toast.error('Một số đơn thuốc có dữ liệu không hợp lệ đã bị lọc bỏ');
        }
      } catch (error: unknown) {
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : error instanceof Error
            ? error.message
            : String(error);
        toast.error(`Lỗi tải danh sách đơn thuốc: ${message}`);
      }
    };
    fetchDonThuocs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, searchDebounced, filterDate, filterNo]);

  // Fetch chi tiết đơn thuốc
  const fetchChiTietDonThuoc = useCallback(async (donthuocid: number) => {
    try {
      // Thêm cache-busting parameters
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const res = await axios.get(`/api/chi-tiet-don-thuoc?donthuocid=${donthuocid}&_t=${timestamp}&_r=${random}`, {
        headers: {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        }
      });
      setChiTietDonThuocs((prev) => ({
        ...prev,
        [donthuocid]: res.data.data.map((item: ChiTietDonThuoc) => ({
          thuoc: { id: item.thuoc.id, tenthuoc: item.thuoc.tenthuoc },
          soluong: item.soluong,
          donvitinh: item.donvitinh || 'N/A',
          cachdung: item.cachdung || 'N/A',
        })),
      }));
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error(`Lỗi tải chi tiết đơn thuốc: ${message}`);
    }
  }, []);

  const handleDelete = useCallback(async (id: number) => {
    if (!await confirm('Bạn có chắc chắn muốn xóa đơn thuốc này?')) return;
    try {
      await axios.delete(`/api/don-thuoc?id=${id}`);
      setDonThuocs((prev) => prev.filter((dt) => dt.id !== id));
      setChiTietDonThuocs((prev) => {
        const newState = { ...prev };
        delete newState[id];
        return newState;
      });
      if (selectedDonThuocId === id) setSelectedDonThuocId(null);
      toast.success('Đã xóa đơn thuốc');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error(`Lỗi xóa đơn thuốc: ${message}`);
    }
  }, [selectedDonThuocId]);

  const handleRowClick = useCallback((donthuocid: number) => {
    if (selectedDonThuocId === donthuocid) {
      setSelectedDonThuocId(null); // Ẩn chi tiết nếu bấm lại
    } else {
      setSelectedDonThuocId(donthuocid);
      fetchChiTietDonThuoc(donthuocid);
    }
  }, [selectedDonThuocId, fetchChiTietDonThuoc]);

  // Backend đã xử lý filter, không cần filter ở client nữa
  const filteredDonThuocs = useMemo(() => donThuocs, [donThuocs]);

  // Backend đã xử lý pagination và filtering
  const totalPages = Math.ceil(total / rowsPerPage);
  const paginatedDonThuocs = useMemo(() => filteredDonThuocs, [filteredDonThuocs]);

  return (
    <ProtectedRoute>
      <div className="p-4 lg:p-4">

  <div className="w-full mx-auto">
          {/* Mobile Controls */}
          <div className="block md:hidden mb-4 space-y-3">
            <Input
              placeholder="Tìm theo tên, mã BN, SĐT, địa chỉ..."
              value={search}
              onChange={(e) => {
                setSearch(e.target.value);
              }}
              className="w-full h-12"
            />
            <Input
              type="date"
              value={filterDate}
              onChange={(e) => {
                setFilterDate(e.target.value);
                setCurrentPage(1);
              }}
              className="w-full h-12"
            />
            <div className="flex items-center justify-between">
              <Button
                variant={filterNo ? 'default' : 'outline'}
                onClick={() => {
                  setFilterNo(!filterNo);
                  setCurrentPage(1);
                }}
                className="h-10"
              >
                Chỉ hiện đơn còn nợ
              </Button>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(+e.target.value);
                  setCurrentPage(1);
                }}
                className="border px-3 py-2 rounded text-sm h-10"
              >
                {[50, 100, 200, 500].map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
            </div>
            <div className="flex items-center justify-between">
              <div className="text-sm text-muted-foreground">
                {search || filterDate || filterNo ? (
                  <>Tìm thấy: {total} đơn (trang {currentPage}/{totalPages})</>
                ) : (
                  <>Tổng: {total} đơn thuốc (trang {currentPage}/{totalPages})</>
                )}
              </div>
              <Button variant={showProfit ? 'default' : 'outline'} size="sm" className="h-10 px-3" type="button" onClick={handleSettingsClick}>
                <Settings className="w-4 h-4" />
              </Button>
            </div>
          </div>

          {/* Desktop Controls */}
          <div className="hidden lg:flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 flex-wrap">
              <Input
                placeholder="Tìm theo tên, mã BN, SĐT, địa chỉ..."
                value={search}
                onChange={(e) => {
                  setSearch(e.target.value);
                }}
                className="w-64"
              />
              <Button variant={showProfit ? 'default' : 'outline'} size="sm" type="button" onClick={handleSettingsClick} className="h-10 px-3">
                <Settings className="w-4 h-4" />
              </Button>
              <Input
                type="date"
                value={filterDate}
                onChange={(e) => {
                  setFilterDate(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-40"
              />
              <Button
                variant={filterNo ? 'default' : 'outline'}
                onClick={() => {
                  setFilterNo(!filterNo);
                  setCurrentPage(1);
                }}
              >
                Chỉ hiện đơn còn nợ
              </Button>
            </div>
            <select
              value={rowsPerPage}
              onChange={(e) => {
                setRowsPerPage(+e.target.value);
                setCurrentPage(1);
              }}
              className="border px-2 py-1 rounded text-sm"
            >
              {[50, 100, 200, 500].map((val) => (
                <option key={val} value={val}>{val}</option>
              ))}
            </select>
          </div>

          {/* Mobile Card Layout */}
          <div className="block md:hidden space-y-4">
            {paginatedDonThuocs.map((dt, index) => {
              const chiTiet = chiTietDonThuocs[dt.id] || [];
              const stt = (currentPage - 1) * rowsPerPage + index + 1;
              const remaining = typeof dt.con_no === 'number' ? dt.con_no : Math.max(0, dt.tongtien - dt.sotien_da_thanh_toan);
              const isDebt = remaining > 0;
              return (
                <Card key={dt.id} className={`border ${isDebt ? 'bg-amber-200 border-amber-500 shadow-md ring-1 ring-amber-400/60' : ''}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-base flex items-center gap-2"><span className="text-[10px] font-mono bg-gray-200 text-gray-700 px-1 rounded">{stt}</span>{dt.benhnhan?.ten || 'Không có tên'}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(dt.ngay_kham).toLocaleDateString('vi-VN')} {new Date(dt.ngay_kham).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold">{(dt.tongtien / 1000).toFixed(0)}k</p>
                        {isDebt && (
                          <p className="text-sm text-red-600">
                            Nợ: {(remaining / 1000).toFixed(0)}k
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">NS:</span> {dt.benhnhan?.namsinh || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tuổi:</span> {calcAge(dt.benhnhan?.namsinh ?? null)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">SĐT:</span> {dt.benhnhan?.dienthoai || '-'}
                      </div>
                    </div>

                    <div className="text-sm">
                      <div><span className="text-muted-foreground">Địa chỉ:</span> {dt.benhnhan?.diachi || '-'}</div>
                      <div><span className="text-muted-foreground">Chẩn đoán:</span> {dt.chandoan || '-'}</div>
                    </div>

                    <div className="flex flex-col gap-2 pt-2">
                      <Button 
                        size="sm" 
                        variant="outline" 
                        className="w-full h-10 justify-start"
                        onClick={() => handleRowClick(dt.id)}
                      >
                        {selectedDonThuocId === dt.id ? 'Ẩn chi tiết' : 'Xem chi tiết thuốc'}
                      </Button>
                      <div className="flex gap-2">
                        <Button size="sm" variant="outline" className="flex-1 h-10" asChild>
                          <Link href={`/ke-don?bn=${dt.benhnhan?.id || ''}&donthuocid=${dt.id}`}>
                            <Pencil className="w-4 h-4 mr-1" />
                            Sửa
                          </Link>
                        </Button>
                        <Button
                          size="sm"
                          variant="secondary"
                          className="flex-1 h-10"
                          disabled={!isDebt}
                          onClick={() => {
                            setPayDonId(dt.id);
                            setPayAmount('');
                            setPayDialogOpen(true);
                          }}
                        >
                          <Wallet className="w-4 h-4 mr-1" />
                          Thu tiền
                        </Button>
                        <Button 
                          size="sm" 
                          variant="destructive" 
                          className="flex-1 h-10" 
                          onClick={() => handleDelete(dt.id)}
                        >
                          <Trash2 className="w-4 h-4 mr-1" />
                          Xóa
                        </Button>
                      </div>
                    </div>

                    {chiTiet.length > 0 && selectedDonThuocId === dt.id && (
                      <div className="mt-3 p-3 bg-green-50 rounded border">
                        <div className="text-xs text-gray-800">
                          <strong>Chi tiết đơn thuốc:</strong>
                          <div className="mt-2 space-y-2">
                            {chiTiet.map((ct: ChiTietDonThuoc) => (
                              <div key={ct.thuoc.id} className="p-2 bg-white rounded border text-xs">
                                <div className="font-semibold">{ct.thuoc.tenthuoc}</div>
                                <div className="grid grid-cols-3 gap-2 mt-1 text-muted-foreground">
                                  <div>SL: {ct.soluong}</div>
                                  <div>ĐV: {ct.donvitinh}</div>
                                  <div>Cách dùng: {ct.cachdung}</div>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      </div>
                    )}
                  </CardContent>
                </Card>
              );
            })}
            {paginatedDonThuocs.length === 0 && (
              <Card>
                <CardContent className="p-8 text-center text-muted-foreground">
                  Không tìm thấy đơn thuốc.
                </CardContent>
              </Card>
            )}
          </div>

          {/* Mobile Pagination */}
          <div className="block md:hidden">
            <SimplePagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              className="mt-4"
            />
          </div>

          {/* Desktop Table Layout */}
          <div className="hidden md:block">
            <Card>
              <CardContent className="p-0">
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100">
                    <tr>
                      <th className="px-2 py-1 text-left">STT</th>
                      <th className="px-2 py-1 text-left">Ngày giờ khám</th>
                      <th className="px-2 py-1 text-left">Bệnh Nhân</th>
                      <th className="px-2 py-1 text-left">Ngày sinh</th>
                      <th className="px-2 py-1 text-left">Tuổi</th>
                      <th className="px-2 py-1 text-left">SĐT</th>
                      <th className="px-2 py-1 text-left">Địa chỉ</th>
                      <th className="px-2 py-1 text-left">Chẩn Đoán</th>
                      <th className="px-2 py-1 text-right">Tổng Tiền</th>
                      <th className="px-2 py-1 text-right">Nợ</th>
                      {showProfit && <th className="px-2 py-1 text-right">Lãi (ước tính)</th>}
                      <th className="px-2 py-1 text-center w-[90px]">Hành Động</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedDonThuocs.map((dt, index) => {
                      const chiTiet = chiTietDonThuocs[dt.id] || [];
                      const stt = (currentPage - 1) * rowsPerPage + index + 1;
                      const remaining = typeof dt.con_no === 'number' ? dt.con_no : Math.max(0, dt.tongtien - dt.sotien_da_thanh_toan);
                      const isDebt = remaining > 0;
                      return (
                        <React.Fragment key={dt.id}>
                          <tr
                            className={`border-b cursor-pointer ${isDebt 
                              ? 'bg-amber-200 hover:bg-amber-200 font-semibold text-amber-900 border-amber-400' 
                              : 'hover:bg-gray-100'} `}
                            onClick={() => handleRowClick(dt.id)}
                          >
                            <td className="px-2 py-1 font-mono">{stt}</td>
                            <td className="px-2 py-1">{new Date(dt.ngay_kham).toLocaleString('vi-VN', { 
                              timeZone: 'Asia/Ho_Chi_Minh', 
                              hour12: false,
                              year: 'numeric',
                              month: '2-digit', 
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}</td>
                            <td className="px-2 py-1">{dt.benhnhan?.ten || '-'}</td>
                            <td className="px-2 py-1">{dt.benhnhan?.namsinh || '-'}</td>
                            <td className="px-2 py-1">
                              {calcAge(dt.benhnhan?.namsinh ?? null)}
                            </td>
                            <td className="px-2 py-1">{dt.benhnhan?.dienthoai || '-'}</td>
                            <td className="px-2 py-1">{dt.benhnhan?.diachi || '-'}</td>
                            <td className="px-2 py-1">{dt.chandoan || '-'}</td>
                            <td className="px-2 py-1 text-right">{(dt.tongtien / 1000).toFixed(0)}k</td>
                            <td className="px-2 py-1 text-right">{isDebt ? (remaining / 1000).toFixed(0) + 'k' : '0k'}</td>
                            {showProfit && (
                              <td className="px-2 py-1 text-right text-emerald-600 font-medium">{dt.lai !== undefined ? ((dt.lai / 1000).toFixed(0) + 'k') : '...'}</td>
                            )}
                            <td className="px-2 py-1 text-center w-[90px]">
                              <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                                <Link href={`/ke-don?bn=${dt.benhnhan?.id || ''}&donthuocid=${dt.id}`}>
                                  <Button size="sm" variant="outline" className="h-7 px-2" onClick={(e) => e.stopPropagation()}>
                                    <Pencil className="w-3 h-3" />
                                  </Button>
                                </Link>
                                <Button
                                  size="sm"
                                  variant="secondary"
                                  className="h-7 px-2"
                                  disabled={!isDebt}
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    setPayDonId(dt.id);
                                    setPayAmount('');
                                    setPayDialogOpen(true);
                                  }}
                                >
                                  <Wallet className="w-3 h-3" />
                                </Button>
                                <Button
                                  size="sm"
                                  variant="destructive"
                                  className="h-7 px-2"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    handleDelete(dt.id);
                                  }}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              </div>
                            </td>
                          </tr>
                          {chiTiet.length > 0 && selectedDonThuocId === dt.id && (
                            <tr>
                              <td colSpan={12} className="px-2 py-1 bg-green-50">
                                <div className="text-xs text-gray-800">
                                  <strong>Chi tiết đơn thuốc:</strong>
                                  <table className="min-w-full text-xs mt-2">
                                    <thead>
                                      <tr className="bg-green-100">
                                        <th className="px-2 py-1 text-left">Tên Thuốc</th>
                                        <th className="px-2 py-1 text-center">Số Lượng</th>
                                        <th className="px-2 py-1 text-left">Đơn Vị</th>
                                        <th className="px-2 py-1 text-left">Cách Dùng</th>
                                      </tr>
                                    </thead>
                                    <tbody>
                                      {chiTiet.map((ct: ChiTietDonThuoc) => (
                                        <tr key={ct.thuoc.id} className="border-b">
                                          <td className="px-2 py-1">{ct.thuoc.tenthuoc}</td>
                                          <td className="px-2 py-1 text-center">{ct.soluong}</td>
                                          <td className="px-2 py-1">{ct.donvitinh}</td>
                                          <td className="px-2 py-1">{ct.cachdung}</td>
                                        </tr>
                                      ))}
                                    </tbody>
                                  </table>
                                </div>
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                    {paginatedDonThuocs.length === 0 && (
                      <tr>
                          <td colSpan={showProfit ? 12 : 11} className="text-center py-2 text-muted-foreground">
                          Không tìm thấy đơn thuốc.
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </CardContent>
            </Card>
          </div>

          {/* Desktop Pagination */}
          <div className="hidden md:block">
            <Pagination
              currentPage={currentPage}
              totalPages={totalPages}
              onPageChange={setCurrentPage}
              className="mt-6"
            />
          </div>
        </div>
      </div>
      {showPasswordDialog && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setShowPasswordDialog(false); setPasswordInput(''); setPasswordError(''); }}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xs p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">Nhập mật khẩu để xem lãi</h2>
            <form onSubmit={handleUnlock} className="space-y-2">
              <Input
                type="password"
                value={passwordInput}
                onChange={(e) => { setPasswordInput(e.target.value); setPasswordError(''); }}
                autoFocus
                placeholder="Mật khẩu"
              />
              {passwordError && <div className="text-xs text-red-600">{passwordError}</div>}
              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => { setShowPasswordDialog(false); setPasswordInput(''); setPasswordError(''); }}>Hủy</Button>
                <Button type="submit" size="sm">Xác nhận</Button>
              </div>
            </form>
          </div>
        </div>
      )}
      {payDialogOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => { setPayDialogOpen(false); setPayDonId(null); setPayAmount(''); }}>
          <div className="bg-white rounded-lg shadow-lg w-full max-w-xs p-4 space-y-3" onClick={(e) => e.stopPropagation()}>
            <h2 className="text-sm font-semibold">Cập nhật thanh toán</h2>
            <div className="space-y-2">
              <Input
                type="number"
                placeholder="Nhập số tiền (nghìn VND)"
                value={payAmount}
                onChange={(e) => setPayAmount(e.target.value)}
                autoFocus
              />
              <div className="text-[11px] text-muted-foreground">Ví dụ: nhập 50 nghĩa là 50.000đ</div>
              <div className="flex gap-2 justify-end pt-1">
                <Button type="button" variant="outline" size="sm" onClick={() => { setPayDialogOpen(false); setPayDonId(null); setPayAmount(''); }}>Hủy</Button>
                <Button
                  type="button"
                  size="sm"
                  onClick={async () => {
                    if (!payDonId) return;
                    const add = parseInt(payAmount, 10) * 1000;
                    if (!add || add <= 0) {
                      toast.error('Số tiền không hợp lệ');
                      return;
                    }
                    try {
                      const res = await axios.patch('/api/don-thuoc', { id: payDonId, add_payment: add });
                      const updated = res.data.data;
                      setDonThuocs(prev => prev.map(d => d.id === payDonId ? { ...d, ...updated } : d));
                      toast.success('Đã cập nhật thanh toán');
                      setPayDialogOpen(false);
                      setPayDonId(null);
                      setPayAmount('');
                    } catch (err) {
                      toast.error('Lỗi cập nhật thanh toán');
                    }
                  }}
                >Lưu</Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </ProtectedRoute>
  );
}