// Khuyến mãi theo chi nhánh
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import PageHeader from '../components/PageHeader';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { Plus, RefreshCw } from 'lucide-react';

export default function KhuyenMaiChuoiPage() {
  const { currentTenantId, tenancyLoading } = useAuth();
  const { branches } = useBranch();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    ten_chuong_trinh: '',
    loai: 'percent',
    gia_tri: '',
    ma_voucher: '',
    ap_dung_cho: 'all',
    branch_id: '',
    tu_ngay: new Date().toISOString().slice(0, 10),
    den_ngay: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  });

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/branches/promotions');
      if (res.ok) setRows(await res.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) load();
  }, [tenancyLoading, currentTenantId, load]);

  const save = async () => {
    if (!form.ten_chuong_trinh.trim()) {
      toast.error('Nhập tên chương trình');
      return;
    }
    const res = await fetchWithAuth('/api/branches/promotions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...form,
        branch_id: form.branch_id || null,
        gia_tri: Number(form.gia_tri) || 0,
      }),
    });
    if (res.ok) {
      toast.success('Đã tạo khuyến mãi');
      setShowAdd(false);
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Lỗi');
    }
  };

  return (
    <ProtectedRoute>
      <FeatureGate feature="multi_branch" permission="manage_clinic">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <PageHeader
            title="Khuyến mãi chuỗi"
            subtitle="Chương trình / voucher theo cửa hàng hoặc toàn chuỗi"
            actions={
              <div className="flex gap-2">
                <button onClick={load} className="px-3 py-1.5 text-sm border rounded-lg">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" /> Thêm
                </button>
              </div>
            }
          />

          {loading ? (
            <p className="text-center text-gray-400 py-10">Đang tải...</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-500 py-10 text-sm">Chưa có chương trình khuyến mãi.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="bg-white border rounded-xl p-3 flex justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{r.ten_chuong_trinh}</p>
                    <p className="text-xs text-gray-500">
                      {r.branch?.ten_chi_nhanh || 'Toàn chuỗi'} · {r.loai} {r.gia_tri}
                      {r.loai === 'percent' ? '%' : 'đ'}
                      {r.ma_voucher ? ` · mã ${r.ma_voucher}` : ''}
                    </p>
                    <p className="text-xs text-gray-400">
                      {r.tu_ngay} → {r.den_ngay}
                    </p>
                  </div>
                  <span
                    className={`text-xs h-fit px-2 py-1 rounded ${
                      r.is_active ? 'bg-green-50 text-green-700' : 'bg-gray-100 text-gray-500'
                    }`}
                  >
                    {r.is_active ? 'Đang chạy' : 'Tắt'}
                  </span>
                </div>
              ))}
            </div>
          )}

          {showAdd && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-md p-4 space-y-2">
                <h3 className="font-semibold">Tạo khuyến mãi</h3>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Tên chương trình"
                  value={form.ten_chuong_trinh}
                  onChange={(e) => setForm((f) => ({ ...f, ten_chuong_trinh: e.target.value }))}
                />
                <div className="grid grid-cols-2 gap-2">
                  <select
                    className="border rounded-lg px-3 py-2 text-sm"
                    value={form.loai}
                    onChange={(e) => setForm((f) => ({ ...f, loai: e.target.value }))}
                  >
                    <option value="percent">% giảm</option>
                    <option value="fixed">Số tiền</option>
                    <option value="voucher">Voucher</option>
                  </select>
                  <input
                    type="number"
                    className="border rounded-lg px-3 py-2 text-sm"
                    placeholder="Giá trị"
                    value={form.gia_tri}
                    onChange={(e) => setForm((f) => ({ ...f, gia_tri: e.target.value }))}
                  />
                </div>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Mã voucher (nếu có)"
                  value={form.ma_voucher}
                  onChange={(e) => setForm((f) => ({ ...f, ma_voucher: e.target.value }))}
                />
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.branch_id}
                  onChange={(e) => setForm((f) => ({ ...f, branch_id: e.target.value }))}
                >
                  <option value="">Toàn chuỗi</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.ten_chi_nhanh}
                    </option>
                  ))}
                </select>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-2 text-sm"
                    value={form.tu_ngay}
                    onChange={(e) => setForm((f) => ({ ...f, tu_ngay: e.target.value }))}
                  />
                  <input
                    type="date"
                    className="border rounded-lg px-3 py-2 text-sm"
                    value={form.den_ngay}
                    onChange={(e) => setForm((f) => ({ ...f, den_ngay: e.target.value }))}
                  />
                </div>
                <div className="flex justify-end gap-2 pt-2">
                  <button onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-sm border rounded-lg">
                    Huỷ
                  </button>
                  <button onClick={save} className="px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg">
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
