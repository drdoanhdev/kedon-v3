//src/pages/don-kinh.tsx
'use client';

import React, { useEffect, useState, useCallback, useMemo } from 'react';
import axios from 'axios';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Pagination, SimplePagination } from '@/components/ui/pagination';
import { Trash2, Pencil, Settings } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';

interface DonKinh {
  id: number;
  benhnhanid: number;
  chandoan: string;
  ngaykham: string;
  giatrong: number;
  giagong: number;
  ghichu: string | null;
  thiluc_khongkinh_mp: string | null;
  thiluc_kinhcu_mp: string | null;
  thiluc_kinhmoi_mp: string | null;
  sokinh_cu_mp: string | null;
  sokinh_moi_mp: string | null;
  hangtrong_mp: string | null;
  ax_mp: number | null;
  thiluc_khongkinh_mt: string | null;
  thiluc_kinhcu_mt: string | null;
  thiluc_kinhmoi_mt: string | null;
  sokinh_cu_mt: string | null;
  sokinh_moi_mt: string | null;
  hangtrong_mt: string | null;
  ax_mt: number | null;
  no: boolean;
  sotien_da_thanh_toan: number;
  lai: number;
  benhnhan: {
    id: number;
    ten: string | null;
    namsinh: string | null; // sửa lại kiểu string để nhận yyyy hoặc dd/mm/yyyy
    dienthoai: string | null;
    diachi: string | null;
    tuoi?: number; // thêm trường tuổi nếu có
  };
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

export default function DonKinhPage() {
  const { confirm } = useConfirm();
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]);
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [debtFilter, setDebtFilter] = useState<boolean | null>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [rowsPerPage, setRowsPerPage] = useState(50);
  const [total, setTotal] = useState(0);
  const [isLoading, setIsLoading] = useState(true);
  const [isFetching, setIsFetching] = useState(false);
  // Profit reveal
  const [showProfit, setShowProfit] = useState(false);
  const [showPasswordDialog, setShowPasswordDialog] = useState(false);
  const [passwordInput, setPasswordInput] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const { user, signIn } = useAuth();

  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Đơn kính';
    }
  }, []);

  // Debounce search input (chờ 500ms sau khi user ngừng gõ)
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setCurrentPage(1);
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

  const handleUnlock = useCallback(async (e: React.FormEvent) => {
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
        setPasswordError("");
        setPasswordInput("");
        toast.success('Đã mở khóa cột lãi');
      } else {
        setPasswordError('Mật khẩu không đúng');
        toast.error('Sai mật khẩu');
      }
    } catch {
      setPasswordError('Lỗi xác thực');
    }
  }, [passwordInput, signIn, user?.email]);

  useEffect(() => {
    const fetchData = async () => {
      // Chỉ dùng isLoading cho lần đầu, isFetching cho các lần sau
      if (donKinhs.length === 0) {
        setIsLoading(true);
      } else {
        setIsFetching(true);
      }
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
        if (dateFilter && dateFilter.trim()) {
          const dateOnly = dateFilter.includes('T') ? dateFilter.split('T')[0] : dateFilter;
          params.append('filterDate', dateOnly);
        }
        if (debtFilter === true) params.append('filterNo', 'true');
        
        const resDonKinh = await axios.get(`/api/don-kinh?${params.toString()}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        setDonKinhs(resDonKinh.data.data || []);
        setTotal(resDonKinh.data.total || 0);
      } catch (error: unknown) {
        let errorMessage = 'Lỗi không xác định';
        let errorDetails = '';
        if (axios.isAxiosError(error)) {
          errorMessage = error.response?.data?.message || error.message;
          errorDetails = error.response?.data?.details || '';
        } else if (error instanceof Error) {
          errorMessage = error.message;
        }
        toast.error(`Lỗi khi tải dữ liệu: ${errorMessage}${errorDetails ? ' - ' + errorDetails : ''}`);
      } finally {
        setIsLoading(false);
        setIsFetching(false);
      }
    };
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentPage, rowsPerPage, searchDebounced, dateFilter, debtFilter]);

  const handleDelete = async (id: number) => {
    if (!await confirm('Bạn có chắc muốn xóa đơn kính này?')) return;
    try {
      const res = await axios.delete(`/api/don-kinh?id=${id}`);
      if (res.status === 200) {
        setDonKinhs(donKinhs.filter((dk) => dk.id !== id));
        toast.success('Đã xóa đơn kính');
      }
    } catch (error: unknown) {
      let errorMessage = 'Lỗi không xác định';
      let errorDetails = '';
      if (axios.isAxiosError(error)) {
        errorMessage = error.response?.data?.message || error.message;
        errorDetails = error.response?.data?.details || '';
      } else if (error instanceof Error) {
        errorMessage = error.message;
      }
      toast.error(`Lỗi khi xóa đơn kính: ${errorMessage}${errorDetails ? ' - ' + errorDetails : ''}`);
    }
  };

  // Backend đã xử lý filter, không cần filter ở client nữa
  // Dùng useMemo để tránh re-render không cần thiết
  const filtered = useMemo(() => donKinhs, [donKinhs]);
  const totalPages = useMemo(() => Math.ceil(total / rowsPerPage), [total, rowsPerPage]);
  const paginated = useMemo(() => filtered, [filtered]);

  const formatMoney = useCallback((amount: number) => {
    return (amount / 1000).toLocaleString('vi-VN');
  }, []);

  return (
    <ProtectedRoute>
      <div className="p-4 lg:p-6 space-y-4">

        {isFetching && (
          <div className="fixed top-4 right-4 z-50 bg-blue-500 text-white px-4 py-2 rounded-lg shadow-lg text-sm">
            Đang tìm kiếm...
          </div>
        )}
        {isLoading ? (
          <div className="text-center text-sm text-muted-foreground">Đang tải dữ liệu...</div>
        ) : (
          <>
            {/* Mobile Controls */}
            <div className="block md:hidden space-y-3">
              <Input
                placeholder="Tìm tên, số ĐT, địa chỉ..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearch(e.target.value);
                  // Không set currentPage ở đây, để debounce xử lý
                }}
                className="w-full h-12"
              />
              <Input
                type="datetime-local"
                value={dateFilter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full h-12"
              />
              <div className="flex items-center justify-between">
                <div className="flex items-center space-x-2">
                  <Switch
                    checked={debtFilter === true}
                    onCheckedChange={(checked: boolean) => {
                      setDebtFilter(checked ? true : null);
                      setCurrentPage(1);
                    }}
                  />
                  <label className="text-sm font-semibold">Chỉ hiển thị đơn còn nợ</label>
                </div>
                <select
                  value={rowsPerPage}
                  onChange={(e) => {
                    setRowsPerPage(+e.target.value);
                    setCurrentPage(1);
                  }}
                  className="border px-3 py-2 rounded text-sm h-10"
                >
                  {[25, 50, 100, 200].map((val) => (
                    <option key={val} value={val}>{val}</option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-between">
                <div className="text-sm text-muted-foreground">
                  Tổng: {total} đơn kính (hiển thị {filtered.length} trên trang {currentPage})
                </div>
                <Button type="button" variant={showProfit ? 'default' : 'outline'} size="sm" onClick={handleSettingsClick} className="h-10 px-3">
                  <Settings className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {/* Desktop Controls */}
            <div className="hidden lg:flex flex-col sm:flex-row gap-4 items-center">
              <Input
                placeholder="Tìm tên, số ĐT, địa chỉ..."
                value={search}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setSearch(e.target.value);
                  // Không set currentPage ở đây, để debounce xử lý
                }}
                className="w-full sm:w-1/3"
              />
              <Input
                type="datetime-local"
                value={dateFilter}
                onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                  setDateFilter(e.target.value);
                  setCurrentPage(1);
                }}
                className="w-full sm:w-1/4"
              />
              <div className="flex items-center space-x-2">
                <Switch
                  checked={debtFilter === true}
                  onCheckedChange={(checked: boolean) => {
                    setDebtFilter(checked ? true : null);
                    setCurrentPage(1);
                  }}
                />
                <label className="text-sm font-semibold">Chỉ hiển thị đơn còn nợ</label>
              </div>
              <select
                value={rowsPerPage}
                onChange={(e) => {
                  setRowsPerPage(+e.target.value);
                  setCurrentPage(1);
                }}
                className="border px-2 py-1 rounded text-sm"
              >
                {[25, 50, 100, 200].map((val) => (
                  <option key={val} value={val}>{val}</option>
                ))}
              </select>
              <div className="text-sm text-muted-foreground whitespace-nowrap">
                Tổng: {total} đơn kính (hiển thị {filtered.length} trên trang {currentPage})
              </div>
              <Button type="button" variant={showProfit ? 'default' : 'outline'} size="sm" onClick={handleSettingsClick} className="h-10 px-3 ml-auto">
                <Settings className="w-4 h-4" />
              </Button>
            </div>

            {/* Mobile Card Layout */}
            <div className="block md:hidden space-y-4">
              {paginated.map((dk, index) => {
                const stt = (currentPage - 1) * rowsPerPage + index + 1;
                const isDebt = (dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan) > 0;
                return (
                <Card key={dk.id} className={`border ${isDebt ? 'bg-amber-200 border-amber-500 shadow-md ring-1 ring-amber-400/60' : ''}`}>
                  <CardContent className="p-4 space-y-3">
                    <div className="flex justify-between items-start">
                      <div className="space-y-1">
                        <h3 className="font-semibold text-base flex items-center gap-2"><span className="text-[10px] font-mono bg-gray-200 text-gray-700 px-1 rounded">{stt}</span>{dk.benhnhan.ten || 'Không có tên'}</h3>
                        <p className="text-sm text-muted-foreground">
                          {new Date(dk.ngaykham).toLocaleDateString('vi-VN')} {new Date(dk.ngaykham).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="text-base font-semibold">{formatMoney(dk.giatrong + dk.giagong)}k</p>

                        {dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan > 0 && (
                          <p className="text-sm text-red-600">
                            Nợ: {formatMoney(dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan)}k
                          </p>
                        )}
                      </div>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">NS:</span> {dk.benhnhan.namsinh || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Tuổi:</span> {calcAge(dk.benhnhan.namsinh ?? null)}
                      </div>
                      <div>
                        <span className="text-muted-foreground">SĐT:</span> {dk.benhnhan.dienthoai || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Địa chỉ:</span> {dk.benhnhan.diachi || '-'}
                      </div>
                    </div>

                    <div className="grid grid-cols-2 gap-3 text-sm">
                      <div>
                        <span className="text-muted-foreground">Mắt phải:</span> {dk.sokinh_moi_mp || '-'}
                      </div>
                      <div>
                        <span className="text-muted-foreground">Mắt trái:</span> {dk.sokinh_moi_mt || '-'}
                      </div>
                    </div>

                    <div className="flex gap-2 pt-2">
                      <Button size="sm" variant="outline" className="flex-1 h-10" asChild>
                        <a href={`/ke-don-kinh?bn=${dk.benhnhanid}`}>
                          <Pencil className="w-4 h-4 mr-1" />
                          Sửa
                        </a>
                      </Button>
                      <Button size="sm" variant="destructive" className="flex-1 h-10" onClick={() => handleDelete(dk.id)}>
                        <Trash2 className="w-4 h-4 mr-1" />
                        Xóa
                      </Button>
                    </div>
                  </CardContent>
                </Card>
              )})}
              {paginated.length === 0 && (
                <Card>
                  <CardContent className="p-8 text-center text-muted-foreground">
                    Không tìm thấy đơn kính.
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
                <CardContent className="p-0 overflow-x-auto">
                  <table className="min-w-full text-sm text-left">
                    <thead className="bg-gray-100 border-b">
                      <tr>
                        <th className="px-4 py-2">STT</th>
                        <th className="px-4 py-2">Ngày khám</th>
                        <th className="px-4 py-2">Họ tên</th>
                        <th className="px-4 py-2">NS</th>
                        <th className="px-4 py-2">Tuổi</th>
                        <th className="px-4 py-2">Điện thoại</th>
                        <th className="px-4 py-2">Địa chỉ</th>
                        <th className="px-4 py-2">Mắt phải</th>
                        <th className="px-4 py-2">Mắt trái</th>
                        <th className="px-4 py-2">Tổng tiền</th>
                        {showProfit && <th className="px-4 py-2">Lãi</th>}
                        <th className="px-4 py-2">còn nợ</th>
                        <th className="px-4 py-2 text-center w-[90px]">Hành động</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginated.map((dk, index) => {
                        const stt = (currentPage - 1) * rowsPerPage + index + 1;
                        const isDebt = (dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan) > 0;
                        return (
                        <tr key={dk.id} className={`border-b ${isDebt ? 'bg-amber-200 font-semibold text-amber-900 border-amber-400' : 'hover:bg-gray-50'}`}>
                          <td className="px-4 py-2 text-center font-mono">{stt}</td>
                          <td className="px-4 py-2">
                            {new Date(dk.ngaykham).toLocaleString('vi-VN', {
                              timeZone: 'Asia/Ho_Chi_Minh',
                              hour12: false,
                              year: 'numeric',
                              month: '2-digit',
                              day: '2-digit',
                              hour: '2-digit',
                              minute: '2-digit'
                            })}
                          </td>
                          <td className="px-4 py-2">{dk.benhnhan.ten || '-'}</td>
                          <td className="px-4 py-2">{dk.benhnhan.namsinh || '-'}</td>
                          <td className="px-4 py-2">{calcAge(dk.benhnhan.namsinh ?? null)}</td>
                          <td className="px-4 py-2">{dk.benhnhan.dienthoai || '-'}</td>
                          <td className="px-4 py-2">{dk.benhnhan.diachi || '-'}</td>
                          <td className="px-4 py-2">{dk.sokinh_moi_mp || '-'}</td>
                          <td className="px-4 py-2">{dk.sokinh_moi_mt || '-'}</td>
                          <td className="px-4 py-2">{formatMoney(dk.giatrong + dk.giagong)}</td>
                          {showProfit && (
                            <td className="px-4 py-2 text-emerald-600 font-medium">{formatMoney(dk.lai)}</td>
                          )}
                          <td className="px-4 py-2">
                            {dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan > 0
                              ? formatMoney(dk.giatrong + dk.giagong - dk.sotien_da_thanh_toan)
                              : '-'}
                          </td>
                          <td className="px-4 py-2 text-center w-[90px]">
                            <div className="flex items-center justify-center gap-1 whitespace-nowrap">
                              <Button size="sm" variant="outline" asChild className="h-7 px-2">
                                <a href={`/ke-don-kinh?bn=${dk.benhnhanid}`}>
                                  <Pencil className="w-3 h-3" />
                                </a>
                              </Button>
                              <Button size="sm" variant="destructive" onClick={() => handleDelete(dk.id)} className="h-7 px-2">
                                <Trash2 className="w-3 h-3" />
                              </Button>
                            </div>
                          </td>
                        </tr>
                        )})}
                      {paginated.length === 0 && (
                        <tr>
                          <td colSpan={showProfit ? 12 : 11} className="text-center py-4 text-muted-foreground">
                            Không tìm thấy đơn kính.
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
          </>
        )}
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
    </ProtectedRoute>
  );
}