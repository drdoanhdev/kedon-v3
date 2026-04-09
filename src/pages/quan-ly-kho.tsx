import React, { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, AlertTriangle, Package, Eye, Frame, ArrowDownToLine, ArrowUpFromLine, Ban, Truck, RefreshCw, Pencil, Upload, Download, ClipboardCopy } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import axios from 'axios';
import * as XLSX from 'xlsx';

// ============================================
// INTERFACES
// ============================================
interface LensStock {
  id: number;
  hang_trong_id: number;
  sph: number;
  cyl: number;
  add_power: number | null;
  mat: string | null;
  ton_dau_ky: number;
  ton_hien_tai: number;
  muc_ton_can_co: number;
  trang_thai_ton: string;
  can_nhap_them: number;
  HangTrong?: { id: number; ten_hang: string; loai_trong: string; kieu_quan_ly: string; gia_nhap: number; gia_ban: number };
}

interface LensOrder {
  id: number;
  don_kinh_id: number;
  hang_trong_id: number;
  so_luong_mieng: number;
  sph: number;
  cyl: number;
  add_power: number | null;
  mat: string | null;
  trang_thai: string;
  ngay_dat: string | null;
  ngay_nhan: string | null;
  ghi_chu: string | null;
  created_at: string;
  HangTrong?: { ten_hang: string; loai_trong: string };
  DonKinh?: { id: number; BenhNhan?: { ten: string } };
  NhaCungCap?: { ten: string };
}

interface HangTrong {
  id: number;
  ten_hang: string;
  loai_trong: string;
  kieu_quan_ly: string;
  gia_nhap: number;
  gia_ban: number;
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
  pending_lens_orders: number;
  summary: { het: number; sap_het: number; total: number };
}

// ============================================
// COMPONENT
// ============================================
export default function QuanLyKho() {
  const { confirm } = useConfirm();
  const [activeTab, setActiveTab] = useState<'overview' | 'lens_stock' | 'lens_order' | 'import'>('overview');

  // Data states
  const [alertData, setAlertData] = useState<AlertSummary | null>(null);
  const [lensStocks, setLensStocks] = useState<LensStock[]>([]);
  const [lensOrders, setLensOrders] = useState<LensOrder[]>([]);
  const [hangTrongs, setHangTrongs] = useState<HangTrong[]>([]);
  const [loading, setLoading] = useState(true);

  // Dialog states
  const [showAddStock, setShowAddStock] = useState(false);
  const [showImport, setShowImport] = useState(false);
  const [showDamaged, setShowDamaged] = useState(false);
  const [selectedStock, setSelectedStock] = useState<LensStock | null>(null);

  // Form states
  const [newStock, setNewStock] = useState({ hang_trong_id: '', sph: '', cyl: '0', add_power: '', mat: '', ton_dau_ky: '0', muc_ton_can_co: '10' });
  const [importForm, setImportForm] = useState({ so_luong: '', don_gia: '', ghi_chu: '' });
  const [damagedForm, setDamagedForm] = useState({ so_luong: '', ly_do: 'cat_vo', ghi_chu: '' });

  // Filter
  const [stockFilter, setStockFilter] = useState<string>('all'); // all, HET, SAP_HET, DU
  const [hangTrongFilter, setHangTrongFilter] = useState<string>('all'); // all or hang_trong_id

  // Edit stock dialog
  const [showEditStock, setShowEditStock] = useState(false);
  const [editStockForm, setEditStockForm] = useState({ hang_trong_id: '', sph: '', cyl: '', add_power: '', mat: '', ton_dau_ky: '', muc_ton_can_co: '' });

  // Show inactive brands
  const [showInactive, setShowInactive] = useState(false);

  // Excel import
  const [showImportExcel, setShowImportExcel] = useState(false);
  const [importRows, setImportRows] = useState<any[]>([]);
  const [importFileName, setImportFileName] = useState('');
  const [importing, setImporting] = useState(false);

  // Copy text popup
  const [showCopyText, setShowCopyText] = useState(false);
  const [copyTextContent, setCopyTextContent] = useState('');
  const [copyTextTitle, setCopyTextTitle] = useState('');

  // ============================================
  // FETCH DATA
  // ============================================
  const fetchAlerts = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/inventory/low-stock?type=kinh');
      setAlertData(data);
    } catch {}
  }, []);

  const fetchLensStocks = useCallback(async () => {
    try {
      const params: any = {};
      if (stockFilter !== 'all') params.trang_thai_ton = stockFilter;
      if (hangTrongFilter !== 'all') params.hang_trong_id = hangTrongFilter;
      if (showInactive) params.show_inactive = '1';
      const { data } = await axios.get('/api/inventory/lens-stock', { params });
      setLensStocks(data);
    } catch {}
  }, [stockFilter, hangTrongFilter, showInactive]);

  const fetchLensOrders = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/inventory/lens-order');
      setLensOrders(data);
    } catch {}
  }, []);

  const fetchHangTrongs = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/hang-trong');
      setHangTrongs(data);
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchAlerts(), fetchLensStocks(), fetchLensOrders(), fetchHangTrongs()])
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { fetchLensStocks(); }, [stockFilter, hangTrongFilter, showInactive]);

  // ============================================
  // ACTIONS
  // ============================================
  const handleAddStock = async () => {
    try {
      await axios.post('/api/inventory/lens-stock', newStock);
      toast.success('Đã thêm dòng kho mới');
      setShowAddStock(false);
      setNewStock({ hang_trong_id: '', sph: '', cyl: '0', add_power: '', mat: '', ton_dau_ky: '0', muc_ton_can_co: '10' });
      fetchLensStocks();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi thêm kho');
    }
  };

  const handleImport = async () => {
    if (!selectedStock) return;
    try {
      await axios.post('/api/inventory/lens-import', {
        lens_stock_id: selectedStock.id,
        ...importForm,
      });
      toast.success(`Đã nhập ${importForm.so_luong} miếng`);
      setShowImport(false);
      setImportForm({ so_luong: '', don_gia: '', ghi_chu: '' });
      setSelectedStock(null);
      fetchLensStocks();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi nhập kho');
    }
  };

  const handleDamaged = async () => {
    if (!selectedStock) return;
    try {
      await axios.post('/api/inventory/lens-damaged', {
        lens_stock_id: selectedStock.id,
        ...damagedForm,
      });
      toast.success('Đã ghi nhận xuất hỏng');
      setShowDamaged(false);
      setDamagedForm({ so_luong: '', ly_do: 'cat_vo', ghi_chu: '' });
      setSelectedStock(null);
      fetchLensStocks();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi xuất hỏng');
    }
  };

  const handleUpdateOrderStatus = async (ids: number[], trang_thai: string) => {
    try {
      await axios.put('/api/inventory/lens-order', { ids, trang_thai });
      toast.success(trang_thai === 'da_dat' ? 'Đã đánh dấu đã đặt' : 'Đã đánh dấu đã nhận');
      fetchLensOrders();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi cập nhật');
    }
  };

  const handleEditStock = async () => {
    if (!selectedStock) return;
    try {
      await axios.put('/api/inventory/lens-stock', {
        id: selectedStock.id,
        hang_trong_id: editStockForm.hang_trong_id,
        sph: editStockForm.sph,
        cyl: editStockForm.cyl,
        add_power: editStockForm.add_power || null,
        mat: editStockForm.add_power ? editStockForm.mat || null : null,
        ton_dau_ky: editStockForm.ton_dau_ky,
        muc_ton_can_co: editStockForm.muc_ton_can_co,
      });
      toast.success('Đã cập nhật thông số kho');
      setShowEditStock(false);
      setSelectedStock(null);
      fetchLensStocks();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi cập nhật');
    }
  };

  const handleDeleteStock = async () => {
    if (!selectedStock) return;
    if (!await confirm(`Xác nhận xóa tổ hợp ${selectedStock.HangTrong?.ten_hang} (${selectedStock.sph}/${selectedStock.cyl}) khỏi kho?`)) return;
    try {
      await axios.delete(`/api/inventory/lens-stock?id=${selectedStock.id}`);
      toast.success('Đã xóa dòng kho');
      setShowEditStock(false);
      setSelectedStock(null);
      fetchLensStocks();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi xóa');
    }
  };

  // ============================================
  // EXCEL IMPORT
  // ============================================
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setImportFileName(file.name);
    const reader = new FileReader();
    reader.onload = (evt) => {
      const data = new Uint8Array(evt.target?.result as ArrayBuffer);
      const workbook = XLSX.read(data, { type: 'array' });
      const sheet = workbook.Sheets[workbook.SheetNames[0]];
      const json: any[] = XLSX.utils.sheet_to_json(sheet);
      // Map Vietnamese/English headers — "Plano"/"PL" = 0
      const parsePower = (v: any): number => {
        if (v === undefined || v === null || v === '') return NaN;
        const s = String(v).trim().toLowerCase();
        if (s === 'plano' || s === 'pl') return 0;
        return parseFloat(s);
      };
      const mapped = json.map(row => {
        const r: any = {};
        r.ten_hang = row['Hãng tròng'] || row['ten_hang'] || row['Tên hãng'] || '';
        r.sph = parsePower(row['SPH'] ?? row['sph']);
        r.cyl = parsePower(row['CYL'] ?? row['cyl'] ?? '0');
        if (isNaN(r.cyl)) r.cyl = 0;
        const addRaw = row['ADD'] ?? row['add_power'];
        r.add_power = (addRaw !== undefined && addRaw !== null && addRaw !== '') ? parsePower(addRaw) : null;
        if (r.add_power !== null && isNaN(r.add_power)) r.add_power = null;
        // Mắt: L/R/trai/phai cho đa tròng
        const matRaw = String(row['Mắt'] ?? row['mat'] ?? row['Eye'] ?? '').trim().toLowerCase();
        if (matRaw === 'l' || matRaw === 'trai' || matRaw === 'left') r.mat = 'trai';
        else if (matRaw === 'r' || matRaw === 'phai' || matRaw === 'right') r.mat = 'phai';
        else r.mat = null;
        r.ton_dau_ky = parseInt(row['Tồn đầu kỳ'] ?? row['ton_dau_ky'] ?? '0') || 0;
        r.muc_ton_can_co = parseInt(row['Tồn cần có'] ?? row['Tồn mục tiêu'] ?? row['Nhập gợi ý'] ?? row['muc_ton_can_co'] ?? row['muc_nhap_goi_y'] ?? '10') || 10;
        return r;
      }).filter(r => r.ten_hang && !isNaN(r.sph));
      setImportRows(mapped);
    };
    reader.readAsArrayBuffer(file);
    // Reset input so same file can be re-selected
    e.target.value = '';
  };

  const handleImportExcel = async () => {
    if (importRows.length === 0) return;
    setImporting(true);
    try {
      const { data } = await axios.post('/api/inventory/lens-stock-import', { rows: importRows });
      const msg = `Thành công: ${data.success}, bỏ qua: ${data.skipped}`;
      if (data.errors?.length > 0) {
        toast(msg + `\n${data.errors.slice(0, 5).join('\n')}`, { duration: 6000 });
      } else {
        toast.success(msg);
      }
      setShowImportExcel(false);
      setImportRows([]);
      setImportFileName('');
      fetchLensStocks();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi nhập Excel');
    } finally {
      setImporting(false);
    }
  };

  const downloadTemplate = () => {
    const templateData = [
      { 'Hãng tròng': 'Essilor', 'SPH': -1.00, 'CYL': 0, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 10, 'Tồn cần có': 10 },
      { 'Hãng tròng': 'Hoya', 'SPH': -2.50, 'CYL': -0.75, 'ADD': 1.50, 'Mắt': 'L', 'Tồn đầu kỳ': 5, 'Tồn cần có': 10 },
      { 'Hãng tròng': 'Essilor', 'SPH': 'Plano', 'CYL': 'Plano', 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 20, 'Tồn cần có': 20 },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Kho tròng');
    XLSX.writeFile(wb, 'mau_nhap_kho_trong.xlsx');
  };

  // ============================================
  // HELPERS
  // ============================================
  const formatSph = (sph: number) => sph === 0 ? 'Plano' : `${sph >= 0 ? '+' : ''}${sph.toFixed(2)}`;

  const formatDoText = (sph: number, cyl: number, add_power: number | null) => {
    let s = formatSph(sph);
    if (cyl !== 0) s += `/${cyl >= 0 ? '+' : ''}${cyl.toFixed(2)}`;
    if (add_power != null) s += ` ADD ${add_power >= 0 ? '+' : ''}${add_power.toFixed(2)}`;
    return s;
  };

  const buildStockNeedText = () => {
    const need = lensStocks.filter(s => s.can_nhap_them > 0);
    if (need.length === 0) return '';
    // Group by ten_hang
    const grouped = new Map<string, { do: string; sl: number; mat: string | null; isProgressive: boolean }[]>();
    for (const s of need) {
      const name = s.HangTrong?.ten_hang || 'Không rõ';
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push({ do: formatDoText(s.sph, s.cyl, s.add_power), sl: s.can_nhap_them, mat: s.mat, isProgressive: s.add_power != null });
    }
    const lines: string[] = [];
    for (const [name, items] of grouped) {
      lines.push(`- ${name}:`);
      const progressive = items.filter(i => i.isProgressive);
      const single = items.filter(i => !i.isProgressive);

      for (const i of progressive) {
        const eyeLabel = i.mat === 'trai' ? '-L-' : i.mat === 'phai' ? '-R-' : '';
        lines.push(`${i.sl} miếng ${eyeLabel ? eyeLabel + ' ' : ''}${i.do}`);
      }

      if (single.length > 0) {
        const merged = new Map<string, number>();
        for (const i of single) {
          merged.set(i.do, (merged.get(i.do) || 0) + i.sl);
        }
        for (const [d, sl] of merged) {
          lines.push(`${sl} miếng ${d}`);
        }
      }
    }
    return lines.join('\n');
  };

  const buildOrderNeedText = () => {
    const pending = lensOrders.filter(o => o.trang_thai === 'cho_dat' || o.trang_thai === 'da_dat');
    if (pending.length === 0) return '';
    const grouped = new Map<string, { do: string; sl: number; mat: string | null; isProgressive: boolean }[]>();
    for (const o of pending) {
      const name = o.HangTrong?.ten_hang || 'Không rõ';
      if (!grouped.has(name)) grouped.set(name, []);
      grouped.get(name)!.push({
        do: formatDoText(o.sph, o.cyl, o.add_power),
        sl: o.so_luong_mieng,
        mat: o.mat,
        isProgressive: o.add_power != null,
      });
    }
    const lines: string[] = [];
    for (const [name, items] of grouped) {
      lines.push(`- ${name}:`);
      // Progressive: keep L/R per line, don't merge
      const progressive = items.filter(i => i.isProgressive);
      const single = items.filter(i => !i.isProgressive);

      for (const i of progressive) {
        const eyeLabel = i.mat === 'trai' ? '-L-' : i.mat === 'phai' ? '-R-' : '';
        lines.push(`${i.sl} miếng ${eyeLabel ? eyeLabel + ' ' : ''}${i.do}`);
      }

      // Single vision: merge same degree
      if (single.length > 0) {
        const merged = new Map<string, number>();
        for (const i of single) {
          merged.set(i.do, (merged.get(i.do) || 0) + i.sl);
        }
        for (const [d, sl] of merged) {
          lines.push(`${sl} miếng ${d}`);
        }
      }
    }
    return lines.join('\n');
  };

  const openCopyPopup = (text: string, title: string) => {
    setCopyTextContent(text);
    setCopyTextTitle(title);
    setShowCopyText(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text).then(() => {
      toast.success('Đã copy vào clipboard');
    }).catch(() => {
      toast.error('Không thể copy');
    });
  };

  const formatDo = (sph: number, cyl: number, add_power: number | null) => {
    let s = formatSph(sph);
    if (cyl !== 0) s += ` / ${cyl >= 0 ? '+' : ''}${cyl.toFixed(2)}`;
    if (add_power != null) s += ` ADD:${add_power >= 0 ? '+' : ''}${add_power.toFixed(2)}`;
    return s;
  };

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

  const orderStatusColor = (tt: string) => {
    if (tt === 'cho_dat') return 'bg-orange-100 text-orange-800';
    if (tt === 'da_dat') return 'bg-blue-100 text-blue-800';
    if (tt === 'da_nhan') return 'bg-green-100 text-green-800';
    return 'bg-gray-100 text-gray-800';
  };

  const orderStatusLabel = (tt: string) => {
    if (tt === 'cho_dat') return 'Chờ đặt';
    if (tt === 'da_dat') return 'Đã đặt';
    if (tt === 'da_nhan') return 'Đã nhận';
    if (tt === 'huy') return 'Hủy';
    return tt;
  };

  // ============================================
  // RENDER
  // ============================================
  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">
        <main className="max-w-7xl mx-auto py-4 sm:py-6 px-3 sm:px-4">
          <div className="flex items-center justify-between mb-4 sm:mb-6">
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-gray-900">Quản lý kho kính</h1>
              <p className="text-gray-500 text-xs sm:text-sm mt-0.5 sm:mt-1">Tồn kho tròng kính, gọng kính</p>
            </div>
            <Button onClick={() => { fetchAlerts(); fetchLensStocks(); fetchLensOrders(); }} variant="outline" size="sm">
              <RefreshCw className="w-4 h-4 mr-1" /><span className="hidden sm:inline">Làm mới</span>
            </Button>
          </div>

          {/* Tabs */}
          <div className="grid grid-cols-3 sm:flex gap-1 mb-4 sm:mb-6 bg-white rounded-lg p-1 shadow-sm border">
            {[
              { key: 'overview', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: <Package className="w-4 h-4" /> },
              { key: 'lens_stock', label: 'Kho tròng kính', mobileLabel: 'Kho tròng', icon: <Eye className="w-4 h-4" /> },
              { key: 'lens_order', label: 'Tròng cần đặt', mobileLabel: 'Cần đặt', icon: <Truck className="w-4 h-4" /> },
            ].map((tab) => (
              <button
                key={tab.key}
                onClick={() => setActiveTab(tab.key as any)}
                className={`flex items-center justify-center gap-1 sm:gap-2 px-2 sm:px-4 py-2 rounded-md text-xs sm:text-sm font-medium transition ${
                  activeTab === tab.key ? 'bg-blue-600 text-white' : 'text-gray-600 hover:bg-gray-100'
                }`}
              >
                {tab.icon}
                <span className="sm:hidden">{tab.mobileLabel}</span>
                <span className="hidden sm:inline">{tab.label}</span>
                {tab.key === 'lens_order' && lensOrders.length > 0 && (
                  <span className="ml-1 px-1.5 py-0.5 text-xs rounded-full bg-orange-500 text-white">{lensOrders.length}</span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-20 text-gray-500">Đang tải dữ liệu kho...</div>
          ) : (
            <>
              {/* ======================== TAB: TỔNG QUAN ======================== */}
              {activeTab === 'overview' && alertData && (
                <div className="space-y-6">
                  {/* Summary Cards */}
                  <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-3xl font-bold text-red-600">{alertData.summary.het}</p>
                        <p className="text-sm text-gray-500 mt-1">Đã hết</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-3xl font-bold text-yellow-600">{alertData.summary.sap_het}</p>
                        <p className="text-sm text-gray-500 mt-1">Sắp hết</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-3xl font-bold text-orange-600">{alertData.pending_lens_orders}</p>
                        <p className="text-sm text-gray-500 mt-1">Tròng chờ đặt</p>
                      </CardContent>
                    </Card>
                    <Card>
                      <CardContent className="pt-6 text-center">
                        <p className="text-3xl font-bold text-blue-600">{lensStocks.length}</p>
                        <p className="text-sm text-gray-500 mt-1">Dòng kho tròng</p>
                      </CardContent>
                    </Card>
                  </div>

                  {/* Alert List */}
                  {alertData.alerts.length > 0 ? (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <AlertTriangle className="w-5 h-5 text-yellow-500" />
                          Cảnh báo tồn kho ({alertData.summary.total})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="w-full text-sm">
                            <thead>
                              <tr className="border-b text-left text-gray-500">
                                <th className="pb-2 font-medium">Loại</th>
                                <th className="pb-2 font-medium">Tên</th>
                                <th className="pb-2 font-medium">Chi tiết</th>
                                <th className="pb-2 font-medium text-center">Tồn</th>
                                <th className="pb-2 font-medium text-center">Cần nhập</th>
                                <th className="pb-2 font-medium text-center">Trạng thái</th>
                              </tr>
                            </thead>
                            <tbody>
                              {alertData.alerts.map((a, i) => (
                                <tr key={i} className="border-b last:border-0">
                                  <td className="py-2">
                                    <span className="text-xs bg-gray-100 px-2 py-0.5 rounded">
                                      {a.loai_hang === 'trong_kinh' ? 'Tròng' : a.loai_hang === 'thuoc' ? 'Thuốc' : 'Gọng'}
                                    </span>
                                  </td>
                                  <td className="py-2 font-medium">{a.ten}</td>
                                  <td className="py-2 text-gray-500 font-mono text-xs">{a.chi_tiet}</td>
                                  <td className="py-2 text-center font-bold">{a.ton_kho}</td>
                                  <td className="py-2 text-center font-bold text-blue-600">{a.can_nhap}</td>
                                  <td className="py-2 text-center">
                                    <span className={`text-xs px-2 py-0.5 rounded-full ${trangThaiColor(a.trang_thai)}`}>
                                      {trangThaiLabel(a.trang_thai)}
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
                        ✅ Tất cả tròng và gọng đều đủ tồn kho
                      </CardContent>
                    </Card>
                  )}
                </div>
              )}

              {/* ======================== TAB: KHO TRÒNG KÍNH ======================== */}
              {activeTab === 'lens_stock' && (
                <div className="space-y-3 sm:space-y-4">
                  {/* Filters & Actions */}
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 sm:gap-3">
                    <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0">
                      {['all', 'HET', 'SAP_HET', 'DU'].map(f => (
                        <button
                          key={f}
                          onClick={() => setStockFilter(f)}
                          className={`px-2.5 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition whitespace-nowrap ${
                            stockFilter === f ? 'bg-blue-600 text-white' : 'bg-white text-gray-600 border hover:bg-gray-50'
                          }`}
                        >
                          {f === 'all' ? 'Tất cả' : trangThaiLabel(f)}
                        </button>
                      ))}
                      <select
                        className="border rounded-lg px-2 sm:px-3 py-1.5 text-xs sm:text-sm bg-white min-w-0"
                        value={hangTrongFilter}
                        onChange={e => setHangTrongFilter(e.target.value)}
                      >
                        <option value="all">-- Tất cả tròng --</option>
                        {hangTrongs.map(h => (
                          <option key={h.id} value={h.id}>{h.ten_hang}</option>
                        ))}
                      </select>
                    </div>
                    <div className="flex items-center gap-1.5 sm:gap-2 overflow-x-auto pb-1 sm:pb-0">
                      <button
                        onClick={() => setShowInactive(!showInactive)}
                        className={`px-2 sm:px-3 py-1.5 rounded-lg text-xs sm:text-sm font-medium transition flex items-center gap-1 whitespace-nowrap ${
                          showInactive ? 'bg-gray-700 text-white' : 'bg-white text-gray-500 border hover:bg-gray-50'
                        }`}
                      >
                        <Ban className="w-3 sm:w-3.5 h-3 sm:h-3.5" />
                        <span className="sm:hidden">Ngưng KD</span>
                        <span className="hidden sm:inline">{showInactive ? 'Đang xem ngưng KD' : 'Xem ngưng KD'}</span>
                      </button>
                      <Button onClick={() => setShowAddStock(true)} size="sm" className="text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap">
                        <Plus className="w-3.5 sm:w-4 h-3.5 sm:h-4 mr-0.5 sm:mr-1" />
                        <span className="sm:hidden">Thêm độ</span>
                        <span className="hidden sm:inline">Thêm độ mới</span>
                      </Button>
                      <Button onClick={() => setShowImportExcel(true)} size="sm" variant="outline" className="text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap">
                        <Upload className="w-3.5 sm:w-4 h-3.5 sm:h-4 mr-0.5 sm:mr-1" />
                        <span className="sm:hidden">Excel</span>
                        <span className="hidden sm:inline">Nhập Excel</span>
                      </Button>
                      {lensStocks.some(s => s.can_nhap_them > 0) && (
                        <Button onClick={() => openCopyPopup(buildStockNeedText(), 'Danh sách tròng cần nhập')} size="sm" variant="outline" className="text-xs sm:text-sm h-8 sm:h-9 whitespace-nowrap">
                          <ClipboardCopy className="w-3.5 sm:w-4 h-3.5 sm:h-4 mr-0.5 sm:mr-1" /> Cần nhập
                        </Button>
                      )}
                    </div>
                  </div>

                  <Card>
                    <CardContent className="p-0">
                      <div className="overflow-x-auto">
                        <table className="w-full text-xs sm:text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50 text-left text-gray-500">
                              <th className="p-2 sm:p-3 font-medium"><span className="sm:hidden">Hãng</span><span className="hidden sm:inline">Hãng tròng</span></th>
                              <th className="p-2 sm:p-3 font-medium font-mono">SPH</th>
                              <th className="p-2 sm:p-3 font-medium font-mono">CYL</th>
                              <th className="p-2 sm:p-3 font-medium font-mono">ADD</th>
                              <th className="p-2 sm:p-3 font-medium text-center">Mắt</th>
                              <th className="p-2 sm:p-3 font-medium text-center hidden sm:table-cell">Tồn đầu kỳ</th>
                              <th className="p-2 sm:p-3 font-medium text-center">Tồn</th>
                              <th className="p-2 sm:p-3 font-medium text-center hidden sm:table-cell">Tồn cần có</th>
                              <th className="p-2 sm:p-3 font-medium text-center"><span className="sm:hidden">Nhập</span><span className="hidden sm:inline">Cần nhập</span></th>
                              <th className="p-2 sm:p-3 font-medium text-center"><span className="sm:hidden">TT</span><span className="hidden sm:inline">Trạng thái</span></th>
                              <th className="p-2 sm:p-3 font-medium text-center"><span className="hidden sm:inline">Thao tác</span></th>
                            </tr>
                          </thead>
                          <tbody>
                            {lensStocks.length === 0 ? (
                              <tr><td colSpan={11} className="p-8 text-center text-gray-400">
                                Chưa có dữ liệu kho tròng. Bấm "Thêm độ mới" để bắt đầu.
                              </td></tr>
                            ) : lensStocks.map(stock => {
                              const isInactive = (stock.HangTrong as any)?.trang_thai === false;
                              return (
                              <tr key={stock.id} className={`border-b hover:bg-gray-50 ${isInactive ? 'opacity-50 bg-gray-50' : ''}`}>
                                <td className="p-2 sm:p-3 font-medium text-xs sm:text-sm max-w-[80px] sm:max-w-none truncate">
                                  {stock.HangTrong?.ten_hang}
                                  {isInactive && <><span className="ml-1 text-[10px] bg-gray-200 text-gray-600 px-1 py-0.5 rounded sm:hidden">Ngưng</span><span className="ml-1.5 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded hidden sm:inline">Ngưng KD</span></>}
                                </td>
                                <td className="p-2 sm:p-3 font-mono">{formatSph(stock.sph)}</td>
                                <td className="p-2 sm:p-3 font-mono">{stock.cyl !== 0 ? `${stock.cyl >= 0 ? '+' : ''}${stock.cyl.toFixed(2)}` : '-'}</td>
                                <td className="p-2 sm:p-3 font-mono">{stock.add_power != null ? `${stock.add_power >= 0 ? '+' : ''}${stock.add_power.toFixed(2)}` : '-'}</td>
                                <td className="p-2 sm:p-3 text-center">
                                  {stock.mat === 'trai' ? <span className="text-[10px] sm:text-xs bg-blue-100 text-blue-700 px-1 sm:px-1.5 py-0.5 rounded">L</span>
                                    : stock.mat === 'phai' ? <span className="text-[10px] sm:text-xs bg-green-100 text-green-700 px-1 sm:px-1.5 py-0.5 rounded">R</span>
                                    : <span className="text-gray-300">-</span>}
                                </td>
                                <td className="p-2 sm:p-3 text-center text-gray-500 hidden sm:table-cell">{stock.ton_dau_ky}</td>
                                <td className="p-2 sm:p-3 text-center">
                                  <span className={`font-bold text-base sm:text-lg ${stock.ton_hien_tai <= 0 ? 'text-red-600' : stock.ton_hien_tai < stock.muc_ton_can_co ? 'text-yellow-600' : 'text-green-600'}`}>
                                    {stock.ton_hien_tai}
                                  </span>
                                </td>
                                <td className="p-2 sm:p-3 text-center text-gray-500 hidden sm:table-cell">{stock.muc_ton_can_co}</td>
                                <td className="p-2 sm:p-3 text-center">
                                  {stock.can_nhap_them > 0 ? (
                                    <span className="font-bold text-blue-600">{stock.can_nhap_them}</span>
                                  ) : (
                                    <span className="text-gray-300">-</span>
                                  )}
                                </td>
                                <td className="p-2 sm:p-3 text-center">
                                  <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${trangThaiColor(stock.trang_thai_ton)}`}>
                                    {trangThaiLabel(stock.trang_thai_ton)}
                                  </span>
                                </td>
                                <td className="p-1.5 sm:p-3 text-center">
                                  <div className="flex gap-0.5 sm:gap-1 justify-center">
                                    <button
                                      onClick={() => {
                                        setSelectedStock(stock);
                                        setEditStockForm({
                                          hang_trong_id: String(stock.hang_trong_id),
                                          sph: String(stock.sph),
                                          cyl: String(stock.cyl),
                                          add_power: stock.add_power != null ? String(stock.add_power) : '',
                                          mat: stock.mat || '',
                                          ton_dau_ky: String(stock.ton_dau_ky),
                                          muc_ton_can_co: String(stock.muc_ton_can_co),
                                        });
                                        setShowEditStock(true);
                                      }}
                                      className="p-1 sm:p-1.5 rounded-lg hover:bg-blue-100 text-blue-600" title="Sửa thông số"
                                    >
                                      <Pencil className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </button>
                                    {!isInactive && (
                                    <>
                                    <button
                                      onClick={() => { setSelectedStock(stock); setShowImport(true); }}
                                      className="p-1 sm:p-1.5 rounded-lg hover:bg-green-100 text-green-600" title="Nhập kho"
                                    >
                                      <ArrowDownToLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </button>
                                    <button
                                      onClick={() => { setSelectedStock(stock); setShowDamaged(true); }}
                                      className="p-1 sm:p-1.5 rounded-lg hover:bg-red-100 text-red-600" title="Xuất hỏng"
                                    >
                                      <Ban className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                    </button>
                                    </>
                                    )}
                                  </div>
                                </td>
                              </tr>
                              );
                            })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>
                </div>
              )}

              {/* ======================== TAB: TRÒNG CẦN ĐẶT ======================== */}
              {activeTab === 'lens_order' && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2 text-lg">
                      <Truck className="w-5 h-5" />
                      Tròng cần đặt ({lensOrders.length})
                      {lensOrders.some(o => o.trang_thai === 'cho_dat' || o.trang_thai === 'da_dat') && (
                        <Button onClick={() => openCopyPopup(buildOrderNeedText(), 'Danh sách tròng cần đặt NCC')} size="sm" variant="outline" className="ml-auto">
                          <ClipboardCopy className="w-4 h-4 mr-1" /> Gửi NCC
                        </Button>
                      )}
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {lensOrders.length === 0 ? (
                      <div className="py-12 text-center text-gray-400">
                        Không có tròng nào cần đặt
                      </div>
                    ) : (
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                          <thead>
                            <tr className="border-b bg-gray-50 text-left text-gray-500">
                              <th className="p-3 font-medium">Hãng tròng</th>
                              <th className="p-3 font-medium font-mono">Độ</th>
                              <th className="p-3 font-medium text-center">Mắt</th>
                              <th className="p-3 font-medium text-center">Miếng</th>
                              <th className="p-3 font-medium">Bệnh nhân</th>
                              <th className="p-3 font-medium text-center">Trạng thái</th>
                              <th className="p-3 font-medium">Ngày tạo</th>
                              <th className="p-3 font-medium text-center">Thao tác</th>
                            </tr>
                          </thead>
                          <tbody>
                            {lensOrders.map(order => (
                              <tr key={order.id} className="border-b hover:bg-gray-50">
                                <td className="p-3 font-medium">{order.HangTrong?.ten_hang}</td>
                                <td className="p-3 font-mono text-xs">{formatDo(order.sph, order.cyl, order.add_power)}</td>
                                <td className="p-3 text-center">
                                  {order.mat === 'trai' ? '👁️ T' : order.mat === 'phai' ? '👁️ P' : '-'}
                                </td>
                                <td className="p-3 text-center font-bold">{order.so_luong_mieng}</td>
                                <td className="p-3">{order.DonKinh?.BenhNhan?.ten || '-'}</td>
                                <td className="p-3 text-center">
                                  <span className={`text-xs px-2 py-0.5 rounded-full ${orderStatusColor(order.trang_thai)}`}>
                                    {orderStatusLabel(order.trang_thai)}
                                  </span>
                                </td>
                                <td className="p-3 text-gray-500 text-xs">
                                  {new Date(order.created_at).toLocaleDateString('vi-VN')}
                                </td>
                                <td className="p-3 text-center">
                                  <div className="flex gap-1 justify-center">
                                    {order.trang_thai === 'cho_dat' && (
                                      <button
                                        onClick={() => handleUpdateOrderStatus([order.id], 'da_dat')}
                                        className="px-2 py-1 text-xs bg-blue-100 text-blue-700 rounded hover:bg-blue-200"
                                      >
                                        Đã đặt
                                      </button>
                                    )}
                                    {order.trang_thai === 'da_dat' && (
                                      <button
                                        onClick={() => handleUpdateOrderStatus([order.id], 'da_nhan')}
                                        className="px-2 py-1 text-xs bg-green-100 text-green-700 rounded hover:bg-green-200"
                                      >
                                        Đã nhận
                                      </button>
                                    )}
                                  </div>
                                </td>
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

          {/* ======================== DIALOG: THÊM ĐỘ MỚI ======================== */}
          <Dialog open={showAddStock} onOpenChange={setShowAddStock}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Thêm tổ hợp độ mới vào kho</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div>
                  <Label>Hãng tròng *</Label>
                  <select
                    className="w-full border rounded-lg px-3 py-2 mt-1"
                    value={newStock.hang_trong_id}
                    onChange={e => setNewStock({ ...newStock, hang_trong_id: e.target.value })}
                  >
                    <option value="">-- Chọn hãng tròng --</option>
                    {hangTrongs.filter(h => (h as any).kieu_quan_ly !== 'DAT_KHI_CO_KHACH').map(h => (
                      <option key={h.id} value={h.id}>{h.ten_hang}</option>
                    ))}
                  </select>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>SPH (độ cầu) *</Label>
                    <Input type="number" step="0.25" value={newStock.sph}
                      onChange={e => setNewStock({ ...newStock, sph: e.target.value })} placeholder="-2.00" />
                  </div>
                  <div>
                    <Label>CYL (độ loạn)</Label>
                    <Input type="number" step="0.25" value={newStock.cyl}
                      onChange={e => setNewStock({ ...newStock, cyl: e.target.value })} placeholder="0" />
                  </div>
                  <div>
                    <Label>ADD (đa tròng)</Label>
                    <Input type="number" step="0.25" value={newStock.add_power}
                      onChange={e => setNewStock({ ...newStock, add_power: e.target.value })} placeholder="" />
                  </div>
                </div>
                {newStock.add_power && (
                  <div>
                    <Label>Mắt (đa tròng) *</Label>
                    <select
                      className="w-full border rounded-lg px-3 py-2 mt-1"
                      value={newStock.mat}
                      onChange={e => setNewStock({ ...newStock, mat: e.target.value })}
                    >
                      <option value="">-- Chọn mắt --</option>
                      <option value="trai">L - Mắt trái</option>
                      <option value="phai">R - Mắt phải</option>
                    </select>
                  </div>
                )}
                <div className="grid grid-cols-3 gap-3">
                  <div>
                    <Label>Tồn đầu kỳ</Label>
                    <Input type="number" value={newStock.ton_dau_ky}
                      onChange={e => setNewStock({ ...newStock, ton_dau_ky: e.target.value })} />
                  </div>
                  <div>
                    <Label>Tồn cần có</Label>
                    <Input type="number" value={newStock.muc_ton_can_co}
                      onChange={e => setNewStock({ ...newStock, muc_ton_can_co: e.target.value })} />
                  </div>
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowAddStock(false)}>Hủy</Button>
                <Button onClick={handleAddStock} disabled={!newStock.hang_trong_id || !newStock.sph}>Thêm vào kho</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ======================== DIALOG: NHẬP KHO ======================== */}
          <Dialog open={showImport} onOpenChange={(open) => { setShowImport(open); if (!open) setSelectedStock(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Nhập kho tròng kính</DialogTitle>
              </DialogHeader>
              {selectedStock && (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-3 text-sm">
                    <p className="font-medium">{selectedStock.HangTrong?.ten_hang}</p>
                    <p className="text-blue-700 font-mono">{formatDo(selectedStock.sph, selectedStock.cyl, selectedStock.add_power)}</p>
                    <p className="text-gray-500">Tồn hiện tại: <span className="font-bold">{selectedStock.ton_hien_tai}</span></p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Số lượng nhập *</Label>
                      <Input type="number" min="1" value={importForm.so_luong}
                        onChange={e => setImportForm({ ...importForm, so_luong: e.target.value })} placeholder="10" />
                    </div>
                    <div>
                      <Label>Đơn giá (VND)</Label>
                      <Input type="number" value={importForm.don_gia}
                        onChange={e => setImportForm({ ...importForm, don_gia: e.target.value })} placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <Label>Ghi chú</Label>
                    <Input value={importForm.ghi_chu}
                      onChange={e => setImportForm({ ...importForm, ghi_chu: e.target.value })} placeholder="Nhập từ NCC..." />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowImport(false)}>Hủy</Button>
                <Button onClick={handleImport} disabled={!importForm.so_luong}>Nhập kho</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ======================== DIALOG: XUẤT HỎNG ======================== */}
          <Dialog open={showDamaged} onOpenChange={(open) => { setShowDamaged(open); if (!open) setSelectedStock(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Ghi nhận tròng hỏng</DialogTitle>
              </DialogHeader>
              {selectedStock && (
                <div className="space-y-4">
                  <div className="bg-red-50 rounded-lg p-3 text-sm">
                    <p className="font-medium">{selectedStock.HangTrong?.ten_hang}</p>
                    <p className="text-red-700 font-mono">{formatDo(selectedStock.sph, selectedStock.cyl, selectedStock.add_power)}</p>
                    <p className="text-gray-500">Tồn hiện tại: <span className="font-bold">{selectedStock.ton_hien_tai}</span></p>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <Label>Số lượng hỏng *</Label>
                      <Input type="number" min="1" max={selectedStock.ton_hien_tai} value={damagedForm.so_luong}
                        onChange={e => setDamagedForm({ ...damagedForm, so_luong: e.target.value })} />
                    </div>
                    <div>
                      <Label>Lý do *</Label>
                      <select
                        className="w-full border rounded-lg px-3 py-2 mt-1"
                        value={damagedForm.ly_do}
                        onChange={e => setDamagedForm({ ...damagedForm, ly_do: e.target.value })}
                      >
                        <option value="cat_vo">Cắt vỡ</option>
                        <option value="loi_gia_cong">Lỗi gia công</option>
                        <option value="hong_khac">Hỏng khác</option>
                      </select>
                    </div>
                  </div>
                  <div>
                    <Label>Ghi chú</Label>
                    <Input value={damagedForm.ghi_chu}
                      onChange={e => setDamagedForm({ ...damagedForm, ghi_chu: e.target.value })} placeholder="Mô tả thêm..." />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowDamaged(false)}>Hủy</Button>
                <Button variant="destructive" onClick={handleDamaged} disabled={!damagedForm.so_luong}>Ghi nhận hỏng</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* ======================== DIALOG: SỬA TỔ HỢP KHO TRÒNG ======================== */}
          <Dialog open={showEditStock} onOpenChange={(open) => { setShowEditStock(open); if (!open) setSelectedStock(null); }}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Sửa tổ hợp kho tròng</DialogTitle>
              </DialogHeader>
              {selectedStock && (
                <div className="space-y-4">
                  <div className="bg-blue-50 rounded-lg p-3 text-sm">
                    <p className="text-gray-500">Tồn hiện tại: <span className="font-bold text-blue-700">{selectedStock.ton_hien_tai}</span></p>
                  </div>
                  <div>
                    <Label>Hãng tròng *</Label>
                    <select
                      className="w-full border rounded-lg px-3 py-2 mt-1"
                      value={editStockForm.hang_trong_id}
                      onChange={e => setEditStockForm({ ...editStockForm, hang_trong_id: e.target.value })}
                    >
                      <option value="">-- Chọn hãng tròng --</option>
                      {hangTrongs.filter(h => (h as any).kieu_quan_ly !== 'DAT_KHI_CO_KHACH').map(h => (
                        <option key={h.id} value={h.id}>{h.ten_hang}</option>
                      ))}
                    </select>
                  </div>
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>SPH (độ cầu) *</Label>
                      <Input type="number" step="0.25" value={editStockForm.sph}
                        onChange={e => setEditStockForm({ ...editStockForm, sph: e.target.value })} />
                    </div>
                    <div>
                      <Label>CYL (độ loạn)</Label>
                      <Input type="number" step="0.25" value={editStockForm.cyl}
                        onChange={e => setEditStockForm({ ...editStockForm, cyl: e.target.value })} />
                    </div>
                    <div>
                      <Label>ADD (đa tròng)</Label>
                      <Input type="number" step="0.25" value={editStockForm.add_power}
                        onChange={e => setEditStockForm({ ...editStockForm, add_power: e.target.value })} />
                    </div>
                  </div>
                  {editStockForm.add_power && (
                    <div>
                      <Label>Mắt (đa tròng) *</Label>
                      <select
                        className="w-full border rounded-lg px-3 py-2 mt-1"
                        value={editStockForm.mat}
                        onChange={e => setEditStockForm({ ...editStockForm, mat: e.target.value })}
                      >
                        <option value="">-- Chọn mắt --</option>
                        <option value="trai">L - Mắt trái</option>
                        <option value="phai">R - Mắt phải</option>
                      </select>
                    </div>
                  )}
                  <div className="grid grid-cols-3 gap-3">
                    <div>
                      <Label>Tồn đầu kỳ</Label>
                      <Input type="number" value={editStockForm.ton_dau_ky}
                        onChange={e => setEditStockForm({ ...editStockForm, ton_dau_ky: e.target.value })} />
                    </div>
                    <div>
                      <Label>Tồn cần có</Label>
                      <Input type="number" value={editStockForm.muc_ton_can_co}
                        onChange={e => setEditStockForm({ ...editStockForm, muc_ton_can_co: e.target.value })} />
                    </div>
                  </div>
                </div>
              )}
              <DialogFooter className="flex justify-between sm:justify-between">
                <Button variant="destructive" size="sm" onClick={handleDeleteStock}>Xóa</Button>
                <div className="flex gap-2">
                  <Button variant="outline" onClick={() => setShowEditStock(false)}>Hủy</Button>
                  <Button onClick={handleEditStock} disabled={!editStockForm.hang_trong_id || !editStockForm.sph}>Lưu</Button>
                </div>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* ======================== DIALOG: NHẬP EXCEL ======================== */}
          <Dialog open={showImportExcel} onOpenChange={(open) => { setShowImportExcel(open); if (!open) { setImportRows([]); setImportFileName(''); } }}>
            <DialogContent className="max-w-3xl">
              <DialogHeader>
                <DialogTitle>Nhập kho tròng từ file Excel</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="flex items-center gap-3">
                  <label className="flex items-center gap-2 px-4 py-2 bg-blue-50 text-blue-700 rounded-lg cursor-pointer hover:bg-blue-100 transition text-sm font-medium">
                    <Upload className="w-4 h-4" />
                    Chọn file Excel
                    <input type="file" accept=".xlsx,.xls,.csv" onChange={handleFileUpload} className="hidden" />
                  </label>
                  <button onClick={downloadTemplate} className="flex items-center gap-1 text-sm text-gray-500 hover:text-blue-600 underline">
                    <Download className="w-4 h-4" /> Tải file mẫu
                  </button>
                </div>
                {importFileName && (
                  <p className="text-sm text-gray-600">📄 {importFileName} — <span className="font-medium">{importRows.length}</span> dòng hợp lệ</p>
                )}
                {importRows.length > 0 && (
                  <div className="overflow-x-auto max-h-72 border rounded-lg">
                    <table className="w-full text-sm">
                      <thead className="sticky top-0 bg-gray-50">
                        <tr className="border-b text-left text-gray-500">
                          <th className="p-2 font-medium">#</th>
                          <th className="p-2 font-medium">Hãng tròng</th>
                          <th className="p-2 font-medium">SPH</th>
                          <th className="p-2 font-medium">CYL</th>
                          <th className="p-2 font-medium">ADD</th>
                          <th className="p-2 font-medium">Mắt</th>
                          <th className="p-2 font-medium">Tồn ĐK</th>
                          <th className="p-2 font-medium">Tồn cần có</th>
                        </tr>
                      </thead>
                      <tbody>
                        {importRows.slice(0, 100).map((r, i) => (
                          <tr key={i} className="border-b text-xs">
                            <td className="p-2 text-gray-400">{i + 1}</td>
                            <td className="p-2">{r.ten_hang}</td>
                            <td className="p-2 font-mono">{r.sph}</td>
                            <td className="p-2 font-mono">{r.cyl}</td>
                            <td className="p-2 font-mono">{r.add_power ?? '-'}</td>
                            <td className="p-2">{r.mat === 'trai' ? 'L' : r.mat === 'phai' ? 'R' : '-'}</td>
                            <td className="p-2">{r.ton_dau_ky}</td>
                            <td className="p-2">{r.muc_ton_can_co}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {importRows.length > 100 && (
                      <p className="p-2 text-xs text-gray-400 text-center">Hiển thị 100/{importRows.length} dòng</p>
                    )}
                  </div>
                )}
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowImportExcel(false)}>Hủy</Button>
                <Button onClick={handleImportExcel} disabled={importRows.length === 0 || importing}>
                  {importing ? 'Đang nhập...' : `Nhập ${importRows.length} dòng`}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* ======================== DIALOG: COPY TEXT ======================== */}
          <Dialog open={showCopyText} onOpenChange={setShowCopyText}>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>{copyTextTitle}</DialogTitle>
              </DialogHeader>
              <div className="space-y-3">
                <p className="text-xs text-gray-500">Sửa nội dung bên dưới nếu cần, rồi bấm Copy</p>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm font-mono min-h-[200px] focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={copyTextContent}
                  onChange={e => setCopyTextContent(e.target.value)}
                />
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCopyText(false)}>Đóng</Button>
                <Button onClick={() => { copyToClipboard(copyTextContent); setShowCopyText(false); }}>
                  <ClipboardCopy className="w-4 h-4 mr-1" /> Copy
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </main>
      </div>
    </ProtectedRoute>
  );
}
