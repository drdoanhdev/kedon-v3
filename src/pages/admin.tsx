/**
 * Trang quản trị nền tảng SaaS — chỉ superadmin
 * 4 tabs: Tổng quan | Phòng khám | Thanh toán | Người dùng
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { getAuthHeaders } from '../lib/fetchWithAuth';
import toast, { Toaster } from 'react-hot-toast';
import Link from 'next/link';

type Tab = 'stats' | 'tenants' | 'payments' | 'users' | 'plans';

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

  if (loading) return <div className="text-center py-12 text-gray-400">Đang tải...</div>;

  return (
    <div className="bg-white rounded-xl border overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Phòng khám</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Owner</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Thành viên</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Gói</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Trạng thái</th>
              <th className="px-4 py-3 text-left font-medium text-gray-600">Ngày tạo</th>
              <th className="px-4 py-3 text-center font-medium text-gray-600">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {tenants.map((t) => (
              <tr key={t.id} className="hover:bg-gray-50">
                <td className="px-4 py-3">
                  <div className="font-medium text-gray-900">{t.name}</div>
                  <div className="text-xs text-gray-500">{t.code || t.id.slice(0, 8)}</div>
                </td>
                <td className="px-4 py-3 text-gray-600">{t.owner_email || '—'}</td>
                <td className="px-4 py-3 text-center">{t.member_count}</td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    t.plan === 'pro' ? 'bg-purple-100 text-purple-700' :
                    t.plan === 'basic' ? 'bg-blue-100 text-blue-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {t.plan || 'trial'}
                  </span>
                </td>
                <td className="px-4 py-3 text-center">
                  <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                    t.status === 'active' ? 'bg-green-100 text-green-700' :
                    t.status === 'suspended' ? 'bg-red-100 text-red-700' :
                    'bg-gray-100 text-gray-600'
                  }`}>
                    {t.status}
                  </span>
                </td>
                <td className="px-4 py-3 text-gray-500">
                  {new Date(t.created_at).toLocaleDateString('vi-VN')}
                </td>
                <td className="px-4 py-3 text-center">
                  <select
                    value={t.status}
                    onChange={(e) => handleStatusChange(t.id, e.target.value)}
                    className="text-xs border rounded px-2 py-1"
                  >
                    <option value="active">Active</option>
                    <option value="suspended">Suspended</option>
                    <option value="inactive">Inactive</option>
                  </select>
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
  );
}

// ========== Quản lý thanh toán ==========
function PaymentsTab() {
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
    if (!confirm(`Bạn có chắc muốn ${label}?`)) return;

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
                        {p.plan} · {p.months}th
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right font-medium">{formatVND(p.amount)}</td>
                    <td className="px-4 py-3 text-center">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        p.status === 'paid' ? 'bg-green-100 text-green-700' :
                        p.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-500'
                      }`}>
                        {p.status === 'paid' ? 'Đã TT' : p.status === 'pending' ? 'Chờ TT' : p.status}
                      </span>
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
                  <th className="px-4 py-3 text-center font-medium text-gray-600">Global Role</th>
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
                        <option value="staff">staff</option>
                        <option value="doctor">doctor</option>
                        <option value="admin">admin</option>
                        <option value="superadmin">superadmin</option>
                      </select>
                    </td>
                    <td className="px-4 py-3">
                      {u.tenants.length > 0 ? (
                        <div className="flex flex-wrap gap-1">
                          {u.tenants.map((t: any, i: number) => (
                            <span key={i} className="px-2 py-0.5 rounded-full text-xs bg-blue-50 text-blue-700">
                              {t.tenant_name} ({t.role})
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
              {plan.max_users && <div>Tối đa: {plan.max_users} user</div>}
              {plan.trial_days && <div>Trial: {plan.trial_days} ngày</div>}
              {plan.trial_max_prescriptions && <div>Giới hạn: {plan.trial_max_prescriptions} đơn</div>}
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
                  <label className="text-sm font-medium text-gray-700">Max users</label>
                  <input
                    type="number"
                    value={editPlan.max_users || ''}
                    onChange={(e) => setEditPlan({ ...editPlan, max_users: e.target.value || null })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    placeholder="∞"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Trial ngày</label>
                  <input
                    type="number"
                    value={editPlan.trial_days || ''}
                    onChange={(e) => setEditPlan({ ...editPlan, trial_days: e.target.value || null })}
                    className="mt-1 w-full px-3 py-2 border rounded-lg focus:ring-2 focus:ring-blue-400 focus:outline-none"
                    placeholder="—"
                  />
                </div>
                <div>
                  <label className="text-sm font-medium text-gray-700">Max đơn trial</label>
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

// ========== Helpers ==========
function formatVND(amount: number): string {
  return amount.toLocaleString('vi-VN') + 'đ';
}

// ========== Trang chính ==========
const TABS: { key: Tab; label: string; icon: string }[] = [
  { key: 'stats', label: 'Tổng quan', icon: '📊' },
  { key: 'tenants', label: 'Phòng khám', icon: '🏥' },
  { key: 'payments', label: 'Thanh toán', icon: '💳' },
  { key: 'users', label: 'Người dùng', icon: '👥' },
  { key: 'plans', label: 'Gói dịch vụ', icon: '💎' },
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
      <Toaster position="top-right" />
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
        {tab === 'users' && <UsersTab />}
        {tab === 'plans' && <PlansTab />}
      </div>
    </ProtectedRoute>
  );
}
