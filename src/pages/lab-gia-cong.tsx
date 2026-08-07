// Lab / gia công trung tâm
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import PageHeader from '../components/PageHeader';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { RefreshCw, Send, Scissors, PackageCheck, Truck } from 'lucide-react';

const STATUS_LABELS: Record<string, string> = {
  cho_gia_cong: 'Chờ gia công',
  dang_cat: 'Đang cắt',
  san_sang: 'Sẵn sàng',
  da_giao: 'Đã giao',
};

const NEXT_ACTION: Record<string, { action: string; label: string; icon: any }> = {
  cho_gia_cong: { action: 'start', label: 'Bắt đầu cắt', icon: Scissors },
  dang_cat: { action: 'ready', label: 'Sẵn sàng', icon: PackageCheck },
  san_sang: { action: 'deliver', label: 'Đã giao KH', icon: Truck },
};

export default function LabGiaCongPage() {
  const { currentTenantId, tenancyLoading } = useAuth();
  const { branches, currentBranchId } = useBranch();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('');
  const [donId, setDonId] = useState('');
  const [labBranchId, setLabBranchId] = useState('');
  const [sending, setSending] = useState(false);

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (statusFilter) params.set('status', statusFilter);
      const res = await fetchWithAuth(`/api/branches/lab?${params}`);
      if (res.ok) setRows(await res.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [currentTenantId, statusFilter]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) load();
  }, [tenancyLoading, currentTenantId, load]);

  useEffect(() => {
    const main = branches.find((b) => b.is_main);
    if (main && !labBranchId) setLabBranchId(main.id);
  }, [branches, labBranchId]);

  const runAction = async (don_kinh_id: number, action: string) => {
    try {
      const res = await fetchWithAuth('/api/branches/lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ don_kinh_id, action }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi');
      }
      toast.success('Đã cập nhật trạng thái lab');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi');
    }
  };

  const sendToLab = async () => {
    if (!donId) {
      toast.error('Nhập ID đơn kính');
      return;
    }
    setSending(true);
    try {
      const res = await fetchWithAuth('/api/branches/lab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          don_kinh_id: Number(donId),
          action: 'send',
          lab_branch_id: labBranchId || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi gửi lab');
      }
      toast.success('Đã gửi đơn sang lab');
      setDonId('');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi');
    }
    setSending(false);
  };

  if (tenancyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <FeatureGate feature="multi_branch">
        <div className="max-w-5xl mx-auto px-4 py-6">
          <PageHeader
            title="Lab / Gia công"
            subtitle="Theo dõi cắt kính trung tâm phục vụ các chi nhánh"
            actions={
              <button
                onClick={load}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Cập nhật
              </button>
            }
          />

          <div className="bg-white border rounded-xl p-4 mb-4 flex flex-wrap gap-2 items-end">
            <div>
              <label className="text-xs text-gray-500 block mb-1">Gửi đơn kính sang lab</label>
              <input
                value={donId}
                onChange={(e) => setDonId(e.target.value)}
                placeholder="ID đơn kính"
                className="border rounded-lg px-3 py-1.5 text-sm w-36"
              />
            </div>
            <div>
              <label className="text-xs text-gray-500 block mb-1">Lab (chi nhánh)</label>
              <select
                value={labBranchId}
                onChange={(e) => setLabBranchId(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm"
              >
                {branches.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.ten_chi_nhanh}
                    {b.is_main ? ' (chính)' : ''}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={sendToLab}
              disabled={sending}
              className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" /> Gửi lab
            </button>
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm ml-auto"
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(STATUS_LABELS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-10">Đang tải...</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-500 py-10 text-sm">Chưa có đơn trong lab.</p>
          ) : (
            <div className="space-y-2">
              {rows.map((r) => {
                const next = r.lab_status ? NEXT_ACTION[r.lab_status] : null;
                const Icon = next?.icon;
                return (
                  <div key={r.id} className="bg-white border rounded-xl p-3 flex flex-wrap items-center gap-3 justify-between">
                    <div className="min-w-0">
                      <p className="font-medium text-sm">
                        Đơn #{r.id} · {r.BenhNhan?.ten || `BN #${r.benhnhanid}`}
                      </p>
                      <p className="text-xs text-gray-500">
                        MP {r.sph_mp}/{r.cyl_mp} · MT {r.sph_mt}/{r.cyl_mt}
                        {r.gong ? ` · ${r.gong}` : ''}
                      </p>
                      <p className="text-xs text-gray-500">
                        CN bán: {r.branch?.ten_chi_nhanh || r.branch_id || '—'}
                        {r.lab_sent_at
                          ? ` · Gửi ${new Date(r.lab_sent_at).toLocaleString('vi-VN')}`
                          : ''}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs px-2 py-1 rounded bg-indigo-50 text-indigo-800 border border-indigo-100">
                        {STATUS_LABELS[r.lab_status] || r.lab_status}
                      </span>
                      {next && (
                        <button
                          onClick={() => runAction(r.id, next.action)}
                          className="flex items-center gap-1 text-xs px-2.5 py-1.5 bg-blue-600 text-white rounded-lg"
                        >
                          {Icon && <Icon className="w-3 h-3" />}
                          {next.label}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {currentBranchId && (
            <p className="text-xs text-gray-400 mt-4">Chi nhánh đang chọn: {currentBranchId.slice(0, 8)}…</p>
          )}
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
