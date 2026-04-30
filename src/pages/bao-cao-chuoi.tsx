// Báo cáo chuỗi - So sánh doanh thu, kho, nhân sự giữa chi nhánh
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import {
  BarChart3, Building2, TrendingUp, TrendingDown, Users, FileText, Glasses,
  ArrowRightLeft, Calendar, RefreshCw, Minus, Trophy, UserCheck
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
  hom_nay_doanh_thu?: number;
  hom_nay_don_thuoc?: number;
  hom_nay_don_kinh?: number;
  trend_pct?: number;
  prev_doanh_thu?: number;
  so_benh_nhan_moi?: number;
  rank?: number;
}

interface TongHop {
  tong_doanh_thu: number;
  tong_don_thuoc: number;
  tong_don_kinh: number;
  tong_benh_nhan: number;
  tong_nhan_vien: number;
  tong_benh_nhan_moi?: number;
}

interface HomNay {
  tong_doanh_thu: number;
  tong_don_thuoc: number;
  tong_don_kinh: number;
  per_branch?: { branch_id: string; ten_chi_nhanh: string; doanh_thu: number; so_don: number }[];
}

interface TransferStats {
  tong: number;
  pending: number;
  completed: number;
}

interface StaffInfo {
  user_id: string;
  full_name?: string;
  email?: string;
  role?: string;
  from_date?: string;
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Chủ phòng khám',
  admin: 'Quản trị viên',
  doctor: 'Bác sĩ',
  staff: 'Nhân viên',
};

const formatMoneyShort = (n: number) => {
  if (!n) return '0đ';
  if (n >= 1_000_000_000) return (n / 1_000_000_000).toFixed(2) + ' tỷ';
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + ' tr';
  if (n >= 1_000) return (n / 1_000).toFixed(0) + 'k';
  return n.toLocaleString('vi-VN') + 'đ';
};

function TrendBadge({ pct }: { pct: number }) {
  if (!isFinite(pct) || pct === 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-gray-500">
        <Minus className="w-3 h-3" /> 0%
      </span>
    );
  }
  if (pct > 0) {
    return (
      <span className="inline-flex items-center gap-0.5 text-xs text-green-600 font-semibold">
        <TrendingUp className="w-3 h-3" /> +{pct.toFixed(1)}%
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-0.5 text-xs text-red-600 font-semibold">
      <TrendingDown className="w-3 h-3" /> {pct.toFixed(1)}%
    </span>
  );
}

export default function BaoCaoChuoi() {
  const { currentTenantId, tenancyLoading } = useAuth();

  const [reports, setReports] = useState<BranchReport[]>([]);
  const [ranking, setRanking] = useState<BranchReport[]>([]);
  const [tongHop, setTongHop] = useState<TongHop | null>(null);
  const [homNay, setHomNay] = useState<HomNay | null>(null);
  const [transferStats, setTransferStats] = useState<TransferStats | null>(null);
  const [staffPerBranch, setStaffPerBranch] = useState<Record<string, StaffInfo[]>>({});
  const [branchesMeta, setBranchesMeta] = useState<{ id: string; ten_chi_nhanh: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'overview' | 'ranking' | 'staff'>('overview');

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
        setRanking(data.ranking || data.reports || []);
        setTongHop(data.tongHop || null);
        setHomNay(data.homNay || null);
        setTransferStats(data.transferStats || null);
        setStaffPerBranch(data.staffPerBranch || {});
        setBranchesMeta(data.branches || []);
      }
    } catch {}
    setLoading(false);
  }, [currentTenantId, fromDate, toDate]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) loadReports();
  }, [tenancyLoading, currentTenantId, loadReports]);

  const maxRevenue = reports.length > 0 ? Math.max(...reports.map(r => r.tong_doanh_thu), 1) : 1;
  const todayStr = now.toLocaleDateString('vi-VN');

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
            <div className="flex items-center gap-2 flex-wrap">
              <Calendar className="w-4 h-4 text-gray-400" />
              <input type="date" value={fromDate} onChange={e => setFromDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm" />
              <span className="text-gray-400">→</span>
              <input type="date" value={toDate} onChange={e => setToDate(e.target.value)}
                className="border rounded-lg px-3 py-1.5 text-sm" />
              <button
                onClick={loadReports}
                disabled={loading}
                className="flex items-center gap-1.5 px-3 py-1.5 text-sm bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
                Cập nhật
              </button>
            </div>
          </div>

          {loading ? (
            <div className="text-center py-10 text-gray-400">Đang tải báo cáo...</div>
          ) : (
            <>
              {/* HÔM NAY DASHBOARD */}
              {homNay && (
                <div className="bg-gradient-to-br from-blue-50 via-indigo-50 to-blue-50 border border-blue-200 rounded-xl p-5 mb-6 shadow-sm">
                  <div className="flex items-center gap-2 mb-4">
                    <span className="relative flex h-2.5 w-2.5">
                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75" />
                      <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-green-500" />
                    </span>
                    <h2 className="font-semibold text-gray-800 text-base">Hôm nay</h2>
                    <span className="text-xs text-gray-500">{todayStr}</span>
                    <span className="ml-auto text-2xl font-bold text-blue-700">{formatMoneyShort(homNay.tong_doanh_thu)}</span>
                  </div>
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3 mb-3">
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <p className="text-2xl font-bold text-gray-900">{formatMoneyShort(homNay.tong_doanh_thu)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Tổng doanh thu</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <p className="text-2xl font-bold text-gray-900">{(homNay.tong_don_thuoc || 0) + (homNay.tong_don_kinh || 0)}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Tổng đơn ({homNay.tong_don_thuoc || 0} thuốc + {homNay.tong_don_kinh || 0} kính)</p>
                    </div>
                    <div className="bg-white rounded-lg p-3 border border-blue-100">
                      <p className="text-2xl font-bold text-gray-900">{branchesMeta.length}</p>
                      <p className="text-xs text-gray-500 mt-0.5">Chi nhánh đang hoạt động</p>
                    </div>
                  </div>
                  {homNay.per_branch && homNay.per_branch.length > 1 && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-2 mt-3">
                      {homNay.per_branch.map(b => (
                        <div key={b.branch_id} className="bg-white/70 rounded-lg p-2.5 border border-blue-100">
                          <p className="text-xs font-medium text-gray-700 truncate">{b.ten_chi_nhanh}</p>
                          <p className="text-sm font-bold text-blue-700">{formatMoneyShort(b.doanh_thu)}</p>
                          <p className="text-[10px] text-gray-500">{b.so_don} đơn</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {/* Summary Cards */}
              {tongHop && (
                <div className="grid grid-cols-2 md:grid-cols-6 gap-3 mb-6">
                  <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="w-4 h-4 text-green-600" />
                      <span className="text-xs text-gray-400">Tổng doanh thu</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{formatMoneyShort(tongHop.tong_doanh_thu)}</p>
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
                      <UserCheck className="w-4 h-4 text-emerald-600" />
                      <span className="text-xs text-gray-400">KH mới</span>
                    </div>
                    <p className="text-lg font-bold text-gray-900">{tongHop.tong_benh_nhan_moi || 0}</p>
                  </div>
                  <div className="bg-white rounded-xl border p-4 shadow-sm">
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-4 h-4 text-amber-600" />
                      <span className="text-xs text-gray-400">Tổng KH</span>
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
                    <span className="text-sm font-semibold text-gray-800">Điều chuyển kho trong kỳ</span>
                  </div>
                  <div className="flex gap-6 text-sm flex-wrap">
                    <span className="text-gray-600">Tổng: <strong>{transferStats.tong}</strong></span>
                    <span className="text-amber-600">Chờ duyệt: <strong>{transferStats.pending}</strong></span>
                    <span className="text-green-600">Hoàn thành: <strong>{transferStats.completed}</strong></span>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex gap-1 mb-4 bg-gray-100 rounded-lg p-1 w-fit flex-wrap">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'overview' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <BarChart3 className="w-4 h-4 inline mr-1.5" />
                  So sánh chi nhánh
                </button>
                <button
                  onClick={() => setActiveTab('ranking')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'ranking' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Trophy className="w-4 h-4 inline mr-1.5" />
                  Xếp hạng
                </button>
                <button
                  onClick={() => setActiveTab('staff')}
                  className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                    activeTab === 'staff' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
                  }`}
                >
                  <Users className="w-4 h-4 inline mr-1.5" />
                  Nhân viên
                </button>
              </div>

              {/* OVERVIEW TAB */}
              {activeTab === 'overview' && (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                      <Building2 className="w-4 h-4 text-blue-600" />
                      So sánh chi nhánh — kỳ đã chọn
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
                            <th className="px-4 py-3 text-center font-medium">So kỳ trước</th>
                            <th className="px-4 py-3 text-right font-medium">Đơn thuốc</th>
                            <th className="px-4 py-3 text-right font-medium">Đơn kính</th>
                            <th className="px-4 py-3 text-right font-medium">KH mới</th>
                            <th className="px-4 py-3 text-right font-medium">NV</th>
                            <th className="px-4 py-3 text-left font-medium min-w-[180px]">Tỷ trọng DT</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {reports.map(r => {
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
                                  {formatMoneyShort(r.tong_doanh_thu)}
                                </td>
                                <td className="px-4 py-3 text-center">
                                  <TrendBadge pct={r.trend_pct || 0} />
                                </td>
                                <td className="px-4 py-3 text-right text-gray-700">{r.so_don_thuoc}</td>
                                <td className="px-4 py-3 text-right text-gray-700">{r.so_don_kinh}</td>
                                <td className="px-4 py-3 text-right text-emerald-600 font-medium">{r.so_benh_nhan_moi || 0}</td>
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
              )}

              {/* RANKING TAB */}
              {activeTab === 'ranking' && (
                <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
                  <div className="px-5 py-3 border-b bg-gray-50">
                    <h2 className="font-semibold text-gray-800 flex items-center gap-2">
                      <Trophy className="w-4 h-4 text-amber-500" />
                      Xếp hạng theo doanh thu
                    </h2>
                  </div>
                  {ranking.length === 0 ? (
                    <div className="px-5 py-10 text-center text-gray-400">Chưa có dữ liệu</div>
                  ) : (
                    <div className="divide-y">
                      {ranking.map((r, idx) => {
                        const rank = r.rank ?? idx + 1;
                        const medal = rank === 1 ? '🥇' : rank === 2 ? '🥈' : rank === 3 ? '🥉' : `#${rank}`;
                        const barColor = rank === 1 ? 'bg-amber-400' : rank === 2 ? 'bg-gray-400' : rank === 3 ? 'bg-orange-400' : 'bg-blue-500';
                        const barWidth = (r.tong_doanh_thu / maxRevenue) * 100;
                        return (
                          <div key={r.branch_id} className="px-5 py-4 flex items-center gap-4">
                            <span className="text-2xl w-12 text-center">{medal}</span>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="font-semibold text-gray-900">{r.ten_chi_nhanh}</span>
                                {r.is_main && (
                                  <span className="text-[9px] bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded-full font-bold">CHÍNH</span>
                                )}
                                <TrendBadge pct={r.trend_pct || 0} />
                              </div>
                              <div className="bg-gray-100 rounded-full h-2 overflow-hidden">
                                <div className={`h-full ${barColor} rounded-full transition-all`} style={{ width: `${barWidth}%` }} />
                              </div>
                              <div className="flex gap-4 mt-1 text-xs text-gray-500">
                                <span>{r.so_don_thuoc} đơn thuốc</span>
                                <span>{r.so_don_kinh} đơn kính</span>
                                {(r.prev_doanh_thu || 0) > 0 && (
                                  <span>Kỳ trước: {formatMoneyShort(r.prev_doanh_thu || 0)}</span>
                                )}
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-lg font-bold text-gray-900">{formatMoneyShort(r.tong_doanh_thu)}</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* STAFF TAB */}
              {activeTab === 'staff' && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {branchesMeta.length === 0 ? (
                    <div className="col-span-2 px-5 py-10 text-center text-gray-400 bg-white rounded-xl border">Chưa có chi nhánh</div>
                  ) : (
                    branchesMeta.map(b => {
                      const staff = staffPerBranch[b.id] || [];
                      return (
                        <div key={b.id} className="bg-white rounded-xl border shadow-sm overflow-hidden">
                          <div className="px-4 py-3 border-b bg-gray-50 flex items-center gap-2">
                            <Building2 className="w-4 h-4 text-blue-600" />
                            <span className="font-semibold text-gray-800 text-sm">{b.ten_chi_nhanh}</span>
                            <span className="ml-auto text-xs text-gray-400">{staff.length} nhân viên</span>
                          </div>
                          {staff.length === 0 ? (
                            <div className="px-4 py-6 text-center text-sm text-gray-400">Chưa có nhân viên</div>
                          ) : (
                            <div className="divide-y">
                              {staff.map(s => (
                                <div key={s.user_id} className="px-4 py-3 flex items-center gap-3">
                                  <div className="w-9 h-9 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-700 flex-shrink-0">
                                    {(s.full_name || s.email || 'U')[0].toUpperCase()}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-gray-800 truncate">{s.full_name || s.email || s.user_id}</p>
                                    <div className="flex items-center gap-2 mt-0.5">
                                      <span className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                                        s.role === 'doctor' ? 'bg-purple-100 text-purple-700' :
                                        s.role === 'admin' ? 'bg-blue-100 text-blue-700' :
                                        s.role === 'owner' ? 'bg-amber-100 text-amber-700' :
                                        'bg-gray-100 text-gray-600'
                                      }`}>
                                        {ROLE_LABELS[s.role || ''] || s.role || 'Nhân viên'}
                                      </span>
                                      {s.from_date && (
                                        <span className="text-[10px] text-gray-400">
                                          từ {new Date(s.from_date).toLocaleDateString('vi-VN')}
                                        </span>
                                      )}
                                    </div>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })
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
