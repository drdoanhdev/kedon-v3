// Bảo hành / đổi trả liên chi nhánh
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import PageHeader from '../components/PageHeader';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { Plus, RefreshCw } from 'lucide-react';

const LOAI_LABELS: Record<string, string> = {
  bao_hanh: 'Bảo hành',
  doi_tra: 'Đổi trả',
  sua_chua: 'Sửa chữa',
};

const STATUS_LABELS: Record<string, string> = {
  tiep_nhan: 'Tiếp nhận',
  dang_xu_ly: 'Đang xử lý',
  hoan_tat: 'Hoàn tất',
  huy: 'Huỷ',
};

export default function BaoHanhLienChiNhanhPage() {
  const { currentTenantId, tenancyLoading } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState({
    benhnhan_id: '',
    don_kinh_id: '',
    loai: 'bao_hanh',
    ly_do: '',
  });

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/branches/warranties');
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
    if (!form.benhnhan_id) {
      toast.error('Nhập ID bệnh nhân');
      return;
    }
    const res = await fetchWithAuth('/api/branches/warranties', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        benhnhan_id: Number(form.benhnhan_id),
        don_kinh_id: form.don_kinh_id ? Number(form.don_kinh_id) : null,
        loai: form.loai,
        ly_do: form.ly_do,
      }),
    });
    if (res.ok) {
      toast.success('Đã tạo phiếu');
      setShowAdd(false);
      load();
    } else {
      const err = await res.json().catch(() => ({}));
      toast.error(err.error || 'Lỗi');
    }
  };

  const updateStatus = async (id: string, trang_thai: string) => {
    const res = await fetchWithAuth('/api/branches/warranties', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id, trang_thai }),
    });
    if (res.ok) {
      toast.success('Đã cập nhật');
      load();
    } else toast.error('Lỗi cập nhật');
  };

  return (
    <ProtectedRoute>
      <FeatureGate feature="multi_branch">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <PageHeader
            title="Bảo hành liên chi nhánh"
            subtitle="Tiếp nhận BH / đổi trả ở cửa hàng khác nơi bán"
            actions={
              <div className="flex gap-2">
                <button onClick={load} className="px-3 py-1.5 text-sm border rounded-lg">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={() => setShowAdd(true)}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg"
                >
                  <Plus className="w-3.5 h-3.5" /> Tiếp nhận
                </button>
              </div>
            }
          />

          {loading ? (
            <p className="text-center text-gray-400 py-10">Đang tải...</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-500 py-10 text-sm">Chưa có phiếu bảo hành.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="bg-white border rounded-xl p-3">
                  <div className="flex justify-between gap-2">
                    <div>
                      <p className="font-medium text-sm">
                        {r.patient?.ten || `BN #${r.benhnhan_id}`} · {LOAI_LABELS[r.loai] || r.loai}
                      </p>
                      <p className="text-xs text-gray-500">
                        Bán tại: {r.sale_branch || '—'} → Xử lý: {r.service_branch || '—'}
                        {r.don_kinh_id ? ` · Đơn #${r.don_kinh_id}` : ''}
                      </p>
                      {r.ly_do && <p className="text-xs text-gray-600 mt-1">{r.ly_do}</p>}
                    </div>
                    <span className="text-xs h-fit px-2 py-1 rounded bg-amber-50 text-amber-800">
                      {STATUS_LABELS[r.trang_thai] || r.trang_thai}
                    </span>
                  </div>
                  {r.trang_thai !== 'hoan_tat' && r.trang_thai !== 'huy' && (
                    <div className="flex gap-2 mt-2">
                      {r.trang_thai === 'tiep_nhan' && (
                        <button
                          onClick={() => updateStatus(r.id, 'dang_xu_ly')}
                          className="text-xs px-2 py-1 border rounded-lg"
                        >
                          Đang xử lý
                        </button>
                      )}
                      <button
                        onClick={() => updateStatus(r.id, 'hoan_tat')}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded-lg"
                      >
                        Hoàn tất
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {showAdd && (
            <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
              <div className="bg-white rounded-xl w-full max-w-md p-4 space-y-2">
                <h3 className="font-semibold">Tiếp nhận BH / đổi trả</h3>
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="ID bệnh nhân"
                  value={form.benhnhan_id}
                  onChange={(e) => setForm((f) => ({ ...f, benhnhan_id: e.target.value }))}
                />
                <input
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="ID đơn kính (tuỳ chọn)"
                  value={form.don_kinh_id}
                  onChange={(e) => setForm((f) => ({ ...f, don_kinh_id: e.target.value }))}
                />
                <select
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  value={form.loai}
                  onChange={(e) => setForm((f) => ({ ...f, loai: e.target.value }))}
                >
                  {Object.entries(LOAI_LABELS).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
                <textarea
                  className="w-full border rounded-lg px-3 py-2 text-sm"
                  placeholder="Lý do"
                  rows={2}
                  value={form.ly_do}
                  onChange={(e) => setForm((f) => ({ ...f, ly_do: e.target.value }))}
                />
                <div className="flex justify-end gap-2">
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
