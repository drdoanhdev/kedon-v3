import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/router';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { useFeatureGate } from '../hooks/useFeatureGate';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Frame, Search, RefreshCw, ArrowDownToLine, Package, AlertTriangle, History, Ban } from 'lucide-react';
import toast from 'react-hot-toast';
import axios from 'axios';
import GongKinhMediaPanel from '@/components/GongKinhMediaPanel';

interface GongKinhStock {
  id: number;
  ten_gong: string;
  ma_gong: string | null;
  mau_sac: string | null;
  kich_co: string | null;
  chat_lieu: string | null;
  hang_san_xuat?: string | null;
  mo_ta?: string | null;
  gia_nhap: number;
  gia_ban: number;
  ton_kho: number;
  muc_ton_can_co: number;
  trang_thai: boolean;
  NhaCungCap?: { id: number; ten: string } | null;
}

interface FrameImportRecord {
  id: number;
  gong_kinh_id: number;
  so_luong: number;
  don_gia: number;
  ghi_chu: string | null;
  ngay_nhap: string;
  GongKinh?: {
    id: number;
    ten_gong: string;
    ma_gong: string | null;
  } | null;
  NhaCungCap?: {
    ten: string;
  } | null;
}

interface LowStockAlert {
  loai_hang: string;
  ten: string;
  chi_tiet: string;
  ton_kho: number;
  muc_toi_thieu: number;
  can_nhap: number;
  trang_thai: string;
}

interface AlertSummary {
  alerts: LowStockAlert[];
  summary: {
    het: number;
    sap_het: number;
    total: number;
  };
}

export default function QuanLyKhoGong() {
  const router = useRouter();
  const { canAccessFeature, hasPermission } = useFeatureGate();
  const canInventory = canAccessFeature('inventory_lens') && hasPermission('manage_inventory');
  const [activeTab, setActiveTab] = useState<'overview' | 'stock' | 'import' | 'catalog'>('catalog');

  const [frameStocks, setFrameStocks] = useState<GongKinhStock[]>([]);
  const [catalogList, setCatalogList] = useState<GongKinhStock[]>([]);
  const [importHistory, setImportHistory] = useState<FrameImportRecord[]>([]);
  const [alertData, setAlertData] = useState<AlertSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const [showInactive, setShowInactive] = useState(false);
  const [frameSearch, setFrameSearch] = useState('');
  const [frameSortBy, setFrameSortBy] = useState<'ten_gong' | 'gia_ban' | 'gia_nhap' | 'ton_kho'>('ten_gong');
  const [frameSortDir, setFrameSortDir] = useState<'asc' | 'desc'>('asc');
  const [framePriceRange, setFramePriceRange] = useState<'all' | 'under200' | '200to500' | '500to1000' | 'over1000'>('all');

  const [showFrameImport, setShowFrameImport] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<GongKinhStock | null>(null);
  const [frameImportForm, setFrameImportForm] = useState({ so_luong: '', don_gia: '', ghi_chu: '' });

  const [nhaCungCaps, setNhaCungCaps] = useState<{ id: number; ten: string }[]>([]);

  const [catalogSearch, setCatalogSearch] = useState('');
  const [catalogPage, setCatalogPage] = useState(1);
  const [showCatalogDialog, setShowCatalogDialog] = useState(false);
  const [editingCatalog, setEditingCatalog] = useState<GongKinhStock | null>(null);
  const [catalogForm, setCatalogForm] = useState({
    ten_gong: '',
    ma_gong: '',
    mau_sac: '',
    kich_co: '',
    chat_lieu: '',
    hang_san_xuat: '',
    gia_nhap: '0',
    gia_ban: '0',
    muc_ton_can_co: '2',
    nha_cung_cap_id: '',
    mo_ta: '',
  });

  const fetchFrameStocks = useCallback(async () => {
    try {
      const { data } = await axios.get(`/api/gong-kinh${showInactive ? '?show_inactive=1' : ''}`);
      setFrameStocks(data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Lỗi tải dữ liệu kho gọng');
    }
  }, [showInactive]);

  const fetchCatalog = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/gong-kinh?scope=shared&show_inactive=1');
      setCatalogList(data || []);
    } catch {
      toast.error('Lỗi tải danh mục gọng');
    }
  }, []);

  const fetchImportHistory = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/inventory/frame-import?limit=200');
      setImportHistory(data || []);
    } catch (err: any) {
      toast.error(err?.response?.data?.message || err?.response?.data?.error || 'Lỗi tải lịch sử nhập gọng');
      setImportHistory([]);
    }
  }, []);

  const fetchAlerts = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/inventory/low-stock?type=gong');
      setAlertData(data || { alerts: [], summary: { het: 0, sap_het: 0, total: 0 } });
    } catch {
      setAlertData({ alerts: [], summary: { het: 0, sap_het: 0, total: 0 } });
    }
  }, []);

  const fetchNhaCungCaps = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/nha-cung-cap');
      setNhaCungCaps(data?.data || data || []);
    } catch {
      setNhaCungCaps([]);
    }
  }, []);

  useEffect(() => {
    const tasks: Promise<unknown>[] = [fetchCatalog(), fetchNhaCungCaps()];
    if (canInventory) {
      tasks.push(fetchFrameStocks(), fetchImportHistory(), fetchAlerts());
    }
    Promise.all(tasks).finally(() => setLoading(false));
  }, [canInventory]);

  useEffect(() => {
    if (canInventory) fetchFrameStocks();
  }, [fetchFrameStocks, canInventory]);

  useEffect(() => {
    if (!router.isReady) return;
    const tabQuery = Array.isArray(router.query.tab) ? router.query.tab[0] : router.query.tab;
    if (!tabQuery || typeof tabQuery !== 'string') return;

    const tabMap: Record<string, 'overview' | 'stock' | 'import' | 'catalog'> = {
      overview: 'overview',
      stock: 'stock',
      catalog: 'catalog',
      import: 'import',
    };

    const mapped = tabMap[tabQuery];
    if (!mapped) return;
    if (!canInventory && mapped !== 'catalog') {
      if (activeTab !== 'catalog') setActiveTab('catalog');
      return;
    }
    if (activeTab !== mapped) setActiveTab(mapped);
  }, [router.isReady, router.query.tab, activeTab, canInventory]);

  useEffect(() => {
    if (!canInventory && activeTab !== 'catalog') setActiveTab('catalog');
  }, [canInventory, activeTab]);

  useEffect(() => {
    if (canInventory && !router.query.tab && activeTab === 'catalog') {
      setActiveTab('overview');
    }
  }, [canInventory, router.query.tab]);

  useEffect(() => {
    setCatalogPage(1);
  }, [catalogSearch, catalogList.length]);

  const handleFrameImport = async () => {
    if (!selectedFrame) return;
    const qty = parseInt(frameImportForm.so_luong, 10);
    if (!qty || qty <= 0) {
      toast.error('Số lượng nhập phải lớn hơn 0');
      return;
    }

    try {
      await axios.post('/api/inventory/frame-import', {
        gong_kinh_id: selectedFrame.id,
        so_luong: qty,
        don_gia: parseInt(frameImportForm.don_gia, 10) || 0,
        ghi_chu: frameImportForm.ghi_chu || null,
      });
      toast.success(`Đã nhập ${qty} gọng`);
      setShowFrameImport(false);
      setFrameImportForm({ so_luong: '', don_gia: '', ghi_chu: '' });
      setSelectedFrame(null);
      fetchFrameStocks();
      fetchImportHistory();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi nhập kho gọng');
    }
  };

  const resetCatalogForm = () => {
    setCatalogForm({
      ten_gong: '',
      ma_gong: '',
      mau_sac: '',
      kich_co: '',
      chat_lieu: '',
      hang_san_xuat: '',
      gia_nhap: '0',
      gia_ban: '0',
      muc_ton_can_co: '2',
      nha_cung_cap_id: '',
      mo_ta: '',
    });
    setEditingCatalog(null);
  };

  const openCreateCatalog = () => {
    resetCatalogForm();
    setShowCatalogDialog(true);
  };

  const openEditCatalog = (item: GongKinhStock) => {
    setEditingCatalog(item);
    setCatalogForm({
      ten_gong: item.ten_gong || '',
      ma_gong: item.ma_gong || '',
      mau_sac: item.mau_sac || '',
      kich_co: item.kich_co || '',
      chat_lieu: item.chat_lieu || '',
      hang_san_xuat: item.hang_san_xuat || '',
      gia_nhap: String(item.gia_nhap || 0),
      gia_ban: String(item.gia_ban || 0),
      muc_ton_can_co: String(item.muc_ton_can_co || 2),
      nha_cung_cap_id: item.NhaCungCap?.id ? String(item.NhaCungCap.id) : '',
      mo_ta: item.mo_ta || '',
    });
    setShowCatalogDialog(true);
  };

  const buildCatalogPayload = (overrides?: Partial<typeof catalogForm>) => ({
    ten_gong: (overrides?.ten_gong ?? catalogForm.ten_gong).trim(),
    ma_gong: (overrides?.ma_gong ?? catalogForm.ma_gong).trim() || null,
    mau_sac: (overrides?.mau_sac ?? catalogForm.mau_sac).trim() || null,
    kich_co: (overrides?.kich_co ?? catalogForm.kich_co).trim() || null,
    chat_lieu: (overrides?.chat_lieu ?? catalogForm.chat_lieu).trim() || null,
    hang_san_xuat: (overrides?.hang_san_xuat ?? catalogForm.hang_san_xuat).trim() || null,
    gia_nhap: parseInt(overrides?.gia_nhap ?? catalogForm.gia_nhap, 10) || 0,
    gia_ban: parseInt(overrides?.gia_ban ?? catalogForm.gia_ban, 10) || 0,
    muc_ton_can_co: parseInt(overrides?.muc_ton_can_co ?? catalogForm.muc_ton_can_co, 10) || 2,
    nha_cung_cap_id: (overrides?.nha_cung_cap_id ?? catalogForm.nha_cung_cap_id) || null,
    mo_ta: (overrides?.mo_ta ?? catalogForm.mo_ta).trim() || null,
  });

  const handleSaveCatalog = async () => {
    const payload = buildCatalogPayload();
    if (!payload.ten_gong) {
      toast.error('Tên gọng là bắt buộc');
      return;
    }

    try {
      if (editingCatalog) {
        await axios.put('/api/gong-kinh?scope=shared', { id: editingCatalog.id, ...payload });
        toast.success('Đã cập nhật gọng');
      } else {
        await axios.post('/api/gong-kinh?scope=shared', payload);
        toast.success('Đã thêm gọng mới');
      }
      setShowCatalogDialog(false);
      resetCatalogForm();
      fetchCatalog();
      if (canInventory) {
        fetchFrameStocks();
        fetchAlerts();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Lỗi lưu danh mục gọng');
    }
  };

  const handleDeleteCatalog = async (item: GongKinhStock) => {
    if (!window.confirm(`Xóa gọng "${item.ten_gong}" khỏi danh mục?`)) return;
    try {
      await axios.delete('/api/gong-kinh?scope=shared', { data: { id: item.id } });
      toast.success('Đã xóa gọng khỏi danh mục');
      fetchCatalog();
      if (canInventory) {
        fetchFrameStocks();
        fetchAlerts();
      }
    } catch (err: any) {
      toast.error(err.response?.data?.error || err.response?.data?.message || 'Lỗi xóa gọng');
    }
  };

  const trangThaiColor = (tt: string) => {
    if (tt === 'HET') return 'bg-red-100 text-red-700';
    if (tt === 'SAP_HET') return 'bg-yellow-100 text-yellow-700';
    return 'bg-green-100 text-green-700';
  };

  const trangThaiLabel = (tt: string) => {
    if (tt === 'HET') return 'Hết';
    if (tt === 'SAP_HET') return 'Sắp hết';
    return 'Đủ';
  };

  const formatDate = (d: string | null) => {
    if (!d) return '-';
    return new Date(d).toLocaleDateString('vi-VN');
  };

  const visibleFrames = frameStocks
    .filter((frame) => {
      const gia = frame.gia_ban || 0;
      if (framePriceRange === 'under200' && gia >= 200000) return false;
      if (framePriceRange === '200to500' && (gia < 200000 || gia > 500000)) return false;
      if (framePriceRange === '500to1000' && (gia < 500000 || gia > 1000000)) return false;
      if (framePriceRange === 'over1000' && gia <= 1000000) return false;

      if (!frameSearch) return true;
      const s = frameSearch.toLowerCase();
      return (
        frame.ten_gong?.toLowerCase().includes(s) ||
        frame.ma_gong?.toLowerCase().includes(s) ||
        frame.mau_sac?.toLowerCase().includes(s) ||
        frame.NhaCungCap?.ten?.toLowerCase().includes(s)
      );
    })
    .sort((a, b) => {
      let cmp = 0;
      if (frameSortBy === 'ten_gong') cmp = (a.ten_gong || '').localeCompare(b.ten_gong || '', 'vi');
      else if (frameSortBy === 'gia_ban') cmp = (a.gia_ban || 0) - (b.gia_ban || 0);
      else if (frameSortBy === 'gia_nhap') cmp = (a.gia_nhap || 0) - (b.gia_nhap || 0);
      else if (frameSortBy === 'ton_kho') cmp = (a.ton_kho ?? 0) - (b.ton_kho ?? 0);
      return frameSortDir === 'desc' ? -cmp : cmp;
    });

  const filteredCatalog = catalogList.filter((frame) => {
    if (!catalogSearch) return true;
    const s = catalogSearch.toLowerCase();
    return (
      (frame.ten_gong || '').toLowerCase().includes(s) ||
      (frame.ma_gong || '').toLowerCase().includes(s) ||
      (frame.mau_sac || '').toLowerCase().includes(s) ||
      (frame.hang_san_xuat || '').toLowerCase().includes(s) ||
      (frame.NhaCungCap?.ten || '').toLowerCase().includes(s)
    );
  });

  const CATALOG_PAGE_SIZE = 20;
  const totalCatalogPages = Math.max(1, Math.ceil(filteredCatalog.length / CATALOG_PAGE_SIZE));
  const safeCatalogPage = Math.min(catalogPage, totalCatalogPages);
  const pagedCatalog = filteredCatalog.slice(
    (safeCatalogPage - 1) * CATALOG_PAGE_SIZE,
    safeCatalogPage * CATALOG_PAGE_SIZE
  );

  return (
    <ProtectedRoute>
      <FeatureGate feature="frame_catalog">
        <div className="min-h-screen bg-gray-50">
          <main className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-4">
            <div className="flex items-center justify-between mb-4 sm:mb-6 gap-2">
              <div>
                <h1 className="text-xl sm:text-2xl font-bold text-gray-900">
                  {canInventory ? 'Quản lý kho gọng' : 'Danh mục gọng'}
                </h1>
                <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">
                  {canInventory ? 'Danh mục gọng, tồn kho và nhập kho' : 'Quản lý danh mục gọng dùng khi kê đơn'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {canInventory && (
                  <Button variant="outline" size="sm" onClick={() => { setCatalogPage(1); setActiveTab('catalog'); }}>
                    Danh mục gọng
                  </Button>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    fetchCatalog();
                    fetchNhaCungCaps();
                    if (canInventory) {
                      fetchFrameStocks();
                      fetchImportHistory();
                      fetchAlerts();
                    }
                  }}
                >
                  <RefreshCw className="w-4 h-4 mr-1" />
                  <span className="hidden sm:inline">Làm mới</span>
                </Button>
              </div>
            </div>

            <div className="grid grid-cols-2 sm:flex gap-1 mb-4 sm:mb-6 bg-white rounded-lg p-1 shadow-sm border overflow-x-auto">
              {[
                ...(canInventory
                  ? [
                      { key: 'overview' as const, label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: <Package className="w-4 h-4" /> },
                      { key: 'stock' as const, label: 'Kho gọng', mobileLabel: 'Kho gọng', icon: <Frame className="w-4 h-4" /> },
                      { key: 'import' as const, label: 'Lịch sử nhập', mobileLabel: 'Lịch sử', icon: <History className="w-4 h-4" /> },
                    ]
                  : []),
                { key: 'catalog' as const, label: 'Danh mục gọng', mobileLabel: 'Danh mục', icon: <Frame className="w-4 h-4" /> },
              ].map((tab) => (
                <button
                  key={tab.key}
                  onClick={() => setActiveTab(tab.key)}
                  className={`flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                    activeTab === tab.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                  }`}
                >
                  {tab.icon}
                  <span className="sm:hidden">{tab.mobileLabel}</span>
                  <span className="hidden sm:inline">{tab.label}</span>
                </button>
              ))}
            </div>

            {loading ? (
              <div className="text-center py-20 text-gray-500">Đang tải dữ liệu kho gọng...</div>
            ) : (
              <>
                {canInventory && activeTab === 'overview' && (
                  <div className="space-y-6">
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <p className="text-3xl font-bold text-red-600">{alertData?.summary.het || 0}</p>
                          <p className="text-sm text-gray-500 mt-1">Đã hết</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <p className="text-3xl font-bold text-yellow-600">{alertData?.summary.sap_het || 0}</p>
                          <p className="text-sm text-gray-500 mt-1">Sắp hết</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <p className="text-3xl font-bold text-blue-600">{alertData?.summary.total || 0}</p>
                          <p className="text-sm text-gray-500 mt-1">Cảnh báo tồn kho</p>
                        </CardContent>
                      </Card>
                      <Card>
                        <CardContent className="pt-6 text-center">
                          <p className="text-3xl font-bold text-green-600">{frameStocks.filter((f) => f.trang_thai).length}</p>
                          <p className="text-sm text-gray-500 mt-1">Mặt hàng đang KD</p>
                        </CardContent>
                      </Card>
                    </div>

                    {(alertData?.alerts?.length || 0) > 0 ? (
                      <Card>
                        <CardHeader>
                          <CardTitle className="flex items-center gap-2 text-lg">
                            <AlertTriangle className="w-5 h-5 text-yellow-500" />
                            Cảnh báo tồn kho gọng
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="overflow-x-auto">
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="border-b text-left text-gray-500">
                                  <th className="pb-2 font-medium">Tên gọng</th>
                                  <th className="pb-2 font-medium">Chi tiết</th>
                                  <th className="pb-2 font-medium text-center">Tồn</th>
                                  <th className="pb-2 font-medium text-center">Cần nhập</th>
                                  <th className="pb-2 font-medium text-center">Trạng thái</th>
                                </tr>
                              </thead>
                              <tbody>
                                {(alertData?.alerts || []).map((alert, idx) => (
                                  <tr key={idx} className="border-b last:border-0">
                                    <td className="py-2 font-medium">{alert.ten}</td>
                                    <td className="py-2 text-gray-500">{alert.chi_tiet || '-'}</td>
                                    <td className="py-2 text-center font-bold">{alert.ton_kho}</td>
                                    <td className="py-2 text-center font-bold text-blue-600">{alert.can_nhap}</td>
                                    <td className="py-2 text-center">
                                      <span className={`text-xs px-2 py-0.5 rounded-full ${trangThaiColor(alert.trang_thai)}`}>
                                        {trangThaiLabel(alert.trang_thai)}
                                      </span>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        </CardContent>
                      </Card>
                    ) : (
                      <Card>
                        <CardContent className="py-12 text-center text-gray-500">
                          ✅ Tất cả gọng đều đủ tồn kho
                        </CardContent>
                      </Card>
                    )}
                  </div>
                )}

                {canInventory && activeTab === 'stock' && (
                  <div className="space-y-4">
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-lg">
                          <div className="flex items-center gap-2">
                            <Frame className="w-5 h-5" />
                            Kho gọng ({visibleFrames.filter((f) => f.trang_thai).length})
                          </div>
                          <div className="flex flex-wrap gap-2 ml-auto w-full sm:w-auto">
                            <button
                              onClick={() => setShowInactive(!showInactive)}
                              className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition flex items-center gap-1 whitespace-nowrap ${
                                showInactive ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 border hover:bg-gray-50'
                              }`}
                            >
                              <Ban className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                              {showInactive ? 'Đang xem ngưng KD' : 'Xem ngưng KD'}
                            </button>

                            <div className="relative flex-1 sm:flex-none">
                              <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                              <Input
                                placeholder="Tìm gọng..."
                                value={frameSearch}
                                onChange={(e) => setFrameSearch(e.target.value)}
                                className="pl-8 h-9 text-sm w-full sm:w-48"
                              />
                            </div>

                            <select
                              className="border rounded-md px-2 py-1.5 text-xs h-9"
                              value={framePriceRange}
                              onChange={(e) => setFramePriceRange(e.target.value as 'all' | 'under200' | '200to500' | '500to1000' | 'over1000')}
                            >
                              <option value="all">Tất cả giá</option>
                              <option value="under200">Dưới 200k</option>
                              <option value="200to500">200k - 500k</option>
                              <option value="500to1000">500k - 1tr</option>
                              <option value="over1000">Trên 1tr</option>
                            </select>

                            <select
                              className="border rounded-md px-2 py-1.5 text-xs h-9"
                              value={`${frameSortBy}_${frameSortDir}`}
                              onChange={(e) => {
                                const [field, dir] = e.target.value.split('_') as [typeof frameSortBy, 'asc' | 'desc'];
                                setFrameSortBy(field);
                                setFrameSortDir(dir);
                              }}
                            >
                              <option value="ten_gong_asc">Tên A→Z</option>
                              <option value="ten_gong_desc">Tên Z→A</option>
                              <option value="gia_ban_asc">Giá bán tăng</option>
                              <option value="gia_ban_desc">Giá bán giảm</option>
                              <option value="gia_nhap_asc">Giá nhập tăng</option>
                              <option value="gia_nhap_desc">Giá nhập giảm</option>
                              <option value="ton_kho_asc">Tồn kho tăng</option>
                              <option value="ton_kho_desc">Tồn kho giảm</option>
                            </select>
                          </div>
                        </CardTitle>
                      </CardHeader>

                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b bg-gray-50 text-left text-gray-500">
                                <th className="p-2 sm:p-3 font-medium">Tên gọng</th>
                                <th className="p-2 sm:p-3 font-medium hidden sm:table-cell">Mã</th>
                                <th className="p-2 sm:p-3 font-medium hidden md:table-cell">Màu / Kích cỡ</th>
                                <th className="p-2 sm:p-3 font-medium text-right">Giá nhập</th>
                                <th className="p-2 sm:p-3 font-medium text-right">Giá bán</th>
                                <th className="p-2 sm:p-3 font-medium text-center">Tồn kho</th>
                                <th className="p-2 sm:p-3 font-medium text-center">Trạng thái</th>
                                <th className="p-2 sm:p-3 font-medium text-center">Thao tác</th>
                              </tr>
                            </thead>
                            <tbody>
                              {visibleFrames.length === 0 ? (
                                <tr>
                                  <td colSpan={8} className="p-8 text-center text-gray-400">
                                    Chưa có dữ liệu gọng phù hợp bộ lọc
                                  </td>
                                </tr>
                              ) : (
                                visibleFrames.map((frame) => {
                                  const tonKho = frame.ton_kho ?? 0;
                                  const mucMin = frame.muc_ton_can_co ?? 2;
                                  const trangThai = tonKho <= 0 ? 'HET' : tonKho <= mucMin ? 'SAP_HET' : 'DU';
                                  const isInactive = !frame.trang_thai;

                                  return (
                                    <tr key={frame.id} className={`border-b hover:bg-gray-50 ${isInactive ? 'opacity-50 bg-gray-50' : ''}`}>
                                      <td className="p-2 sm:p-3">
                                        <div className="font-medium">{frame.ten_gong}</div>
                                        {frame.chat_lieu && <div className="text-xs text-gray-400">{frame.chat_lieu}</div>}
                                        {frame.NhaCungCap && <div className="text-xs text-gray-400 sm:hidden">NCC: {frame.NhaCungCap.ten}</div>}
                                      </td>
                                      <td className="p-2 sm:p-3 font-mono text-xs text-gray-500 hidden sm:table-cell">{frame.ma_gong || '-'}</td>
                                      <td className="p-2 sm:p-3 text-xs text-gray-500 hidden md:table-cell">
                                        {[frame.mau_sac, frame.kich_co].filter(Boolean).join(' / ') || '-'}
                                      </td>
                                      <td className="p-2 sm:p-3 text-right text-xs">{(frame.gia_nhap || 0).toLocaleString('vi-VN')}</td>
                                      <td className="p-2 sm:p-3 text-right text-xs font-medium">{(frame.gia_ban || 0).toLocaleString('vi-VN')}</td>
                                      <td className="p-2 sm:p-3 text-center font-bold">{tonKho}</td>
                                      <td className="p-2 sm:p-3 text-center">
                                        <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${trangThaiColor(trangThai)}`}>
                                          {trangThaiLabel(trangThai)}
                                        </span>
                                      </td>
                                      <td className="p-1.5 sm:p-3 text-center">
                                        {!isInactive && (
                                          <button
                                            onClick={() => {
                                              setSelectedFrame(frame);
                                              setShowFrameImport(true);
                                            }}
                                            className="p-1 sm:p-1.5 rounded-lg hover:bg-green-100 text-green-600"
                                            title="Nhập kho"
                                          >
                                            <ArrowDownToLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                          </button>
                                        )}
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

                {activeTab === 'catalog' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-lg">
                        <div className="flex items-center gap-2">
                          <Frame className="w-5 h-5" />
                          Danh mục gọng ({filteredCatalog.length})
                        </div>
                        <div className="flex flex-wrap gap-2 ml-auto w-full sm:w-auto">
                          <div className="relative flex-1 sm:flex-none">
                            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            <Input
                              placeholder="Tìm gọng theo tên, mã, màu, NCC..."
                              value={catalogSearch}
                              onChange={(e) => setCatalogSearch(e.target.value)}
                              className="pl-8 h-9 text-sm w-full sm:w-56"
                            />
                          </div>
                          <Button size="sm" onClick={openCreateCatalog}>
                            <Frame className="w-4 h-4 mr-1" /> Thêm gọng
                          </Button>
                        </div>
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50 text-left text-gray-500">
                              <th className="p-2 sm:p-3 font-medium">Tên gọng</th>
                              <th className="p-2 sm:p-3 font-medium">Mã</th>
                              <th className="p-2 sm:p-3 font-medium text-right">Giá nhập</th>
                              <th className="p-2 sm:p-3 font-medium text-right">Giá bán</th>
                              <th className="p-2 sm:p-3 font-medium text-center">Tồn tối thiểu</th>
                              <th className="p-2 sm:p-3 font-medium">NCC</th>
                              <th className="p-2 sm:p-3 font-medium text-center">Trạng thái</th>
                              <th className="p-2 sm:p-3 font-medium text-right">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {filteredCatalog.length === 0 ? (
                              <tr>
                                <td colSpan={8} className="p-8 text-center text-gray-400">
                                  Chưa có dữ liệu danh mục gọng
                                </td>
                              </tr>
                            ) : (
                              pagedCatalog.map((item) => (
                                <tr key={item.id} className={`border-b hover:bg-gray-50 ${!item.trang_thai ? 'bg-gray-50 opacity-60' : ''}`}>
                                  <td className="p-2 sm:p-3 font-medium">{item.ten_gong}</td>
                                  <td className="p-2 sm:p-3 text-gray-500">{item.ma_gong || '-'}</td>
                                  <td className="p-2 sm:p-3 text-right">{(item.gia_nhap || 0).toLocaleString('vi-VN')}</td>
                                  <td className="p-2 sm:p-3 text-right font-medium">{(item.gia_ban || 0).toLocaleString('vi-VN')}</td>
                                  <td className="p-2 sm:p-3 text-center">{item.muc_ton_can_co ?? 2}</td>
                                  <td className="p-2 sm:p-3">{item.NhaCungCap?.ten || '-'}</td>
                                  <td className="p-2 sm:p-3 text-center">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${item.trang_thai ? 'bg-green-100 text-green-700' : 'bg-gray-200 text-gray-700'}`}>
                                      {item.trang_thai ? 'Đang kinh doanh' : 'Ngừng kinh doanh'}
                                    </span>
                                  </td>
                                  <td className="p-2 sm:p-3 text-right">
                                    <div className="flex justify-end gap-1">
                                      {item.trang_thai && (
                                        <>
                                          <Button size="sm" variant="outline" onClick={() => openEditCatalog(item)}>Sửa</Button>
                                          <Button
                                            size="sm"
                                            variant="outline"
                                            className="text-red-600 hover:text-red-700"
                                            onClick={() => handleDeleteCatalog(item)}
                                          >
                                            Xóa
                                          </Button>
                                        </>
                                      )}
                                    </div>
                                  </td>
                                </tr>
                              ))
                            )}
                          </tbody>
                        </table>
                      </div>

                      {filteredCatalog.length > 0 && (
                        <div className="flex items-center justify-between pt-3 text-sm text-gray-500">
                          <span>
                            Hiển thị {(safeCatalogPage - 1) * CATALOG_PAGE_SIZE + 1}-
                            {Math.min(safeCatalogPage * CATALOG_PAGE_SIZE, filteredCatalog.length)} / {filteredCatalog.length}
                          </span>
                          <div className="flex items-center gap-2">
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={safeCatalogPage <= 1}
                              onClick={() => setCatalogPage((p) => Math.max(1, p - 1))}
                            >
                              Trước
                            </Button>
                            <span>Trang {safeCatalogPage}/{totalCatalogPages}</span>
                            <Button
                              size="sm"
                              variant="outline"
                              disabled={safeCatalogPage >= totalCatalogPages}
                              onClick={() => setCatalogPage((p) => Math.min(totalCatalogPages, p + 1))}
                            >
                              Sau
                            </Button>
                          </div>
                        </div>
                      )}
                    </CardContent>
                  </Card>
                )}

                {canInventory && activeTab === 'import' && (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2 text-lg">
                        <History className="w-5 h-5" />
                        Lịch sử nhập kho gọng ({importHistory.length})
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      {importHistory.length === 0 ? (
                        <p className="text-center py-8 text-gray-400">Chưa có lịch sử nhập kho gọng</p>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-gray-500">
                                <th className="py-2 pr-4">Ngày</th>
                                <th className="py-2 pr-4">Gọng</th>
                                <th className="py-2 pr-4">Mã</th>
                                <th className="py-2 pr-4 text-right">SL</th>
                                <th className="py-2 pr-4 text-right">Đơn giá</th>
                                <th className="py-2 pr-4 text-right">Thành tiền</th>
                                <th className="py-2 pr-4">NCC</th>
                                <th className="py-2">Ghi chú</th>
                              </tr>
                            </thead>
                            <tbody>
                              {importHistory.map((record) => (
                                <tr key={record.id} className="border-b last:border-0">
                                  <td className="py-2 pr-4">{formatDate(record.ngay_nhap)}</td>
                                  <td className="py-2 pr-4 font-medium">{record.GongKinh?.ten_gong || `#${record.gong_kinh_id}`}</td>
                                  <td className="py-2 pr-4 text-gray-500">{record.GongKinh?.ma_gong || '-'}</td>
                                  <td className="py-2 pr-4 text-right font-bold">{record.so_luong}</td>
                                  <td className="py-2 pr-4 text-right">{(record.don_gia || 0).toLocaleString('vi-VN')}</td>
                                  <td className="py-2 pr-4 text-right">{((record.so_luong || 0) * (record.don_gia || 0)).toLocaleString('vi-VN')}</td>
                                  <td className="py-2 pr-4 text-gray-500">{record.NhaCungCap?.ten || '-'}</td>
                                  <td className="py-2 text-gray-500">{record.ghi_chu || '-'}</td>
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

            <Dialog
              open={showCatalogDialog}
              onOpenChange={(open) => {
                setShowCatalogDialog(open);
                if (!open) resetCatalogForm();
              }}
            >
              <DialogContent className="max-w-2xl">
                <DialogHeader>
                  <DialogTitle>{editingCatalog ? 'Sửa gọng kính' : 'Thêm gọng kính'}</DialogTitle>
                </DialogHeader>

                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Tên gọng *</Label>
                      <Input
                        value={catalogForm.ten_gong}
                        onChange={(e) => setCatalogForm({ ...catalogForm, ten_gong: e.target.value })}
                        placeholder="VD: Gọng Titan siêu nhẹ"
                      />
                    </div>
                    <div>
                      <Label>Mã gọng</Label>
                      <Input
                        value={catalogForm.ma_gong}
                        onChange={(e) => setCatalogForm({ ...catalogForm, ma_gong: e.target.value })}
                        placeholder="VD: GK-001"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label>Màu sắc</Label>
                      <Input
                        value={catalogForm.mau_sac}
                        onChange={(e) => setCatalogForm({ ...catalogForm, mau_sac: e.target.value })}
                        placeholder="Đen"
                      />
                    </div>
                    <div>
                      <Label>Kích cỡ</Label>
                      <Input
                        value={catalogForm.kich_co}
                        onChange={(e) => setCatalogForm({ ...catalogForm, kich_co: e.target.value })}
                        placeholder="52-18-140"
                      />
                    </div>
                    <div>
                      <Label>Chất liệu</Label>
                      <Input
                        value={catalogForm.chat_lieu}
                        onChange={(e) => setCatalogForm({ ...catalogForm, chat_lieu: e.target.value })}
                        placeholder="Titan"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div>
                      <Label>Giá nhập</Label>
                      <Input
                        type="number"
                        min="0"
                        value={catalogForm.gia_nhap}
                        onChange={(e) => setCatalogForm({ ...catalogForm, gia_nhap: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Giá bán</Label>
                      <Input
                        type="number"
                        min="0"
                        value={catalogForm.gia_ban}
                        onChange={(e) => setCatalogForm({ ...catalogForm, gia_ban: e.target.value })}
                        placeholder="0"
                      />
                    </div>
                    <div>
                      <Label>Tồn tối thiểu</Label>
                      <Input
                        type="number"
                        min="0"
                        value={catalogForm.muc_ton_can_co}
                        onChange={(e) => setCatalogForm({ ...catalogForm, muc_ton_can_co: e.target.value })}
                        placeholder="2"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <Label>Hãng sản xuất</Label>
                      <Input
                        value={catalogForm.hang_san_xuat}
                        onChange={(e) => setCatalogForm({ ...catalogForm, hang_san_xuat: e.target.value })}
                        placeholder="VD: Ray-Ban"
                      />
                    </div>
                    <div>
                      <Label>Nhà cung cấp</Label>
                      <select
                        className="w-full border rounded-lg px-3 py-2 mt-1"
                        value={catalogForm.nha_cung_cap_id}
                        onChange={(e) => setCatalogForm({ ...catalogForm, nha_cung_cap_id: e.target.value })}
                      >
                        <option value="">-- Chọn NCC --</option>
                        {nhaCungCaps.map((ncc) => (
                          <option key={ncc.id} value={ncc.id}>{ncc.ten}</option>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div>
                    <Label>Mô tả</Label>
                    <Input
                      value={catalogForm.mo_ta}
                      onChange={(e) => setCatalogForm({ ...catalogForm, mo_ta: e.target.value })}
                      placeholder="Mô tả thêm..."
                    />
                  </div>

                  {editingCatalog && (
                    <div>
                      <Label>Tồn kho hiện tại</Label>
                      <Input type="number" value={editingCatalog.ton_kho ?? 0} disabled className="bg-gray-50" />
                      <p className="text-xs text-gray-500 mt-1">Chỉ thay đổi qua Nhập kho gọng</p>
                    </div>
                  )}

                  {editingCatalog?.id ? (
                    <GongKinhMediaPanel gongKinhId={editingCatalog.id} className="mt-2" />
                  ) : null}
                </div>

                <DialogFooter>
                  <Button variant="outline" onClick={() => { setShowCatalogDialog(false); resetCatalogForm(); }}>
                    Hủy
                  </Button>
                  <Button onClick={handleSaveCatalog}>{editingCatalog ? 'Lưu thay đổi' : 'Thêm gọng'}</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>

            <Dialog open={showFrameImport} onOpenChange={(open) => { setShowFrameImport(open); if (!open) setSelectedFrame(null); }}>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Nhập kho gọng kính</DialogTitle>
                </DialogHeader>
                {selectedFrame && (
                  <div className="space-y-4">
                    <div className="bg-blue-50 rounded-lg p-3 text-sm">
                      <p className="font-medium">{selectedFrame.ten_gong}</p>
                      {selectedFrame.ma_gong && <p className="text-blue-600 text-xs">Mã: {selectedFrame.ma_gong}</p>}
                      <p className="text-gray-500">Tồn hiện tại: <span className="font-bold">{selectedFrame.ton_kho ?? 0}</span></p>
                    </div>
                    <div className="grid grid-cols-2 gap-3">
                      <div>
                        <Label>Số lượng nhập *</Label>
                        <Input
                          type="number"
                          min="1"
                          value={frameImportForm.so_luong}
                          onChange={(e) => setFrameImportForm({ ...frameImportForm, so_luong: e.target.value })}
                          placeholder="1"
                        />
                      </div>
                      <div>
                        <Label>Đơn giá nhập / giá mua (VND)</Label>
                        <Input
                          type="number"
                          value={frameImportForm.don_gia}
                          onChange={(e) => setFrameImportForm({ ...frameImportForm, don_gia: e.target.value })}
                          placeholder="0"
                        />
                        <p className="text-xs text-gray-500 mt-1">Giá mua lần này. Giá bán sửa ở Danh mục gọng.</p>
                      </div>
                    </div>
                    <div>
                      <Label>Ghi chú</Label>
                      <Input
                        value={frameImportForm.ghi_chu}
                        onChange={(e) => setFrameImportForm({ ...frameImportForm, ghi_chu: e.target.value })}
                        placeholder="Nhập từ NCC..."
                      />
                    </div>
                  </div>
                )}
                <DialogFooter>
                  <Button variant="outline" onClick={() => setShowFrameImport(false)}>Hủy</Button>
                  <Button onClick={handleFrameImport} disabled={!frameImportForm.so_luong}>Nhập kho</Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </main>
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
