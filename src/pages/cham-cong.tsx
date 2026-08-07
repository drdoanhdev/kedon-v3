// Chấm công nhân viên
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useBranch } from '../contexts/BranchContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import PageHeader from '../components/PageHeader';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { LogIn, LogOut, RefreshCw, Clock } from 'lucide-react';

export default function ChamCongPage() {
  const { currentTenantId, tenancyLoading } = useAuth();
  const { branches, currentBranchId } = useBranch();
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [branchFilter, setBranchFilter] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const today = new Date();
      const from = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 14)
        .toISOString()
        .split('T')[0];
      const params = new URLSearchParams({ from });
      if (branchFilter) params.set('branch_id', branchFilter);
      const res = await fetchWithAuth(`/api/branches/attendance?${params}`);
      if (res.ok) setRows(await res.json());
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [currentTenantId, branchFilter]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) load();
  }, [tenancyLoading, currentTenantId, load]);

  const punch = async (action: 'check_in' | 'check_out') => {
    const branch_id = currentBranchId || branchFilter;
    if (!branch_id && action === 'check_in') {
      toast.error('Chọn chi nhánh trước khi check-in');
      return;
    }
    setBusy(true);
    try {
      const res = await fetchWithAuth('/api/branches/attendance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, branch_id }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || 'Lỗi chấm công');
      }
      toast.success(action === 'check_in' ? 'Đã check-in' : 'Đã check-out');
      load();
    } catch (e: any) {
      toast.error(e.message || 'Lỗi');
    }
    setBusy(false);
  };

  const formatDt = (s?: string | null) =>
    s ? new Date(s).toLocaleString('vi-VN') : '—';

  if (tenancyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <ProtectedRoute>
      <FeatureGate feature="staff_attendance">
        <div className="max-w-4xl mx-auto px-4 py-6">
          <PageHeader
            title="Chấm công"
            subtitle="Check-in / check-out theo chi nhánh"
            actions={
              <button
                onClick={load}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              </button>
            }
          />

          <div className="bg-white border rounded-xl p-4 mb-4 flex flex-wrap gap-2 items-center">
            <button
              onClick={() => punch('check_in')}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-green-600 text-white rounded-lg disabled:opacity-50"
            >
              <LogIn className="w-4 h-4" /> Check-in
            </button>
            <button
              onClick={() => punch('check_out')}
              disabled={busy}
              className="flex items-center gap-1.5 px-4 py-2 text-sm bg-slate-700 text-white rounded-lg disabled:opacity-50"
            >
              <LogOut className="w-4 h-4" /> Check-out
            </button>
            <select
              value={branchFilter}
              onChange={(e) => setBranchFilter(e.target.value)}
              className="border rounded-lg px-3 py-1.5 text-sm ml-auto"
            >
              <option value="">Tất cả chi nhánh</option>
              {branches.map((b) => (
                <option key={b.id} value={b.id}>
                  {b.ten_chi_nhanh}
                </option>
              ))}
            </select>
          </div>

          {loading ? (
            <p className="text-center text-gray-400 py-10">Đang tải...</p>
          ) : rows.length === 0 ? (
            <p className="text-center text-gray-500 py-10 text-sm">Chưa có bản ghi chấm công.</p>
          ) : (
            <div className="overflow-x-auto border rounded-xl bg-white">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50 text-left">
                  <tr>
                    <th className="px-3 py-2">Nhân viên</th>
                    <th className="px-3 py-2">Chi nhánh</th>
                    <th className="px-3 py-2">Check-in</th>
                    <th className="px-3 py-2">Check-out</th>
                    <th className="px-3 py-2">Nguồn</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r) => (
                    <tr key={r.id} className="border-t">
                      <td className="px-3 py-2 font-medium">{r.full_name}</td>
                      <td className="px-3 py-2">{r.branch?.ten_chi_nhanh || '—'}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className="inline-flex items-center gap-1">
                          <Clock className="w-3 h-3 text-gray-400" />
                          {formatDt(r.check_in_at)}
                        </span>
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">{formatDt(r.check_out_at)}</td>
                      <td className="px-3 py-2 text-xs text-gray-500">{r.source}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
