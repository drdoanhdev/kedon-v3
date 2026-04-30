// Điều chuyển kho giữa chi nhánh - phiên bản tối ưu UX
import { useState, useEffect, useCallback, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import {
  ArrowRightLeft, Plus, CheckCircle, XCircle, Clock, Package,
  Save, Search, AlertTriangle, X, History, Inbox, Send, Zap, Building2
} from 'lucide-react';

interface Branch {
  id: string;
  ten_chi_nhanh: string;
  is_main: boolean;
  status: string;
}

interface Transfer {
  id: string;
  from_branch_id: string;
  to_branch_id: string;
  loai: string;
  item_id: string;
  ten_san_pham: string | null;
  so_luong: number;
  don_gia: number;
  ghi_chu: string | null;
  status: string;
  nguoi_tao: string;
  nguoi_duyet: string | null;
  completed_at: string | null;
  created_at: string;
  from_branch?: { id: string; ten_chi_nhanh: string };
  to_branch?: { id: string; ten_chi_nhanh: string };
}

const LOAI_LABELS: Record<string, string> = {
  lens: 'Tròng kính',
  gong: 'Gọng kính',
  thuoc: 'Thuốc',
  vat_tu: 'Vật tư',
};

const STATUS_CONFIG: Record<string, { label: string; color: string; icon: any }> = {
  pending: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-700 border-amber-200', icon: Clock },
  approved: { label: 'Đã duyệt', color: 'bg-blue-100 text-blue-700 border-blue-200', icon: CheckCircle },
  completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700 border-green-200', icon: CheckCircle },
  rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-700 border-red-200', icon: XCircle },
  cancelled: { label: 'Đã hủy', color: 'bg-gray-100 text-gray-500 border-gray-200', icon: XCircle },
};

export default function DieuChuyenKho() {
  const { currentTenantId, tenancyLoading } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [activeView, setActiveView] = useState<'todo' | 'history'>('todo');
  const [filterLoai, setFilterLoai] = useState('');
  const [filterFromBranch, setFilterFromBranch] = useState('');
  const [filterToBranch, setFilterToBranch] = useState('');
  const [page, setPage] = useState(1);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({
    from_branch_id: '',
    to_branch_id: '',
    loai: 'lens',
    item_id: '',
    ten_san_pham: '',
    so_luong: '',
    don_gia: '',
    ghi_chu: '',
  });
  const [productSearch, setProductSearch] = useState('');

  // Inventory items for selection
  const [inventoryItems, setInventoryItems] = useState<any[]>([]);
  const [loadingItems, setLoadingItems] = useState(false);

  const loadBranches = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      const res = await fetchWithAuth('/api/branches?status=active');
      if (res.ok) setBranches(await res.json());
    } catch {}
  }, [currentTenantId]);

  const loadTransfers = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: '50' });
      if (filterLoai) params.set('loai', filterLoai);
      // For "todo" view, fetch pending+approved; for history fetch all then filter client-side
      const res = await fetchWithAuth(`/api/branches/transfers?${params}`);
      if (res.ok) {
        const result = await res.json();
        setTransfers(result.data || []);
        setTotal(result.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [currentTenantId, page, filterLoai]);

  // Load inventory items when branch & type changes
  const loadInventoryItems = useCallback(async () => {
    if (!form.from_branch_id || !form.loai) {
      setInventoryItems([]);
      return;
    }
    setLoadingItems(true);
    try {
      let endpoint = '';
      if (form.loai === 'lens') {
        endpoint = '/api/inventory/lens-stock';
      } else if (form.loai === 'thuoc') {
        endpoint = '/api/thuoc';
      } else if (form.loai === 'gong') {
        endpoint = '/api/gong-kinh';
      }
      if (endpoint) {
        const res = await fetchWithAuth(endpoint, {
          headers: { 'x-branch-id': form.from_branch_id },
        });
        if (res.ok) {
          const data = await res.json();
          setInventoryItems(Array.isArray(data) ? data : data.data || []);
        } else {
          setInventoryItems([]);
        }
      }
    } catch {}
    setLoadingItems(false);
  }, [form.from_branch_id, form.loai]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) {
      loadBranches();
      loadTransfers();
    }
  }, [tenancyLoading, currentTenantId, loadBranches, loadTransfers]);

  useEffect(() => {
    if (form.from_branch_id && form.loai) loadInventoryItems();
  }, [form.from_branch_id, form.loai, loadInventoryItems]);

  // Helpers
  const getItemName = useCallback((item: any) => {
    if (form.loai === 'lens') {
      return `${item.HangTrong?.ten_hang || 'Tròng'} SPH:${item.sph} CYL:${item.cyl}${item.add_power ? ` ADD:${item.add_power}` : ''}`;
    }
    if (form.loai === 'thuoc') return item.tenthuoc || item.mathuoc || `Thuốc #${item.id}`;
    if (form.loai === 'gong') return item.ten_gong || item.ma_gong || `Gọng #${item.id}`;
    return String(item.id);
  }, [form.loai]);

  const getItemStock = useCallback((item: any) => {
    if (form.loai === 'lens') return item.ton_hien_tai ?? 0;
    if (form.loai === 'thuoc') return item.tonkho ?? 0;
    if (form.loai === 'gong') return item.ton_kho ?? 0;
    return 0;
  }, [form.loai]);

  const getItemCost = useCallback((item: any) => {
    if (form.loai === 'lens') return item.HangTrong?.gia_nhap ?? 0;
    if (form.loai === 'thuoc') return item.gianhap ?? 0;
    if (form.loai === 'gong') return item.gia_nhap ?? 0;
    return 0;
  }, [form.loai]);

  // Filtered list of items (search + stock > 0)
  const filteredItems = useMemo(() => {
    const q = productSearch.trim().toLowerCase();
    return inventoryItems
      .filter(i => getItemStock(i) > 0)
      .filter(i => !q || getItemName(i).toLowerCase().includes(q));
  }, [inventoryItems, productSearch, getItemName, getItemStock]);

  const selectedItem = useMemo(
    () => inventoryItems.find(i => String(i.id) === form.item_id),
    [inventoryItems, form.item_id]
  );
  const selectedStock = selectedItem ? getItemStock(selectedItem) : 0;
  const overStock = !!form.so_luong && selectedItem && parseInt(form.so_luong) > selectedStock;

  const pickItem = (item: any) => {
    const cost = Number(getItemCost(item)) || 0;
    setForm(f => ({
      ...f,
      item_id: String(item.id),
      ten_san_pham: getItemName(item),
      don_gia: String(Math.max(0, Math.round(cost))),
    }));
    setProductSearch('');
  };

  const resetForm = () => {
    setForm({ from_branch_id: '', to_branch_id: '', loai: 'lens', item_id: '', ten_san_pham: '', so_luong: '', don_gia: '', ghi_chu: '' });
    setProductSearch('');
    setInventoryItems([]);
  };

  const handleSubmit = async () => {
    if (!form.from_branch_id || !form.to_branch_id || !form.item_id || !form.so_luong) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }
    if (form.from_branch_id === form.to_branch_id) {
      toast.error('Chi nhánh gửi và nhận phải khác nhau');
      return;
    }
    if (overStock) {
      toast.error(`Chỉ có ${selectedStock} trong kho`);
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/branches/transfers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          so_luong: parseInt(form.so_luong),
          don_gia: form.don_gia ? parseInt(form.don_gia) : 0,
        }),
      });
      if (res.ok) {
        toast.success('Đã tạo phiếu điều chuyển');
        setShowForm(false);
        resetForm();
        loadTransfers();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
    setSaving(false);
  };

  const callAction = async (transferId: string, action: string): Promise<boolean> => {
    try {
      const res = await fetchWithAuth('/api/branches/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transferId, action }),
      });
      if (res.ok) return true;
      const err = await res.json();
      toast.error(err.error || `Không thể ${action}`);
      return false;
    } catch {
      toast.error('Lỗi kết nối');
      return false;
    }
  };

  const handleAction = async (transferId: string, action: string) => {
    const confirmMsg: Record<string, string> = {
      approve: 'Duyệt phiếu điều chuyển này?',
      reject: 'Từ chối phiếu điều chuyển này?',
      complete: 'Hoàn thành điều chuyển? Hệ thống sẽ tự động cập nhật kho.',
      cancel: 'Hủy phiếu điều chuyển này?',
    };
    if (!confirm(confirmMsg[action] || 'Xác nhận?')) return;
    if (await callAction(transferId, action)) {
      toast.success('Đã cập nhật phiếu');
      loadTransfers();
    }
  };

  // Combo: Duyệt + hoàn thành 1 click
  const handleApproveAndComplete = async (transferId: string) => {
    if (!confirm('Duyệt và hoàn thành ngay? Kho sẽ được cập nhật tự động.')) return;
    const ok1 = await callAction(transferId, 'approve');
    if (!ok1) return;
    const ok2 = await callAction(transferId, 'complete');
    if (ok2) {
      toast.success('Đã duyệt và hoàn thành');
      loadTransfers();
    } else {
      toast('Đã duyệt — vui lòng bấm "Hoàn thành" để cập nhật kho', { icon: 'ℹ️' });
      loadTransfers();
    }
  };

  const formatDate = (d: string) => new Date(d).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' });

  // Filter transfers client-side by view + branches
  const visibleTransfers = useMemo(() => {
    return transfers.filter(t => {
      const isPending = t.status === 'pending' || t.status === 'approved';
      if (activeView === 'todo' && !isPending) return false;
      if (activeView === 'history' && isPending) return false;
      if (filterFromBranch && t.from_branch_id !== filterFromBranch) return false;
      if (filterToBranch && t.to_branch_id !== filterToBranch) return false;
      return true;
    });
  }, [transfers, activeView, filterFromBranch, filterToBranch]);

  const todoCount = transfers.filter(t => t.status === 'pending' || t.status === 'approved').length;
  const pendingCount = transfers.filter(t => t.status === 'pending').length;

  if (tenancyLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }

  return (
    <ProtectedRoute>
      <FeatureGate feature="branch_transfer" permission="manage_inventory">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="w-7 h-7 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Điều chuyển kho</h1>
                <p className="text-sm text-gray-500">Chuyển kính, thuốc, vật tư giữa các chi nhánh</p>
              </div>
            </div>
            <button
              onClick={() => { resetForm(); setShowForm(true); }}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium shadow-sm"
            >
              <Plus className="w-4 h-4" />
              Tạo phiếu chuyển kho
            </button>
          </div>

          {/* Quick stats */}
          {pendingCount > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-xl px-4 py-3 mb-4 flex items-center gap-3">
              <AlertTriangle className="w-5 h-5 text-amber-600 flex-shrink-0" />
              <div className="flex-1 text-sm">
                <span className="font-semibold text-amber-800">{pendingCount} phiếu chờ duyệt</span>
                <span className="text-amber-700 ml-1">— cần xử lý sớm để tránh tồn đọng.</span>
              </div>
              <button
                onClick={() => setActiveView('todo')}
                className="px-3 py-1.5 text-xs bg-amber-600 text-white rounded-lg hover:bg-amber-700 font-medium"
              >
                Xem ngay
              </button>
            </div>
          )}

          {/* Tabs (todo / history) */}
          <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit">
            <button
              onClick={() => setActiveView('todo')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                activeView === 'todo' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Inbox className="w-4 h-4" />
              Cần xử lý
              {todoCount > 0 && (
                <span className="text-[10px] bg-amber-500 text-white px-1.5 py-0.5 rounded-full font-bold">{todoCount}</span>
              )}
            </button>
            <button
              onClick={() => setActiveView('history')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors flex items-center gap-1.5 ${
                activeView === 'history' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <History className="w-4 h-4" />
              Lịch sử
            </button>
          </div>

          {/* Filters */}
          <div className="flex gap-2 mb-4 flex-wrap">
            <select
              value={filterFromBranch}
              onChange={e => setFilterFromBranch(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Tất cả chi nhánh gửi</option>
              {branches.map(b => <option key={b.id} value={b.id}>Từ: {b.ten_chi_nhanh}</option>)}
            </select>
            <select
              value={filterToBranch}
              onChange={e => setFilterToBranch(e.target.value)}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Tất cả chi nhánh nhận</option>
              {branches.map(b => <option key={b.id} value={b.id}>Đến: {b.ten_chi_nhanh}</option>)}
            </select>
            <select
              value={filterLoai}
              onChange={e => { setFilterLoai(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Tất cả loại hàng</option>
              {Object.entries(LOAI_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            {(filterFromBranch || filterToBranch || filterLoai) && (
              <button
                onClick={() => { setFilterFromBranch(''); setFilterToBranch(''); setFilterLoai(''); }}
                className="text-xs text-gray-500 hover:text-gray-700 underline self-center"
              >
                Xóa lọc
              </button>
            )}
            <span className="text-sm text-gray-400 self-center ml-auto">{visibleTransfers.length} / {total} phiếu</span>
          </div>

          {/* Transfer List */}
          {loading ? (
            <div className="text-center py-10 text-gray-400">Đang tải...</div>
          ) : visibleTransfers.length === 0 ? (
            <div className="text-center py-16 text-gray-400 bg-white rounded-xl border border-dashed">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p className="font-medium">{activeView === 'todo' ? 'Không có phiếu nào cần xử lý' : 'Chưa có lịch sử điều chuyển'}</p>
              <p className="text-xs text-gray-400 mt-1">{activeView === 'todo' ? 'Tất cả phiếu đã được xử lý hoặc chưa có phiếu mới.' : 'Phiếu hoàn thành / từ chối / hủy sẽ xuất hiện ở đây.'}</p>
            </div>
          ) : (
            <div className="space-y-3">
              {visibleTransfers.map(t => {
                const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.pending;
                const StatusIcon = sc.icon;
                const isPending = t.status === 'pending';
                const isApproved = t.status === 'approved';
                return (
                  <div
                    key={t.id}
                    className={`bg-white rounded-xl border p-4 shadow-sm transition-all ${
                      isPending ? 'border-amber-200 ring-1 ring-amber-100' : 'border-gray-200'
                    }`}
                  >
                    {/* From → To prominent */}
                    <div className="flex items-center gap-3 mb-3 flex-wrap">
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-gray-50 rounded-lg border border-gray-200">
                        <Building2 className="w-3.5 h-3.5 text-gray-500" />
                        <span className="text-sm font-medium text-gray-800">{t.from_branch?.ten_chi_nhanh || '—'}</span>
                      </div>
                      <ArrowRightLeft className="w-5 h-5 text-blue-500 flex-shrink-0" />
                      <div className="flex items-center gap-2 px-3 py-1.5 bg-blue-50 rounded-lg border border-blue-200">
                        <Building2 className="w-3.5 h-3.5 text-blue-500" />
                        <span className="text-sm font-medium text-blue-800">{t.to_branch?.ten_chi_nhanh || '—'}</span>
                      </div>
                      <span className={`text-[11px] px-2 py-1 rounded-full font-semibold border ${sc.color}`}>
                        <StatusIcon className="w-3 h-3 inline mr-1" />{sc.label}
                      </span>
                      <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                        {LOAI_LABELS[t.loai] || t.loai}
                      </span>
                      <span className="ml-auto text-xs text-gray-400">{formatDate(t.created_at)}</span>
                    </div>

                    {/* Product info */}
                    <div className="flex items-center gap-4 flex-wrap">
                      <div className="flex-1 min-w-[200px]">
                        <p className="text-sm font-semibold text-gray-900">
                          {t.ten_san_pham || `Mã: ${t.item_id}`}
                        </p>
                        <div className="flex gap-3 mt-1 text-xs text-gray-500">
                          <span>SL: <strong className="text-gray-800">{t.so_luong}</strong></span>
                          {t.don_gia > 0 && (
                            <span>Đơn giá: <strong className="text-gray-800">{t.don_gia.toLocaleString('vi-VN')}đ</strong></span>
                          )}
                          {t.don_gia > 0 && (
                            <span>Tổng: <strong className="text-gray-800">{(t.don_gia * t.so_luong).toLocaleString('vi-VN')}đ</strong></span>
                          )}
                        </div>
                        {t.ghi_chu && <p className="text-xs text-gray-500 italic mt-1">📝 {t.ghi_chu}</p>}
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1.5 flex-wrap">
                        {isPending && (
                          <>
                            <button
                              onClick={() => handleApproveAndComplete(t.id)}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-sm"
                              title="Duyệt và hoàn thành ngay (cập nhật kho)"
                            >
                              <Zap className="w-3.5 h-3.5" /> Duyệt & hoàn thành
                            </button>
                            <button
                              onClick={() => handleAction(t.id, 'approve')}
                              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium border border-blue-200"
                            >
                              Chỉ duyệt
                            </button>
                            <button
                              onClick={() => handleAction(t.id, 'reject')}
                              className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium border border-red-200"
                            >
                              Từ chối
                            </button>
                          </>
                        )}
                        {isApproved && (
                          <>
                            <button
                              onClick={() => handleAction(t.id, 'complete')}
                              className="flex items-center gap-1 px-3 py-1.5 text-xs bg-green-600 text-white rounded-lg hover:bg-green-700 font-medium shadow-sm"
                            >
                              <CheckCircle className="w-3.5 h-3.5" /> Hoàn thành
                            </button>
                            <button
                              onClick={() => handleAction(t.id, 'cancel')}
                              className="px-3 py-1.5 text-xs bg-gray-50 text-gray-600 rounded-lg hover:bg-gray-100 font-medium border border-gray-200"
                            >
                              Hủy
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Pagination */}
          {total > 50 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30 hover:bg-gray-50"
              >
                Trước
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-500">Trang {page} / {Math.ceil(total / 50)}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / 50)}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30 hover:bg-gray-50"
              >
                Sau
              </button>
            </div>
          )}

          {/* Create Form Modal */}
          {showForm && (
            <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 backdrop-blur-sm overflow-y-auto p-4">
              <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl my-8">
                <div className="flex items-center justify-between px-5 py-4 border-b">
                  <div>
                    <h3 className="font-semibold text-gray-900 text-lg flex items-center gap-2">
                      <ArrowRightLeft className="w-5 h-5 text-blue-600" />
                      Tạo phiếu điều chuyển
                    </h3>
                    <p className="text-xs text-gray-500 mt-0.5">Chọn chi nhánh gửi → nhận, sau đó chọn sản phẩm để chuyển.</p>
                  </div>
                  <button
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="p-1.5 text-gray-400 hover:text-gray-700 hover:bg-gray-100 rounded-lg"
                  >
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div className="p-5 space-y-5">
                  {/* Step 1: Branches */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">1. Chi nhánh</p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block flex items-center gap-1">
                          <Send className="w-3.5 h-3.5 text-gray-500" /> Từ chi nhánh *
                        </label>
                        <select
                          value={form.from_branch_id}
                          onChange={e => setForm(f => ({ ...f, from_branch_id: e.target.value, item_id: '', ten_san_pham: '' }))}
                          className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                        >
                          <option value="">-- Chọn chi nhánh gửi --</option>
                          {branches.map(b => <option key={b.id} value={b.id}>{b.ten_chi_nhanh}</option>)}
                        </select>
                      </div>
                      <div>
                        <label className="text-sm font-medium text-gray-700 mb-1 block flex items-center gap-1">
                          <Inbox className="w-3.5 h-3.5 text-blue-500" /> Đến chi nhánh *
                        </label>
                        <select
                          value={form.to_branch_id}
                          onChange={e => setForm(f => ({ ...f, to_branch_id: e.target.value }))}
                          className="w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                        >
                          <option value="">-- Chọn chi nhánh nhận --</option>
                          {branches.filter(b => b.id !== form.from_branch_id).map(b => (
                            <option key={b.id} value={b.id}>{b.ten_chi_nhanh}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>

                  {/* Step 2: Type */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">2. Loại hàng</p>
                    <div className="flex gap-2 flex-wrap">
                      {Object.entries(LOAI_LABELS).map(([k, v]) => (
                        <button
                          key={k}
                          type="button"
                          onClick={() => setForm(f => ({ ...f, loai: k, item_id: '', ten_san_pham: '' }))}
                          className={`px-4 py-2 text-sm rounded-lg border font-medium transition-colors ${
                            form.loai === k
                              ? 'bg-blue-600 text-white border-blue-600'
                              : 'bg-white text-gray-700 border-gray-200 hover:border-blue-300'
                          }`}
                        >
                          {v}
                        </button>
                      ))}
                    </div>
                  </div>

                  {/* Step 3: Product */}
                  <div>
                    <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">3. Sản phẩm</p>
                    {!form.from_branch_id ? (
                      <div className="text-sm text-gray-400 bg-gray-50 rounded-lg px-4 py-3 border border-dashed">
                        ← Chọn chi nhánh gửi trước để xem sản phẩm có sẵn.
                      </div>
                    ) : loadingItems ? (
                      <div className="text-sm text-gray-400 px-3 py-2">Đang tải danh sách sản phẩm...</div>
                    ) : (
                      <>
                        {/* Product search */}
                        <div className="relative mb-2">
                          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                          <input
                            type="text"
                            value={productSearch}
                            onChange={e => setProductSearch(e.target.value)}
                            placeholder="Tìm sản phẩm theo tên..."
                            className="w-full border rounded-lg pl-10 pr-3 py-2.5 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                          />
                        </div>

                        {/* Selected item display */}
                        {selectedItem && (
                          <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 mb-2 flex items-center gap-3">
                            <Package className="w-5 h-5 text-blue-600 flex-shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-semibold text-blue-900 truncate">{form.ten_san_pham}</p>
                              <p className="text-xs text-blue-700">Tồn kho hiện có: <strong>{selectedStock}</strong></p>
                            </div>
                            <button
                              onClick={() => setForm(f => ({ ...f, item_id: '', ten_san_pham: '', so_luong: '' }))}
                              className="text-blue-700 hover:bg-blue-100 p-1 rounded"
                              title="Bỏ chọn"
                            >
                              <X className="w-4 h-4" />
                            </button>
                          </div>
                        )}

                        {/* Item list */}
                        {!selectedItem && (
                          <div className="border rounded-lg max-h-56 overflow-y-auto divide-y bg-white">
                            {filteredItems.length === 0 ? (
                              <div className="px-4 py-6 text-center text-sm text-gray-400">
                                {productSearch ? 'Không tìm thấy sản phẩm phù hợp.' : 'Không có sản phẩm nào còn tồn ở chi nhánh này.'}
                              </div>
                            ) : (
                              filteredItems.slice(0, 100).map(item => (
                                <button
                                  key={item.id}
                                  type="button"
                                  onClick={() => pickItem(item)}
                                  className="w-full text-left px-3 py-2 hover:bg-blue-50 flex items-center justify-between gap-2"
                                >
                                  <span className="text-sm text-gray-800 truncate">{getItemName(item)}</span>
                                  <span className="text-xs bg-gray-100 text-gray-700 px-2 py-0.5 rounded font-mono flex-shrink-0">
                                    Tồn: {getItemStock(item)}
                                  </span>
                                </button>
                              ))
                            )}
                            {filteredItems.length > 100 && (
                              <div className="px-3 py-2 text-xs text-gray-400 text-center bg-gray-50">
                                Hiển thị 100 / {filteredItems.length} sản phẩm — gõ để tìm chính xác hơn
                              </div>
                            )}
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Step 4: Quantity */}
                  {selectedItem && (
                    <div>
                      <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2">4. Số lượng</p>
                      <div className="flex gap-2 items-start flex-wrap">
                        <div className="flex-1 min-w-[160px]">
                          <input
                            type="number"
                            min="1"
                            max={selectedStock}
                            value={form.so_luong}
                            onChange={e => setForm(f => ({ ...f, so_luong: e.target.value }))}
                            placeholder={`Nhập số lượng (tối đa ${selectedStock})`}
                            className={`w-full border rounded-lg px-3 py-2.5 text-sm focus:ring-2 focus:outline-none ${
                              overStock ? 'border-red-300 focus:ring-red-200 bg-red-50' : 'focus:ring-blue-200'
                            }`}
                          />
                          {overStock && (
                            <p className="text-xs text-red-600 mt-1 flex items-center gap-1">
                              <AlertTriangle className="w-3 h-3" /> Vượt tồn kho ({selectedStock})
                            </p>
                          )}
                        </div>
                        <div className="flex gap-1">
                          {[1, 5, 10].filter(n => n <= selectedStock).map(n => (
                            <button
                              key={n}
                              type="button"
                              onClick={() => setForm(f => ({ ...f, so_luong: String(n) }))}
                              className="px-3 py-2 text-xs bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 font-medium"
                            >
                              +{n}
                            </button>
                          ))}
                          <button
                            type="button"
                            onClick={() => setForm(f => ({ ...f, so_luong: String(selectedStock) }))}
                            className="px-3 py-2 text-xs bg-blue-100 text-blue-700 rounded-lg hover:bg-blue-200 font-medium"
                          >
                            Tất cả ({selectedStock})
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Notes */}
                  <div>
                    <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú (tuỳ chọn)</label>
                    <input
                      type="text"
                      value={form.ghi_chu}
                      onChange={e => setForm(f => ({ ...f, ghi_chu: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                      placeholder="VD: Bổ sung kho cho chi nhánh đang thiếu..."
                    />
                  </div>
                </div>

                <div className="flex gap-2 px-5 py-4 border-t bg-gray-50 rounded-b-xl">
                  <button
                    onClick={handleSubmit}
                    disabled={saving || overStock || !form.item_id}
                    className="flex items-center gap-2 px-5 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                  >
                    <Save className="w-4 h-4" />
                    {saving ? 'Đang lưu...' : 'Tạo phiếu'}
                  </button>
                  <button
                    onClick={() => { setShowForm(false); resetForm(); }}
                    className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
