// Tổng quan tồn kho toàn chuỗi
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import PageHeader from '../components/PageHeader';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import Link from 'next/link';
import {
  Package, AlertTriangle, RefreshCw, Glasses, Pill, ArrowRightLeft, Building2,
} from 'lucide-react';

interface BranchMeta {
  id: string;
  ten_chi_nhanh: string;
  is_main: boolean;
}

interface StockRow {
  ten?: string;
  label?: string;
  donvi?: string;
  per_branch: Record<string, number>;
  tong: number;
  muc_min: number;
  co_canh_bao: boolean;
}

interface AlertRow {
  loai: string;
  ten: string;
  chi_nhanh: string;
  branch_id: string;
  ton_kho: number;
  muc_min: number;
  trang_thai: string;
}

interface Suggestion {
  loai: string;
  ten: string;
  from_branch: string;
  to_branch: string;
  from_qty: number;
  to_qty: number;
  suggest_qty: number;
}

type TabKey = 'alerts' | 'gong' | 'lens' | 'thuoc' | 'suggest';

export default function TonKhoChuoiPage() {
  const { currentTenantId, tenancyLoading } = useAuth();
  const [branches, setBranches] = useState<BranchMeta[]>([]);
  const [gong, setGong] = useState<StockRow[]>([]);
  const [lens, setLens] = useState<StockRow[]>([]);
  const [thuoc, setThuoc] = useState<StockRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<TabKey>('alerts');
  const [onlyLow, setOnlyLow] = useState(true);

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/branches/inventory-overview');
      if (res.ok) {
        const data = await res.json();
        setBranches(data.branches || []);
        setGong(data.gong || []);
        setLens(data.lens || []);
        setThuoc(data.thuoc || []);
        setAlerts(data.alerts || []);
        setSuggestions(data.transferSuggestions || []);
      }
    } catch {
      /* ignore */
    }
    setLoading(false);
  }, [currentTenantId]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) load();
  }, [tenancyLoading, currentTenantId, load]);

  const renderMatrix = (rows: StockRow[], nameFn: (r: StockRow) => string) => {
    const filtered = onlyLow ? rows.filter((r) => r.co_canh_bao) : rows;
    if (filtered.length === 0) {
      return <p className="text-sm text-gray-500 py-8 text-center">Không có dữ liệu.</p>;
    }
    return (
      <div className="overflow-x-auto border rounded-xl bg-white">
        <table className="min-w-full text-sm">
          <thead className="bg-gray-50 text-left">
            <tr>
              <th className="px-3 py-2 font-medium sticky left-0 bg-gray-50">Sản phẩm</th>
              {branches.map((b) => (
                <th key={b.id} className="px-3 py-2 font-medium whitespace-nowrap">
                  {b.ten_chi_nhanh}
                </th>
              ))}
              <th className="px-3 py-2 font-medium">Tổng</th>
            </tr>
          </thead>
          <tbody>
            {filtered.slice(0, 200).map((r, idx) => (
              <tr key={idx} className="border-t hover:bg-gray-50">
                <td className="px-3 py-2 sticky left-0 bg-white font-medium max-w-[240px]">
                  <span className="line-clamp-2">{nameFn(r)}</span>
                  {r.co_canh_bao && (
                    <span className="ml-1 text-[10px] text-amber-700 bg-amber-50 px-1 rounded">thấp</span>
                  )}
                </td>
                {branches.map((b) => {
                  const qty = r.per_branch[b.id];
                  const low = qty !== undefined && qty <= r.muc_min;
                  return (
                    <td
                      key={b.id}
                      className={`px-3 py-2 tabular-nums ${low ? 'text-red-600 font-semibold' : 'text-gray-800'}`}
                    >
                      {qty === undefined ? '—' : qty}
                    </td>
                  );
                })}
                <td className="px-3 py-2 font-semibold tabular-nums">{r.tong}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  };

  if (tenancyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  const tabs: { key: TabKey; label: string; count?: number }[] = [
    { key: 'alerts', label: 'Cảnh báo', count: alerts.length },
    { key: 'gong', label: 'Gọng', count: gong.length },
    { key: 'lens', label: 'Tròng', count: lens.length },
    { key: 'thuoc', label: 'Thuốc', count: thuoc.length },
    { key: 'suggest', label: 'Gợi ý chuyển', count: suggestions.length },
  ];

  return (
    <ProtectedRoute>
      <FeatureGate feature="multi_branch" permission="manage_clinic">
        <div className="max-w-6xl mx-auto px-4 py-6">
          <PageHeader
            title="Tồn kho chuỗi"
            subtitle="So sánh tồn gọng / tròng / thuốc giữa các chi nhánh"
            actions={
              <div className="flex items-center gap-2 flex-wrap">
                <label className="flex items-center gap-1.5 text-sm text-gray-600">
                  <input
                    type="checkbox"
                    checked={onlyLow}
                    onChange={(e) => setOnlyLow(e.target.checked)}
                    className="rounded"
                  />
                  Chỉ hàng thấp
                </label>
                <button
                  onClick={load}
                  disabled={loading}
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                  Cập nhật
                </button>
                <Link
                  href="/dieu-chuyen-kho"
                  className="flex items-center gap-1.5 px-3 py-1.5 text-sm border rounded-lg hover:bg-gray-50"
                >
                  <ArrowRightLeft className="w-3.5 h-3.5" />
                  Điều chuyển
                </Link>
              </div>
            }
          />

          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-5">
            <div className="bg-white border rounded-xl p-3">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Building2 className="w-3.5 h-3.5" /> Chi nhánh
              </div>
              <p className="text-2xl font-bold">{branches.length}</p>
            </div>
            <div className="bg-white border rounded-xl p-3">
              <div className="flex items-center gap-2 text-amber-600 text-xs mb-1">
                <AlertTriangle className="w-3.5 h-3.5" /> Cảnh báo
              </div>
              <p className="text-2xl font-bold text-amber-700">{alerts.length}</p>
            </div>
            <div className="bg-white border rounded-xl p-3">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Glasses className="w-3.5 h-3.5" /> SKU gọng
              </div>
              <p className="text-2xl font-bold">{gong.length}</p>
            </div>
            <div className="bg-white border rounded-xl p-3">
              <div className="flex items-center gap-2 text-gray-500 text-xs mb-1">
                <Package className="w-3.5 h-3.5" /> SKU tròng
              </div>
              <p className="text-2xl font-bold">{lens.length}</p>
            </div>
          </div>

          <div className="flex gap-1 mb-4 overflow-x-auto">
            {tabs.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`px-3 py-1.5 text-sm rounded-lg whitespace-nowrap ${
                  tab === t.key ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                }`}
              >
                {t.label}
                {t.count != null && (
                  <span className="ml-1 opacity-80">({t.count})</span>
                )}
              </button>
            ))}
          </div>

          {loading ? (
            <div className="text-center py-12 text-gray-400">Đang tải tồn kho...</div>
          ) : (
            <>
              {tab === 'alerts' && (
                <div className="space-y-2">
                  {alerts.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">Không có cảnh báo tồn thấp.</p>
                  ) : (
                    alerts.map((a, i) => (
                      <div
                        key={i}
                        className="flex items-center justify-between gap-3 bg-white border rounded-lg px-3 py-2.5"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-sm truncate">{a.ten}</p>
                          <p className="text-xs text-gray-500">
                            {a.chi_nhanh} · {a.loai === 'gong_kinh' ? 'Gọng' : a.loai === 'lens' ? 'Tròng' : 'Thuốc'}
                          </p>
                        </div>
                        <span
                          className={`text-xs font-semibold px-2 py-1 rounded ${
                            a.trang_thai === 'HET'
                              ? 'bg-red-100 text-red-700'
                              : 'bg-amber-100 text-amber-800'
                          }`}
                        >
                          {a.ton_kho}/{a.muc_min}
                        </span>
                      </div>
                    ))
                  )}
                </div>
              )}
              {tab === 'gong' && renderMatrix(gong, (r) => r.ten || '')}
              {tab === 'lens' && renderMatrix(lens, (r) => r.label || r.ten || '')}
              {tab === 'thuoc' &&
                renderMatrix(thuoc, (r) => `${r.ten || ''}${r.donvi ? ` (${r.donvi})` : ''}`)}
              {tab === 'suggest' && (
                <div className="space-y-2">
                  {suggestions.length === 0 ? (
                    <p className="text-sm text-gray-500 text-center py-8">
                      Chưa có gợi ý điều chuyển phù hợp.
                    </p>
                  ) : (
                    suggestions.map((s, i) => (
                      <div key={i} className="bg-white border rounded-lg px-3 py-3">
                        <p className="font-medium text-sm mb-1">{s.ten}</p>
                        <p className="text-xs text-gray-600">
                          {s.from_branch} ({s.from_qty}) → {s.to_branch} ({s.to_qty}) · gợi ý chuyển{' '}
                          <strong>{s.suggest_qty}</strong>
                        </p>
                        <Link
                          href="/dieu-chuyen-kho"
                          className="inline-flex items-center gap-1 mt-2 text-xs text-blue-600 hover:underline"
                        >
                          <ArrowRightLeft className="w-3 h-3" /> Tạo phiếu điều chuyển
                        </Link>
                      </div>
                    ))
                  )}
                </div>
              )}
            </>
          )}
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
