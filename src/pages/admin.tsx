/**
 * Trang quản trị nền tảng SaaS — chỉ superadmin
 * 4 tabs: Tổng quan | Phòng khám | Thanh toán | Người dùng
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { getAuthHeaders } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import Link from 'next/link';

import React from 'react';

type Tab = 'stats' | 'tenants' | 'payments' | 'users' | 'plans' | 'messages' | 'webhooks';

// ========== Thống kê tổng quan ==========
function StatsTab() {
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const headers = await getAuthHeaders();
        const res = await fetch('/api/admin/stats', { headers });
        if (res.ok) setStats(await res.json());
        else toast.error('Lỗi tải thống kê');
      } catch { toast.error('Lỗi kết nối'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <div className="text-center py-12 text-gray-400">Đang tải...</div>;
  if (!stats) return <div className="text-center py-12 text-red-400">Không tải được dữ liệu</div>;

  const cards = [
    { label: 'Phòng khám', value: stats.totalTenants, icon: '🏥', color: 'bg-blue-50 text-blue-700' },
    { label: 'Người dùng', value: stats.totalUsers, icon: '👥', color: 'bg-green-50 text-green-700' },
    { label: 'Tổng đơn thuốc/kính', value: stats.totalPrescriptions, icon: '📋', color: 'bg-indigo-50 text-indigo-700' },
    { label: 'Doanh thu', value: formatVND(stats.totalRevenue), icon: '💰', color: 'bg-yellow-50 text-yellow-700' },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {cards.map((c, i) => (
          <div key={i} className={`rounded-xl p-5 ${c.color}`}>
            <div className="text-2xl mb-1">{c.icon}</div>
            <div className="text-2xl font-bold">{c.value}</div>
            <div className="text-sm opacity-75">{c.label}</div>
          </div>
        ))}
      </div>

      {/* Phân bố theo gói */}
      <div className="bg-white rounded-xl border p-5">
        <h3 className="font-semibold text-gray-800 mb-3">Phân bố theo gói</h3>
        <div className="flex flex-wrap gap-3">
          {Object.entries(stats.planDistribution || {}).map(([plan, count]) => (
            <span key={plan} className="px-3 py-1 rounded-full text-sm font-medium bg-gray-100 text-gray-700">
              {plan}: {count as number}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

// ========== Quản lý phòng khám ==========
function TenantsTab() {
  const [tenants, setTenants] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [planModal, setPlanModal] = useState<{ tenant: any } | null>(null);
  const [planForm, setPlanForm] = useState({ plan: '', months: '1' });
  const [savingPlan, setSavingPlan] = useState(false);

  const fetchTenants = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/tenants', { headers });
      if (res.ok) {
        const data = await res.json();
        setTenants(data.data || []);
      }
    } catch { toast.error('Lỗi kết nối'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchTenants(); }, [fetchTenants]);

  const handleStatusChange = async (tenantId: string, status: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/tenants', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ tenantId, status }),
      });
      if (res.ok) {
        toast.success('Đã cập nhật trạng thái');
        fetchTenants();
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi cập nhật');
      }
    } catch { toast.error('Lỗi kết nối'); }
  };

  const openPlanModal = (tenant: any) => {
    setPlanForm({
      plan: tenant.plan || 'trial',
      months: '1',
    });
    setPlanModal({ tenant });
  };

  const handleSavePlan = async () => {
    if (!planModal) return;
    setSavingPlan(true);
    try {
      const now = new Date();
      // Tính plan_expires_at: cộng months tháng từ hiện tại (hoặc từ ngày hết hạn cũ nếu còn hạn)
      let expiresAt: Date;
      if (planForm.plan === 'trial') {
        // Trial: không có hạn mới, reset về null
        expiresAt = new Date(0);
      } else {
        const existingExpiry = planModal.tenant.plan_expires_at;
        if (existingExpiry && new Date(existingExpiry) > now) {
          expiresAt = new Date(existingExpiry);
        } else {
          expiresAt = new Date(now);
        }
        expiresAt.setMonth(expiresAt.getMonth() + parseInt(planForm.months));
      }

      const headers = await getAuthHeaders();
      const body: any = {
        tenantId: planModal.tenant.id,
        plan: planForm.plan,
        plan_expires_at: planForm.plan === 'trial' ? null : expiresAt.toISOString(),
      };

      const res = await fetch('/api/admin/tenants', {
        method: 'PUT',
        headers,
        body: JSON.stringify(body),
      });

      if (res.ok) {
        toast.success(`Đã ${planForm.plan === 'trial' ? 'chuyển về dùng thử' : `kích hoạt gói ${planForm.plan === 'enterprise' ? 'Doanh nghiệp' : planForm.plan === 'pro' ? 'Chuyên nghiệp' : 'Cơ bản'} (${planForm.months} tháng)`}`);
        setPlanModal(null);
        fetchTenants();
      } else {
        const err = await res.json();
        toast.error(err.message || 'Lỗi cập nhật');
      }
    } catch { toast.error('Lỗi kết nối'); }
    finally { setSavingPlan(false); }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Đang tải...</div>;

  return (
    <>
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Phòng khám</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">SĐT</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Chủ sở hữu</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">TV</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Gói</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Trạng thái</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Ngày tạo</th>
              <th className="px-2 py-2 text-left font-medium text-gray-600 whitespace-nowrap">Đăng nhập</th>
              <th className="px-2 py-2 text-center font-medium text-gray-600 whitespace-nowrap">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-2 py-2 whitespace-nowrap">
                  <div className="font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.code || t.id.slice(0, 8)}</div>
                </td>
                <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{t.phone || '—'}</td>
                <td className="px-2 py-2 text-gray-600 whitespace-nowrap">{t.owner_email || '—'}</td>
                <td className="px-2 py-2 text-center">{t.member_count}</td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  <div className="flex flex-col items-center gap-0.5">
                    <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                      t.plan === 'enterprise' ? 'bg-amber-100 text-amber-700' :
                      t.plan === 'pro' ? 'bg-purple-100 text-purple-700' :
                      t.plan === 'basic' ? 'bg-blue-100 text-blue-700' :
                      'bg-gray-100 text-gray-600'
                    }`}>
                      {t.plan === 'enterprise' ? 'Doanh nghiệp' : t.plan === 'pro' ? 'Chuyên nghiệp' : t.plan === 'basic' ? 'Cơ bản' : 'Dùng thử'}
                    </span>
                    <span className={`text-[10px] ${
                      t.plan_source === 'admin' ? 'text-orange-500' :
                      t.plan_source === 'payment' ? 'text-green-600' :
                      'text-gray-400'
                    }`}>
                      {t.plan_source === 'admin' ? '🔧 Admin' : t.plan_source === 'payment' ? '💳 Mua' : ''}
                    </span>
                    {t.plan_expires_at && t.plan !== 'trial' && (
                      <span className={`text-[10px] ${new Date(t.plan_expires_at) < new Date() ? 'text-red-500 font-medium' : 'text-gray-400'}`}>
                        {new Date(t.plan_expires_at) < new Date() ? 'Hết hạn ' : 'HSD '}
                        {new Date(t.plan_expires_at).toLocaleDateString('vi-VN')}
                      </span>
                    )}
                  </div>
                </td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    t.status === 'active' ? 'bg-green-100 text-green-700' :
                    t.status === 'suspended' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {t.status === 'active' ? 'Hoạt động' : t.status === 'suspended' ? 'Tạm ngưng' : 'Ngưng HĐ'}
                  </span>
                </td>
                <td className="px-2 py-2 text-gray-500 whitespace-nowrap">
                  {new Date(t.created_at).toLocaleDateString('vi-VN')}
                </td>
                <td className="px-2 py-2 text-gray-500 text-xs whitespace-nowrap">
                  {t.owner_last_sign_in
                    ? new Date(t.owner_last_sign_in).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })
                    : '—'}
                </td>
                <td className="px-2 py-2 text-center whitespace-nowrap">
                  <div className="flex items-center gap-1 justify-center">
                    <select
                      value={t.status}
                      onChange={(e) => handleStatusChange(t.id, e.target.value)}
                      className="text-xs border rounded px-1 py-1"
                    >
                      <option value="active">Hoạt động</option>
                      <option value="suspended">Tạm ngưng</option>
                      <option value="inactive">Ngưng HĐ</option>
                    </select>
                    <button
                      onClick={() => openPlanModal(t)}
                      className="px-1.5 py-1 bg-purple-50 text-purple-700 text-xs rounded hover:bg-purple-100 font-medium"
                      title="Kích hoạt / đổi gói"
                    >
                      💎
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {tenants.length === 0 && (
        <div className="text-center py-12 text-gray-400">Chưa có phòng khám nào</div>
      )}
    </div>

      {/* Modal kích hoạt gói */}
      {planModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-md w-full">
            <h3 className="text-lg font-bold text-gray-900 mb-1">Kích hoạt / đổi gói dịch vụ</h3>
            <p className="text-sm text-gray-500 mb-4">
              {planModal.tenant.name} — Gói hiện tại: <span className="font-medium">{planModal.tenant.plan === 'enterprise' ? 'Doanh nghiệp' : planModal.tenant.plan === 'pro' ? 'Chuyên nghiệp' : planModal.tenant.plan === 'basic' ? 'Cơ bản' : 'Dùng thử'}</span>
              {planModal.tenant.plan_source === 'payment' && <span className="text-green-600 ml-1">(Khách mua)</span>}
              {planModal.tenant.plan_source === 'admin' && <span className="text-orange-500 ml-1">(Admin cấp)</span>}
            </p>

            {planModal.tenant.plan_expires_at && planModal.tenant.plan !== 'trial' && (
              <div className={`text-sm mb-4 p-2 rounded ${new Date(planModal.tenant.plan_expires_at) < new Date() ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
                {new Date(planModal.tenant.plan_expires_at) < new Date()
                  ? `⚠️ Đã hết hạn ngày ${new Date(planModal.tenant.plan_expires_at).toLocaleDateString('vi-VN')}`
                  : `✅ Còn hạn đến ${new Date(planModal.tenant.plan_expires_at).toLocaleDateString('vi-VN')}`}
              </div>
            )}

            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium text-gray-700">Chọn gói</label>
                <select
                  value={planForm.plan}
                  onChange={(e) => setPlanForm({ ...planForm, plan: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                >
                  <option value="trial">🎁 Dùng thử</option>
                  <option value="basic">🔵 Cơ bản</option>
                  <option value="pro">💎 Chuyên nghiệp</option>
                  <option value="enterprise">🏪 Doanh nghiệp</option>
                </select>
              </div>

              {planForm.plan !== 'trial' && (
                <div>
                  <label className="text-sm font-medium text-gray-700">Số tháng kích hoạt</label>
                  <select
                    value={planForm.months}
                    onChange={(e) => setPlanForm({ ...planForm, months: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-purple-400 focus:outline-none"
                  >
                    {[1, 2, 3, 6, 12].map(m => (
                      <option key={m} value={m}>{m} tháng</option>
                    ))}
                  </select>
                  <p className="text-xs text-gray-400 mt-1">
                    {planModal.tenant.plan_expires_at && new Date(planModal.tenant.plan_expires_at) > new Date()
                      ? 'Sẽ cộng dồn vào thời hạn hiện tại'
                      : 'Tính từ hôm nay'}
                  </p>
                </div>
              )}

              {planForm.plan === 'trial' && planModal.tenant.plan !== 'trial' && (
                <div className="p-3 bg-yellow-50 rounded-lg text-sm text-yellow-800">
                  ⚠️ Chuyển về gói dùng thử sẽ xóa hạn sử dụng gói trả phí.
                </div>
              )}
            </div>

            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSavePlan}
                disabled={savingPlan}
                className="flex-1 py-2.5 bg-purple-600 text-white rounded-lg font-semibold hover:bg-purple-700 transition disabled:opacity-50"
              >
                {savingPlan ? 'Đang lưu...' : planForm.plan === 'trial' ? 'Chuyển về dùng thử' : `Kích hoạt ${planForm.months} tháng`}
              </button>
              <button
                onClick={() => setPlanModal(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

// ========== Quản lý thanh toán ==========
function PaymentsTab() {
  const { confirm } = useConfirm();
  const [payments, setPayments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('pending');

  const fetchPayments = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/payments?status=${filter}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setPayments(data.data || []);
      }
    } catch { toast.error('Lỗi kết nối'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchPayments(); }, [fetchPayments]);

  const handleAction = async (orderId: string, action: 'confirm' | 'cancel') => {
    const label = action === 'confirm' ? 'xác nhận thanh toán' : 'hủy đơn';
    if (!await confirm(`Bạn có chắc muốn ${label}?`)) return;

    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/payments', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ orderId, action }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchPayments();
      } else {
        toast.error(data.message || 'Lỗi');
      }
    } catch { toast.error('Lỗi kết nối'); }
  };

  return (
    <div className="space-y-4">
      {/* Filter buttons */}
      <div className="flex gap-2">
        {['pending', 'paid', 'cancelled', 'all'].map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
              filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
            }`}
          >
            {f === 'pending' ? 'Chờ xác nhận' : f === 'paid' ? 'Đã thanh toán' : f === 'cancelled' ? 'Đã hủy' : 'Tất cả'}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Mã GD</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Phòng khám</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Gói</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Số tiền</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Trạng thái</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Xác thực</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày tạo</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {payments.map((p) => (
                  <tr key={p.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">{p.transfer_code}</td>
                    <td className="px-4 py-3 text-gray-700">{(p as any).tenants?.name || p.tenant_id?.slice(0, 8)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-700">
                        {p.plan === 'enterprise' ? 'Doanh nghiệp' : p.plan === 'pro' ? 'Chuyên nghiệp' : p.plan === 'basic' ? 'Cơ bản' : p.plan === 'trial' ? 'Dùng thử' : p.plan} · {p.months} tháng
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatVND(p.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'paid' ? 'bg-green-100 text-green-700' :
                        p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {p.status === 'paid' ? 'Đã thanh toán' : p.status === 'pending' ? 'Chờ thanh toán' : p.status === 'cancelled' ? 'Đã hủy' : p.status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-center">
                      {p.validated_at ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700" title={new Date(p.validated_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}>
                          ✅ Webhook
                        </span>
                      ) : p.status === 'paid' ? (
                        <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-700">
                          🔧 Admin
                        </span>
                      ) : (
                        <span className="text-gray-300 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {new Date(p.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </td>
                    <td className="px-4 py-3 text-center space-x-1">
                      {p.status === 'pending' && (
                        <>
                          <button
                            onClick={() => handleAction(p.id, 'confirm')}
                            className="px-2 py-1 bg-green-600 text-white text-xs rounded hover:bg-green-700"
                          >
                            Xác nhận
                          </button>
                          <button
                            onClick={() => handleAction(p.id, 'cancel')}
                            className="px-2 py-1 bg-red-500 text-white text-xs rounded hover:bg-red-600"
                          >
                            Hủy
                          </button>
                        </>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {payments.length === 0 && (
            <div className="text-center py-12 text-gray-400">Không có đơn nào</div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== Webhook Logs — Audit quy trình Webhook → VALIDATE → Activate ==========
function WebhooksTab() {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');

  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/webhook-logs?status=${filter}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setLogs(data.data || []);
      }
    } catch { toast.error('Lỗi kết nối'); }
    finally { setLoading(false); }
  }, [filter]);

  useEffect(() => { fetchLogs(); }, [fetchLogs]);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          {['all', 'valid', 'invalid', 'pending'].map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition ${
                filter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
              }`}
            >
              {f === 'all' ? 'Tất cả' : f === 'valid' ? '✅ Valid' : f === 'invalid' ? '❌ Invalid' : '⏳ Pending'}
            </button>
          ))}
        </div>
        <button
          onClick={fetchLogs}
          className="px-3 py-1.5 bg-gray-100 text-gray-600 rounded-lg text-sm hover:bg-gray-200"
        >
          🔄 Làm mới
        </button>
      </div>

      <p className="text-xs text-gray-500">
        Quy trình xác thực tự động: <span className="font-medium">Webhook → VALIDATE → Activate</span> &middot; OptiGo.vn
      </p>

      {loading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Thời gian</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Nguồn</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Mã GD</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-600">Số tiền</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Validation</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Phòng khám</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Chi tiết</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {logs.map((log: any) => (
                  <tr key={log.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-500 text-xs whitespace-nowrap">
                      {new Date(log.created_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        {log.source}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-gray-700">
                      {log.transfer_code || '—'}
                    </td>
                    <td className="px-4 py-3 text-right font-medium">
                      {log.amount ? formatVND(log.amount) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        log.validation_status === 'valid' ? 'bg-green-100 text-green-700' :
                        log.validation_status === 'invalid' ? 'bg-red-100 text-red-700' :
                        'bg-yellow-100 text-yellow-700'
                      }`}>
                        {log.validation_status === 'valid' ? '✅ Valid' :
                         log.validation_status === 'invalid' ? '❌ Invalid' : '⏳ Pending'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-700 text-xs">
                      {log.payment_orders?.tenants?.name || '—'}
                    </td>
                    <td className="px-4 py-3 text-xs">
                      {log.validation_errors?.length > 0 && (
                        <span className="text-red-600" title={log.validation_errors.join('; ')}>
                          {log.validation_errors[0]}{log.validation_errors.length > 1 ? ` (+${log.validation_errors.length - 1})` : ''}
                        </span>
                      )}
                      {log.validation_status === 'valid' && log.payment_orders && (
                        <span className="text-green-600">
                          Gói {log.payment_orders.plan} · {log.payment_orders.months} tháng
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {logs.length === 0 && (
            <div className="text-center py-12 text-gray-400">Không có webhook log nào</div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== Quản lý người dùng ==========
function UsersTab() {
  const [users, setUsers] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [resetUserId, setResetUserId] = useState<string | null>(null);
  const [newPassword, setNewPassword] = useState('');

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch(`/api/admin/users?search=${encodeURIComponent(search)}`, { headers });
      if (res.ok) {
        const data = await res.json();
        setUsers(data.data || []);
      }
    } catch { toast.error('Lỗi kết nối'); }
    finally { setLoading(false); }
  }, [search]);

  useEffect(() => {
    const timer = setTimeout(() => { fetchUsers(); }, 300);
    return () => clearTimeout(timer);
  }, [fetchUsers]);

  const handleResetPassword = async () => {
    if (!resetUserId || !newPassword) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ userId: resetUserId, action: 'reset-password', newPassword }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setResetUserId(null);
        setNewPassword('');
      } else {
        toast.error(data.message);
      }
    } catch { toast.error('Lỗi kết nối'); }
  };

  const handleRoleChange = async (userId: string, role: string) => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/users', {
        method: 'PUT',
        headers,
        body: JSON.stringify({ userId, action: 'update-role', role }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        fetchUsers();
      } else {
        toast.error(data.message);
      }
    } catch { toast.error('Lỗi kết nối'); }
  };

  return (
    <div className="space-y-4">
      <input
        type="text"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Tìm kiếm theo email..."
        className="w-full max-w-md px-4 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
      />

      {/* Reset password modal */}
      {resetUserId && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 max-w-sm w-full mx-4">
            <h3 className="font-semibold text-gray-800 mb-3">Reset mật khẩu</h3>
            <p className="text-sm text-gray-500 mb-3">
              User: {users.find(u => u.id === resetUserId)?.email}
            </p>
            <input
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Mật khẩu mới (≥ 6 ký tự)"
              className="w-full px-3 py-2 border rounded-lg mb-3 focus:outline-none focus:ring-2 focus:ring-blue-400"
            />
            <div className="flex gap-2">
              <button
                onClick={handleResetPassword}
                disabled={newPassword.length < 6}
                className="flex-1 py-2 bg-blue-600 text-white rounded-lg font-medium hover:bg-blue-700 disabled:opacity-50"
              >
                Xác nhận
              </button>
              <button
                onClick={() => { setResetUserId(null); setNewPassword(''); }}
                className="flex-1 py-2 bg-gray-100 text-gray-700 rounded-lg font-medium hover:bg-gray-200"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="text-center py-12 text-gray-400">Đang tải...</div>
      ) : (
        <div className="bg-white rounded-xl border overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Email</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Vai trò hệ thống</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Phòng khám</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-600">Đăng nhập gần nhất</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Thao tác</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {users.map((u) => (
                  <tr key={u.id} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-medium text-gray-900">{u.email}</td>
                    <td className="px-4 py-3 text-center">
                      <select
                        value={u.global_role || ''}
                        onChange={(e) => handleRoleChange(u.id, e.target.value)}
                        className="text-xs border rounded px-2 py-1"
                      >
                        <option value="">— Chưa cấp —</option>
                        <option value="staff">Nhân viên</option>
                        <option value="doctor">Bác sĩ</option>
                        <option value="admin">Quản trị viên</option>
                        <option value="superadmin">Quản trị nền tảng</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {u.tenants.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.tenants.map((t: any, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                              {t.tenant_name} ({t.role === 'owner' ? 'Chủ PK' : t.role === 'admin' ? 'Quản trị' : t.role === 'doctor' ? 'Bác sĩ' : t.role === 'staff' ? 'Nhân viên' : t.role})
                            </span>
                          ))}
                        </div>
                      ) : (
                        <span className="text-gray-400 text-xs">Chưa tham gia PK</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-gray-500">
                      {u.last_sign_in_at ? new Date(u.last_sign_in_at).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' }) : '—'}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button
                        onClick={() => setResetUserId(u.id)}
                        className="px-2 py-1 bg-yellow-500 text-white text-xs rounded hover:bg-yellow-600"
                      >
                        Reset MK
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {users.length === 0 && (
            <div className="text-center py-12 text-gray-400">Không tìm thấy user nào</div>
          )}
        </div>
      )}
    </div>
  );
}

// ========== Quản lý gói dịch vụ ==========
function PlansTab() {
  const [plans, setPlans] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [editPlan, setEditPlan] = useState<any | null>(null);
  const [featureInput, setFeatureInput] = useState('');

  const fetchPlans = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/plans', { headers });
      if (res.ok) {
        const data = await res.json();
        setPlans(data.data || []);
      }
    } catch { toast.error('Lỗi kết nối'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchPlans(); }, [fetchPlans]);

  const openEdit = (plan: any) => {
    setEditPlan({ ...plan, features: [...(plan.features || [])] });
    setFeatureInput('');
  };

  const handleSave = async () => {
    if (!editPlan) return;
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/admin/plans', {
        method: 'PUT',
        headers,
        body: JSON.stringify(editPlan),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message);
        setEditPlan(null);
        fetchPlans();
      } else {
        toast.error(data.message || 'Lỗi cập nhật');
      }
    } catch { toast.error('Lỗi kết nối'); }
  };

  const addFeature = () => {
    if (!featureInput.trim() || !editPlan) return;
    setEditPlan({ ...editPlan, features: [...editPlan.features, featureInput.trim()] });
    setFeatureInput('');
  };

  const removeFeature = (idx: number) => {
    if (!editPlan) return;
    const f = [...editPlan.features];
    f.splice(idx, 1);
    setEditPlan({ ...editPlan, features: f });
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Đang tải...</div>;

  return (
    <div className="space-y-6">
      {/* Danh sách gói */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {plans.map((plan) => (
          <div
            key={plan.id}
            className={`bg-white rounded-xl border-2 p-5 relative ${
              plan.is_popular ? 'border-purple-400 ring-2 ring-purple-100' : 'border-gray-200'
            } ${!plan.is_active ? 'opacity-50' : ''}`}
          >
            {plan.is_popular && (
              <span className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-0.5 bg-purple-600 text-white text-xs rounded-full font-medium">
                Phổ biến
              </span>
            )}
            {!plan.is_active && (
              <span className="absolute -top-3 right-3 px-2 py-0.5 bg-gray-500 text-white text-xs rounded-full">
                Đã ẩn
              </span>
            )}
            <div className="text-center mb-4">
              <h3 className="text-lg font-bold text-gray-900">{plan.name}</h3>
              <p className="text-xs text-gray-500 font-mono">{plan.plan_key}</p>
              <div className="mt-2">
                <span className="text-2xl font-bold text-blue-700">
                  {plan.price === 0 ? 'Miễn phí' : formatVND(plan.price)}
                </span>
                {plan.price > 0 && <span className="text-sm text-gray-500">{plan.period_label}</span>}
              </div>
            </div>
            <ul className="space-y-1.5 mb-4">
              {(plan.features || []).map((f: string, i: number) => (
                <li key={i} className="text-sm text-gray-600 flex items-start gap-1.5">
                  <span className="text-green-500 mt-0.5">✓</span> {f}
                </li>
              ))}
            </ul>
            <div className="text-xs text-gray-400 space-y-0.5 mb-3">
              {plan.max_users && <div>Tối đa: {plan.max_users} người dùng</div>}
              {plan.trial_days && <div>Dùng thử: {plan.trial_days} ngày</div>}
              {plan.trial_max_prescriptions && <div>Giới hạn dùng thử: {plan.trial_max_prescriptions} đơn</div>}
            </div>
            <button
              onClick={() => openEdit(plan)}
              className="w-full py-2 bg-blue-600 text-white text-sm rounded-lg font-medium hover:bg-blue-700 transition"
            >
              ✏️ Chỉnh sửa
            </button>
          </div>
        ))}
      </div>

      {/* Modal chỉnh sửa */}
      {editPlan && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white rounded-2xl p-6 max-w-lg w-full max-h-[90vh] overflow-y-auto">
            <h3 className="text-lg font-bold text-gray-900 mb-4">
              Chỉnh sửa gói: {editPlan.name} ({editPlan.plan_key})
            </h3>

            <div className="space-y-4">
              {/* Tên gói */}
              <div>
                <label className="text-sm font-medium text-gray-700">Tên gói hiển thị</label>
                <input
                  value={editPlan.name}
                  onChange={(e) => setEditPlan({ ...editPlan, name: e.target.value })}
                  className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                />
              </div>

              {/* Giá */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Giá (VND/tháng)</label>
                  <input
                    type="number"
                    value={editPlan.price}
                    onChange={(e) => setEditPlan({ ...editPlan, price: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Nhãn chu kỳ</label>
                  <input
                    value={editPlan.period_label}
                    onChange={(e) => setEditPlan({ ...editPlan, period_label: e.target.value })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    placeholder="/tháng"
                  />
                </div>
              </div>

              {/* Giới hạn */}
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <label className="text-sm font-medium text-gray-700">Tối đa người dùng</label>
                  <input
                    type="number"
                    value={editPlan.max_users || ''}
                    onChange={(e) => setEditPlan({ ...editPlan, max_users: e.target.value || null })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    placeholder="∞"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Dùng thử (ngày)</label>
                  <input
                    type="number"
                    value={editPlan.trial_days || ''}
                    onChange={(e) => setEditPlan({ ...editPlan, trial_days: e.target.value || null })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Tối đa đơn dùng thử</label>
                  <input
                    type="number"
                    value={editPlan.trial_max_prescriptions || ''}
                    onChange={(e) => setEditPlan({ ...editPlan, trial_max_prescriptions: e.target.value || null })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    placeholder="—"
                  />
                </div>
              </div>

              {/* Tính năng */}
              <div>
                <label className="text-sm font-medium text-gray-700">Tính năng hiển thị</label>
                <div className="mt-1 space-y-1.5">
                  {(editPlan.features || []).map((f: string, i: number) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="flex-1 text-sm bg-gray-50 px-3 py-1.5 rounded border">{f}</span>
                      <button
                        onClick={() => removeFeature(i)}
                        className="text-red-400 hover:text-red-600 text-sm px-1"
                      >
                        ✕
                      </button>
                    </div>
                  ))}
                  <div className="flex gap-2">
                    <input
                      value={featureInput}
                      onChange={(e) => setFeatureInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && (e.preventDefault(), addFeature())}
                      placeholder="Thêm tính năng..."
                      className="flex-1 px-3 py-1.5 border rounded-lg text-sm focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    />
                    <button
                      onClick={addFeature}
                      className="px-3 py-1.5 bg-blue-100 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-200"
                    >
                      + Thêm
                    </button>
                  </div>
                </div>
              </div>

              {/* Switches */}
              <div className="flex flex-wrap gap-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPlan.is_popular}
                    onChange={(e) => setEditPlan({ ...editPlan, is_popular: e.target.checked })}
                    className="w-4 h-4 rounded text-purple-600"
                  />
                  <span className="text-sm text-gray-700">⭐ Phổ biến</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editPlan.is_active}
                    onChange={(e) => setEditPlan({ ...editPlan, is_active: e.target.checked })}
                    className="w-4 h-4 rounded text-green-600"
                  />
                  <span className="text-sm text-gray-700">✅ Hiển thị</span>
                </label>
              </div>

              {/* Thứ tự */}
              <div>
                <label className="text-sm font-medium text-gray-700">Thứ tự hiển thị</label>
                <input
                  type="number"
                  value={editPlan.sort_order}
                  onChange={(e) => setEditPlan({ ...editPlan, sort_order: e.target.value })}
                  className="mt-1 w-24 px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                />
              </div>
            </div>

            {/* Actions */}
            <div className="flex gap-3 mt-6">
              <button
                onClick={handleSave}
                className="flex-1 py-2.5 bg-blue-600 text-white rounded-lg font-semibold hover:bg-blue-700 transition"
              >
                💾 Lưu thay đổi
              </button>
              <button
                onClick={() => setEditPlan(null)}
                className="flex-1 py-2.5 bg-gray-100 text-gray-700 rounded-lg font-semibold hover:bg-gray-200 transition"
              >
                Hủy
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ========== Tin nhắn Platform ==========
function MessagesTab() {
  const [inbox, setInbox] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTenant, setSelectedTenant] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<any[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [newMsg, setNewMsg] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = React.useRef<HTMLDivElement>(null);

  const fetchInbox = useCallback(async () => {
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tin-nhan-platform?mode=inbox', { headers });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setInbox(json.data || []);
    } catch { toast.error('Lỗi tải inbox'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { fetchInbox(); }, [fetchInbox]);

  // Poll inbox every 30s
  useEffect(() => {
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') fetchInbox();
    }, 30_000);
    return () => clearInterval(timer);
  }, [fetchInbox]);

  const openThread = useCallback(async (tenantId: string) => {
    setSelectedTenant(tenantId);
    setThreadLoading(true);
    try {
      const headers = await getAuthHeaders();
      // Fetch messages
      const res = await fetch(`/api/tin-nhan-platform?mode=thread&tenant_id=${tenantId}&limit=50`, { headers });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setThreadMessages(json.data || []);
      // Mark as read
      await fetch('/api/tin-nhan-platform?mode=admin_read', {
        method: 'PATCH',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: tenantId }),
      });
      // Update inbox count
      setInbox(prev => prev.map(t => t.tenant_id === tenantId ? { ...t, unread_count: 0 } : t));
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }), 100);
    } catch { toast.error('Lỗi tải tin nhắn'); }
    finally { setThreadLoading(false); }
  }, []);

  // Poll thread every 10s
  useEffect(() => {
    if (!selectedTenant) return;
    const timer = setInterval(async () => {
      if (document.visibilityState !== 'visible') return;
      try {
        const headers = await getAuthHeaders();
        const res = await fetch(`/api/tin-nhan-platform?mode=thread&tenant_id=${selectedTenant}&limit=50`, { headers });
        if (!res.ok) return;
        const json = await res.json();
        const msgs = json.data || [];
        setThreadMessages(prev => {
          if (msgs.length !== prev.length || msgs[msgs.length - 1]?.id !== prev[prev.length - 1]?.id) {
            setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
            return msgs;
          }
          return prev;
        });
      } catch { /* silent */ }
    }, 10_000);
    return () => clearInterval(timer);
  }, [selectedTenant]);

  const sendReply = async () => {
    if (!newMsg.trim() || !selectedTenant || sending) return;
    setSending(true);
    try {
      const headers = await getAuthHeaders();
      const res = await fetch('/api/tin-nhan-platform?mode=reply', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ tenant_id: selectedTenant, noi_dung: newMsg }),
      });
      if (!res.ok) throw new Error();
      const json = await res.json();
      setThreadMessages(prev => [...prev, { ...json.data, sender_name: 'Bạn (Superadmin)' }]);
      setNewMsg('');
      setTimeout(() => messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    } catch { toast.error('Lỗi gửi tin nhắn'); }
    finally { setSending(false); }
  };

  if (loading) return <div className="text-center py-12 text-gray-400">Đang tải...</div>;

  // Thread view (đang xem tin nhắn với 1 tenant)
  if (selectedTenant) {
    const tenantInfo = inbox.find(t => t.tenant_id === selectedTenant);
    return (
      <div className="flex flex-col" style={{ height: 'calc(100vh - 240px)' }}>
        {/* Thread header */}
        <div className="flex items-center gap-3 mb-3 flex-shrink-0">
          <button
            onClick={() => { setSelectedTenant(null); fetchInbox(); }}
            className="px-3 py-1.5 text-sm bg-gray-100 hover:bg-gray-200 rounded-lg transition-colors"
          >
            ← Quay lại
          </button>
          <div>
            <h3 className="font-semibold text-gray-900">
              {tenantInfo?.tenant_name || 'Phòng khám'}
            </h3>
            {tenantInfo?.tenant_code && (
              <span className="text-xs text-gray-400">Mã: {tenantInfo.tenant_code}</span>
            )}
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto bg-gray-50 rounded-xl border p-4 space-y-3">
          {threadLoading ? (
            <div className="text-center py-12 text-gray-400">Đang tải...</div>
          ) : threadMessages.length === 0 ? (
            <div className="text-center py-12 text-gray-400">Chưa có tin nhắn</div>
          ) : (
            threadMessages.map(msg => {
              const isSuper = msg.sender_role === 'superadmin';
              return (
                <div key={msg.id} className={`flex ${isSuper ? 'justify-end' : 'justify-start'}`}>
                  <div className="max-w-[75%]">
                    {!isSuper && (
                      <p className="text-[10px] text-gray-400 mb-0.5 px-1">
                        {msg.sender_name || 'User'}
                      </p>
                    )}
                    <div className={`rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                      isSuper
                        ? 'bg-purple-600 text-white rounded-br-md'
                        : 'bg-white text-gray-800 rounded-bl-md border border-gray-200'
                    }`}>
                      <p className="whitespace-pre-wrap break-words">{msg.noi_dung}</p>
                    </div>
                    <p className={`text-[10px] text-gray-400 mt-0.5 px-1 ${isSuper ? 'text-right' : ''}`}>
                      {new Date(msg.created_at).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Reply input */}
        <div className="flex-shrink-0 mt-3">
          <div className="flex items-end gap-2">
            <textarea
              placeholder="Trả lời phòng khám..."
              value={newMsg}
              onChange={e => setNewMsg(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
              rows={1}
              className="flex-1 resize-none max-h-32 min-h-[44px] rounded-lg border border-gray-300 px-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-purple-300"
              maxLength={2000}
              style={{ height: 'auto', minHeight: '44px' }}
              onInput={(e) => {
                const t = e.target as HTMLTextAreaElement;
                t.style.height = 'auto';
                t.style.height = Math.min(t.scrollHeight, 128) + 'px';
              }}
            />
            <button
              onClick={sendReply}
              disabled={!newMsg.trim() || sending}
              className="bg-purple-600 hover:bg-purple-700 disabled:opacity-50 text-white h-11 px-4 rounded-lg transition-colors"
            >
              Gửi
            </button>
          </div>
          <p className="text-[10px] text-gray-300 mt-1 text-right">Enter gửi • Shift+Enter xuống dòng</p>
        </div>
      </div>
    );
  }

  // Inbox view (danh sách tenant)
  const totalUnread = inbox.reduce((s, t) => s + t.unread_count, 0);
  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-gray-800">
          Tin nhắn từ phòng khám
          {totalUnread > 0 && (
            <span className="ml-2 px-2 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
              {totalUnread}
            </span>
          )}
        </h2>
        <button onClick={() => { setLoading(true); fetchInbox(); }} className="text-sm text-blue-600 hover:underline">
          Làm mới
        </button>
      </div>

      {inbox.length === 0 ? (
        <div className="text-center py-12 text-gray-400">
          <p>Chưa có phòng khám nào gửi tin nhắn</p>
        </div>
      ) : (
        <div className="space-y-2">
          {inbox.map(t => (
            <div
              key={t.tenant_id}
              onClick={() => openThread(t.tenant_id)}
              className={`flex items-center justify-between p-4 rounded-xl border cursor-pointer transition-all hover:shadow-md ${
                t.unread_count > 0 ? 'bg-blue-50 border-blue-200' : 'bg-white border-gray-200 hover:bg-gray-50'
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <h3 className={`font-medium truncate ${t.unread_count > 0 ? 'text-gray-900' : 'text-gray-600'}`}>
                    {t.tenant_name}
                  </h3>
                  {t.tenant_code && (
                    <span className="text-[10px] bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                      {t.tenant_code}
                    </span>
                  )}
                </div>
                <p className="text-xs text-gray-400 mt-0.5">
                  Tin nhắn gần nhất: {new Date(t.last_message_at).toLocaleString('vi-VN', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {t.unread_count > 0 && (
                <span className="ml-3 px-2.5 py-0.5 bg-red-500 text-white text-xs font-bold rounded-full">
                  {t.unread_count}
                </span>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ========== Helpers ==========
function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

// ========== Trang chính ==========
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'stats', label: 'Tổng quan', icon: '📊' },
  { key: 'tenants', label: 'Phòng khám', icon: '🏥' },
  { key: 'payments', label: 'Thanh toán', icon: '💳' },
  { key: 'webhooks', label: 'Webhook Logs', icon: '🔗' },
  { key: 'users', label: 'Người dùng', icon: '👥' },
  { key: 'plans', label: 'Gói dịch vụ', icon: '💎' },
  { key: 'messages', label: 'Tin nhắn', icon: '💬' },
];

export default function AdminPage() {
  const { userRole, user } = useAuth();
  const [tab, setTab] = useState<Tab>('stats');

  // Block nếu không phải superadmin
  if (userRole !== 'superadmin') {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-3">Không có quyền truy cập</h1>
            <p className="text-gray-600 mb-4">Trang này chỉ dành cho quản trị viên nền tảng (superadmin).</p>
            <Link href="/" className="text-blue-600 hover:underline">Quay lại trang chủ</Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="max-w-7xl mx-auto px-4 py-6">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Quản trị nền tảng</h1>
            <p className="text-sm text-gray-500">Đăng nhập: {user?.email}</p>
          </div>
          <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-xs font-semibold uppercase">
            Superadmin
          </span>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 mb-6 bg-gray-100 rounded-xl p-1 w-fit">
          {TABS.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
                tab === t.key
                  ? 'bg-white text-gray-900 shadow-sm'
                  : 'text-gray-500 hover:text-gray-700'
              }`}
            >
              {t.icon} {t.label}
            </button>
          ))}
        </div>

        {/* Content */}
        {tab === 'stats' && <StatsTab />}
        {tab === 'tenants' && <TenantsTab />}
        {tab === 'payments' && <PaymentsTab />}
        {tab === 'webhooks' && <WebhooksTab />}
        {tab === 'users' && <UsersTab />}
        {tab === 'plans' && <PlansTab />}
        {tab === 'messages' && <MessagesTab />}
      </div>
    </ProtectedRoute>
  );
}
