// Card tong hop "Tai khoan nguoi dung" -- danh sach thanh vien + bao mat dang nhap
import { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import { Shield, Laptop, Wifi, Clock3, Save, RotateCcw, X, Plus, Trash2, Users } from 'lucide-react';

interface LoginSecurityPolicy {
  enabled: boolean;
  single_device_only: boolean;
  enforce_store_network: boolean;
  allowed_ips: string[];
  enforce_working_hours: boolean;
  allowed_weekdays: number[];
  start_time: string;
  end_time: string;
  timezone: string;
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  role_id?: string | null;
  active: boolean;
  email?: string;
  full_name?: string;
  last_login_at?: string | null;
  login_security?: LoginSecurityPolicy;
  locked_device_id?: string | null;
  locked_device_label?: string | null;
  locked_device_at?: string | null;
}

interface TenantRole {
  id: string;
  code: string;
  name: string;
  is_system: boolean;
  is_protected: boolean;
}

const defaultLoginPolicy: LoginSecurityPolicy = {
  enabled: false,
  single_device_only: false,
  enforce_store_network: false,
  allowed_ips: [],
  enforce_working_hours: false,
  allowed_weekdays: [1, 2, 3, 4, 5, 6],
  start_time: '08:00',
  end_time: '20:00',
  timezone: 'Asia/Ho_Chi_Minh',
};

const weekdayOptions = [
  { value: 0, label: 'CN' },
  { value: 1, label: 'T2' },
  { value: 2, label: 'T3' },
  { value: 3, label: 'T4' },
  { value: 4, label: 'T5' },
  { value: 5, label: 'T6' },
  { value: 6, label: 'T7' },
];

const normalizePolicy = (raw: any): LoginSecurityPolicy => ({
  enabled: raw?.enabled === true,
  single_device_only: raw?.single_device_only === true,
  enforce_store_network: raw?.enforce_store_network === true,
  allowed_ips: Array.isArray(raw?.allowed_ips)
    ? raw.allowed_ips.map((v: any) => String(v || '').trim()).filter(Boolean)
    : [],
  enforce_working_hours: raw?.enforce_working_hours === true,
  allowed_weekdays: Array.isArray(raw?.allowed_weekdays)
    ? raw.allowed_weekdays.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
    : defaultLoginPolicy.allowed_weekdays,
  start_time: typeof raw?.start_time === 'string' ? raw.start_time : defaultLoginPolicy.start_time,
  end_time: typeof raw?.end_time === 'string' ? raw.end_time : defaultLoginPolicy.end_time,
  timezone: typeof raw?.timezone === 'string' ? raw.timezone : defaultLoginPolicy.timezone,
});

export default function LoginSecurityCard() {
  const { currentTenantId, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [roles, setRoles] = useState<TenantRole[]>([]);
  const [loading, setLoading] = useState(true);

  const [showSecurityEditor, setShowSecurityEditor] = useState(false);
  const [securityMember, setSecurityMember] = useState<Member | null>(null);
  const [securityForm, setSecurityForm] = useState<LoginSecurityPolicy>(defaultLoginPolicy);
  const [allowedIpsText, setAllowedIpsText] = useState('');
  const [saving, setSaving] = useState(false);

  const [showAddForm, setShowAddForm] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newFullName, setNewFullName] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRoleId, setNewRoleId] = useState('');
  const [addingMember, setAddingMember] = useState(false);

  const [updatingRole, setUpdatingRole] = useState<string | null>(null);
  const [removingMember, setRemovingMember] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const [membersRes, rolesRes] = await Promise.all([
        fetchWithAuth('/api/tenants/members'),
        fetchWithAuth('/api/roles'),
      ]);
      if (membersRes.ok) {
        const data = await membersRes.json();
        const list = Array.isArray(data) ? data : data.data || data.members || [];
        setMembers(list);
      }
      if (rolesRes.ok) {
        const data = await rolesRes.json();
        const list: TenantRole[] = data.data || [];
        setRoles(list);
        setNewRoleId(prev => {
          if (prev) return prev;
          const def = list.find(r => r.code === 'staff') || list.find(r => !r.is_protected);
          return def?.id || '';
        });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  useEffect(() => { load(); }, [load]);

  const openSecurityForMember = (member: Member) => {
    const policy = normalizePolicy(member.login_security || {});
    setSecurityMember(member);
    setSecurityForm(policy);
    setAllowedIpsText(policy.allowed_ips.join('\n'));
    setShowSecurityEditor(true);
  };

  const saveSecuritySettings = async () => {
    if (!securityMember) return;
    const allowedIps = allowedIpsText.split(/[,\n]/).map(v => v.trim()).filter(Boolean);
    const payload: LoginSecurityPolicy = {
      ...securityForm,
      allowed_ips: allowedIps,
      allowed_weekdays: securityForm.allowed_weekdays.length > 0 ? securityForm.allowed_weekdays : [1, 2, 3, 4, 5, 6],
    };
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/tenants/member-login-security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId: securityMember.id, login_security: payload, reset_device_lock: false }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || 'Lỗi lưu cài đặt bảo mật đăng nhập');
        return;
      }
      toast.success('Đã lưu cài đặt bảo mật đăng nhập');
      setShowSecurityEditor(false);
      setSecurityMember(null);
      await load();
    } catch {
      toast.error('Lỗi kết nối khi lưu cài đặt bảo mật');
    } finally {
      setSaving(false);
    }
  };

  const resetLockedDevice = async () => {
    if (!securityMember) return;
    if (!confirm('Đặt lại thiết bị đã khóa cho nhân viên này?')) return;
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/tenants/member-login-security', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId: securityMember.id, login_security: securityForm, reset_device_lock: true }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || 'Không thể đặt lại khóa thiết bị');
        return;
      }
      toast.success('Đã đặt lại thiết bị');
      await load();
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setSaving(false);
    }
  };

  const handleAddMember = async () => {
    if (!newEmail.trim()) { toast.error('Vui lòng nhập email'); return; }
    if (!newRoleId) { toast.error('Vui lòng chọn vai trò'); return; }
    setAddingMember(true);
    try {
      const res = await fetchWithAuth('/api/tenants/members', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: newEmail.trim(),
          full_name: newFullName.trim() || undefined,
          role_id: newRoleId,
          password: newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Đã thêm thành viên');
        setShowAddForm(false);
        setNewEmail('');
        setNewFullName('');
        setNewPassword('');
        await load();
      } else {
        toast.error(data.message || 'Lỗi thêm thành viên');
      }
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setAddingMember(false);
    }
  };

  const handleUpdateRole = async (membershipId: string, roleId: string) => {
    setUpdatingRole(membershipId);
    try {
      const res = await fetchWithAuth('/api/tenants/members', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ membershipId, role_id: roleId }),
      });
      const data = await res.json();
      if (res.ok) { toast.success('Đã cập nhật vai trò'); await load(); }
      else toast.error(data.message || 'Lỗi cập nhật vai trò');
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setUpdatingRole(null);
    }
  };

  const handleRemoveMember = async (membershipId: string, displayName: string) => {
    if (!confirm(`Xóa "${displayName}" khỏi phòng khám?`)) return;
    setRemovingMember(membershipId);
    try {
      const res = await fetchWithAuth(`/api/tenants/members?membershipId=${membershipId}`, { method: 'DELETE' });
      const data = await res.json();
      if (res.ok) { toast.success('Đã xóa thành viên'); await load(); }
      else toast.error(data.message || 'Lỗi xóa thành viên');
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setRemovingMember(null);
    }
  };

  const activeMembers = members.filter(m => m.active !== false);
  const sortedMembers = [...activeMembers].sort((a, b) => {
    if (a.role === 'owner') return -1;
    if (b.role === 'owner') return 1;
    return 0;
  });

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
        {/* Header */}
        <div className="px-5 py-3.5 border-b bg-gray-50 flex items-center gap-2">
          <Users className="w-4 h-4 text-blue-600" />
          <h3 className="text-sm font-semibold text-gray-800">Tài khoản người dùng</h3>
          <span className="ml-1 text-xs text-gray-400 font-normal">({activeMembers.length})</span>
          <div className="ml-auto">
            <button
              onClick={() => setShowAddForm(v => !v)}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Thêm thành viên
            </button>
          </div>
        </div>

        {/* Add member inline form */}
        {showAddForm && (
          <div className="px-5 py-4 bg-blue-50 border-b border-blue-100">
            <p className="text-sm font-semibold text-blue-800 mb-3">Thêm thành viên mới</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3 mb-3">
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={e => setNewEmail(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white"
                  placeholder="email@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Họ và tên</label>
                <input
                  type="text"
                  value={newFullName}
                  onChange={e => setNewFullName(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white"
                  placeholder="Nguyễn Văn A"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">Mật khẩu (nếu tạo mới)</label>
                <input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white"
                  placeholder="Tối thiểu 6 ký tự"
                />
              </div>
              <div>
                <label className="text-xs font-medium text-gray-700 block mb-1">
                  Vai trò <span className="text-red-500">*</span>
                </label>
                <select
                  value={newRoleId}
                  onChange={e => setNewRoleId(e.target.value)}
                  className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none bg-white"
                >
                  {roles.filter(r => !r.is_protected).map(r => (
                    <option key={r.id} value={r.id}>
                      {r.name}{r.is_system ? '' : ' (tùy biến)'}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleAddMember}
                disabled={addingMember}
                className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
              >
                <Save className="w-4 h-4" />
                {addingMember ? 'Đang thêm...' : 'Thêm thành viên'}
              </button>
              <button
                onClick={() => { setShowAddForm(false); setNewEmail(''); setNewFullName(''); setNewPassword(''); }}
                className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
              >
                Hủy
              </button>
            </div>
          </div>
        )}

        {/* Column headers */}
        <div className="hidden md:grid px-5 py-2.5 border-b bg-gray-50 text-xs font-semibold text-gray-400 uppercase tracking-wider gap-3" style={{gridTemplateColumns:'2fr 1.4fr 1.8fr 1.2fr 100px'}}>
          <div>Thành viên</div>
          <div>Vai trò</div>
          <div>Bảo mật đăng nhập</div>
          <div>Đăng nhập gần nhất</div>
          <div></div>
        </div>

        {/* Member rows */}
        {loading ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">Đang tải...</div>
        ) : sortedMembers.length === 0 ? (
          <div className="px-5 py-8 text-sm text-gray-400 text-center">Chưa có thành viên nào.</div>
        ) : (
          <div className="divide-y">
            {sortedMembers.map(member => {
              const isOwner = member.role === 'owner';
              const isSelf = member.user_id === user?.id;
              const p = normalizePolicy(member.login_security || {});
              const displayName = member.full_name || member.email || member.user_id || '';
              return (
                <div key={member.id} className="hover:bg-gray-50 transition-colors">
                  {/* Desktop grid row */}
                  <div className="hidden md:grid px-5 py-3.5 items-center gap-3" style={{gridTemplateColumns:'2fr 1.4fr 1.8fr 1.2fr 100px'}}>
                    {/* Col 1: Avatar + Name + Email */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isOwner ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                        {(displayName[0] || 'U').toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-gray-900 flex items-center gap-1.5 flex-wrap leading-snug">
                          {displayName}
                          {isSelf && <span className="text-[11px] px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full font-normal">Bạn</span>}
                          {isOwner && <span className="text-[11px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">Chủ PK</span>}
                        </p>
                        <p className="text-xs text-gray-400 mt-0.5 truncate">{member.email || member.user_id}</p>
                      </div>
                    </div>

                    {/* Col 2: Role */}
                    <div>
                      {isOwner ? (
                        <span className="inline-flex items-center text-xs px-2.5 py-1 rounded-full font-semibold bg-amber-100 text-amber-700">
                          Chủ phòng khám
                        </span>
                      ) : (
                        <select
                          value={member.role_id || ''}
                          onChange={e => handleUpdateRole(member.id, e.target.value)}
                          disabled={updatingRole === member.id}
                          className="text-xs border border-gray-200 rounded-lg px-2.5 py-1.5 bg-white text-gray-700 focus:ring-1 focus:ring-blue-200 focus:outline-none disabled:opacity-50 cursor-pointer w-full"
                        >
                          {!member.role_id && <option value="" disabled>-- Chưa gán --</option>}
                          {roles.filter(r => !r.is_protected).map(r => (
                            <option key={r.id} value={r.id}>{r.name}{r.is_system ? '' : ' *'}</option>
                          ))}
                        </select>
                      )}
                    </div>

                    {/* Col 3: Security badges */}
                    <div className="flex flex-wrap gap-1.5 items-center">
                      {isOwner ? (
                        <span className="text-xs text-gray-300">--</span>
                      ) : (
                        <>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                            {p.enabled ? 'Bật' : 'Tắt'}
                          </span>
                          {p.single_device_only && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-indigo-100 text-indigo-700 flex items-center gap-0.5">
                              <Laptop className="w-3 h-3" />1 TB
                            </span>
                          )}
                          {p.enforce_store_network && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-emerald-100 text-emerald-700 flex items-center gap-0.5">
                              <Wifi className="w-3 h-3" />IP
                            </span>
                          )}
                          {p.enforce_working_hours && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-amber-100 text-amber-700 flex items-center gap-0.5">
                              <Clock3 className="w-3 h-3" />{p.start_time}-{p.end_time}
                            </span>
                          )}
                          {member.locked_device_id && (
                            <span className="text-xs px-2 py-0.5 rounded-full font-medium bg-purple-100 text-purple-700">Khóa TB</span>
                          )}
                        </>
                      )}
                    </div>

                    {/* Col 4: Last login */}
                    <div className="text-xs text-gray-500">
                      {member.last_login_at
                        ? new Date(member.last_login_at).toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' })
                        : <span className="text-gray-300">Chưa có</span>
                      }
                    </div>

                    {/* Col 5: Actions */}
                    <div className="flex items-center gap-1.5 justify-end">
                      {!isOwner && (
                        <>
                          <button
                            onClick={() => openSecurityForMember(member)}
                            className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50 transition-colors whitespace-nowrap"
                          >
                            <Shield className="w-3.5 h-3.5" />
                            Bảo mật
                          </button>
                          {!isSelf && (
                            <button
                              onClick={() => handleRemoveMember(member.id, displayName)}
                              disabled={removingMember === member.id}
                              className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg transition-colors disabled:opacity-50"
                              title="Xóa thành viên"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          )}
                        </>
                      )}
                    </div>
                  </div>

                  {/* Mobile layout */}
                  <div className="flex md:hidden px-4 py-3 items-start gap-3">
                    <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-bold shrink-0 ${isOwner ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                      {(displayName[0] || 'U').toUpperCase()}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <p className="text-sm font-semibold text-gray-900">{displayName}</p>
                        {isSelf && <span className="text-xs px-1.5 py-0.5 bg-gray-100 text-gray-500 rounded-full">Bạn</span>}
                        {isOwner && <span className="text-xs px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">Chủ PK</span>}
                      </div>
                      <p className="text-xs text-gray-400 mt-0.5">{member.email}</p>
                      {!isOwner && (
                        <div className="flex flex-wrap gap-1.5 mt-1.5 items-center">
                          <select
                            value={member.role_id || ''}
                            onChange={e => handleUpdateRole(member.id, e.target.value)}
                            disabled={updatingRole === member.id}
                            className="text-xs border border-gray-200 rounded-lg px-2 py-1 bg-white text-gray-700 focus:outline-none disabled:opacity-50"
                          >
                            {!member.role_id && <option value="" disabled>-- Chưa gán --</option>}
                            {roles.filter(r => !r.is_protected).map(r => (
                              <option key={r.id} value={r.id}>{r.name}</option>
                            ))}
                          </select>
                          <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${p.enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-400'}`}>
                            {p.enabled ? 'Bảo mật: Bật' : 'Bảo mật: Tắt'}
                          </span>
                        </div>
                      )}
                    </div>
                    {!isOwner && (
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => openSecurityForMember(member)} className="p-1.5 text-blue-600 hover:bg-blue-50 rounded-lg">
                          <Shield className="w-4 h-4" />
                        </button>
                        {!isSelf && (
                          <button onClick={() => handleRemoveMember(member.id, displayName)} disabled={removingMember === member.id} className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg disabled:opacity-50">
                            <Trash2 className="w-4 h-4" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Security editor panel */}
      {showSecurityEditor && securityMember && (
        <div className="bg-white border border-blue-200 rounded-xl p-5 shadow-sm">
          <div className="flex items-start justify-between gap-3 mb-4">
            <div>
              <h3 className="font-semibold text-gray-900 text-base">
                Bảo mật đăng nhập: {securityMember.full_name || securityMember.email || securityMember.user_id}
              </h3>
              <p className="text-sm text-gray-500 mt-0.5">
                Thiết lập giới hạn thiết bị, mạng cửa hàng và khung giờ đăng nhập.
              </p>
            </div>
            <button
              onClick={() => { setShowSecurityEditor(false); setSecurityMember(null); }}
              className="text-gray-400 hover:text-gray-600 p-1 rounded"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          <div className="space-y-4">
            <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
              <input
                type="checkbox"
                checked={securityForm.enabled}
                onChange={(e) => setSecurityForm((f) => ({ ...f, enabled: e.target.checked }))}
                className="w-4 h-4"
              />
              Bật bảo mật đăng nhập cho tài khoản này
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="border rounded-lg p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={securityForm.single_device_only}
                    onChange={(e) => setSecurityForm((f) => ({ ...f, single_device_only: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <Laptop className="w-4 h-4 text-indigo-600" />
                  Chỉ 1 thiết bị duy nhất
                </label>
                <p className="text-xs text-gray-500 mt-2">
                  Lần đăng nhập hợp lệ đầu tiên sẽ tự khóa thiết bị. Đăng nhập ở máy khác sẽ bị chặn.
                </p>
                <p className="text-xs text-gray-600 mt-2 font-medium">
                  Thiết bị hiện tại: {securityMember.locked_device_label || securityMember.locked_device_id || 'Chưa khóa'}
                </p>
              </div>

              <div className="border rounded-lg p-4">
                <label className="flex items-center gap-2 text-sm font-medium text-gray-800 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={securityForm.enforce_store_network}
                    onChange={(e) => setSecurityForm((f) => ({ ...f, enforce_store_network: e.target.checked }))}
                    className="w-4 h-4"
                  />
                  <Wifi className="w-4 h-4 text-emerald-600" />
                  Chỉ cho phép mạng cửa hàng
                </label>
                <p className="text-xs text-gray-500 mt-2">
                  Nhập danh sách IP/CIDR, mỗi dòng một giá trị.
                </p>
                <textarea
                  value={allowedIpsText}
                  onChange={(e) => setAllowedIpsText(e.target.value)}
                  rows={4}
                  className="mt-2 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                  placeholder="113.161.10.25"
                />
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <label className="flex items-center gap-2 text-sm font-medium text-gray-800 mb-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={securityForm.enforce_working_hours}
                  onChange={(e) => setSecurityForm((f) => ({ ...f, enforce_working_hours: e.target.checked }))}
                  className="w-4 h-4"
                />
                <Clock3 className="w-4 h-4 text-amber-600" />
                Chỉ cho đăng nhập theo giờ làm việc
              </label>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Bắt đầu</label>
                  <input
                    type="time"
                    value={securityForm.start_time}
                    onChange={(e) => setSecurityForm((f) => ({ ...f, start_time: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Kết thúc</label>
                  <input
                    type="time"
                    value={securityForm.end_time}
                    onChange={(e) => setSecurityForm((f) => ({ ...f, end_time: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                  />
                </div>
                <div>
                  <label className="text-xs font-medium text-gray-600 block mb-1">Múi giờ</label>
                  <input
                    type="text"
                    value={securityForm.timezone}
                    onChange={(e) => setSecurityForm((f) => ({ ...f, timezone: e.target.value }))}
                    className="w-full border rounded-lg px-3 py-2 text-sm"
                    placeholder="Asia/Ho_Chi_Minh"
                  />
                </div>
              </div>

              <div className="flex flex-wrap gap-2 mt-3">
                {weekdayOptions.map((d) => {
                  const checked = securityForm.allowed_weekdays.includes(d.value);
                  return (
                    <label
                      key={d.value}
                      className={`px-3 py-1.5 rounded-lg border text-sm font-medium cursor-pointer select-none ${checked ? 'bg-blue-50 text-blue-700 border-blue-300' : 'bg-white text-gray-600 border-gray-200 hover:bg-gray-50'}`}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => {
                          setSecurityForm((f) => {
                            const next = e.target.checked
                              ? [...f.allowed_weekdays, d.value]
                              : f.allowed_weekdays.filter((v) => v !== d.value);
                            return { ...f, allowed_weekdays: Array.from(new Set(next)).sort((a, b) => a - b) };
                          });
                        }}
                        className="hidden"
                      />
                      {d.label}
                    </label>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2 mt-5 pt-4 border-t">
            <button
              onClick={saveSecuritySettings}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-semibold disabled:opacity-50"
            >
              <Save className="w-4 h-4" />
              {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
            </button>
            <button
              onClick={resetLockedDevice}
              disabled={saving}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 text-sm font-semibold disabled:opacity-50"
            >
              <RotateCcw className="w-4 h-4" />
              Đặt lại thiết bị khóa
            </button>
            <button
              onClick={() => { setShowSecurityEditor(false); setSecurityMember(null); }}
              className="flex items-center gap-1.5 px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-semibold"
            >
              Đóng
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
