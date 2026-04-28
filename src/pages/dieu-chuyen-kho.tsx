// Điều chuyển kho giữa chi nhánh
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import {
  ArrowRightLeft, Plus, CheckCircle, XCircle, Clock, Package,
  Save
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
  pending: { label: 'Chờ duyệt', color: 'bg-amber-100 text-amber-700', icon: Clock },
  approved: { label: 'Đã duyệt', color: 'bg-blue-100 text-blue-700', icon: CheckCircle },
  completed: { label: 'Hoàn thành', color: 'bg-green-100 text-green-700', icon: CheckCircle },
  rejected: { label: 'Từ chối', color: 'bg-red-100 text-red-700', icon: XCircle },
  cancelled: { label: 'Đã hủy', color: 'bg-gray-100 text-gray-500', icon: XCircle },
};

export default function DieuChuyenKho() {
  const { currentTenantId, tenancyLoading } = useAuth();

  const [branches, setBranches] = useState<Branch[]>([]);
  const [transfers, setTransfers] = useState<Transfer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('');
  const [filterLoai, setFilterLoai] = useState('');
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
      const params = new URLSearchParams({ page: String(page), limit: '30' });
      if (filterStatus) params.set('status', filterStatus);
      if (filterLoai) params.set('loai', filterLoai);
      const res = await fetchWithAuth(`/api/branches/transfers?${params}`);
      if (res.ok) {
        const result = await res.json();
        setTransfers(result.data || []);
        setTotal(result.total || 0);
      }
    } catch {}
    setLoading(false);
  }, [currentTenantId, page, filterStatus, filterLoai]);

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
          headers: {
            'x-branch-id': form.from_branch_id,
          },
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

  const handleSubmit = async () => {
    if (!form.from_branch_id || !form.to_branch_id || !form.item_id || !form.so_luong) {
      toast.error('Vui lòng điền đầy đủ thông tin bắt buộc');
      return;
    }
    if (form.from_branch_id === form.to_branch_id) {
      toast.error('Chi nhánh gửi và nhận phải khác nhau');
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
        setForm({ from_branch_id: '', to_branch_id: '', loai: 'lens', item_id: '', ten_san_pham: '', so_luong: '', don_gia: '', ghi_chu: '' });
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

  const handleAction = async (transferId: string, action: string) => {
    const confirmMsg: Record<string, string> = {
      approve: 'Duyệt phiếu điều chuyển này?',
      reject: 'Từ chối phiếu điều chuyển này?',
      complete: 'Hoàn thành điều chuyển? Hệ thống sẽ tự động cập nhật kho.',
      cancel: 'Hủy phiếu điều chuyển này?',
    };
    if (!confirm(confirmMsg[action] || 'Xác nhận?')) return;

    try {
      const res = await fetchWithAuth('/api/branches/transfers', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: transferId, action }),
      });
      if (res.ok) {
        toast.success('Đã cập nhật phiếu');
        loadTransfers();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
  };

  const formatMoney = (n: number) => n.toLocaleString('vi-VN') + 'đ';
  const formatDate = (d: string) => new Date(d).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });

  const getItemName = (item: any) => {
    if (form.loai === 'lens') {
      return `${item.HangTrong?.ten_hang || 'Tròng'} SPH:${item.sph} CYL:${item.cyl}${item.add_power ? ` ADD:${item.add_power}` : ''}`;
    }
    if (form.loai === 'thuoc') return item.tenthuoc || item.mathuoc || `Thuốc #${item.id}`;
    if (form.loai === 'gong') return item.ten_gong || item.ma_gong || `Gọng #${item.id}`;
    return String(item.id);
  };

  const getItemStock = (item: any) => {
    if (form.loai === 'lens') return item.ton_hien_tai ?? 0;
    if (form.loai === 'thuoc') return item.tonkho ?? 0;
    if (form.loai === 'gong') return item.ton_kho ?? 0;
    return 0;
  };

  const getItemCost = (item: any) => {
    if (form.loai === 'lens') return item.HangTrong?.gia_nhap ?? 0;
    if (form.loai === 'thuoc') return item.gianhap ?? 0;
    if (form.loai === 'gong') return item.gia_nhap ?? 0;
    return 0;
  };

  const getItemLabel = (item: any) => {
    return `${getItemName(item)} (Tồn: ${getItemStock(item)})`;
  };

  if (tenancyLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }

  return (
    <ProtectedRoute>
      <FeatureGate feature="branch_transfer" permission="manage_inventory">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6">
            <div className="flex items-center gap-3">
              <ArrowRightLeft className="w-7 h-7 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Điều chuyển kho</h1>
                <p className="text-sm text-gray-500">Chuyển kính, thuốc, vật tư giữa các chi nhánh</p>
              </div>
            </div>
            <button
              onClick={() => setShowForm(true)}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
            >
              <Plus className="w-4 h-4" />
              Tạo phiếu
            </button>
          </div>

          {/* Create Form */}
          {showForm && (
            <div className="bg-white border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
              <h3 className="font-semibold text-gray-800 mb-4">Tạo phiếu điều chuyển</h3>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Từ chi nhánh *</label>
                  <select
                    value={form.from_branch_id}
                    onChange={e => setForm(f => ({ ...f, from_branch_id: e.target.value, item_id: '', ten_san_pham: '' }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">-- Chọn --</option>
                    {branches.map(b => <option key={b.id} value={b.id}>{b.ten_chi_nhanh}</option>)}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Đến chi nhánh *</label>
                  <select
                    value={form.to_branch_id}
                    onChange={e => setForm(f => ({ ...f, to_branch_id: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    <option value="">-- Chọn --</option>
                    {branches.filter(b => b.id !== form.from_branch_id).map(b => (
                      <option key={b.id} value={b.id}>{b.ten_chi_nhanh}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Loại hàng *</label>
                  <select
                    value={form.loai}
                    onChange={e => setForm(f => ({ ...f, loai: e.target.value, item_id: '', ten_san_pham: '' }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  >
                    {Object.entries(LOAI_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </select>
                </div>
                <div className="md:col-span-2">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Sản phẩm *</label>
                  {loadingItems ? (
                    <p className="text-sm text-gray-400 py-2">Đang tải...</p>
                  ) : (
                    <select
                      value={form.item_id}
                      onChange={e => {
                        const item = inventoryItems.find(i => String(i.id) === e.target.value);
                        const normalizedCost = item ? Number(getItemCost(item)) : 0;
                        setForm(f => ({
                          ...f,
                          item_id: e.target.value,
                          ten_san_pham: item ? getItemName(item) : '',
                          don_gia: item ? String(Math.max(0, Math.round(Number.isFinite(normalizedCost) ? normalizedCost : 0))) : f.don_gia,
                        }));
                      }}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    >
                      <option value="">-- Chọn sản phẩm --</option>
                      {inventoryItems.map(item => (
                        <option key={item.id} value={item.id}>{getItemLabel(item)}</option>
                      ))}
                    </select>
                  )}
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Số lượng *</label>
                  <input
                    type="number"
                    min="1"
                    value={form.so_luong}
                    onChange={e => setForm(f => ({ ...f, so_luong: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div className="md:col-span-3">
                  <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
                  <input
                    type="text"
                    value={form.ghi_chu}
                    onChange={e => setForm(f => ({ ...f, ghi_chu: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Lý do điều chuyển..."
                  />
                </div>
              </div>
              <div className="flex gap-2 mt-4">
                <button onClick={handleSubmit} disabled={saving}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50">
                  <Save className="w-4 h-4" />{saving ? 'Đang lưu...' : 'Tạo phiếu'}
                </button>
                <button onClick={() => setShowForm(false)} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">Hủy</button>
              </div>
            </div>
          )}

          {/* Filters */}
          <div className="flex gap-3 mb-4 flex-wrap">
            <select
              value={filterStatus}
              onChange={e => { setFilterStatus(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_CONFIG).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </select>
            <select
              value={filterLoai}
              onChange={e => { setFilterLoai(e.target.value); setPage(1); }}
              className="border rounded-lg px-3 py-2 text-sm bg-white"
            >
              <option value="">Tất cả loại hàng</option>
              {Object.entries(LOAI_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <span className="text-sm text-gray-400 self-center ml-auto">{total} phiếu</span>
          </div>

          {/* Transfer List */}
          {loading ? (
            <div className="text-center py-10 text-gray-400">Đang tải...</div>
          ) : transfers.length === 0 ? (
            <div className="text-center py-16 text-gray-400">
              <Package className="w-12 h-12 mx-auto mb-3 text-gray-300" />
              <p>Chưa có phiếu điều chuyển nào</p>
            </div>
          ) : (
            <div className="space-y-3">
              {transfers.map(t => {
                const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.pending;
                const StatusIcon = sc.icon;
                return (
                  <div key={t.id} className="bg-white rounded-xl border border-gray-200 p-4 shadow-sm">
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className={`text-[11px] px-2 py-0.5 rounded-full font-medium ${sc.color}`}>
                            <StatusIcon className="w-3 h-3 inline mr-1" />{sc.label}
                          </span>
                          <span className="text-[11px] bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full">
                            {LOAI_LABELS[t.loai] || t.loai}
                          </span>
                        </div>
                        <p className="text-sm font-medium text-gray-800 truncate">
                          {t.ten_san_pham || `Mã: ${t.item_id}`}
                        </p>
                        <div className="flex items-center gap-2 text-xs text-gray-500 mt-1">
                          <span className="font-medium text-gray-700">{t.from_branch?.ten_chi_nhanh || '—'}</span>
                          <ArrowRightLeft className="w-3.5 h-3.5 text-blue-500" />
                          <span className="font-medium text-gray-700">{t.to_branch?.ten_chi_nhanh || '—'}</span>
                        </div>
                        <div className="flex gap-4 mt-1.5 text-xs text-gray-400">
                          <span>SL: <strong className="text-gray-700">{t.so_luong}</strong></span>
                          {t.ghi_chu && <span className="truncate max-w-[200px]">{t.ghi_chu}</span>}
                          <span>{formatDate(t.created_at)}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex gap-1 shrink-0">
                        {t.status === 'pending' && (
                          <>
                            <button onClick={() => handleAction(t.id, 'approve')}
                              className="px-3 py-1.5 text-xs bg-blue-50 text-blue-700 rounded-lg hover:bg-blue-100 font-medium">
                              Duyệt
                            </button>
                            <button onClick={() => handleAction(t.id, 'reject')}
                              className="px-3 py-1.5 text-xs bg-red-50 text-red-600 rounded-lg hover:bg-red-100 font-medium">
                              Từ chối
                            </button>
                          </>
                        )}
                        {t.status === 'approved' && (
                          <>
                            <button onClick={() => handleAction(t.id, 'complete')}
                              className="px-3 py-1.5 text-xs bg-green-50 text-green-700 rounded-lg hover:bg-green-100 font-medium">
                              Hoàn thành
                            </button>
                            <button onClick={() => handleAction(t.id, 'cancel')}
                              className="px-3 py-1.5 text-xs bg-gray-50 text-gray-500 rounded-lg hover:bg-gray-100 font-medium">
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
          {total > 30 && (
            <div className="flex justify-center gap-2 mt-6">
              <button
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page === 1}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30 hover:bg-gray-50"
              >
                Trước
              </button>
              <span className="px-3 py-1.5 text-sm text-gray-500">Trang {page} / {Math.ceil(total / 30)}</span>
              <button
                onClick={() => setPage(p => p + 1)}
                disabled={page >= Math.ceil(total / 30)}
                className="px-3 py-1.5 text-sm border rounded-lg disabled:opacity-30 hover:bg-gray-50"
              >
                Sau
              </button>
            </div>
          )}
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
