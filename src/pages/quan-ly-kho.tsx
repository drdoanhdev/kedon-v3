import React, { useState, useEffect, useCallback } from 'react';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Plus, AlertTriangle, Package, Eye, Frame, ArrowDownToLine, ArrowUpFromLine, Ban, Truck, RefreshCw, Pencil, Upload, Download, ClipboardCopy, Search, Tags } from 'lucide-react';
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
  const [activeTab, setActiveTab] = useState<'overview' | 'lens_stock' | 'lens_order' | 'frame_stock' | 'import'>('overview');

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

  // Frame (gọng) stock states
  interface GongKinhStock {
    id: number;
    ten_gong: string;
    ma_gong: string | null;
    mau_sac: string | null;
    kich_co: string | null;
    chat_lieu: string | null;
    gia_nhap: number;
    gia_ban: number;
    ton_kho: number;
    muc_ton_can_co: number;
    trang_thai: boolean;
    NhaCungCap?: { id: number; ten: string } | null;
  }
  const [frameStocks, setFrameStocks] = useState<GongKinhStock[]>([]);
  const [frameSearch, setFrameSearch] = useState('');
  const [frameSortBy, setFrameSortBy] = useState<'ten_gong' | 'gia_ban' | 'gia_nhap' | 'ton_kho'>('ten_gong');
  const [frameSortDir, setFrameSortDir] = useState<'asc' | 'desc'>('asc');
  const [framePriceRange, setFramePriceRange] = useState<'all' | 'under200' | '200to500' | '500to1000' | 'over1000'>('all');
  const [showFrameImport, setShowFrameImport] = useState(false);
  const [selectedFrame, setSelectedFrame] = useState<GongKinhStock | null>(null);
  const [frameImportForm, setFrameImportForm] = useState({ so_luong: '', don_gia: '', ghi_chu: '' });

  // Nhóm giá gọng kính
  interface NhomGiaGongStock {
    id: number;
    ten_nhom: string;
    gia_ban_tu: number;
    gia_ban_den: number;
    gia_ban_mac_dinh: number;
    gia_nhap_trung_binh: number;
    so_luong_ton: number;
  }
  const [nhomGiaGongs, setNhomGiaGongs] = useState<NhomGiaGongStock[]>([]);

  // Import receipt (phiếu nhập tổng hợp) states
  interface ImportReceipt {
    id: number;
    ma_phieu: string | null;
    nha_cung_cap_id: number | null;
    tong_tien: number;
    ghi_chu: string | null;
    ngay_nhap: string;
    NhaCungCap?: { id: number; ten: string } | null;
    import_receipt_detail: {
      id: number;
      loai_hang: string;
      so_luong: number;
      don_gia: number;
      thanh_tien: number;
      Thuoc?: { id: number; ten: string } | null;
      LensStock?: { id: number; sph: number; cyl: number; add_power: number | null; HangTrong: { ten_hang: string } } | null;
      GongKinh?: { id: number; ten_gong: string; ma_gong: string | null } | null;
      MedicalSupply?: { id: number; ten_vat_tu: string } | null;
    }[];
  }
  const [receipts, setReceipts] = useState<ImportReceipt[]>([]);
  const [showCreateReceipt, setShowCreateReceipt] = useState(false);
  const [receiptForm, setReceiptForm] = useState({ ma_phieu: '', nha_cung_cap_id: '', ghi_chu: '' });
  const [receiptDetails, setReceiptDetails] = useState<{ loai_hang: string; item_id: string; item_label: string; so_luong: string; don_gia: string }[]>([]);
  const [expandedReceipt, setExpandedReceipt] = useState<number | null>(null);
  const [nhaCungCaps, setNhaCungCaps] = useState<{ id: number; ten: string }[]>([]);
  const [catalogItems, setCatalogItems] = useState<{ thuoc: any[]; trong_kinh: any[]; gong_kinh: any[]; vat_tu: any[] }>({ thuoc: [], trong_kinh: [], gong_kinh: [], vat_tu: [] });

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

  const fetchFrameStocks = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/gong-kinh?show_inactive=1');
      setFrameStocks(data || []);
    } catch {}
  }, []);

  const fetchNhomGiaGongs = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/nhom-gia-gong');
      setNhomGiaGongs(data || []);
    } catch {}
  }, []);

  const fetchReceipts = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/inventory/import-receipt');
      setReceipts(data || []);
    } catch {}
  }, []);

  const fetchNhaCungCaps = useCallback(async () => {
    try {
      const { data } = await axios.get('/api/nha-cung-cap');
      setNhaCungCaps(data?.data || data || []);
    } catch {}
  }, []);

  const fetchCatalogItems = useCallback(async () => {
    try {
      const [thuocRes, lensRes, gongRes] = await Promise.all([
        axios.get('/api/thuoc').catch(() => ({ data: [] })),
        axios.get('/api/inventory/lens-stock').catch(() => ({ data: [] })),
        axios.get('/api/gong-kinh').catch(() => ({ data: [] })),
      ]);
      setCatalogItems({
        thuoc: thuocRes.data?.data || thuocRes.data || [],
        trong_kinh: lensRes.data || [],
        gong_kinh: gongRes.data || [],
        vat_tu: [],
      });
    } catch {}
  }, []);

  useEffect(() => {
    Promise.all([fetchAlerts(), fetchLensStocks(), fetchLensOrders(), fetchHangTrongs(), fetchFrameStocks(), fetchNhomGiaGongs(), fetchReceipts(), fetchNhaCungCaps()])
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
  // FRAME (GỌNG) ACTIONS
  // ============================================
  const handleFrameImport = async () => {
    if (!selectedFrame) return;
    try {
      await axios.post('/api/inventory/frame-import', {
        gong_kinh_id: selectedFrame.id,
        so_luong: parseInt(frameImportForm.so_luong),
        don_gia: parseInt(frameImportForm.don_gia) || 0,
        ghi_chu: frameImportForm.ghi_chu || null,
      });
      toast.success(`Đã nhập ${frameImportForm.so_luong} gọng`);
      setShowFrameImport(false);
      setFrameImportForm({ so_luong: '', don_gia: '', ghi_chu: '' });
      setSelectedFrame(null);
      fetchFrameStocks();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi nhập kho gọng');
    }
  };

  // ============================================
  // IMPORT RECEIPT (PHIẾU NHẬP TỔNG HỢP)
  // ============================================
  const handleAddReceiptLine = () => {
    setReceiptDetails([...receiptDetails, { loai_hang: 'gong_kinh', item_id: '', item_label: '', so_luong: '1', don_gia: '0' }]);
  };

  const handleRemoveReceiptLine = (index: number) => {
    setReceiptDetails(receiptDetails.filter((_, i) => i !== index));
  };

  const handleSubmitReceipt = async () => {
    if (receiptDetails.length === 0) {
      toast.error('Cần ít nhất 1 dòng chi tiết');
      return;
    }
    const invalidLine = receiptDetails.find(d => !d.item_id || !d.so_luong || parseInt(d.so_luong) <= 0);
    if (invalidLine) {
      toast.error('Vui lòng chọn hàng và nhập số lượng > 0 cho tất cả dòng');
      return;
    }
    try {
      await axios.post('/api/inventory/import-receipt', {
        ma_phieu: receiptForm.ma_phieu || null,
        nha_cung_cap_id: receiptForm.nha_cung_cap_id || null,
        ghi_chu: receiptForm.ghi_chu || null,
        chi_tiet: receiptDetails.map(d => ({
          loai_hang: d.loai_hang,
          item_id: d.item_id,
          so_luong: parseInt(d.so_luong),
          don_gia: parseInt(d.don_gia) || 0,
        })),
      });
      toast.success('Đã tạo phiếu nhập kho');
      setShowCreateReceipt(false);
      setReceiptForm({ ma_phieu: '', nha_cung_cap_id: '', ghi_chu: '' });
      setReceiptDetails([]);
      fetchReceipts();
      fetchLensStocks();
      fetchFrameStocks();
      fetchAlerts();
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Lỗi tạo phiếu nhập');
    }
  };

  const getItemLabel = (loai_hang: string, item_id: string): string => {
    const id = parseInt(item_id);
    if (loai_hang === 'thuoc') {
      const t = catalogItems.thuoc.find((x: any) => x.id === id);
      return t ? t.ten : '';
    }
    if (loai_hang === 'trong_kinh') {
      const l = catalogItems.trong_kinh.find((x: any) => x.id === id);
      return l ? `${l.HangTrong?.ten_hang || '?'} (${l.sph}/${l.cyl})` : '';
    }
    if (loai_hang === 'gong_kinh') {
      const g = catalogItems.gong_kinh.find((x: any) => x.id === id);
      return g ? g.ten_gong : '';
    }
    return '';
  };

  const getReceiptDetailLabel = (d: ImportReceipt['import_receipt_detail'][0]) => {
    if (d.Thuoc) return `Thuốc: ${d.Thuoc.ten}`;
    if (d.LensStock) return `Tròng: ${d.LensStock.HangTrong?.ten_hang || '?'} (${d.LensStock.sph}/${d.LensStock.cyl})`;
    if (d.GongKinh) return `Gọng: ${d.GongKinh.ten_gong}${d.GongKinh.ma_gong ? ` (${d.GongKinh.ma_gong})` : ''}`;
    if (d.MedicalSupply) return `Vật tư: ${d.MedicalSupply.ten_vat_tu}`;
    return '?';
  };

  const loaiHangLabel: Record<string, string> = {
    thuoc: 'Thuốc',
    trong_kinh: 'Tròng kính',
    gong_kinh: 'Gọng kính',
    vat_tu: 'Vật tư',
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
    const wb = XLSX.utils.book_new();

    // ---- Sheet 1: Dữ liệu mẫu ----
    const templateData = [
      // Cận đơn thuần (chỉ SPH, CYL = 0)
      { 'Hãng tròng': 'Essilor', 'SPH': -0.50, 'CYL': 0, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 10, 'Tồn cần có': 10, 'Ghi chú': 'Cận nhẹ -0.50' },
      { 'Hãng tròng': 'Essilor', 'SPH': -1.00, 'CYL': 0, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 10, 'Tồn cần có': 10, 'Ghi chú': 'Cận -1.00' },
      { 'Hãng tròng': 'Essilor', 'SPH': -2.00, 'CYL': 0, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 8, 'Tồn cần có': 10, 'Ghi chú': 'Cận -2.00' },
      { 'Hãng tròng': 'Essilor', 'SPH': -3.00, 'CYL': 0, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 5, 'Tồn cần có': 10, 'Ghi chú': 'Cận -3.00' },
      // Viễn (SPH dương)
      { 'Hãng tròng': 'Essilor', 'SPH': 1.00, 'CYL': 0, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 5, 'Tồn cần có': 5, 'Ghi chú': 'Viễn +1.00' },
      { 'Hãng tròng': 'Essilor', 'SPH': 2.00, 'CYL': 0, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 5, 'Tồn cần có': 5, 'Ghi chú': 'Viễn +2.00' },
      // Cận + Loạn (SPH âm + CYL âm)
      { 'Hãng tròng': 'Hoya', 'SPH': -1.50, 'CYL': -0.50, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 5, 'Tồn cần có': 5, 'Ghi chú': 'Cận kèm loạn nhẹ' },
      { 'Hãng tròng': 'Hoya', 'SPH': -2.50, 'CYL': -0.75, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 5, 'Tồn cần có': 5, 'Ghi chú': 'Cận kèm loạn' },
      { 'Hãng tròng': 'Hoya', 'SPH': -3.00, 'CYL': -1.25, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 3, 'Tồn cần có': 5, 'Ghi chú': 'Cận kèm loạn nặng' },
      // Không độ (Plano)
      { 'Hãng tròng': 'Essilor', 'SPH': 'Plano', 'CYL': 0, 'ADD': '', 'Mắt': '', 'Tồn đầu kỳ': 20, 'Tồn cần có': 20, 'Ghi chú': 'Không độ (0.00), ghi Plano hoặc 0' },
      // Đa tròng (có ADD, phải chỉ rõ Mắt L hoặc R)
      { 'Hãng tròng': 'Essilor', 'SPH': -1.00, 'CYL': -0.50, 'ADD': 1.50, 'Mắt': 'L', 'Tồn đầu kỳ': 3, 'Tồn cần có': 5, 'Ghi chú': 'Đa tròng mắt trái - ADD 1.50' },
      { 'Hãng tròng': 'Essilor', 'SPH': -1.00, 'CYL': -0.50, 'ADD': 1.50, 'Mắt': 'R', 'Tồn đầu kỳ': 3, 'Tồn cần có': 5, 'Ghi chú': 'Đa tròng mắt phải - ADD 1.50' },
      { 'Hãng tròng': 'Hoya', 'SPH': -2.00, 'CYL': -0.75, 'ADD': 2.00, 'Mắt': 'L', 'Tồn đầu kỳ': 2, 'Tồn cần có': 3, 'Ghi chú': 'Đa tròng mắt trái - ADD 2.00' },
      { 'Hãng tròng': 'Hoya', 'SPH': -2.00, 'CYL': -0.75, 'ADD': 2.00, 'Mắt': 'R', 'Tồn đầu kỳ': 2, 'Tồn cần có': 3, 'Ghi chú': 'Đa tròng mắt phải - ADD 2.00' },
      { 'Hãng tròng': 'Essilor', 'SPH': 0.50, 'CYL': 0, 'ADD': 1.00, 'Mắt': 'L', 'Tồn đầu kỳ': 4, 'Tồn cần có': 5, 'Ghi chú': 'Đa tròng viễn nhẹ + ADD thấp' },
    ];
    const ws = XLSX.utils.json_to_sheet(templateData);
    // Auto-width columns
    const colWidths = [
      { wch: 14 }, // Hãng tròng
      { wch: 8 },  // SPH
      { wch: 8 },  // CYL
      { wch: 8 },  // ADD
      { wch: 6 },  // Mắt
      { wch: 12 }, // Tồn đầu kỳ
      { wch: 12 }, // Tồn cần có
      { wch: 35 }, // Ghi chú
    ];
    ws['!cols'] = colWidths;
    XLSX.utils.book_append_sheet(wb, ws, 'Kho tròng');

    // ---- Sheet 2: Hướng dẫn ----
    const guideData = [
      ['HƯỚNG DẪN NHẬP DỮ LIỆU KHO TRÒNG'],
      [''],
      ['Cột', 'Bắt buộc', 'Mô tả', 'Ví dụ'],
      ['Hãng tròng', 'Có', 'Tên hãng tròng (phải trùng với danh mục đã tạo trong phần mềm)', 'Essilor, Hoya, Chemi...'],
      ['SPH', 'Có', 'Công suất cầu. Cận: số âm (-). Viễn: số dương (+). Không độ: ghi 0 hoặc Plano', '-1.00, -2.50, +1.00, Plano'],
      ['CYL', 'Không', 'Công suất trụ (loạn). Để trống hoặc 0 nếu không có loạn', '-0.50, -1.25, 0'],
      ['ADD', 'Không', 'Chỉ dùng cho tròng đa tròng (progressive). Để trống nếu tròng đơn tròng', '1.00, 1.50, 2.00'],
      ['Mắt', 'Không', 'Chỉ cần khi tròng đa tròng: L = mắt trái, R = mắt phải. Tròng đơn tròng để trống', 'L, R, (để trống)'],
      ['Tồn đầu kỳ', 'Không', 'Số lượng tồn kho ban đầu. Mặc định 0 nếu để trống', '5, 10, 20'],
      ['Tồn cần có', 'Không', 'Mức tồn kho mục tiêu. Dùng để cảnh báo sắp hết. Mặc định 10', '5, 10, 20'],
      ['Ghi chú', '', 'Cột tham khảo, hệ thống sẽ BỎ QUA cột này khi nhập', ''],
      [''],
      ['CÁC TRƯỜNG HỢP PHỔ BIẾN:'],
      [''],
      ['1. TRÒNG CẬN (chỉ cận, không loạn)', '', '', ''],
      ['   SPH = số âm, CYL = 0, ADD = trống, Mắt = trống', '', '', ''],
      ['   Ví dụ: SPH = -1.00, CYL = 0 → tròng cận 1 độ', '', '', ''],
      [''],
      ['2. TRÒNG CẬN + LOẠN', '', '', ''],
      ['   SPH = số âm, CYL = số âm, ADD = trống, Mắt = trống', '', '', ''],
      ['   Ví dụ: SPH = -2.50, CYL = -0.75 → cận 2.50 loạn 0.75', '', '', ''],
      [''],
      ['3. TRÒNG VIỄN', '', '', ''],
      ['   SPH = số dương, CYL = 0, ADD = trống, Mắt = trống', '', '', ''],
      ['   Ví dụ: SPH = +1.00, CYL = 0 → viễn 1 độ', '', '', ''],
      [''],
      ['4. TRÒNG KHÔNG ĐỘ', '', '', ''],
      ['   SPH = 0 hoặc Plano, CYL = 0, ADD = trống, Mắt = trống', '', '', ''],
      ['   Dùng cho kính bảo vệ, kính thời trang không có độ', '', '', ''],
      [''],
      ['5. TRÒNG ĐA TRÒNG (Progressive)', '', '', ''],
      ['   SPH = số, CYL = số, ADD = số dương (1.00-3.00), Mắt = L hoặc R', '', '', ''],
      ['   ⚠ QUAN TRỌNG: Tròng đa tròng PHẢI chỉ rõ Mắt (L/R) vì mỗi mắt khác nhau', '', '', ''],
      ['   ⚠ Phải nhập 2 dòng riêng cho mắt trái (L) và mắt phải (R)', '', '', ''],
      ['   Ví dụ: SPH=-1.00 CYL=-0.50 ADD=1.50 Mắt=L → đa tròng mắt trái', '', '', ''],
      [''],
      ['LƯU Ý CHUNG:'],
      ['   • Hãng tròng phải trùng với tên đã tạo trong Danh mục > Hãng tròng', '', '', ''],
      ['   • Mỗi dòng là 1 loại tròng riêng biệt', '', '', ''],
      ['   • Nếu trùng (cùng hãng, SPH, CYL, ADD, Mắt) sẽ bị bỏ qua', '', '', ''],
      ['   • Cột "Ghi chú" chỉ để tham khảo, hệ thống không đọc cột này', '', '', ''],
    ];
    const wsGuide = XLSX.utils.aoa_to_sheet(guideData);
    wsGuide['!cols'] = [{ wch: 55 }, { wch: 12 }, { wch: 60 }, { wch: 30 }];
    // Merge title row
    wsGuide['!merges'] = [{ s: { r: 0, c: 0 }, e: { r: 0, c: 3 } }];
    XLSX.utils.book_append_sheet(wb, wsGuide, 'Hướng dẫn');

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
      <FeatureGate feature="inventory_lens">
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
          <div className="grid grid-cols-5 sm:flex gap-1 mb-4 sm:mb-6 bg-white rounded-lg p-1 shadow-sm border">
            {[
              { key: 'overview', label: 'Tổng quan', mobileLabel: 'Tổng quan', icon: <Package className="w-4 h-4" /> },
              { key: 'lens_stock', label: 'Kho tròng kính', mobileLabel: 'Kho tròng', icon: <Eye className="w-4 h-4" /> },
              { key: 'frame_stock', label: 'Kho gọng kính', mobileLabel: 'Kho gọng', icon: <Frame className="w-4 h-4" /> },
              { key: 'lens_order', label: 'Tròng cần đặt', mobileLabel: 'Cần đặt', icon: <Truck className="w-4 h-4" /> },
              { key: 'import', label: 'Phiếu nhập kho', mobileLabel: 'Phiếu nhập', icon: <Upload className="w-4 h-4" /> },
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

              {/* ======================== TAB: KHO GỌNG KÍNH ======================== */}
              {activeTab === 'frame_stock' && (
                <div className="space-y-4">
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-lg">
                        <div className="flex items-center gap-2">
                          <Frame className="w-5 h-5" />
                          Kho gọng kính ({frameStocks.filter(f => f.trang_thai).length})
                        </div>
                        <div className="flex flex-wrap gap-2 ml-auto w-full sm:w-auto">
                          <div className="relative flex-1 sm:flex-none">
                            <Search className="absolute left-2.5 top-2.5 w-4 h-4 text-gray-400" />
                            <Input
                              placeholder="Tìm gọng..."
                              value={frameSearch}
                              onChange={e => setFrameSearch(e.target.value)}
                              className="pl-8 h-9 text-sm w-full sm:w-48"
                            />
                          </div>
                          <select className="border rounded-md px-2 py-1.5 text-xs h-9" value={framePriceRange}
                            onChange={e => setFramePriceRange(e.target.value as any)}>
                            <option value="all">Tất cả giá</option>
                            <option value="under200">Dưới 200k</option>
                            <option value="200to500">200k - 500k</option>
                            <option value="500to1000">500k - 1tr</option>
                            <option value="over1000">Trên 1tr</option>
                          </select>
                          <select className="border rounded-md px-2 py-1.5 text-xs h-9" value={`${frameSortBy}_${frameSortDir}`}
                            onChange={e => {
                              const [field, dir] = e.target.value.split('_') as [typeof frameSortBy, 'asc' | 'desc'];
                              setFrameSortBy(field);
                              setFrameSortDir(dir);
                            }}>
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
                            {frameStocks
                              .filter(f => {
                                if (!f.trang_thai) return false;
                                // Price range filter (giá bán, đơn vị VND)
                                const gia = f.gia_ban || 0;
                                if (framePriceRange === 'under200' && gia >= 200000) return false;
                                if (framePriceRange === '200to500' && (gia < 200000 || gia > 500000)) return false;
                                if (framePriceRange === '500to1000' && (gia < 500000 || gia > 1000000)) return false;
                                if (framePriceRange === 'over1000' && gia <= 1000000) return false;
                                // Text search
                                if (!frameSearch) return true;
                                const s = frameSearch.toLowerCase();
                                return (f.ten_gong?.toLowerCase().includes(s)) ||
                                       (f.ma_gong?.toLowerCase().includes(s)) ||
                                       (f.mau_sac?.toLowerCase().includes(s)) ||
                                       (f.NhaCungCap?.ten?.toLowerCase().includes(s));
                              })
                              .sort((a, b) => {
                                let cmp = 0;
                                if (frameSortBy === 'ten_gong') cmp = (a.ten_gong || '').localeCompare(b.ten_gong || '', 'vi');
                                else if (frameSortBy === 'gia_ban') cmp = (a.gia_ban || 0) - (b.gia_ban || 0);
                                else if (frameSortBy === 'gia_nhap') cmp = (a.gia_nhap || 0) - (b.gia_nhap || 0);
                                else if (frameSortBy === 'ton_kho') cmp = (a.ton_kho ?? 0) - (b.ton_kho ?? 0);
                                return frameSortDir === 'desc' ? -cmp : cmp;
                              })
                              .map(frame => {
                                const tonKho = frame.ton_kho ?? 0;
                                const mucMin = frame.muc_ton_can_co ?? 2;
                                const trangThai = tonKho <= 0 ? 'HET' : tonKho <= mucMin ? 'SAP_HET' : 'DU';
                                return (
                                  <tr key={frame.id} className="border-b hover:bg-gray-50">
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
                                      <span className={`text-[10px] sm:text-xs px-1.5 sm:px-2 py-0.5 rounded-full ${
                                        trangThai === 'HET' ? 'bg-red-100 text-red-700' :
                                        trangThai === 'SAP_HET' ? 'bg-yellow-100 text-yellow-700' :
                                        'bg-green-100 text-green-700'
                                      }`}>
                                        {trangThai === 'HET' ? 'Hết' : trangThai === 'SAP_HET' ? 'Sắp hết' : 'Đủ'}
                                      </span>
                                    </td>
                                    <td className="p-1.5 sm:p-3 text-center">
                                      <button
                                        onClick={() => { setSelectedFrame(frame); setShowFrameImport(true); }}
                                        className="p-1 sm:p-1.5 rounded-lg hover:bg-green-100 text-green-600" title="Nhập kho"
                                      >
                                        <ArrowDownToLine className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
                                      </button>
                                    </td>
                                  </tr>
                                );
                              })}
                          </tbody>
                        </table>
                      </div>
                    </CardContent>
                  </Card>

                  {/* Nhóm giá gọng tồn kho */}
                  {nhomGiaGongs.length > 0 && (
                    <Card>
                      <CardHeader>
                        <CardTitle className="flex items-center gap-2 text-lg">
                          <Tags className="w-5 h-5" />
                          Tồn kho theo nhóm giá ({nhomGiaGongs.length})
                        </CardTitle>
                      </CardHeader>
                      <CardContent>
                        <div className="overflow-x-auto">
                          <table className="min-w-full text-sm">
                            <thead className="bg-gray-100 border-b">
                              <tr>
                                <th className="px-4 py-2 text-left">Nhóm giá</th>
                                <th className="px-4 py-2 text-right">Giá bán (từ-đến)</th>
                                <th className="px-4 py-2 text-right">Giá mặc định</th>
                                <th className="px-4 py-2 text-right">Giá nhập TB</th>
                                <th className="px-4 py-2 text-center">Tồn kho</th>
                              </tr>
                            </thead>
                            <tbody>
                              {nhomGiaGongs.map(nhom => (
                                <tr key={nhom.id} className="border-b hover:bg-gray-50">
                                  <td className="px-4 py-2 font-medium">{nhom.ten_nhom}</td>
                                  <td className="px-4 py-2 text-right text-gray-600">{nhom.gia_ban_tu.toLocaleString()}đ - {nhom.gia_ban_den.toLocaleString()}đ</td>
                                  <td className="px-4 py-2 text-right">{nhom.gia_ban_mac_dinh.toLocaleString()}đ</td>
                                  <td className="px-4 py-2 text-right text-gray-500">{nhom.gia_nhap_trung_binh.toLocaleString()}đ</td>
                                  <td className={`px-4 py-2 text-center font-bold ${nhom.so_luong_ton <= 0 ? 'text-red-600' : nhom.so_luong_ton <= 5 ? 'text-yellow-600' : 'text-green-600'}`}>
                                    {nhom.so_luong_ton}
                                  </td>
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

          {/* ======================== TAB: PHIẾU NHẬP KHO ======================== */}
          {activeTab === 'import' && (
            <div className="space-y-4">
              <Card>
                <CardHeader>
                  <CardTitle className="flex flex-col sm:flex-row items-start sm:items-center gap-2 text-lg">
                    <div className="flex items-center gap-2">
                      <Upload className="w-5 h-5" />
                      Phiếu nhập kho ({receipts.length})
                    </div>
                    <Button size="sm" onClick={() => { fetchCatalogItems(); setShowCreateReceipt(true); }} className="ml-auto">
                      <Plus className="w-4 h-4 mr-1" /> Tạo phiếu nhập
                    </Button>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {receipts.length === 0 ? (
                    <p className="text-gray-500 text-center py-8">Chưa có phiếu nhập nào</p>
                  ) : (
                    <div className="space-y-3">
                      {receipts.map(r => (
                        <div key={r.id} className="border rounded-lg overflow-hidden">
                          <button
                            onClick={() => setExpandedReceipt(expandedReceipt === r.id ? null : r.id)}
                            className="w-full p-3 sm:p-4 flex items-center justify-between hover:bg-gray-50 text-left"
                          >
                            <div>
                              <div className="font-medium text-sm sm:text-base">
                                {r.ma_phieu || `PN-${r.id}`}
                                {r.NhaCungCap && <span className="text-gray-500 ml-2 text-xs">NCC: {r.NhaCungCap.ten}</span>}
                              </div>
                              <div className="text-xs text-gray-400">
                                {new Date(r.ngay_nhap).toLocaleDateString('vi-VN')} · {r.import_receipt_detail?.length || 0} dòng · {(r.tong_tien || 0).toLocaleString('vi-VN')}đ
                              </div>
                              {r.ghi_chu && <div className="text-xs text-gray-400 mt-0.5">{r.ghi_chu}</div>}
                            </div>
                            <span className="text-gray-400 text-lg">{expandedReceipt === r.id ? '▲' : '▼'}</span>
                          </button>
                          {expandedReceipt === r.id && r.import_receipt_detail && (
                            <div className="border-t bg-gray-50 p-3">
                              <table className="w-full text-xs sm:text-sm">
                                <thead>
                                  <tr className="text-gray-500">
                                    <th className="text-left pb-1">Hàng hóa</th>
                                    <th className="text-center pb-1">SL</th>
                                    <th className="text-right pb-1 hidden sm:table-cell">Đơn giá</th>
                                    <th className="text-right pb-1">Thành tiền</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.import_receipt_detail.map(d => (
                                    <tr key={d.id} className="border-t border-gray-200">
                                      <td className="py-1.5">
                                        <span className={`text-[10px] px-1 py-0.5 rounded mr-1 ${
                                          d.loai_hang === 'thuoc' ? 'bg-purple-100 text-purple-700' :
                                          d.loai_hang === 'trong_kinh' ? 'bg-blue-100 text-blue-700' :
                                          d.loai_hang === 'gong_kinh' ? 'bg-orange-100 text-orange-700' :
                                          'bg-gray-100 text-gray-700'
                                        }`}>{loaiHangLabel[d.loai_hang]}</span>
                                        {getReceiptDetailLabel(d)}
                                      </td>
                                      <td className="text-center py-1.5">{d.so_luong}</td>
                                      <td className="text-right py-1.5 hidden sm:table-cell">{(d.don_gia || 0).toLocaleString('vi-VN')}</td>
                                      <td className="text-right py-1.5 font-medium">{(d.thanh_tien || 0).toLocaleString('vi-VN')}</td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
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
          {/* ======================== DIALOG: NHẬP KHO GỌNG ======================== */}
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
                      <Input type="number" min="1" value={frameImportForm.so_luong}
                        onChange={e => setFrameImportForm({ ...frameImportForm, so_luong: e.target.value })} placeholder="1" />
                    </div>
                    <div>
                      <Label>Đơn giá (VND)</Label>
                      <Input type="number" value={frameImportForm.don_gia}
                        onChange={e => setFrameImportForm({ ...frameImportForm, don_gia: e.target.value })} placeholder="0" />
                    </div>
                  </div>
                  <div>
                    <Label>Ghi chú</Label>
                    <Input value={frameImportForm.ghi_chu}
                      onChange={e => setFrameImportForm({ ...frameImportForm, ghi_chu: e.target.value })} placeholder="Nhập từ NCC..." />
                  </div>
                </div>
              )}
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowFrameImport(false)}>Hủy</Button>
                <Button onClick={handleFrameImport} disabled={!frameImportForm.so_luong}>Nhập kho</Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
          {/* ======================== DIALOG: TẠO PHIẾU NHẬP ======================== */}
          <Dialog open={showCreateReceipt} onOpenChange={(open) => { setShowCreateReceipt(open); if (!open) { setReceiptDetails([]); setReceiptForm({ ma_phieu: '', nha_cung_cap_id: '', ghi_chu: '' }); } }}>
            <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Tạo phiếu nhập kho tổng hợp</DialogTitle>
              </DialogHeader>
              <div className="space-y-4">
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <Label>Mã phiếu</Label>
                    <Input value={receiptForm.ma_phieu} onChange={e => setReceiptForm({ ...receiptForm, ma_phieu: e.target.value })}
                      placeholder={`PN-${new Date().toISOString().slice(0,10).replace(/-/g,'')}`} />
                  </div>
                  <div>
                    <Label>Nhà cung cấp</Label>
                    <select className="w-full border rounded-md px-3 py-2 text-sm" value={receiptForm.nha_cung_cap_id}
                      onChange={e => setReceiptForm({ ...receiptForm, nha_cung_cap_id: e.target.value })}>
                      <option value="">-- Chọn NCC --</option>
                      {nhaCungCaps.map(n => <option key={n.id} value={n.id}>{n.ten}</option>)}
                    </select>
                  </div>
                  <div>
                    <Label>Ghi chú</Label>
                    <Input value={receiptForm.ghi_chu} onChange={e => setReceiptForm({ ...receiptForm, ghi_chu: e.target.value })}
                      placeholder="Ghi chú..." />
                  </div>
                </div>

                <div className="border-t pt-3">
                  <div className="flex items-center justify-between mb-2">
                    <Label className="text-sm font-medium">Chi tiết hàng nhập</Label>
                    <Button size="sm" variant="outline" onClick={handleAddReceiptLine}>
                      <Plus className="w-3 h-3 mr-1" /> Thêm dòng
                    </Button>
                  </div>

                  {receiptDetails.length === 0 ? (
                    <p className="text-gray-400 text-sm text-center py-4">Nhấn "Thêm dòng" để bắt đầu</p>
                  ) : (
                    <div className="space-y-2">
                      {receiptDetails.map((line, idx) => (
                        <div key={idx} className="grid grid-cols-12 gap-2 items-end bg-gray-50 rounded-lg p-2">
                          <div className="col-span-3 sm:col-span-2">
                            <label className="text-[10px] text-gray-500">Loại</label>
                            <select className="w-full border rounded px-2 py-1.5 text-xs"
                              value={line.loai_hang}
                              onChange={e => {
                                const updated = [...receiptDetails];
                                updated[idx] = { ...updated[idx], loai_hang: e.target.value, item_id: '', item_label: '' };
                                setReceiptDetails(updated);
                              }}>
                              <option value="gong_kinh">Gọng</option>
                              <option value="trong_kinh">Tròng</option>
                              <option value="thuoc">Thuốc</option>
                            </select>
                          </div>
                          <div className="col-span-5 sm:col-span-4">
                            <label className="text-[10px] text-gray-500">Hàng hóa</label>
                            <select className="w-full border rounded px-2 py-1.5 text-xs"
                              value={line.item_id}
                              onChange={e => {
                                const updated = [...receiptDetails];
                                updated[idx] = { ...updated[idx], item_id: e.target.value, item_label: getItemLabel(line.loai_hang, e.target.value) };
                                setReceiptDetails(updated);
                              }}>
                              <option value="">-- Chọn --</option>
                              {line.loai_hang === 'gong_kinh' && catalogItems.gong_kinh.map((g: any) => (
                                <option key={g.id} value={g.id}>{g.ten_gong}{g.ma_gong ? ` (${g.ma_gong})` : ''}</option>
                              ))}
                              {line.loai_hang === 'trong_kinh' && catalogItems.trong_kinh.map((l: any) => (
                                <option key={l.id} value={l.id}>{l.HangTrong?.ten_hang || '?'} ({l.sph}/{l.cyl}){l.add_power ? ` ADD${l.add_power}` : ''}</option>
                              ))}
                              {line.loai_hang === 'thuoc' && catalogItems.thuoc.map((t: any) => (
                                <option key={t.id} value={t.id}>{t.ten}</option>
                              ))}
                            </select>
                          </div>
                          <div className="col-span-2 sm:col-span-2">
                            <label className="text-[10px] text-gray-500">SL</label>
                            <Input type="number" min="1" className="text-xs h-8"
                              value={line.so_luong}
                              onChange={e => {
                                const updated = [...receiptDetails];
                                updated[idx] = { ...updated[idx], so_luong: e.target.value };
                                setReceiptDetails(updated);
                              }} />
                          </div>
                          <div className="col-span-3 sm:col-span-3 hidden sm:block">
                            <label className="text-[10px] text-gray-500">Đơn giá</label>
                            <Input type="number" className="text-xs h-8"
                              value={line.don_gia}
                              onChange={e => {
                                const updated = [...receiptDetails];
                                updated[idx] = { ...updated[idx], don_gia: e.target.value };
                                setReceiptDetails(updated);
                              }} />
                          </div>
                          <div className="col-span-2 sm:col-span-1 flex justify-end">
                            <button onClick={() => handleRemoveReceiptLine(idx)}
                              className="p-1.5 rounded hover:bg-red-100 text-red-500" title="Xóa dòng">
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                      <div className="text-right text-sm font-medium pt-2 border-t">
                        Tổng: {receiptDetails.reduce((s, d) => s + (parseInt(d.so_luong) || 0) * (parseInt(d.don_gia) || 0), 0).toLocaleString('vi-VN')}đ
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setShowCreateReceipt(false)}>Hủy</Button>
                <Button onClick={handleSubmitReceipt} disabled={receiptDetails.length === 0}>Tạo phiếu</Button>
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
      </FeatureGate>
    </ProtectedRoute>
  );
}
