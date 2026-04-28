// Báo cáo chuỗi - So sánh doanh thu, kho, nhân sự giữa chi nhánh
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import {
  BarChart3, Building2, TrendingUp, Users, FileText, Glasses,
  Package, ArrowRightLeft, Calendar
} from 'lucide-react';

interface BranchReport {
  branch_id: string;
  ten_chi_nhanh: string;
  is_main: boolean;
  so_don_thuoc: number;
  so_don_kinh: number;
  doanh_thu_thuoc: number;
  doanh_thu_kinh: number;
  tong_doanh_thu: number;
  so_benh_nhan: number;
  so_nhan_vien: number;
}

interface TongHop {
  tong_doanh_thu: number;
  tong_don_thuoc: number;
  tong_don_kinh: number;
  tong_benh_nhan: number;
  tong_nhan_vien: number;
}

interface TransferStats {
  tong: number;
  pending: number;
  completed: number;
}

export default function BaoCaoChuoi() {
  const { currentTenantId, tenancyLoading } = useAuth();

  const [reports, setReports] = useState<BranchReport[]>([]);
  const [tongHop, setTongHop] = useState<TongHop | null>(null);
  const [transferStats, setTransferStats] = useState<TransferStats | null>(null);
  const [loading, setLoading] = useState(true);

  // Date range
  const now = new Date();
  const [fromDate, setFromDate] = useState(() => {
    const d = new Date(now.getFullYear(), now.getMonth(), 1);
    return d.toISOString().split('T')[0];
  });
  const [toDate, setToDate] = useState(() => now.toISOString().split('T')[0]);

  const loadReports = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const params = new URLSearchParams({ from: fromDate, to: toDate });
      const res = await fetchWithAuth(`/api/branches/reports?${params}`);
      if (res.ok) {
        const data = await res.json();
        setReports(data.reports || []);
        setTongHop(data.tongHop || null);
        setTransferStats(data.transferStats || null);
      }
    } catch {}
    setLoading(false);
  }, [currentTenantId, fromDate, toDate]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) loadReports();
  }, [tenancyLoading, currentTenantId, loadReports]);

  const formatMoney = (n: number) => {
    if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + 'tr';
    if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
    return n.toLocaleString('vi-VN') + 'đ';
  };

  const maxRevenue = reports.length > 0 ? Math.max(...reports.map(r => r.tong_doanh_thu), 1) : 1;

  if (tenancyLoading) {
    return <div className="min-h-screen flex items-center justify-center"><div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" /></div>;
  }

  return (
    <ProtectedRoute>
      <FeatureGate feature="chain_reports" permission="view_reports">
        <div className="max-w-6xl mx-auto px-4 py-6">
          {/* Header */}
          <div className="flex items-center justify-between mb-6 flex-wrap gap-3">
            <div className="flex items-center gap-3">
              <BarChart3 className="w-7 h-7 text-blue-600" />
              <div>
                <h1 className="text-xl font-bold text-gray-900">Báo cáo chuỗi</h1>
                <p className="text-sm text-gray-500">So sánh hiệu quả giữa các chi nhánh</p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm" />
              <span className="text-gray-400">→</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm" />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10 text-gray-400">Đang tải báo cáo...</div>
          ) : (
            <>
              {/* Summary Cards */}
              {tongHop && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
                  <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-xs text-gray-400">Tổng doanh thu</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{formatMoney(tongHop.tong_doanh_thu)}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <FileText className="w-4 h-4 text-blue-600" />
                      <span className="text-xs text-gray-400">Đơn thuốc</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{tongHop.tong_don_thuoc}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Glasses className="w-4 h-4 text-purple-600" />
                      <span className="text-xs text-gray-400">Đơn kính</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{tongHop.tong_don_kinh}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-amber-600" />
                      <span className="text-xs text-gray-400">Tổng khách</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{tongHop.tong_benh_nhan}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-indigo-600" />
                      <span className="text-xs text-gray-400">Nhân viên</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{tongHop.tong_nhan_vien}</p>
                  </div>
                </div>
              )}

              {/* Transfer Stats */}
              {transferStats && transferStats.tong > 0 && (
                <div className="bg-white rounded-xl border p-4 mb-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-3">
                    <ArrowRightLeft className="w-4 h-4 text-blue-600" />
                    <span className="text-sm font-semibold text-gray-800">Điều chuyển kho</span>
                  </div>
                  <div className="flex gap-6 text-sm">
                    <span className="text-gray-600">Tổng: <strong>{transferStats.tong}</strong></span>
                    <span className="text-amber-600">Chờ duyệt: <strong>{transferStats.pending}</strong></span>
                    <span className="text-green-600">Hoàn thành: <strong>{transferStats.completed}</strong></span>
                  </div>
                </div>
              )}

              {/* Branch Comparison */}
              <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50">
                  <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                    <Building2 className="w-4 h-4 text-blue-600" />
                    So sánh chi nhánh
                  </h2>
                </div>

                {reports.length === 0 ? (
                  <div className="px-5 py-10 text-center text-gray-400">Chưa có dữ liệu</div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="bg-gray-50 text-gray-500 text-xs uppercase">
                          <th className="px-4 py-3 text-left font-medium">Chi nhánh</th>
                          <th className="px-4 py-3 text-right font-medium">Doanh thu</th>
                          <th className="px-4 py-3 text-right font-medium">Đơn thuốc</th>
                          <th className="px-4 py-3 text-right font-medium">Đơn kính</th>
                          <th className="px-4 py-3 text-right font-medium">Khách</th>
                          <th className="px-4 py-3 text-right font-medium">NV</th>
                          <th className="px-4 py-3 text-left font-medium min-w-[180px]">Tỷ trọng DT</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {reports.map((r, i) => {
                          const pct = tongHop && tongHop.tong_doanh_thu > 0
                            ? (r.tong_doanh_thu / tongHop.tong_doanh_thu * 100)
                            : 0;
                          return (
                            <tr key={r.branch_id} className="hover:bg-gray-50 transition-colors">
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium text-gray-800">{r.ten_chi_nhanh}</span>
                                  {r.is_main && (
                                    <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">
                                      CHÍNH
                                    </span>
                                  )}
                                </div>
                              </td>
                              <td className="px-4 py-3 text-right font-semibold text-gray-900">
                                {formatMoney(r.tong_doanh_thu)}
                              </td>
                              <td className="px-4 py-3 text-right text-gray-700">{r.so_don_thuoc}</td>
                              <td className="px-4 py-3 text-right text-gray-700">{r.so_don_kinh}</td>
                              <td className="px-4 py-3 text-right text-gray-700">{r.so_benh_nhan}</td>
                              <td className="px-4 py-3 text-right text-gray-700">{r.so_nhan_vien}</td>
                              <td className="px-4 py-3">
                                <div className="flex items-center gap-2">
                                  <div className="flex-1 bg-gray-100 rounded-full h-2.5 overflow-hidden">
                                    <div
                                      className="h-full bg-blue-500 rounded-full transition-all"
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                  <span className="text-xs text-gray-500 w-10 text-right">{pct.toFixed(1)}%</span>
                                </div>
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Revenue Detail by Branch */}
              <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
                {reports.map(r => (
                  <div key={r.branch_id} className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-3">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      <span className="font-semibold text-gray-800 text-sm">{r.ten_chi_nhanh}</span>
                      {r.is_main && <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">CHÍNH</span>}
                    </div>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Doanh thu thuốc</span>
                        <span className="font-medium text-gray-800">{formatMoney(r.doanh_thu_thuoc)}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Doanh thu kính</span>
                        <span className="font-medium text-gray-800">{formatMoney(r.doanh_thu_kinh)}</span>
                      </div>
                      <div className="border-t pt-2 flex justify-between text-sm">
                        <span className="text-gray-700 font-medium">Tổng</span>
                        <span className="font-bold text-blue-700">{formatMoney(r.tong_doanh_thu)}</span>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
