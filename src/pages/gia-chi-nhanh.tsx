// Quản lý giá bán / giá vốn theo chi nhánh
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import PageHeader from '../components/PageHeader';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { RefreshCw, Plus, Trash2, Copy, Search } from 'lucide-react';

interface Branch {
  id: string;
  ten_chi_nhanh: string;
  is_main: boolean;
}

interface OverrideRow {
  id: string;
  item_type: string;
  item_id: number;
  ten_san_pham?: string;
  gia_ban_override: number | null;
  gia_von_override: number | null;
  reason?: string | null;
}

interface CatalogItem {
  id: number;
  name: string;
  gia_ban: number;
  gia_nhap: number;
}

const TYPE_LABELS: Record<string, string> = {
  gong_kinh: 'Gọng',
  hang_trong: 'Tròng',
  thuoc: 'Thuốc',
};

const formatMoney = (n: number | null | undefined) =>
  n == null ? '—' : Number(n).toLocaleString('vi-VN') + 'đ';

export default function GiaChiNhanhPage() {
  const { currentTenantId, tenancyLoading } = useAuth();
  const [branches, setBranches] = useState<Branch[]>([]);
  const [branchId, setBranchId] = useState('');
  const [itemType, setItemType] = useState('gong_kinh');
  const [overrides, setOverrides] = useState<OverrideRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [catalog, setCatalog] = useState<CatalogItem[]>([]);
  const [showAdd, setShowAdd] = useState(false);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState({
    item_id: '',
    gia_ban_override: '',
    gia_von_override: '',
    reason: '',
  });
  const [copyFromId, setCopyFromId] = useState('');
  const [saving, setSaving] = useState(false);

  const loadBranches = useCallback(async () => {
    if (!currentTenantId) return;
    const res = await fetchWithAuth('/api/branches?status=active');
    if (res.ok) {
      const data = await res.json();
      setBranches(data || []);
      if (!branchId && data?.[0]) setBranchId(data[0].id);
    }
  }, [currentTenantId, branchId]);

  const loadOverrides = useCallback(async () => {
    if (!currentTenantId || !branchId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ branch_id: branchId, item_type: itemType });
      const res = await fetchWithAuth(`/api/branches/price-overrides?${params}`);
      if (res.ok) setOverrides(await res.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [currentTenantId, branchId, itemType]);

  const loadCatalog = useCallback(async () => {
    if (!currentTenantId) return;
    try {
      let url = '';
      if (itemType === 'gong_kinh') url = '/api/gong-kinh?scope=shared';
      else if (itemType === 'hang_trong') url = '/api/hang-trong';
      else url = '/api/thuoc?scope=shared';
      const res = await fetchWithAuth(url);
      if (!res.ok) return;
      const data = await res.json();
      const rows = Array.isArray(data) ? data : data.data || [];
      setCatalog(
        rows.map((r: any) => ({
          id: Number(r.id),
          name: r.ten_gong || r.ten_hang || r.tenthuoc || `#${r.id}`,
          gia_ban: Number(r.gia_ban || r.giaban || 0),
          gia_nhap: Number(r.gia_nhap || r.gianhap || 0),
        }))
      );
    } catch {
      /* ignore */
    }
  }, [currentTenantId, itemType]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) loadBranches();
  }, [tenancyLoading, currentTenantId, loadBranches]);

  useEffect(() => {
    if (branchId) loadOverrides();
  }, [branchId, itemType, loadOverrides]);

  useEffect(() => {
    loadCatalog();
  }, [loadCatalog]);

  const handleSave = async () => {
    if (!form.item_id || (!form.gia_ban_override && !form.gia_von_override)) {
      toast.error('Chọn sản phẩm và nhập ít nhất một mức giá');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/branches/price-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: branchId,
          item_type: itemType,
          item_id: Number(form.item_id),
          gia_ban_override: form.gia_ban_override ? Number(form.gia_ban_override) : null,
          gia_von_override: form.gia_von_override ? Number(form.gia_von_override) : null,
          reason: form.reason || null,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi lưu');
      }
      toast.success('Đã lưu giá chi nhánh');
      setShowAdd(false);
      setForm({ item_id: '', gia_ban_override: '', gia_von_override: '', reason: '' });
      loadOverrides();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi lưu');
    }
    setSaving(false);
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Xóa giá riêng này?')) return;
    const res = await fetchWithAuth(`/api/branches/price-overrides?id=${id}`, { method: 'DELETE' });
    if (res.ok) {
      toast.success('Đã xóa');
      loadOverrides();
    } else toast.error('Không xóa được');
  };

  const handleCopyFrom = async () => {
    if (!copyFromId || copyFromId === branchId) {
      toast.error('Chọn chi nhánh nguồn khác');
      return;
    }
    setSaving(true);
    try {
      const params = new URLSearchParams({ branch_id: copyFromId, item_type: itemType });
      const res = await fetchWithAuth(`/api/branches/price-overrides?${params}`);
      if (!res.ok) throw new Error('Không tải được giá nguồn');
      const source: OverrideRow[] = await res.json();
      let ok = 0;
      for (const row of source) {
        const r = await fetchWithAuth('/api/branches/price-overrides', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            branch_id: branchId,
            item_type: row.item_type,
            item_id: row.item_id,
            gia_ban_override: row.gia_ban_override,
            gia_von_override: row.gia_von_override,
            reason: `Copy từ chi nhánh`,
          }),
        });
        if (r.ok) ok++;
      }
      toast.success(`Đã copy ${ok}/${source.length} mức giá`);
      loadOverrides();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi copy');
    }
    setSaving(false);
  };

  const filteredCatalog = catalog.filter((c) =>
    !search.trim() ? true : c.name.toLowerCase().includes(search.trim().toLowerCase())
  );

  if (tenancyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <FeatureGate feature="multi_branch" permission="manage_clinic">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <PageHeader
            title="Giá theo chi nhánh"
            subtitle="Override giá bán / giá vốn riêng cho từng cửa hàng"
            actions={
              <button
                onClick={() => setShowAdd(true)}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                <Plus className="w-3.5 h-3.5" /> Thêm giá
              </button>
            }
          />

          <div className="flex flex-wrap gap-2 mb-4">
            <select
              value={branchId}
              onChange={(e) => setBranchId(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm"
            >
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ten_chi_nhanh}
                </option>
              ))}
            </select>
            <select
              value={itemType}
              onChange={(e) => setItemType(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm"
            >
              {Object.entries(TYPE_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
            <button
              onClick={loadOverrides}
              className="flex items-center gap-1 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            </button>
          </div>

          <div className="bg-slate-50 border rounded-xl p-3 mb-4 flex flex-wrap items-end gap-2">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Copy giá từ chi nhánh</label>
              <select
                value={copyFromId}
                onChange={(e) => setCopyFromId(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm bg-white"
              >
                <option value="">— Chọn —</option>
                {branches
                  .filter((b) => b.id !== branchId)
                  .map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.ten_chi_nhanh}
                    </option>
                  ))}
              </select>
            </div>
            <button
              onClick={handleCopyFrom}
              disabled={saving || !copyFromId}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-white border rounded-lg hover:bg-gray-50 disabled:opacity-50"
            >
              <Copy className="w-3.5 h-3.5" /> Copy sang CN hiện tại
            </button>
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-10">Đang tải...</p>
          ) : overrides.length === 0 ? (
            <p className="text-center text-gray-500 py-10 text-sm">
              Chưa có giá riêng cho loại {TYPE_LABELS[itemType]} tại chi nhánh này.
            </p>
          ) : (
            <div className="overflow-x-auto border rounded-xl bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Sản phẩm</th>
                    <th className="px-3 py-2">Giá bán CN</th>
                    <th className="px-3 py-2">Giá vốn CN</th>
                    <th className="px-3 py-2">Ghi chú</th>
                    <th className="px-3 py-2 w-12" />
                  </tr>
                </thead>
                <tbody>
                  {overrides.map((o) => (
                    <tr key={o.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{o.ten_san_pham}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(o.gia_ban_override)}</td>
                      <td className="px-3 py-2 tabular-nums">{formatMoney(o.gia_von_override)}</td>
                      <td className="px-3 py-2 text-gray-500 text-xs">{o.reason || '—'}</td>
                      <td className="px-3 py-2">
                        <button
                          onClick={() => handleDelete(o.id)}
                          className="p-1 text-red-500 hover:bg-red-50 rounded"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {showAdd && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-end sm:items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-md p-4 shadow-xl">
                <h3 className="font-semibold mb-3">Thêm / cập nhật giá {TYPE_LABELS[itemType]}</h3>
                <div className="relative mb-2">
                  <Search className="w-4 h-4 absolute left-2.5 top-2.5 text-gray-400" />
                  <input
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                    placeholder="Tìm sản phẩm..."
                    className="w-full border rounded-lg pl-8 pr-3 py-2 text-sm"
                  />
                </div>
                <select
                  value={form.item_id}
                  onChange={(e) => {
                    const id = e.target.value;
                    const item = catalog.find((c) => String(c.id) === id);
                    setForm((f) => ({
                      ...f,
                      item_id: id,
                      gia_ban_override: item ? String(item.gia_ban) : f.gia_ban_override,
                      gia_von_override: item ? String(item.gia_nhap) : f.gia_von_override,
                    }));
                  }}
                  className="w-full border rounded-lg px-3 py-2 text-sm mb-2"
                >
                  <option value="">— Chọn sản phẩm —</option>
                  {filteredCatalog.slice(0, 100).map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (DM: {formatMoney(c.gia_ban)})
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2 mb-2">
                  <div>
                    <label className="text-xs text-gray-500">Giá bán</label>
                    <input
                      type="number"
                      value={form.gia_ban_override}
                      onChange={(e) => setForm((f) => ({ ...f, gia_ban_override: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                  <div>
                    <label className="text-xs text-gray-500">Giá vốn</label>
                    <input
                      type="number"
                      value={form.gia_von_override}
                      onChange={(e) => setForm((f) => ({ ...f, gia_von_override: e.target.value }))}
                      className="w-full border rounded-lg px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <input
                  value={form.reason}
                  onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))}
                  placeholder="Lý do (tuỳ chọn)"
                  className="w-full border rounded-lg px-3 py-2 text-sm mb-3"
                />
                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => setShowAdd(false)}
                    className="px-3 py-1.5 text-sm border rounded-lg"
                  >
                    Huỷ
                  </button>
                  <button
                    onClick={handleSave}
                    disabled={saving}
                    className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
                  >
                    Lưu
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
