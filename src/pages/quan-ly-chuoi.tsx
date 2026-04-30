// Quản lý chuỗi cửa hàng - Chi nhánh & Nhân viên
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import {
  Building2, Plus, Edit2, Trash2, Users, MapPin, Phone,
  CheckCircle, XCircle, Save, X, Star, UserPlus,
  Shield, Laptop, Clock3, Wifi, RotateCcw
} from 'lucide-react';

interface Branch {
  id: string;
  tenant_id: string;
  ten_chi_nhanh: string;
  dia_chi: string | null;
  dien_thoai: string | null;
  is_main: boolean;
  status: string;
  created_at: string;
}

interface StaffAssignment {
  id: string;
  user_id: string;
  branch_id: string;
  is_primary: boolean;
  from_date: string;
  to_date: string | null;
  ghi_chu: string | null;
  branch?: { id: string; ten_chi_nhanh: string };
  profile?: { id: string; full_name: string; phone: string };
  membership?: { role: string };
}

interface Member {
  id: string;
  user_id: string;
  role: string;
  active: boolean;
  email?: string;
  full_name?: string;
  login_security?: LoginSecurityPolicy;
  locked_device_id?: string | null;
  locked_device_label?: string | null;
  locked_device_at?: string | null;
}

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

interface QuanLyChuoiSectionProps {
  embedded?: boolean;
  initialTab?: 'branches' | 'staff';
}

const ROLE_LABELS: Record<string, string> = {
  owner: 'Chủ phòng khám',
  admin: 'Quản trị viên',
  doctor: 'Bác sĩ',
  staff: 'Nhân viên',
};

const getRoleLabel = (role?: string) => ROLE_LABELS[role || ''] || role || 'Nhân viên';

export function QuanLyChuoiSection({ embedded = false, initialTab = 'branches' }: QuanLyChuoiSectionProps) {
  const { currentTenantId, currentTenant, currentRole, tenancyLoading } = useAuth();
  const [activeTab, setActiveTab] = useState<'branches' | 'staff'>(initialTab);

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

  // Branch state
  const [branches, setBranches] = useState<Branch[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddBranch, setShowAddBranch] = useState(false);
  const [editBranch, setEditBranch] = useState<Branch | null>(null);
  const [branchForm, setBranchForm] = useState({ ten_chi_nhanh: '', dia_chi: '', dien_thoai: '' });
  const [saving, setSaving] = useState(false);

  // Staff state
  const [staffAssignments, setStaffAssignments] = useState<StaffAssignment[]>([]);
  const [members, setMembers] = useState<Member[]>([]);
  const [showAssignStaff, setShowAssignStaff] = useState(false);
  const [staffForm, setStaffForm] = useState({ user_id: '', branch_id: '' });
  const [loadingStaff, setLoadingStaff] = useState(false);
  const [draggingAssignment, setDraggingAssignment] = useState<{ kind: 'assigned' | 'unassigned'; id: string; userId: string } | null>(null);
  const [dragOverBranch, setDragOverBranch] = useState<string | null>(null);

  // Load branches
  const loadBranches = useCallback(async () => {
    if (!currentTenantId) return;
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/branches');
      if (res.ok) {
        setBranches(await res.json());
      } else {
        // Nếu chưa có branch, init
        const initRes = await fetchWithAuth('/api/branches/init', { method: 'POST' });
        if (initRes.ok) {
          const { branches: newBranches } = await initRes.json();
          setBranches(newBranches);
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  }, [currentTenantId]);

  // Load staff assignments
  const loadStaff = useCallback(async () => {
    if (!currentTenantId) return;
    setLoadingStaff(true);
    try {
      const [staffRes, membersRes] = await Promise.all([
        fetchWithAuth('/api/branches/staff?active_only=1'),
        fetchWithAuth('/api/tenants/members'),
      ]);
      if (staffRes.ok) setStaffAssignments(await staffRes.json());
      if (membersRes.ok) {
        const membersData = await membersRes.json();
        setMembers(Array.isArray(membersData) ? membersData : membersData.data || membersData.members || []);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingStaff(false);
    }
  }, [currentTenantId]);

  useEffect(() => {
    if (!tenancyLoading && currentTenantId) {
      loadBranches();
    }
  }, [tenancyLoading, currentTenantId, loadBranches]);

  useEffect(() => {
    if (activeTab === 'staff' && currentTenantId) loadStaff();
  }, [activeTab, currentTenantId, loadStaff]);

  useEffect(() => {
    setActiveTab(initialTab);
  }, [initialTab]);

  // Branch CRUD
  const handleSaveBranch = async () => {
    if (!branchForm.ten_chi_nhanh.trim()) {
      toast.error('Tên chi nhánh là bắt buộc');
      return;
    }
    setSaving(true);
    try {
      const method = editBranch ? 'PUT' : 'POST';
      const body = editBranch ? { id: editBranch.id, ...branchForm } : branchForm;
      const res = await fetchWithAuth('/api/branches', {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      if (res.ok) {
        toast.success(editBranch ? 'Đã cập nhật chi nhánh' : 'Đã tạo chi nhánh mới');
        setShowAddBranch(false);
        setEditBranch(null);
        setBranchForm({ ten_chi_nhanh: '', dia_chi: '', dien_thoai: '' });
        loadBranches();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch (err) {
      toast.error('Lỗi kết nối');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteBranch = async (branch: Branch) => {
    if (branch.is_main) {
      toast.error('Không thể xóa chi nhánh chính');
      return;
    }
    if (!confirm(`Bạn chắc chắn muốn xóa chi nhánh "${branch.ten_chi_nhanh}"?`)) return;
    try {
      const res = await fetchWithAuth(`/api/branches?id=${branch.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Đã xóa chi nhánh');
        loadBranches();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
  };

  const handleToggleBranchStatus = async (branch: Branch) => {
    const newStatus = branch.status === 'active' ? 'inactive' : 'active';
    try {
      const res = await fetchWithAuth('/api/branches', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: branch.id, status: newStatus }),
      });
      if (res.ok) {
        toast.success(newStatus === 'active' ? 'Đã mở lại chi nhánh' : 'Đã tạm ngừng chi nhánh');
        loadBranches();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
  };

  // Staff assignment
  const handleAssignStaff = async () => {
    if (!staffForm.user_id || !staffForm.branch_id) {
      toast.error('Vui lòng chọn nhân viên và chi nhánh');
      return;
    }
    setSaving(true);
    try {
      const res = await fetchWithAuth('/api/branches/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(staffForm),
      });
      if (res.ok) {
        toast.success('Đã phân công nhân viên');
        setShowAssignStaff(false);
        setStaffForm({ user_id: '', branch_id: '' });
        loadStaff();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch {
      toast.error('Lỗi kết nối');
    } finally {
      setSaving(false);
    }
  };

  const handleRemoveStaffAssignment = async (assignment: StaffAssignment) => {
    if (!confirm('Bạn chắc chắn muốn xóa phân công này?')) return;
    try {
      const res = await fetchWithAuth(`/api/branches/staff?id=${assignment.id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Đã xóa phân công');
        loadStaff();
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
  };

  const moveAssignmentToBranch = async (assignmentId: string, branchId: string) => {
    try {
      const res = await fetchWithAuth('/api/branches/staff', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: assignmentId, branch_id: branchId }),
      });
      if (res.ok) {
        toast.success('Đã chuyển nhân viên');
        loadStaff();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || 'Không thể chuyển nhân viên');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
  };

  const assignUnassignedToBranch = async (userId: string, branchId: string) => {
    try {
      const res = await fetchWithAuth('/api/branches/staff', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: userId, branch_id: branchId }),
      });
      if (res.ok) {
        toast.success('Đã phân công nhân viên');
        loadStaff();
      } else {
        const err = await res.json().catch(() => null);
        toast.error(err?.error || 'Không thể phân công');
      }
    } catch {
      toast.error('Lỗi kết nối');
    }
  };

  const handleDropOnBranch = async (branchId: string) => {
    if (!draggingAssignment) return;
    const drag = draggingAssignment;
    setDraggingAssignment(null);
    setDragOverBranch(null);

    if (drag.kind === 'assigned') {
      const sa = staffAssignments.find((s) => s.id === drag.id);
      if (sa && sa.branch_id === branchId) return;
      await moveAssignmentToBranch(drag.id, branchId);
    } else {
      await assignUnassignedToBranch(drag.userId, branchId);
    }
  };

  const startEditBranch = (branch: Branch) => {
    setEditBranch(branch);
    setBranchForm({
      ten_chi_nhanh: branch.ten_chi_nhanh,
      dia_chi: branch.dia_chi || '',
      dien_thoai: branch.dien_thoai || '',
    });
    setShowAddBranch(true);
  };

  const cancelForm = () => {
    setShowAddBranch(false);
    setEditBranch(null);
    setBranchForm({ ten_chi_nhanh: '', dia_chi: '', dien_thoai: '' });
  };

  const weekdayOptions: { value: number; label: string }[] = [];

  if (tenancyLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600" />
      </div>
    );
  }

  return (
    <div className={embedded ? 'space-y-6' : 'max-w-6xl mx-auto px-4 py-6'}>
      {/* Header */}
      {!embedded && (
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Building2 className="w-7 h-7 text-blue-600" />
            <div>
              <h1 className="text-xl font-bold text-gray-900">Quản lý chuỗi cửa hàng</h1>
              <p className="text-sm text-gray-500">{currentTenant?.name}</p>
            </div>
          </div>
        </div>
      )}

          {/* Branch Tab */}
          {activeTab === 'branches' && (
            <div>
              {/* Add button */}
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => { cancelForm(); setShowAddBranch(true); }}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <Plus className="w-4 h-4" />
                  Thêm chi nhánh
                </button>
              </div>

              {/* Add/Edit Form */}
              {showAddBranch && (
                <div className="bg-white border border-blue-200 rounded-xl p-5 mb-4 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-4">
                    {editBranch ? 'Sửa chi nhánh' : 'Thêm chi nhánh mới'}
                  </h3>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Tên chi nhánh *</label>
                      <input
                        type="text"
                        value={branchForm.ten_chi_nhanh}
                        onChange={e => setBranchForm(f => ({ ...f, ten_chi_nhanh: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                        placeholder="VD: Chi nhánh Quận 1"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Địa chỉ</label>
                      <input
                        type="text"
                        value={branchForm.dia_chi}
                        onChange={e => setBranchForm(f => ({ ...f, dia_chi: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                        placeholder="Số nhà, đường, quận..."
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Điện thoại</label>
                      <input
                        type="text"
                        value={branchForm.dien_thoai}
                        onChange={e => setBranchForm(f => ({ ...f, dien_thoai: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                        placeholder="0901234567"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleSaveBranch}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Đang lưu...' : 'Lưu'}
                    </button>
                    <button onClick={cancelForm} className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm">
                      <X className="w-4 h-4 inline mr-1" />Hủy
                    </button>
                  </div>
                </div>
              )}

              {/* Branch List */}
              {loading ? (
                <div className="text-center py-10 text-gray-400">Đang tải...</div>
              ) : branches.length === 0 ? (
                <div className="text-center py-10 text-gray-400">
                  <Building2 className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Chưa có chi nhánh nào</p>
                </div>
              ) : (
                <div className="grid gap-4">
                  {branches.map(branch => (
                    <div
                      key={branch.id}
                      className={`bg-white rounded-xl border p-5 shadow-sm ${
                        branch.status === 'inactive' ? 'opacity-60' : ''
                      } ${branch.is_main ? 'border-blue-300 bg-blue-50/30' : 'border-gray-200'}`}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex items-start gap-3">
                          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                            branch.is_main ? 'bg-blue-100 text-blue-600' : 'bg-gray-100 text-gray-600'
                          }`}>
                            <Building2 className="w-5 h-5" />
                          </div>
                          <div>
                            <div className="flex items-center gap-2">
                              <h3 className="font-semibold text-gray-900">{branch.ten_chi_nhanh}</h3>
                              {branch.is_main && (
                                <span className="text-[10px] bg-blue-100 text-blue-700 px-2 py-0.5 rounded-full font-bold uppercase">
                                  Chính
                                </span>
                              )}
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
                                branch.status === 'active'
                                  ? 'bg-green-100 text-green-700'
                                  : 'bg-red-100 text-red-700'
                              }`}>
                                {branch.status === 'active' ? 'Hoạt động' : 'Ngừng'}
                              </span>
                            </div>
                            {branch.dia_chi && (
                              <p className="text-sm text-gray-500 flex items-center gap-1 mt-1">
                                <MapPin className="w-3.5 h-3.5" />{branch.dia_chi}
                              </p>
                            )}
                            {branch.dien_thoai && (
                              <p className="text-sm text-gray-500 flex items-center gap-1">
                                <Phone className="w-3.5 h-3.5" />{branch.dien_thoai}
                              </p>
                            )}
                          </div>
                        </div>

                        <div className="flex items-center gap-1">
                          <button
                            onClick={() => startEditBranch(branch)}
                            className="p-2 text-gray-400 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition-colors"
                            title="Sửa"
                          >
                            <Edit2 className="w-4 h-4" />
                          </button>
                          {!branch.is_main && (
                            <>
                              <button
                                onClick={() => handleToggleBranchStatus(branch)}
                                className="p-2 text-gray-400 hover:text-amber-600 hover:bg-amber-50 rounded-lg transition-colors"
                                title={branch.status === 'active' ? 'Tạm ngừng' : 'Mở lại'}
                              >
                                {branch.status === 'active' ? <XCircle className="w-4 h-4" /> : <CheckCircle className="w-4 h-4" />}
                              </button>
                              <button
                                onClick={() => handleDeleteBranch(branch)}
                                className="p-2 text-gray-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                title="Xóa"
                              >
                                <Trash2 className="w-4 h-4" />
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Staff Tab */}
          {activeTab === 'staff' && (
            <div>
              <div className="flex justify-end mb-4">
                <button
                  onClick={() => setShowAssignStaff(true)}
                  className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                >
                  <UserPlus className="w-4 h-4" />
                  Phân công nhân viên
                </button>
              </div>

              {/* Assign form */}
              {showAssignStaff && (
                <div className="bg-white border border-blue-200 rounded-xl p-5 mb-4 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-4">Phân công nhân viên vào chi nhánh</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Nhân viên *</label>
                      <select
                        value={staffForm.user_id}
                        onChange={e => setStaffForm(f => ({ ...f, user_id: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                      >
                        <option value="">-- Chọn nhân viên --</option>
                        {members.filter(m => {
                          if (!m.active) return false;
                          // Chỉ hiện nhân viên chưa được phân công
                          const assigned = staffAssignments.find(s => s.user_id === m.user_id);
                          return !assigned;
                        }).map(m => (
                          <option key={m.user_id} value={m.user_id}>
                            {m.full_name || m.email || m.user_id} ({getRoleLabel(m.role)})
                          </option>
                        ))}
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Chi nhánh *</label>
                      <select
                        value={staffForm.branch_id}
                        onChange={e => setStaffForm(f => ({ ...f, branch_id: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                      >
                        <option value="">-- Chọn chi nhánh --</option>
                        {branches.filter(b => b.status === 'active').map(b => (
                          <option key={b.id} value={b.id}>{b.ten_chi_nhanh}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleAssignStaff}
                      disabled={saving}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {saving ? 'Đang lưu...' : 'Phân công'}
                    </button>
                    <button
                      onClick={() => { setShowAssignStaff(false); setStaffForm({ user_id: '', branch_id: '' }); }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {/* Staff by branch */}
              {loadingStaff ? (
                <div className="text-center py-10 text-gray-400">Đang tải...</div>
              ) : (
                <div className="space-y-6">
                  {/* Unassigned members warning */}
                  {(() => {
                    const assignedUserIds = new Set(staffAssignments.map(s => s.user_id));
                    const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, doctor: 2, staff: 3 };
                    const unassigned = members
                      .filter(m => m.active && !assignedUserIds.has(m.user_id))
                      .sort((a, b) => (ROLE_RANK[a.role] ?? 99) - (ROLE_RANK[b.role] ?? 99));
                    if (unassigned.length === 0) return null;
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-semibold text-amber-800">
                            {unassigned.length} nhân viên chưa được phân công chi nhánh
                          </span>
                          <span className="ml-auto text-[11px] text-amber-700/70">Kéo thẻ vào chi nhánh để phân công</span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {unassigned.map(m => (
                            <span
                              key={m.user_id}
                              draggable
                              onDragStart={() => setDraggingAssignment({ kind: 'unassigned', id: m.user_id, userId: m.user_id })}
                              onDragEnd={() => { setDraggingAssignment(null); setDragOverBranch(null); }}
                              className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-amber-200 rounded-full text-xs text-amber-800 cursor-grab active:cursor-grabbing select-none"
                              title="Kéo vào chi nhánh để phân công"
                            >
                              {m.full_name || m.email || m.user_id}
                              <span className="text-amber-400">({getRoleLabel(m.role)})</span>
                            </span>
                          ))}
                        </div>
                        <button
                          onClick={() => setShowAssignStaff(true)}
                          className="mt-2 text-xs text-amber-700 hover:text-amber-900 underline"
                        >
                          Phân công ngay →
                        </button>
                      </div>
                    );
                  })()}

                  {branches
                    .filter(b => b.status === 'active')
                    .slice()
                    .sort((a, b) => Number(b.is_main) - Number(a.is_main))
                    .map(branch => {
                    const ROLE_RANK: Record<string, number> = { owner: 0, admin: 1, doctor: 2, staff: 3 };
                    const branchStaff = staffAssignments
                      .filter(s => s.branch_id === branch.id)
                      .slice()
                      .sort((a, b) => (ROLE_RANK[a.membership?.role || ''] ?? 99) - (ROLE_RANK[b.membership?.role || ''] ?? 99));
                    const isOver = dragOverBranch === branch.id;
                    return (
                      <div
                        key={branch.id}
                        onDragOver={(e) => { if (draggingAssignment) { e.preventDefault(); setDragOverBranch(branch.id); } }}
                        onDragLeave={() => { if (dragOverBranch === branch.id) setDragOverBranch(null); }}
                        onDrop={(e) => { e.preventDefault(); handleDropOnBranch(branch.id); }}
                        className={`bg-white rounded-xl border overflow-hidden transition-colors ${isOver ? 'border-blue-400 ring-2 ring-blue-200' : 'border-gray-200'}`}
                      >
                        <div className="px-5 py-3 bg-gray-50 border-b flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-600" />
                          <span className="font-semibold text-gray-800">{branch.ten_chi_nhanh}</span>
                          {branch.is_main && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          )}
                          <span className="text-xs text-gray-400 ml-auto">{branchStaff.length} nhân viên</span>
                        </div>
                        {branchStaff.length === 0 ? (
                          <div className={`px-5 py-6 text-sm text-center ${isOver ? 'text-blue-600 bg-blue-50' : 'text-gray-400'}`}>
                            {isOver ? 'Thả vào đây để phân công' : 'Chưa có nhân viên nào — kéo thẻ vào đây'}
                          </div>
                        ) : (
                          <div className="divide-y">
                            {branchStaff.map(sa => {
                              const isOwner = sa.membership?.role === 'owner';
                              return (
                                <div
                                  key={sa.id}
                                  draggable={!isOwner}
                                  onDragStart={() => { if (!isOwner) setDraggingAssignment({ kind: 'assigned', id: sa.id, userId: sa.user_id }); }}
                                  onDragEnd={() => { setDraggingAssignment(null); setDragOverBranch(null); }}
                                  className={`px-5 py-3 flex items-center justify-between ${isOwner ? '' : 'cursor-grab active:cursor-grabbing'}`}
                                  title={isOwner ? 'Chủ phòng khám không thể chuyển chi nhánh' : 'Kéo sang chi nhánh khác để chuyển'}
                                >
                                  <div className="flex items-center gap-3">
                                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold ${isOwner ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700'}`}>
                                      {(sa.profile?.full_name?.[0] || 'U').toUpperCase()}
                                    </div>
                                    <div>
                                      <p className="text-sm font-medium text-gray-800 flex items-center gap-1.5">
                                        {sa.profile?.full_name || sa.user_id}
                                        {isOwner && <Star className="w-3 h-3 text-amber-500 fill-amber-500" />}
                                      </p>
                                      <p className="text-xs text-gray-400">
                                        {getRoleLabel(sa.membership?.role)}
                                      </p>
                                    </div>
                                  </div>
                                  {!isOwner && (
                                    <button
                                      onClick={() => handleRemoveStaffAssignment(sa)}
                                      className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                      title="Xóa phân công"
                                    >
                                      <Trash2 className="w-4 h-4" />
                                    </button>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}
    </div>
  );
}

export default function QuanLyChuoi() {
  return (
    <ProtectedRoute>
      <FeatureGate feature="multi_branch" permission="manage_clinic">
        <QuanLyChuoiSection />
      </FeatureGate>
    </ProtectedRoute>
  );
}
