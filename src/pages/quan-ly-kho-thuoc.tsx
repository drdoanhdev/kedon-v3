import React, { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { Card, CardContent } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Package, AlertTriangle, RefreshCw, Plus, ArrowDownToLine, Trash2, Search, History } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';

// ============================================
// INTERFACES
// ============================================
interface ThuocStock {
  id: number;
  mathuoc: string | null;
  tenthuoc: string | null;
  donvitinh: string | null;
  giaban: number;
  gianhap: number;
  tonkho: number | null;
  muc_ton_can_co: number | null;
  trang_thai: string;
  ngung_kinh_doanh?: boolean;
}

interface StockSummary {
  total: number;
  het: number;
  sap_het: number;
  du: number;
}

interface NhapKhoRecord {
  id: number;
  thuoc_id: number;
  so_luong: number;
  don_gia: number;
  thanh_tien: number;
  nha_cung_cap: string | null;
  so_lo: string | null;
  han_su_dung: string | null;
  ghi_chu: string | null;
  ngay_nhap: string;
  Thuoc?: { id: number; tenthuoc: string | null; mathuoc: string | null; donvitinh: string | null };
}

interface HuyRecord {
  id: number;
  thuoc_id: number;
  so_luong: number;
  ly_do: string;
  ghi_chu: string | null;
  ngay_huy: string;
  Thuoc?: { id: number; tenthuoc: string | null; mathuoc: string | null; donvitinh: string | null };
}

// ============================================
// COMPONENT
// ============================================
export default function QuanLyKhoThuoc() {
  const [activeTab, setActiveTab] = useState<'overview' | 'stock' | 'nhap' | 'huy'>('overview');

  // Data states
  const [thuocList, setThuocList] = useState<ThuocStock[]>([]);
  const [summary, setSummary] = useState<StockSummary>({ total: 0, het: 0, sap_het: 0, du: 0 });
  const [nhapHistory, setNhapHistory] = useState<NhapKhoRecord[]>([]);
  const [huyHistory, setHuyHistory] = useState<HuyRecord[]>([]);
  const [loading, setLoading] = useState(true);

  // Filter
  const [stockFilter, setStockFilter] = useState<string>('all');
  const [searchText, setSearchText] = useState('');
  const [showInactive, setShowInactive] = useState(false);

  // Dialog: Nhập kho
  const [showNhapDialog, setShowNhapDialog] = useState(false);
  const [selectedThuoc, setSelectedThuoc] = useState<ThuocStock | null>(null);
  const [nhapForm, setNhapForm] = useState({ so_luong: '', don_gia: '', nha_cung_cap: '', so_lo: '', han_su_dung: '', ghi_chu: '' });

  // Dialog: Hủy thuốc
  const [showHuyDialog, setShowHuyDialog] = useState(false);
  const [huyForm, setHuyForm] = useState({ so_luong: '', ly_do: 'het_han', ghi_chu: '' });

  // ============================================
  // FETCH DATA
  // ============================================
  const fetchStock = useCallback(async () => {
    try {
      const params: any = {};
      if (stockFilter !== 'all') params.filter = stockFilter;
      if (searchText) params.search = searchText;
      if (showInactive) params.show_inactive = '1';
      const { data } = await axios.get('/api/inventory/thuoc-stock', { params });
      setThuocList(data.data || []);
      setSummary(data.summary || { total: 0, het: 0, sap_het: 0, du: 0 });
    } catch {
      toast.error('Lỗi tải dữ liệu kho thuốc');
    }
  }, [stockFilter, searchText, showInactive]);

  const fetchNhapHistory = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/inventory/thuoc-nhap');
      setNhapHistory(data.data || []);
    } catch {}
  }, []);

  const fetchHuyHistory = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/inventory/thuoc-huy');
      setHuyHistory(data.data || []);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchStock(), fetchNhapHistory(), fetchHuyHistory()])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchStock(); }, [stockFilter, searchText, showInactive]);

  // ============================================
  // ACTIONS
  // ============================================
  const handleNhapKho = async () => {
    if (!selectedThuoc) return;
    const sl = parseInt(nhapForm.so_luong);
    if (!sl || sl <= 0) {
      toast.error('Số lượng phải lớn hơn 0');
      return;
    }
    try {
      await axios.post('/api/inventory/thuoc-nhap', {
        thuoc_id: selectedThuoc.id,
        so_luong: sl,
        don_gia: parseInt(nhapForm.don_gia) || 0,
        nha_cung_cap: nhapForm.nha_cung_cap,
        so_lo: nhapForm.so_lo,
        han_su_dung: nhapForm.han_su_dung || null,
        ghi_chu: nhapForm.ghi_chu,
      });
      toast.success(`Đã nhập ${sl} ${selectedThuoc.donvitinh || 'đơn vị'} ${selectedThuoc.tenthuoc}`);
      setShowNhapDialog(false);
      resetNhapForm();
      fetchStock();
      fetchNhapHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi nhập kho');
    }
  };

  const handleHuyThuoc = async () => {
    if (!selectedThuoc) return;
    const sl = parseInt(huyForm.so_luong);
    if (!sl || sl <= 0) {
      toast.error('Số lượng phải lớn hơn 0');
      return;
    }
    try {
      await axios.post('/api/inventory/thuoc-huy', {
        thuoc_id: selectedThuoc.id,
        so_luong: sl,
        ly_do: huyForm.ly_do,
        ghi_chu: huyForm.ghi_chu,
      });
      toast.success(`Đã hủy ${sl} ${selectedThuoc.donvitinh || 'đơn vị'} ${selectedThuoc.tenthuoc}`);
      setShowHuyDialog(false);
      resetHuyForm();
      fetchStock();
      fetchHuyHistory();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi hủy thuốc');
    }
  };

  const resetNhapForm = () => {
    setNhapForm({ so_luong: '', don_gia: '', nha_cung_cap: '', so_lo: '', han_su_dung: '', ghi_chu: '' });
    setSelectedThuoc(null);
  };

  const resetHuyForm = () => {
    setHuyForm({ so_luong: '', ly_do: 'het_han', ghi_chu: '' });
    setSelectedThuoc(null);
  };

  // ============================================
  // HELPERS
  // ============================================
  const trangThaiColor = (tt: string) => {
    if (tt === 'HET') return 'bg-red-100 text-red-800';
    if (tt === 'SAP_HET') return 'bg-yellow-100 text-yellow-800';
    return 'bg-green-100 text-green-800';
  };

  const trangThaiLabel = (tt: string) => {
    if (tt === 'HET') return 'Hết';
    if (tt === 'SAP_HET') return 'Sắp hết';
    return 'Đủ';
  };

  const lyDoLabel = (ld: string) => {
    const map: Record<string, string> = {
      het_han: 'Hết hạn',
      hu_hong: 'Hư hỏng',
      mat: 'Mất',
      khac: 'Khác',
    };
    return map[ld] || ld;
  };

  const formatMoney = (v: number) => {
    return v.toLocaleString('vi-VN') + 'đ';
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('vi-VN');
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <ProtectedRoute>
      <FeatureGate feature="inventory_drug">
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto py-6 px-4">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Quản lý kho thuốc</h1>
              <p className="text-gray-500 text-sm mt-1">Xuất nhập tồn kho thuốc, vật tư y tế</p>
            </div>
            <Button onClick={() => { fetchStock(); fetchNhapHistory(); fetchHuyHistory(); }} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-1" /> Làm mới
            </Button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-white rounded-lg p-1 shadow-sm border">
            {[
              { key: 'overview', label: 'Tổng quan', icon: <Package className="w-4 h-4" /> },
              { key: 'stock', label: 'Tồn kho', icon: <Search className="w-4 h-4" /> },
              { key: 'nhap', label: 'Lịch sử nhập', icon: <ArrowDownToLine className="w-4 h-4" /> },
              { key: 'huy', label: 'Lịch sử hủy', icon: <Trash2 className="w-4 h-4" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition ${
                  activeTab === tab.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-20 text-gray-500">Đang tải dữ liệu kho thuốc...</div>
          ) : (
            <>
              {/* ======================== TAB: TỔNG QUAN ======================== */}
              {activeTab === 'overview' && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-3xl font-bold text-red-600">{summary.het}</p>
                        <p className="text-sm text-gray-500 mt-1">Đã hết</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-3xl font-bold text-yellow-600">{summary.sap_het}</p>
                        <p className="text-sm text-gray-500 mt-1">Sắp hết</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-3xl font-bold text-green-600">{summary.du}</p>
                        <p className="text-sm text-gray-500 mt-1">Đủ hàng</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-3xl font-bold text-blue-600">{summary.total}</p>
                        <p className="text-sm text-gray-500 mt-1">Tổng mặt hàng</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Cảnh báo thuốc hết / sắp hết */}
                  {(summary.het > 0 || summary.sap_het > 0) && (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-4">
                          <AlertTriangle className="w-5 h-5 text-yellow-500" />
                          <h3 className="font-semibold">Cảnh báo tồn kho</h3>
                        </div>
                        <div className="space-y-2">
                          {thuocList
                            .filter(t => t.trang_thai === 'HET' || t.trang_thai === 'SAP_HET')
                            .slice(0, 20)
                            .map(t => (
                              <div key={t.id} className="flex items-center justify-between py-2 px-3 rounded bg-gray-50">
                                <div>
                                  <span className="font-medium">{t.tenthuoc}</span>
                                  {t.mathuoc && <span className="text-gray-400 text-sm ml-2">({t.mathuoc})</span>}
                                </div>
                                <div className="flex items-center gap-3">
                                  <span className="text-sm text-gray-500">Tồn: <strong>{t.tonkho ?? 0}</strong> / {t.muc_ton_can_co ?? 10}</span>
                                  <span className={`px-2 py-0.5 rounded text-xs font-medium ${trangThaiColor(t.trang_thai)}`}>
                                    {trangThaiLabel(t.trang_thai)}
                                  </span>
                                  <Button size="sm" variant="outline" onClick={() => { setSelectedThuoc(t); setShowNhapDialog(true); }}>
                                    <Plus className="w-3 h-3 mr-1" /> Nhập
                                  </Button>
                                </div>
                              </div>
                            ))}
                        </div>
                      </CardContent>
                    </Card>
                  )}

                  {/* Nhập kho gần đây */}
                  {nhapHistory.length > 0 && (
                    <Card>
                      <CardContent className="pt-6">
                        <div className="flex items-center gap-2 mb-4">
                          <History className="w-5 h-5 text-blue-500" />
                          <h3 className="font-semibold">Nhập kho gần đây</h3>
                        </div>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-gray-500">
                                <th className="py-2 pr-4">Ngày</th>
                                <th className="py-2 pr-4">Thuốc</th>
                                <th className="py-2 pr-4 text-right">SL</th>
                                <th className="py-2 pr-4 text-right">Đơn giá</th>
                                <th className="py-2 pr-4">NCC</th>
                              </tr>
                            </thead>
                            <tbody>
                              {nhapHistory.slice(0, 10).map(r => (
                                <tr key={r.id} className="border-b last:border-0">
                                  <td className="py-2 pr-4">{formatDate(r.ngay_nhap)}</td>
                                  <td className="py-2 pr-4">{r.Thuoc?.tenthuoc || `#${r.thuoc_id}`}</td>
                                  <td className="py-2 pr-4 text-right font-medium">{r.so_luong}</td>
                                  <td className="py-2 pr-4 text-right">{formatMoney(r.don_gia || 0)}</td>
                                  <td className="py-2 pr-4 text-gray-500">{r.nha_cung_cap || '-'}</td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* ======================== TAB: TỒN KHO ======================== */}
              {activeTab === 'stock' && (
                <div className="space-y-4">
                  {/* Search & Filter */}
                  <div className="flex flex-wrap gap-3 items-center">
                    <div className="relative flex-1 min-w-[200px]">
                      <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                      <Input
                        placeholder="Tìm thuốc theo tên, mã, hoạt chất..."
                        value={searchText}
                        onChange={e => setSearchText(e.target.value)}
                        className="pl-9"
                      />
                    </div>
                    <div className="flex gap-1">
                      {[
                        { key: 'all', label: 'Tất cả' },
                        { key: 'HET', label: 'Hết' },
                        { key: 'SAP_HET', label: 'Sắp hết' },
                        { key: 'DU', label: 'Đủ' },
                      ].map(f => (
                        <Button
                          key={f.key}
                          variant={stockFilter === f.key ? 'default' : 'outline'}
                          size="sm"
                          onClick={() => setStockFilter(f.key)}
                        >
                          {f.label}
                        </Button>
                      ))}
                      <button
                        onClick={() => setShowInactive(!showInactive)}
                        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition flex items-center gap-1 whitespace-nowrap border ${
                          showInactive ? 'bg-gray-700 text-white border-gray-700' : 'bg-white text-gray-500 border-gray-300 hover:bg-gray-50'
                        }`}
                      >
                        {showInactive ? 'Đang xem ngừng KD' : 'Xem ngừng KD'}
                      </button>
                    </div>
                  </div>

                  {/* Stock Table */}
                  <Card>
                    <CardContent className="pt-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="py-2 pr-4">Mã</th>
                              <th className="py-2 pr-4">Tên thuốc</th>
                              <th className="py-2 pr-4">ĐVT</th>
                              <th className="py-2 pr-4 text-right">Giá nhập</th>
                              <th className="py-2 pr-4 text-right">Giá bán</th>
                              <th className="py-2 pr-4 text-right">Tồn kho</th>
                              <th className="py-2 pr-4 text-center">Trạng thái</th>
                              <th className="py-2 text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {thuocList.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="py-8 text-center text-gray-400">
                                  {searchText ? 'Không tìm thấy thuốc phù hợp' : 'Chưa có dữ liệu thuốc'}
                                </td>
                              </tr>
                            ) : (
                              thuocList.map(t => {
                                const isInactive = !!t.ngung_kinh_doanh;
                                return (
                                <tr key={t.id} className={`border-b last:border-0 hover:bg-gray-50 ${isInactive ? 'opacity-50 bg-gray-50' : ''}`}>
                                  <td className="py-2 pr-4 text-gray-400">{t.mathuoc || '-'}</td>
                                  <td className="py-2 pr-4 font-medium">
                                    {t.tenthuoc}
                                    {isInactive && <span className="ml-1.5 text-xs bg-red-100 text-red-600 px-1.5 py-0.5 rounded">Ngừng KD</span>}
                                  </td>
                                  <td className="py-2 pr-4">{t.donvitinh || '-'}</td>
                                  <td className="py-2 pr-4 text-right">{formatMoney(t.gianhap)}</td>
                                  <td className="py-2 pr-4 text-right">{formatMoney(t.giaban)}</td>
                                  <td className="py-2 pr-4 text-right font-bold">{t.tonkho ?? 0}</td>
                                  <td className="py-2 pr-4 text-center">
                                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${trangThaiColor(t.trang_thai)}`}>
                                      {trangThaiLabel(t.trang_thai)}
                                    </span>
                                  </td>
                                  <td className="py-2 text-right">
                                    <div className="flex justify-end gap-1">
                                      {!isInactive && (
                                      <>
                                      <Button size="sm" variant="outline" onClick={() => { setSelectedThuoc(t); setShowNhapDialog(true); }}>
                                        <ArrowDownToLine className="w-3 h-3 mr-1" /> Nhập
                                      </Button>
                                      <Button size="sm" variant="outline" className="text-red-600 hover:text-red-700" onClick={() => { setSelectedThuoc(t); setShowHuyDialog(true); }}>
                                        <Trash2 className="w-3 h-3 mr-1" /> Hủy
                                      </Button>
                                      </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                                );
                              })
                            )}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ======================== TAB: LỊCH SỬ NHẬP ======================== */}
              {activeTab === 'nhap' && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-4">Lịch sử nhập kho</h3>
                    {nhapHistory.length === 0 ? (
                      <p className="text-center py-8 text-gray-400">Chưa có lịch sử nhập kho</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="py-2 pr-4">Ngày nhập</th>
                              <th className="py-2 pr-4">Thuốc</th>
                              <th className="py-2 pr-4 text-right">Số lượng</th>
                              <th className="py-2 pr-4 text-right">Đơn giá</th>
                              <th className="py-2 pr-4 text-right">Thành tiền</th>
                              <th className="py-2 pr-4">NCC</th>
                              <th className="py-2 pr-4">Số lô</th>
                              <th className="py-2 pr-4">HSD</th>
                              <th className="py-2">Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody>
                            {nhapHistory.map(r => (
                              <tr key={r.id} className="border-b last:border-0">
                                <td className="py-2 pr-4">{formatDate(r.ngay_nhap)}</td>
                                <td className="py-2 pr-4 font-medium">{r.Thuoc?.tenthuoc || `#${r.thuoc_id}`}</td>
                                <td className="py-2 pr-4 text-right font-bold">{r.so_luong}</td>
                                <td className="py-2 pr-4 text-right">{formatMoney(r.don_gia || 0)}</td>
                                <td className="py-2 pr-4 text-right">{formatMoney(r.thanh_tien || 0)}</td>
                                <td className="py-2 pr-4 text-gray-500">{r.nha_cung_cap || '-'}</td>
                                <td className="py-2 pr-4 text-gray-500">{r.so_lo || '-'}</td>
                                <td className="py-2 pr-4 text-gray-500">{formatDate(r.han_su_dung)}</td>
                                <td className="py-2 text-gray-500">{r.ghi_chu || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}

              {/* ======================== TAB: LỊCH SỬ HỦY ======================== */}
              {activeTab === 'huy' && (
                <Card>
                  <CardContent className="pt-6">
                    <h3 className="font-semibold mb-4">Lịch sử hủy thuốc</h3>
                    {huyHistory.length === 0 ? (
                      <p className="text-center py-8 text-gray-400">Chưa có lịch sử hủy thuốc</p>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b text-left text-gray-500">
                              <th className="py-2 pr-4">Ngày hủy</th>
                              <th className="py-2 pr-4">Thuốc</th>
                              <th className="py-2 pr-4 text-right">Số lượng</th>
                              <th className="py-2 pr-4">Lý do</th>
                              <th className="py-2">Ghi chú</th>
                            </tr>
                          </thead>
                          <tbody>
                            {huyHistory.map(r => (
                              <tr key={r.id} className="border-b last:border-0">
                                <td className="py-2 pr-4">{formatDate(r.ngay_huy)}</td>
                                <td className="py-2 pr-4 font-medium">{r.Thuoc?.tenthuoc || `#${r.thuoc_id}`}</td>
                                <td className="py-2 pr-4 text-right font-bold text-red-600">{r.so_luong}</td>
                                <td className="py-2 pr-4">
                                  <span className="px-2 py-0.5 rounded text-xs font-medium bg-gray-100">{lyDoLabel(r.ly_do)}</span>
                                </td>
                                <td className="py-2 text-gray-500">{r.ghi_chu || '-'}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>
              )}
            </>
          )}
        </main>
      </div>

      {/* ======================== DIALOG: NHẬP KHO ======================== */}
      <Dialog open={showNhapDialog} onOpenChange={(open) => { if (!open) resetNhapForm(); setShowNhapDialog(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Nhập kho thuốc</DialogTitle>
          </DialogHeader>
          {selectedThuoc && (
            <div className="mb-3 p-3 bg-blue-50 rounded-lg">
              <p className="font-semibold">{selectedThuoc.tenthuoc}</p>
              <p className="text-sm text-gray-500">Tồn hiện tại: {selectedThuoc.tonkho ?? 0} {selectedThuoc.donvitinh || ''}</p>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label>Số lượng nhập <span className="text-red-500">*</span></Label>
              <Input type="number" min="1" value={nhapForm.so_luong} onChange={e => setNhapForm({ ...nhapForm, so_luong: e.target.value })} placeholder="VD: 100" />
            </div>
            <div>
              <Label>Đơn giá (VNĐ)</Label>
              <Input type="number" min="0" value={nhapForm.don_gia} onChange={e => setNhapForm({ ...nhapForm, don_gia: e.target.value })} placeholder="VD: 5000" />
            </div>
            <div>
              <Label>Nhà cung cấp</Label>
              <Input value={nhapForm.nha_cung_cap} onChange={e => setNhapForm({ ...nhapForm, nha_cung_cap: e.target.value })} placeholder="Tên NCC" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Số lô</Label>
                <Input value={nhapForm.so_lo} onChange={e => setNhapForm({ ...nhapForm, so_lo: e.target.value })} placeholder="VD: LOT001" />
              </div>
              <div>
                <Label>Hạn sử dụng</Label>
                <Input type="date" value={nhapForm.han_su_dung} onChange={e => setNhapForm({ ...nhapForm, han_su_dung: e.target.value })} />
              </div>
            </div>
            <div>
              <Label>Ghi chú</Label>
              <Input value={nhapForm.ghi_chu} onChange={e => setNhapForm({ ...nhapForm, ghi_chu: e.target.value })} placeholder="Ghi chú..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetNhapForm(); setShowNhapDialog(false); }}>Hủy</Button>
            <Button onClick={handleNhapKho}>Nhập kho</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* ======================== DIALOG: HỦY THUỐC ======================== */}
      <Dialog open={showHuyDialog} onOpenChange={(open) => { if (!open) resetHuyForm(); setShowHuyDialog(open); }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Hủy thuốc</DialogTitle>
          </DialogHeader>
          {selectedThuoc && (
            <div className="mb-3 p-3 bg-red-50 rounded-lg">
              <p className="font-semibold">{selectedThuoc.tenthuoc}</p>
              <p className="text-sm text-gray-500">Tồn hiện tại: {selectedThuoc.tonkho ?? 0} {selectedThuoc.donvitinh || ''}</p>
            </div>
          )}
          <div className="space-y-3">
            <div>
              <Label>Số lượng hủy <span className="text-red-500">*</span></Label>
              <Input type="number" min="1" max={selectedThuoc?.tonkho ?? 0} value={huyForm.so_luong} onChange={e => setHuyForm({ ...huyForm, so_luong: e.target.value })} placeholder="VD: 10" />
            </div>
            <div>
              <Label>Lý do hủy <span className="text-red-500">*</span></Label>
              <select
                value={huyForm.ly_do}
                onChange={e => setHuyForm({ ...huyForm, ly_do: e.target.value })}
                className="w-full border rounded-md px-3 py-2 text-sm"
              >
                <option value="het_han">Hết hạn sử dụng</option>
                <option value="hu_hong">Hư hỏng</option>
                <option value="mat">Mất</option>
                <option value="khac">Khác</option>
              </select>
            </div>
            <div>
              <Label>Ghi chú</Label>
              <Input value={huyForm.ghi_chu} onChange={e => setHuyForm({ ...huyForm, ghi_chu: e.target.value })} placeholder="Ghi chú..." />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { resetHuyForm(); setShowHuyDialog(false); }}>Đóng</Button>
            <Button variant="destructive" onClick={handleHuyThuoc}>Xác nhận hủy</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      </FeatureGate>
    </ProtectedRoute>
  );
}
