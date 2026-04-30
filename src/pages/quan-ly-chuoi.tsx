// Quản lý chuỗi cửa hàng - Chi nhánh & Nhân viên
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import toast from 'react-hot-toast';
import {
  Building2, Plus, Edit2, Trash2, Users, MapPin, Phone,
  CheckCircle, XCircle, ArrowRightLeft, Save, X, Star, UserPlus,
  Shield, Laptop, Clock3, Wifi, RotateCcw, Package, Tag,
  AlertTriangle, RefreshCw
} from 'lucide-react';

interface InventoryAlert {
  loai: string;
  ten: string;
  chi_nhanh: string;
  branch_id: string;
  ton_kho: number;
  muc_min: number;
  trang_thai: string;
}

interface InvRow {
  ten: string;
  donvi?: string;
  per_branch: Record<string, number>;
  tong: number;
  co_canh_bao: boolean;
  muc_min: number;
}

interface PriceOverride {
  id: number;
  branch_id: string;
  item_type: string;
  item_id: number;
  ten_san_pham: string;
  gia_ban_override: number | null;
  gia_von_override: number | null;
  reason: string | null;
  created_at: string;
}

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
  initialTab?: 'branches' | 'staff' | 'inventory' | 'prices';
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
  const [activeTab, setActiveTab] = useState<'branches' | 'staff' | 'inventory' | 'prices'>(initialTab);

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
  const [showSecurityEditor, setShowSecurityEditor] = useState(false);
  const [securityMember, setSecurityMember] = useState<Member | null>(null);
  const [securityForm, setSecurityForm] = useState<LoginSecurityPolicy>(defaultLoginPolicy);
  const [allowedIpsText, setAllowedIpsText] = useState('');

  // Inventory overview state
  const [invBranches, setInvBranches] = useState<any[]>([]);
  const [invThuoc, setInvThuoc] = useState<InvRow[]>([]);
  const [invGong, setInvGong] = useState<InvRow[]>([]);
  const [invAlerts, setInvAlerts] = useState<InventoryAlert[]>([]);
  const [loadingInv, setLoadingInv] = useState(false);
  const [invFilter, setInvFilter] = useState<'thuoc' | 'gong' | 'alerts'>('alerts');

  // Price overrides state
  const [priceOverrides, setPriceOverrides] = useState<PriceOverride[]>([]);
  const [loadingPrices, setLoadingPrices] = useState(false);
  const [selectedBranchForPrice, setSelectedBranchForPrice] = useState('');
  const [showAddOverride, setShowAddOverride] = useState(false);
  const [overrideForm, setOverrideForm] = useState({ item_type: 'thuoc', item_id: '', gia_ban_override: '', gia_von_override: '', reason: '' });
  const [savingOverride, setSavingOverride] = useState(false);

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

  // Load inventory overview
  const loadInventory = useCallback(async () => {
    if (!currentTenantId) return;
    setLoadingInv(true);
    try {
      const res = await fetchWithAuth('/api/branches/inventory-overview');
      if (res.ok) {
        const data = await res.json();
        setInvBranches(data.branches || []);
        setInvThuoc(data.thuoc || []);
        setInvGong(data.gong || []);
        setInvAlerts(data.alerts || []);
      }
    } catch {}
    setLoadingInv(false);
  }, [currentTenantId]);

  useEffect(() => {
    if (activeTab === 'inventory' && currentTenantId) loadInventory();
  }, [activeTab, currentTenantId, loadInventory]);

  // Load price overrides
  const loadPriceOverrides = useCallback(async (branchId: string) => {
    if (!branchId) return;
    setLoadingPrices(true);
    try {
      const res = await fetchWithAuth(`/api/branches/price-overrides?branch_id=${branchId}`);
      if (res.ok) setPriceOverrides(await res.json());
    } catch {}
    setLoadingPrices(false);
  }, []);

  useEffect(() => {
    if (activeTab === 'prices' && currentTenantId && branches.length > 0) {
      const firstBranchId = selectedBranchForPrice || branches[0]?.id;
      if (firstBranchId) {
        setSelectedBranchForPrice(firstBranchId);
        loadPriceOverrides(firstBranchId);
      }
    }
  }, [activeTab, currentTenantId, branches]);

  const handleDeleteOverride = async (id: number) => {
    if (!confirm('Xóa giá riêng này?')) return;
    try {
      const res = await fetchWithAuth(`/api/branches/price-overrides?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        toast.success('Đã xóa giá riêng');
        loadPriceOverrides(selectedBranchForPrice);
      }
    } catch {}
  };

  const handleSaveOverride = async () => {
    if (!overrideForm.item_id) { toast.error('Nhập ID sản phẩm'); return; }
    if (!overrideForm.gia_ban_override && !overrideForm.gia_von_override) {
      toast.error('Nhập ít nhất giá bán hoặc giá vốn');
      return;
    }
    setSavingOverride(true);
    try {
      const res = await fetchWithAuth('/api/branches/price-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          branch_id: selectedBranchForPrice,
          item_type: overrideForm.item_type,
          item_id: Number(overrideForm.item_id),
          gia_ban_override: overrideForm.gia_ban_override ? Number(overrideForm.gia_ban_override) : null,
          gia_von_override: overrideForm.gia_von_override ? Number(overrideForm.gia_von_override) : null,
          reason: overrideForm.reason,
        }),
      });
      if (res.ok) {
        toast.success('Đã lưu giá riêng');
        setShowAddOverride(false);
        setOverrideForm({ item_type: 'thuoc', item_id: '', gia_ban_override: '', gia_von_override: '', reason: '' });
        loadPriceOverrides(selectedBranchForPrice);
      } else {
        const err = await res.json();
        toast.error(err.error || 'Lỗi');
      }
    } catch {}
    setSavingOverride(false);
  };

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

  const normalizePolicy = (raw: any): LoginSecurityPolicy => ({
    enabled: raw?.enabled === true,
    single_device_only: raw?.single_device_only === true,
    enforce_store_network: raw?.enforce_store_network === true,
    allowed_ips: Array.isArray(raw?.allowed_ips) ? raw.allowed_ips.map((v: any) => String(v || '').trim()).filter(Boolean) : [],
    enforce_working_hours: raw?.enforce_working_hours === true,
    allowed_weekdays: Array.isArray(raw?.allowed_weekdays)
      ? raw.allowed_weekdays.map((n: any) => Number(n)).filter((n: number) => Number.isInteger(n) && n >= 0 && n <= 6)
      : defaultLoginPolicy.allowed_weekdays,
    start_time: typeof raw?.start_time === 'string' ? raw.start_time : defaultLoginPolicy.start_time,
    end_time: typeof raw?.end_time === 'string' ? raw.end_time : defaultLoginPolicy.end_time,
    timezone: typeof raw?.timezone === 'string' ? raw.timezone : defaultLoginPolicy.timezone,
  });

  const openSecurityForMember = (member: Member) => {
    const policy = normalizePolicy(member.login_security || {});
    setSecurityMember(member);
    setSecurityForm(policy);
    setAllowedIpsText(policy.allowed_ips.join('\n'));
    setShowSecurityEditor(true);
  };

  const saveSecuritySettings = async () => {
    if (!securityMember) return;

    const allowedIps = allowedIpsText
      .split(/[,\n]/)
      .map((v) => v.trim())
      .filter(Boolean);

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
        body: JSON.stringify({
          membershipId: securityMember.id,
          login_security: payload,
          reset_device_lock: false,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || 'Lỗi lưu cài đặt bảo mật đăng nhập');
        return;
      }

      toast.success('Đã lưu cài đặt bảo mật đăng nhập');
      setShowSecurityEditor(false);
      setSecurityMember(null);
      await loadStaff();
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
        body: JSON.stringify({
          membershipId: securityMember.id,
          login_security: securityForm,
          reset_device_lock: true,
        }),
      });

      if (!res.ok) {
        const err = await res.json().catch(() => null);
        toast.error(err?.message || 'Không thể đặt lại khóa thiết bị');
        return;
      }

      toast.success('Đã đặt lại khóa thiết bị');
      await loadStaff();
    } catch {
      toast.error('Lỗi kết nối khi đặt lại khóa thiết bị');
    } finally {
      setSaving(false);
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

  const weekdayOptions = [
    { value: 0, label: 'CN' },
    { value: 1, label: 'T2' },
    { value: 2, label: 'T3' },
    { value: 3, label: 'T4' },
    { value: 4, label: 'T5' },
    { value: 5, label: 'T6' },
    { value: 6, label: 'T7' },
  ];

  const securityMembers = members
    .filter((m) => m.active && m.role !== 'owner')
    .map((m) => ({
      ...m,
      login_security: normalizePolicy(m.login_security || {}),
    }));

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

          {/* Tabs */}
          <div className="flex gap-1 mb-6 bg-gray-100 rounded-lg p-1 flex-wrap">
            <button
              onClick={() => setActiveTab('branches')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'branches' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Building2 className="w-4 h-4 inline mr-1.5" />
              Chi nhánh ({branches.length})
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
            <button
              onClick={() => setActiveTab('inventory')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'inventory' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Package className="w-4 h-4 inline mr-1.5" />
              Tồn kho toàn chuỗi
              {invAlerts.length > 0 && <span className="ml-1 text-[10px] bg-red-500 text-white px-1.5 py-0.5 rounded-full">{invAlerts.length}</span>}
            </button>
            <button
              onClick={() => setActiveTab('prices')}
              className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${
                activeTab === 'prices' ? 'bg-white text-blue-700 shadow-sm' : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              <Tag className="w-4 h-4 inline mr-1.5" />
              Giá chi nhánh
            </button>
          </div>

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

              <div className="bg-white rounded-xl border border-gray-200 shadow-sm mb-4 overflow-hidden">
                <div className="px-5 py-3 border-b bg-gray-50 flex items-center gap-2">
                  <Shield className="w-4 h-4 text-blue-600" />
                  <h3 className="text-sm font-semibold text-gray-800">Bảo mật đăng nhập nhân viên</h3>
                  <span className="ml-auto text-xs text-gray-500">{securityMembers.length} tài khoản</span>
                </div>

                {securityMembers.length === 0 ? (
                  <div className="px-5 py-4 text-sm text-gray-400">Chưa có nhân viên để cài đặt.</div>
                ) : (
                  <div className="divide-y">
                    {securityMembers.map((member) => {
                      const p = member.login_security as LoginSecurityPolicy;
                      return (
                        <div key={member.id} className="px-5 py-3 flex items-start justify-between gap-3">
                          <div className="min-w-0">
                            <p className="text-sm font-medium text-gray-900 truncate">
                              {member.full_name || member.email || member.user_id}
                            </p>
                            <p className="text-xs text-gray-500">{member.email || member.user_id} ({getRoleLabel(member.role)})</p>
                            <div className="flex flex-wrap gap-1.5 mt-1.5">
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-semibold ${p.enabled ? 'bg-blue-100 text-blue-700' : 'bg-gray-100 text-gray-600'}`}>
                                {p.enabled ? 'Bảo mật: Bật' : 'Bảo mật: Tắt'}
                              </span>
                              {p.single_device_only && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-indigo-100 text-indigo-700">
                                  1 thiết bị
                                </span>
                              )}
                              {p.enforce_store_network && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-emerald-100 text-emerald-700">
                                  Giới hạn mạng cửa hàng
                                </span>
                              )}
                              {p.enforce_working_hours && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-amber-100 text-amber-700">
                                  Khung giờ {p.start_time}-{p.end_time}
                                </span>
                              )}
                              {member.locked_device_id && (
                                <span className="text-[10px] px-2 py-0.5 rounded-full font-semibold bg-purple-100 text-purple-700">
                                  Đã khóa thiết bị
                                </span>
                              )}
                            </div>
                          </div>
                          <button
                            onClick={() => openSecurityForMember(member)}
                            className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-blue-200 text-blue-700 hover:bg-blue-50"
                          >
                            Cài đặt
                          </button>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>

              {showSecurityEditor && securityMember && (
                <div className="bg-white border border-blue-200 rounded-xl p-5 mb-4 shadow-sm">
                  <div className="flex items-start justify-between gap-3 mb-4">
                    <div>
                      <h3 className="font-semibold text-gray-900">Cài đặt đăng nhập: {securityMember.full_name || securityMember.email || securityMember.user_id}</h3>
                      <p className="text-xs text-gray-500 mt-0.5">Thiết lập giới hạn thiết bị, mạng cửa hàng và khung giờ đăng nhập cho tài khoản này.</p>
                    </div>
                    <button
                      onClick={() => { setShowSecurityEditor(false); setSecurityMember(null); }}
                      className="text-gray-500 hover:text-gray-700"
                      title="Đóng"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>

                  <div className="space-y-4">
                    <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                      <input
                        type="checkbox"
                        checked={securityForm.enabled}
                        onChange={(e) => setSecurityForm((f) => ({ ...f, enabled: e.target.checked }))}
                      />
                      Bật bảo mật đăng nhập cho tài khoản này
                    </label>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <div className="border rounded-lg p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                          <input
                            type="checkbox"
                            checked={securityForm.single_device_only}
                            onChange={(e) => setSecurityForm((f) => ({ ...f, single_device_only: e.target.checked }))}
                          />
                          <Laptop className="w-4 h-4 text-indigo-600" />
                          Chỉ 1 thiết bị duy nhất
                        </label>
                        <p className="text-xs text-gray-500 mt-1">Lần đăng nhập hợp lệ đầu tiên sẽ tự khóa thiết bị. Đăng nhập ở máy khác sẽ bị chặn.</p>
                        <p className="text-xs text-gray-600 mt-2">
                          Thiết bị hiện tại: {securityMember.locked_device_label || securityMember.locked_device_id || 'Chưa khóa'}
                        </p>
                      </div>

                      <div className="border rounded-lg p-3">
                        <label className="flex items-center gap-2 text-sm font-medium text-gray-800">
                          <input
                            type="checkbox"
                            checked={securityForm.enforce_store_network}
                            onChange={(e) => setSecurityForm((f) => ({ ...f, enforce_store_network: e.target.checked }))}
                          />
                          <Wifi className="w-4 h-4 text-emerald-600" />
                          Chỉ cho phép mạng cửa hàng
                        </label>
                        <p className="text-xs text-gray-500 mt-1">Nhập danh sách IP/CIDR, mỗi dòng một giá trị. Ví dụ: 113.161.10.25 hoặc 192.168.1.0/24.</p>
                        <textarea
                          value={allowedIpsText}
                          onChange={(e) => setAllowedIpsText(e.target.value)}
                          rows={4}
                          className="mt-2 w-full border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                          placeholder="113.161.10.25\n192.168.1.0/24"
                        />
                      </div>
                    </div>

                    <div className="border rounded-lg p-3">
                      <label className="flex items-center gap-2 text-sm font-medium text-gray-800 mb-2">
                        <input
                          type="checkbox"
                          checked={securityForm.enforce_working_hours}
                          onChange={(e) => setSecurityForm((f) => ({ ...f, enforce_working_hours: e.target.checked }))}
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
                            <label key={d.value} className={`px-2 py-1 rounded-md border text-xs font-medium cursor-pointer ${checked ? 'bg-blue-50 text-blue-700 border-blue-200' : 'bg-white text-gray-600 border-gray-200'}`}>
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
                                className="mr-1"
                              />
                              {d.label}
                            </label>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2 mt-4">
                    <button
                      onClick={saveSecuritySettings}
                      disabled={saving}
                      className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium disabled:opacity-50"
                    >
                      <Save className="w-4 h-4 inline mr-1.5" />
                      {saving ? 'Đang lưu...' : 'Lưu cài đặt'}
                    </button>
                    <button
                      onClick={resetLockedDevice}
                      disabled={saving}
                      className="px-4 py-2 bg-white border border-amber-200 text-amber-700 rounded-lg hover:bg-amber-50 text-sm font-medium disabled:opacity-50"
                    >
                      <RotateCcw className="w-4 h-4 inline mr-1.5" />
                      Đặt lại thiết bị khóa
                    </button>
                    <button
                      onClick={() => { setShowSecurityEditor(false); setSecurityMember(null); }}
                      className="px-4 py-2 bg-white border border-gray-200 text-gray-700 rounded-lg hover:bg-gray-50 text-sm font-medium"
                    >
                      Đóng
                    </button>
                  </div>
                </div>
              )}

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
                    const unassigned = members.filter(m => m.active && !assignedUserIds.has(m.user_id));
                    if (unassigned.length === 0) return null;
                    return (
                      <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <Users className="w-4 h-4 text-amber-600" />
                          <span className="text-sm font-semibold text-amber-800">
                            {unassigned.length} nhân viên chưa được phân công chi nhánh
                          </span>
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {unassigned.map(m => (
                            <span key={m.user_id} className="inline-flex items-center gap-1 px-3 py-1 bg-white border border-amber-200 rounded-full text-xs text-amber-800">
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

                  {branches.filter(b => b.status === 'active').map(branch => {
                    const branchStaff = staffAssignments.filter(s => s.branch_id === branch.id);
                    return (
                      <div key={branch.id} className="bg-white rounded-xl border border-gray-200 overflow-hidden">
                        <div className="px-5 py-3 bg-gray-50 border-b flex items-center gap-2">
                          <Building2 className="w-4 h-4 text-blue-600" />
                          <span className="font-semibold text-gray-800">{branch.ten_chi_nhanh}</span>
                          {branch.is_main && (
                            <Star className="w-3.5 h-3.5 text-amber-500 fill-amber-500" />
                          )}
                          <span className="text-xs text-gray-400 ml-auto">{branchStaff.length} nhân viên</span>
                        </div>
                        {branchStaff.length === 0 ? (
                          <div className="px-5 py-4 text-sm text-gray-400 text-center">
                            Chưa có nhân viên nào được phân công
                          </div>
                        ) : (
                          <div className="divide-y">
                            {branchStaff.map(sa => (
                              <div key={sa.id} className="px-5 py-3 flex items-center justify-between">
                                <div className="flex items-center gap-3">
                                  <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center text-sm font-bold text-blue-700">
                                    {(sa.profile?.full_name?.[0] || 'U').toUpperCase()}
                                  </div>
                                  <div>
                                    <p className="text-sm font-medium text-gray-800">
                                      {sa.profile?.full_name || sa.user_id}
                                    </p>
                                    <p className="text-xs text-gray-400">
                                      {getRoleLabel(sa.membership?.role)}
                                    </p>
                                  </div>
                                </div>
                                <button
                                  onClick={() => handleRemoveStaffAssignment(sa)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                  title="Xóa phân công"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* Inventory Tab */}
          {activeTab === 'inventory' && (
            <div>
              <div className="flex items-center justify-between mb-4">
                <div className="flex gap-2">
                  {(['alerts', 'thuoc', 'gong'] as const).map(f => (
                    <button
                      key={f}
                      onClick={() => setInvFilter(f)}
                      className={`px-3 py-1.5 text-sm rounded-lg font-medium transition-colors ${invFilter === f ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {f === 'alerts' ? `⚠ Cảnh báo (${invAlerts.length})` : f === 'thuoc' ? 'Thuốc / Hàng trống' : 'Gọng kính'}
                    </button>
                  ))}
                </div>
                <button
                  onClick={loadInventory}
                  disabled={loadingInv}
                  className="flex items-center gap-2 px-3 py-1.5 text-sm bg-gray-100 text-gray-600 rounded-lg hover:bg-gray-200 disabled:opacity-50"
                >
                  <RefreshCw className={`w-4 h-4 ${loadingInv ? 'animate-spin' : ''}`} />
                  Làm mới
                </button>
              </div>

              {loadingInv ? (
                <div className="text-center py-10 text-gray-400">Đang tải tồn kho...</div>
              ) : (
                <>
                  {invFilter === 'alerts' && (
                    <div>
                      {invAlerts.length === 0 ? (
                        <div className="text-center py-12 text-gray-400">
                          <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
                          <p>Không có cảnh báo tồn kho</p>
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {invAlerts.map((alert, idx) => (
                            <div
                              key={idx}
                              className={`flex items-center gap-4 p-4 rounded-xl border ${alert.trang_thai === 'HET' ? 'bg-red-50 border-red-200' : 'bg-amber-50 border-amber-200'}`}
                            >
                              <AlertTriangle className={`w-5 h-5 flex-shrink-0 ${alert.trang_thai === 'HET' ? 'text-red-500' : 'text-amber-500'}`} />
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-gray-900 truncate">{alert.ten}</p>
                                <p className="text-xs text-gray-500">{alert.chi_nhanh} • {alert.loai === 'thuoc' ? 'Thuốc/Hàng trống' : 'Gọng kính'}</p>
                              </div>
                              <div className="text-right">
                                <p className={`text-sm font-bold ${alert.trang_thai === 'HET' ? 'text-red-600' : 'text-amber-700'}`}>
                                  {alert.ton_kho}
                                </p>
                                <p className="text-xs text-gray-400">/ min {alert.muc_min}</p>
                              </div>
                              <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold ${alert.trang_thai === 'HET' ? 'bg-red-200 text-red-800' : 'bg-amber-200 text-amber-800'}`}>
                                {alert.trang_thai === 'HET' ? 'HẾT' : 'SẮP HẾT'}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}

                  {(invFilter === 'thuoc' || invFilter === 'gong') && (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200 rounded-xl overflow-hidden text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left px-4 py-3 font-semibold text-gray-700 min-w-[180px]">Tên</th>
                            {invBranches.map(b => (
                              <th key={b.id} className="text-center px-3 py-3 font-semibold text-gray-700 min-w-[100px]">
                                {b.ten_chi_nhanh}
                              </th>
                            ))}
                            <th className="text-center px-3 py-3 font-semibold text-gray-700">Tổng</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {(invFilter === 'thuoc' ? invThuoc : invGong).map((row, idx) => (
                            <tr key={idx} className={row.co_canh_bao ? 'bg-amber-50' : 'hover:bg-gray-50'}>
                              <td className="px-4 py-2.5">
                                <span className="font-medium text-gray-900">{row.ten}</span>
                                {row.donvi && <span className="text-xs text-gray-400 ml-1">({row.donvi})</span>}
                                {row.co_canh_bao && <AlertTriangle className="w-3.5 h-3.5 text-amber-500 inline ml-1.5" />}
                              </td>
                              {invBranches.map(b => {
                                const qty = row.per_branch[b.id] ?? 0;
                                const isLow = row.muc_min > 0 && qty <= row.muc_min;
                                return (
                                  <td key={b.id} className={`text-center px-3 py-2.5 font-mono text-sm ${qty === 0 ? 'text-red-600 bg-red-50' : isLow ? 'text-amber-700 bg-amber-50' : 'text-gray-700'}`}>
                                    {qty}
                                  </td>
                                );
                              })}
                              <td className="text-center px-3 py-2.5 font-bold text-gray-900">{row.tong}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                      {(invFilter === 'thuoc' ? invThuoc : invGong).length === 0 && (
                        <div className="text-center py-8 text-gray-400">Không có dữ liệu</div>
                      )}
                    </div>
                  )}
                </>
              )}
            </div>
          )}

          {/* Price Overrides Tab */}
          {activeTab === 'prices' && (
            <div>
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <select
                  value={selectedBranchForPrice}
                  onChange={e => {
                    setSelectedBranchForPrice(e.target.value);
                    if (e.target.value) loadPriceOverrides(e.target.value);
                  }}
                  className="border rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-blue-200 focus:outline-none"
                >
                  <option value="">-- Chọn chi nhánh --</option>
                  {branches.map(b => (
                    <option key={b.id} value={b.id}>{b.ten_chi_nhanh}</option>
                  ))}
                </select>
                {selectedBranchForPrice && (
                  <button
                    onClick={() => setShowAddOverride(true)}
                    className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm font-medium"
                  >
                    <Plus className="w-4 h-4" />
                    Thêm giá riêng
                  </button>
                )}
              </div>

              {showAddOverride && (
                <div className="bg-white border border-blue-200 rounded-xl p-5 mb-4 shadow-sm">
                  <h3 className="font-semibold text-gray-800 mb-4">Thêm giá riêng cho chi nhánh</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Loại sản phẩm</label>
                      <select
                        value={overrideForm.item_type}
                        onChange={e => setOverrideForm(f => ({ ...f, item_type: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                      >
                        <option value="thuoc">Thuốc / Hàng trống</option>
                        <option value="gong_kinh">Gọng kính</option>
                      </select>
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">ID sản phẩm *</label>
                      <input
                        type="number"
                        value={overrideForm.item_id}
                        onChange={e => setOverrideForm(f => ({ ...f, item_id: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="ID trong hệ thống"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Giá bán (VND)</label>
                      <input
                        type="number"
                        value={overrideForm.gia_ban_override}
                        onChange={e => setOverrideForm(f => ({ ...f, gia_ban_override: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="Để trống = giữ mặc định"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Giá vốn (VND)</label>
                      <input
                        type="number"
                        value={overrideForm.gia_von_override}
                        onChange={e => setOverrideForm(f => ({ ...f, gia_von_override: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="Để trống = giữ mặc định"
                      />
                    </div>
                    <div>
                      <label className="text-sm font-medium text-gray-700 mb-1 block">Ghi chú</label>
                      <input
                        type="text"
                        value={overrideForm.reason}
                        onChange={e => setOverrideForm(f => ({ ...f, reason: e.target.value }))}
                        className="w-full border rounded-lg px-3 py-2 text-sm"
                        placeholder="Lý do điều chỉnh giá..."
                      />
                    </div>
                  </div>
                  <div className="flex gap-2 mt-4">
                    <button
                      onClick={handleSaveOverride}
                      disabled={savingOverride}
                      className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm disabled:opacity-50"
                    >
                      <Save className="w-4 h-4" />
                      {savingOverride ? 'Đang lưu...' : 'Lưu'}
                    </button>
                    <button
                      onClick={() => { setShowAddOverride(false); setOverrideForm({ item_type: 'thuoc', item_id: '', gia_ban_override: '', gia_von_override: '', reason: '' }); }}
                      className="px-4 py-2 text-gray-600 hover:bg-gray-100 rounded-lg text-sm"
                    >
                      Hủy
                    </button>
                  </div>
                </div>
              )}

              {!selectedBranchForPrice ? (
                <div className="text-center py-10 text-gray-400">
                  <Tag className="w-12 h-12 mx-auto mb-3 text-gray-300" />
                  <p>Chọn chi nhánh để xem giá riêng</p>
                </div>
              ) : loadingPrices ? (
                <div className="text-center py-10 text-gray-400">Đang tải...</div>
              ) : (
                <div>
                  <p className="text-xs text-gray-500 mb-3">
                    Giá riêng sẽ ghi đè giá mặc định cho chi nhánh đã chọn. Nếu không có giá riêng, hệ thống dùng giá mặc định.
                  </p>
                  {priceOverrides.length === 0 ? (
                    <div className="text-center py-10 text-gray-400">
                      <Tag className="w-10 h-10 mx-auto mb-2 text-gray-300" />
                      <p>Chưa có giá riêng nào cho chi nhánh này</p>
                    </div>
                  ) : (
                    <div className="overflow-x-auto">
                      <table className="min-w-full bg-white border border-gray-200 rounded-xl overflow-hidden text-sm">
                        <thead>
                          <tr className="bg-gray-50 border-b">
                            <th className="text-left px-4 py-3 font-semibold text-gray-700">Sản phẩm</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-700">Loại</th>
                            <th className="text-right px-4 py-3 font-semibold text-gray-700">Giá bán</th>
                            <th className="text-right px-4 py-3 font-semibold text-gray-700">Giá vốn</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-700">Ghi chú</th>
                            <th className="text-left px-4 py-3 font-semibold text-gray-700">Ngày tạo</th>
                            <th className="px-4 py-3"></th>
                          </tr>
                        </thead>
                        <tbody className="divide-y">
                          {priceOverrides.map(row => (
                            <tr key={row.id} className="hover:bg-gray-50">
                              <td className="px-4 py-2.5 font-medium text-gray-900">{row.ten_san_pham || `ID ${row.item_id}`}</td>
                              <td className="px-4 py-2.5 text-gray-500 capitalize">{row.item_type === 'thuoc' ? 'Thuốc' : row.item_type === 'gong_kinh' ? 'Gọng kính' : row.item_type}</td>
                              <td className="px-4 py-2.5 text-right text-green-700 font-mono font-semibold">
                                {row.gia_ban_override != null ? row.gia_ban_override.toLocaleString('vi-VN') : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-right text-blue-700 font-mono">
                                {row.gia_von_override != null ? row.gia_von_override.toLocaleString('vi-VN') : '—'}
                              </td>
                              <td className="px-4 py-2.5 text-gray-500 text-xs">{row.reason || '—'}</td>
                              <td className="px-4 py-2.5 text-gray-400 text-xs">{new Date(row.created_at).toLocaleDateString('vi-VN')}</td>
                              <td className="px-4 py-2.5">
                                <button
                                  onClick={() => handleDeleteOverride(row.id)}
                                  className="p-1.5 text-gray-400 hover:text-red-500 hover:bg-red-50 rounded-lg"
                                  title="Xóa"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
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
