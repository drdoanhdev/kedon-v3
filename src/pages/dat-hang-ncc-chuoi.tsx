// Đặt hàng NCC tập trung (gộp tròng cần đặt)
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import PageHeader from '../components/PageHeader';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { PackagePlus, RefreshCw } from 'lucide-react';

export default function DatHangNccChuoiPage() {
  const { currentTenantId, tenancyLoading } = useAuth();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [limits, setLimits] = useState<any>(null);

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const [poRes, limRes] = await Promise.all([
        fetchWithAuth('/api/branches/lens-purchase-orders'),
        fetchWithAuth('/api/branches/limits'),
      ]);
      if (poRes.ok) setRows(await poRes.json());
      if (limRes.ok) setLimits(await limRes.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) load();
  }, [tenancyLoading, currentTenantId, load]);

  const createDraft = async () => {
    setBusy(true);
    try {
      const res = await fetchWithAuth('/api/branches/lens-purchase-orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'draft_from_pending' }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Lỗi tạo PO');
      toast.success(`Đã tạo ${data.ma_po} (${data.items_count} dòng)`);
      load();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi');
    }
    setBusy(false);
  };

  const mark = async (id: string, action: string) => {
    const res = await fetchWithAuth('/api/branches/lens-purchase-orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action, id }),
    });
    if (res.ok) {
      toast.success('Đã cập nhật');
      load();
    } else toast.error('Lỗi');
  };

  const buySlots = async () => {
    const res = await fetchWithAuth('/api/branches/limits', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ add_slots: 1 }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok) {
      toast.success(data.message || 'Đã thêm slot');
      load();
    } else toast.error(data.error || 'Lỗi');
  };

  return (
    <ProtectedRoute>
      <FeatureGate feature="multi_branch" permission="manage_clinic">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <PageHeader
            title="Đặt hàng NCC chuỗi"
            subtitle="Gộp tròng cần đặt từ nhiều chi nhánh thành 1 phiếu PO"
            actions={
              <div className="flex gap-2">
                <button onClick={load} className="px-3 py-1.5 text-sm border rounded-lg">
                  <RefreshCw className="w-3.5 h-3.5" />
                </button>
                <button
                  onClick={createDraft}
                  disabled={busy}
                  className="flex items-center gap-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
                >
                  <PackagePlus className="w-3.5 h-3.5" /> Gộp PO nháp
                </button>
              </div>
            }
          />

          {limits && (
            <div className="bg-slate-50 border rounded-xl p-3 mb-4 text-sm flex flex-wrap items-center gap-3 justify-between">
              <p>
                Chi nhánh: <strong>{limits.current_branches}</strong> / {limits.max_branches}
                {limits.remaining === 0 ? ' (đã đầy)' : ` · còn ${limits.remaining}`}
              </p>
              <button onClick={buySlots} className="text-xs px-3 py-1.5 border rounded-lg bg-white hover:bg-gray-50">
                Mua thêm 1 slot ({Number(limits.branch_addon_price || 0).toLocaleString('vi-VN')}đ)
              </button>
            </div>
          )}

          {loading ? (
            <p className="text-center text-gray-400 py-10">Đang tải...</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-500 py-10 text-sm">Chưa có phiếu đặt hàng.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => (
                <div key={r.id} className="bg-white border rounded-xl p-3 flex justify-between gap-3">
                  <div>
                    <p className="font-medium text-sm">{r.ma_po || r.id.slice(0, 8)}</p>
                    <p className="text-xs text-gray-500">
                      {r.trang_thai} · {new Date(r.created_at).toLocaleString('vi-VN')}
                    </p>
                    {r.ghi_chu && <p className="text-xs text-gray-600">{r.ghi_chu}</p>}
                  </div>
                  <div className="flex gap-1.5 h-fit">
                    {r.trang_thai === 'draft' && (
                      <button
                        onClick={() => mark(r.id, 'mark_ordered')}
                        className="text-xs px-2 py-1 bg-indigo-600 text-white rounded-lg"
                      >
                        Đã đặt NCC
                      </button>
                    )}
                    {(r.trang_thai === 'ordered' || r.trang_thai === 'partial') && (
                      <button
                        onClick={() => mark(r.id, 'mark_received')}
                        className="text-xs px-2 py-1 bg-green-600 text-white rounded-lg"
                      >
                        Đã nhận
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
