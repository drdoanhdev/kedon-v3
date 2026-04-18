/**
 * Trang quản lý phòng khám (Chủ phòng khám / Admin)
 * - Xem/sửa thông tin phòng khám
 * - Quản lý thành viên: thêm/sửa role/xóa
 */
import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Badge } from '../components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '../components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import Link from 'next/link';
import { fetchWithAuth, getAuthHeaders } from '../lib/fetchWithAuth';

const ROLE_LABELS: Record<string, string> = {
  owner: 'Chủ phòng khám',
  admin: 'Quản trị viên',
  doctor: 'Bác sĩ',
  staff: 'Nhân viên',
};

const ROLE_COLORS: Record<string, string> = {
  owner: 'bg-purple-100 text-purple-800',
  admin: 'bg-blue-100 text-blue-800',
  doctor: 'bg-green-100 text-green-800',
  staff: 'bg-gray-100 text-gray-800',
};

interface Member {
  id: string;
  user_id: string;
  role: string;
  active: boolean;
  email: string;
  full_name: string | null;
  last_login_at: string | null;
  created_at: string;
}

interface TenantInfo {
  id: string;
  name: string;
  code: string | null;
  phone: string | null;
  address: string | null;
  settings?: any;
}

export default function QuanLyPhongKham() {
  const { confirm } = useConfirm();
  const { currentTenant, currentRole, user, currentTenantId } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  const [planInfo, setPlanInfo] = useState<any>(null);
  
  // Form state
  const [editTenant, setEditTenant] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantAddress, setTenantAddress] = useState('');
  const [crmDaysThreshold, setCrmDaysThreshold] = useState('90');
  const [crmLimit, setCrmLimit] = useState('20');
  const [crmOnlyHasPhone, setCrmOnlyHasPhone] = useState(false);
  const [crmPrioritizeHighValue, setCrmPrioritizeHighValue] = useState(true);
  const [crmPriorityAThreshold, setCrmPriorityAThreshold] = useState('140');
  const [crmPriorityBThreshold, setCrmPriorityBThreshold] = useState('105');
  const [crmValuePerPoint, setCrmValuePerPoint] = useState('200000');
  const [crmValueBonusCap, setCrmValueBonusCap] = useState('50');
  const [crmLifetimeValuePerPoint, setCrmLifetimeValuePerPoint] = useState('1500000');
  const [crmLifetimeValueBonusCap, setCrmLifetimeValueBonusCap] = useState('35');
  const [crmServiceCountPoint, setCrmServiceCountPoint] = useState('3');
  const [crmServiceCountBonusCap, setCrmServiceCountBonusCap] = useState('25');
  const [crmOverduePoint, setCrmOverduePoint] = useState('15');
  const [crmOverdueBonusCap, setCrmOverdueBonusCap] = useState('40');

  const CRM_DEFAULTS = {
    daysThreshold: '90',
    limit: '20',
    priorityAThreshold: '140',
    priorityBThreshold: '105',
    valuePerPoint: '200000',
    valueBonusCap: '50',
    lifetimeValuePerPoint: '1500000',
    lifetimeValueBonusCap: '35',
    serviceCountPoint: '3',
    serviceCountBonusCap: '25',
    overduePoint: '15',
    overdueBonusCap: '40',
    onlyHasPhone: false,
    prioritizeHighValue: true,
  };

  const CRM_PRESETS: Record<'small' | 'medium' | 'large', typeof CRM_DEFAULTS> = {
    small: {
      daysThreshold: '120',
      limit: '20',
      priorityAThreshold: '155',
      priorityBThreshold: '120',
      valuePerPoint: '250000',
      valueBonusCap: '40',
      lifetimeValuePerPoint: '2000000',
      lifetimeValueBonusCap: '28',
      serviceCountPoint: '2',
      serviceCountBonusCap: '20',
      overduePoint: '18',
      overdueBonusCap: '35',
      onlyHasPhone: true,
      prioritizeHighValue: true,
    },
    medium: {
      daysThreshold: '90',
      limit: '35',
      priorityAThreshold: '140',
      priorityBThreshold: '105',
      valuePerPoint: '200000',
      valueBonusCap: '50',
      lifetimeValuePerPoint: '1500000',
      lifetimeValueBonusCap: '35',
      serviceCountPoint: '3',
      serviceCountBonusCap: '25',
      overduePoint: '15',
      overdueBonusCap: '40',
      onlyHasPhone: true,
      prioritizeHighValue: true,
    },
    large: {
      daysThreshold: '75',
      limit: '60',
      priorityAThreshold: '125',
      priorityBThreshold: '95',
      valuePerPoint: '150000',
      valueBonusCap: '70',
      lifetimeValuePerPoint: '1200000',
      lifetimeValueBonusCap: '45',
      serviceCountPoint: '4',
      serviceCountBonusCap: '35',
      overduePoint: '12',
      overdueBonusCap: '50',
      onlyHasPhone: true,
      prioritizeHighValue: true,
    },
  };

  const applyCrmConfig = (cfg: typeof CRM_DEFAULTS) => {
    setCrmDaysThreshold(cfg.daysThreshold);
    setCrmLimit(cfg.limit);
    setCrmPriorityAThreshold(cfg.priorityAThreshold);
    setCrmPriorityBThreshold(cfg.priorityBThreshold);
    setCrmValuePerPoint(cfg.valuePerPoint);
    setCrmValueBonusCap(cfg.valueBonusCap);
    setCrmLifetimeValuePerPoint(cfg.lifetimeValuePerPoint);
    setCrmLifetimeValueBonusCap(cfg.lifetimeValueBonusCap);
    setCrmServiceCountPoint(cfg.serviceCountPoint);
    setCrmServiceCountBonusCap(cfg.serviceCountBonusCap);
    setCrmOverduePoint(cfg.overduePoint);
    setCrmOverdueBonusCap(cfg.overdueBonusCap);
    setCrmOnlyHasPhone(cfg.onlyHasPhone);
    setCrmPrioritizeHighValue(cfg.prioritizeHighValue);
  };

  const handleApplyPreset = (size: 'small' | 'medium' | 'large') => {
    applyCrmConfig(CRM_PRESETS[size]);
    const label = size === 'small' ? 'Nhỏ' : size === 'medium' ? 'Vừa' : 'Lớn';
    toast.success(`Đã áp dụng preset cửa hàng ${label}. Bấm Lưu để ghi nhận.`);
  };

  const handleResetCrmDefaults = () => {
    applyCrmConfig(CRM_DEFAULTS);
    toast.success('Đã khôi phục cấu hình mặc định. Bấm Lưu để ghi nhận.');
  };
  
  // Add member 
  const [showAddMember, setShowAddMember] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [newRole, setNewRole] = useState<'admin' | 'doctor' | 'staff'>('staff');

  const isOwnerOrAdmin = currentRole === 'owner' || currentRole === 'admin';

  // Kiểm tra quyền
  if (!isOwnerOrAdmin) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Không có quyền truy cập</h1>
            <p className="text-gray-600">Chỉ chủ phòng khám hoặc quản trị viên mới có quyền quản lý.</p>
            <Link href="/" className="text-blue-600 hover:underline mt-4 block">Quay lại trang chủ</Link>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  const fetchMembers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetchWithAuth('/api/tenants/members');
      const data = await res.json();
      if (res.ok) {
        setMembers(data.data || []);
      } else {
        toast.error(data.message || 'Lỗi tải danh sách thành viên');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchMembers();
    // Fetch plan info
    if (currentTenantId) {
      (async () => {
        try {
          const headers = await getAuthHeaders();
          const res = await fetch('/api/tenants/trial', { headers });
          if (res.ok) setPlanInfo(await res.json());
        } catch {}
      })();
    }
    if (currentTenant) {
      setTenantInfo({
        id: currentTenant.id,
        name: currentTenant.name || '',
        code: currentTenant.code || null,
        phone: null,
        address: null,
        settings: {},
      });
      setTenantName(currentTenant.name || '');
      setTenantCode(currentTenant.code || '');
    }
  }, [fetchMembers, currentTenant, currentTenantId]);

  useEffect(() => {
    if (!currentTenantId) return;
    (async () => {
      try {
        const res = await fetchWithAuth('/api/tenants');
        const data = await res.json();
        const rows = data?.data || [];
        const t = rows.find((x: any) => x.id === currentTenantId);
        if (!t) return;

        const settings = t.settings || {};
        const cfg = settings?.dashboard?.crm || {};
        const days = Number(cfg.daysThreshold);
        const limit = Number(cfg.limit);
        const aThreshold = Number(cfg.priorityAThreshold);
        const bThreshold = Number(cfg.priorityBThreshold);
        const valuePerPoint = Number(cfg.valuePerPoint);
        const valueBonusCap = Number(cfg.valueBonusCap);
        const lifetimeValuePerPoint = Number(cfg.lifetimeValuePerPoint);
        const lifetimeValueBonusCap = Number(cfg.lifetimeValueBonusCap);
        const serviceCountPoint = Number(cfg.serviceCountPoint);
        const serviceCountBonusCap = Number(cfg.serviceCountBonusCap);
        const overduePoint = Number(cfg.overduePoint);
        const overdueBonusCap = Number(cfg.overdueBonusCap);
        const onlyHasPhone = cfg.onlyHasPhone === true;
        const prioritizeHighValue = cfg.prioritizeHighValue !== false;

        setTenantInfo({
          id: t.id,
          name: t.name || '',
          code: t.code || null,
          phone: t.phone || null,
          address: t.address || null,
          settings,
        });
        setTenantName(t.name || '');
        setTenantCode(t.code || '');
        setTenantPhone(t.phone || '');
        setTenantAddress(t.address || '');
        setCrmDaysThreshold(String(Number.isFinite(days) ? days : 90));
        setCrmLimit(String(Number.isFinite(limit) ? limit : 20));
        setCrmPriorityAThreshold(String(Number.isFinite(aThreshold) ? aThreshold : 140));
        setCrmPriorityBThreshold(String(Number.isFinite(bThreshold) ? bThreshold : 105));
        setCrmValuePerPoint(String(Number.isFinite(valuePerPoint) ? valuePerPoint : 200000));
        setCrmValueBonusCap(String(Number.isFinite(valueBonusCap) ? valueBonusCap : 50));
        setCrmLifetimeValuePerPoint(String(Number.isFinite(lifetimeValuePerPoint) ? lifetimeValuePerPoint : 1500000));
        setCrmLifetimeValueBonusCap(String(Number.isFinite(lifetimeValueBonusCap) ? lifetimeValueBonusCap : 35));
        setCrmServiceCountPoint(String(Number.isFinite(serviceCountPoint) ? serviceCountPoint : 3));
        setCrmServiceCountBonusCap(String(Number.isFinite(serviceCountBonusCap) ? serviceCountBonusCap : 25));
        setCrmOverduePoint(String(Number.isFinite(overduePoint) ? overduePoint : 15));
        setCrmOverdueBonusCap(String(Number.isFinite(overdueBonusCap) ? overdueBonusCap : 40));
        setCrmOnlyHasPhone(onlyHasPhone);
        setCrmPrioritizeHighValue(prioritizeHighValue);
      } catch {}
    })();
  }, [currentTenantId]);

  const handleUpdateTenant = async () => {
    if (!tenantInfo) return;
    try {
      const nextDays = Math.min(Math.max(parseInt(crmDaysThreshold || '90', 10) || 90, 30), 365);
      const nextLimit = Math.min(Math.max(parseInt(crmLimit || '20', 10) || 20, 5), 100);
      const nextValuePerPoint = Math.min(Math.max(parseInt(crmValuePerPoint || '200000', 10) || 200000, 50000), 2000000);
      const nextValueBonusCap = Math.min(Math.max(parseInt(crmValueBonusCap || '50', 10) || 50, 0), 200);
      const nextA = Math.min(Math.max(parseInt(crmPriorityAThreshold || '140', 10) || 140, 60), 400);
      const nextBRaw = Math.min(Math.max(parseInt(crmPriorityBThreshold || '105', 10) || 105, 30), 300);
      const nextB = Math.min(nextBRaw, nextA - 1);
      const nextLifetimeValuePerPoint = Math.min(Math.max(parseInt(crmLifetimeValuePerPoint || '1500000', 10) || 1500000, 100000), 10000000);
      const nextLifetimeValueBonusCap = Math.min(Math.max(parseInt(crmLifetimeValueBonusCap || '35', 10) || 35, 0), 200);
      const nextServiceCountPoint = Math.min(Math.max(parseInt(crmServiceCountPoint || '3', 10) || 3, 0), 20);
      const nextServiceCountBonusCap = Math.min(Math.max(parseInt(crmServiceCountBonusCap || '25', 10) || 25, 0), 200);
      const nextOverduePoint = Math.min(Math.max(parseInt(crmOverduePoint || '15', 10) || 15, 0), 100);
      const nextOverdueBonusCap = Math.min(Math.max(parseInt(crmOverdueBonusCap || '40', 10) || 40, 0), 300);
      const nextSettings = {
        ...(tenantInfo.settings || {}),
        dashboard: {
          ...((tenantInfo.settings || {}).dashboard || {}),
          crm: {
            ...((tenantInfo.settings || {}).dashboard?.crm || {}),
            daysThreshold: nextDays,
            limit: nextLimit,
            priorityAThreshold: nextA,
            priorityBThreshold: nextB,
            valuePerPoint: nextValuePerPoint,
            valueBonusCap: nextValueBonusCap,
            lifetimeValuePerPoint: nextLifetimeValuePerPoint,
            lifetimeValueBonusCap: nextLifetimeValueBonusCap,
            serviceCountPoint: nextServiceCountPoint,
            serviceCountBonusCap: nextServiceCountBonusCap,
            overduePoint: nextOverduePoint,
            overdueBonusCap: nextOverdueBonusCap,
            onlyHasPhone: crmOnlyHasPhone,
            prioritizeHighValue: crmPrioritizeHighValue,
          },
        },
      };

      const res = await fetchWithAuth('/api/tenants', {
        method: 'PUT',
        body: JSON.stringify({
          id: tenantInfo.id,
          name: tenantName,
          code: tenantCode,
          phone: tenantPhone,
          address: tenantAddress,
          settings: nextSettings,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Đã cập nhật thông tin phòng khám');
        setTenantInfo((prev) => prev ? { ...prev, settings: nextSettings } : prev);
        setCrmDaysThreshold(String(nextDays));
        setCrmLimit(String(nextLimit));
        setCrmPriorityAThreshold(String(nextA));
        setCrmPriorityBThreshold(String(nextB));
        setCrmValuePerPoint(String(nextValuePerPoint));
        setCrmValueBonusCap(String(nextValueBonusCap));
        setCrmLifetimeValuePerPoint(String(nextLifetimeValuePerPoint));
        setCrmLifetimeValueBonusCap(String(nextLifetimeValueBonusCap));
        setCrmServiceCountPoint(String(nextServiceCountPoint));
        setCrmServiceCountBonusCap(String(nextServiceCountBonusCap));
        setCrmOverduePoint(String(nextOverduePoint));
        setCrmOverdueBonusCap(String(nextOverdueBonusCap));
        setEditTenant(false);
      } else {
        toast.error(data.message || 'Lỗi cập nhật');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleAddMember = async () => {
    if (!newEmail) {
      toast.error('Vui lòng nhập email');
      return;
    }
    try {
      const res = await fetchWithAuth('/api/tenants/members', {
        method: 'POST',
        body: JSON.stringify({
          email: newEmail,
          role: newRole,
          password: newPassword || undefined,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success(data.message || 'Đã thêm thành viên');
        setShowAddMember(false);
        setNewEmail('');
        setNewPassword('');
        setNewRole('staff');
        fetchMembers();
      } else {
        toast.error(data.message || 'Lỗi thêm thành viên');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleUpdateRole = async (membershipId: string, role: string) => {
    try {
      const res = await fetchWithAuth('/api/tenants/members', {
        method: 'PUT',
        body: JSON.stringify({ membershipId, role }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Đã cập nhật role');
        fetchMembers();
      } else {
        toast.error(data.message || 'Lỗi cập nhật');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  const handleRemoveMember = async (membershipId: string, email: string) => {
    if (!await confirm(`Bạn có chắc chắn muốn xóa ${email} khỏi phòng khám?`)) return;
    try {
      const res = await fetchWithAuth(`/api/tenants/members?membershipId=${membershipId}`, {
        method: 'DELETE',
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Đã xóa thành viên');
        fetchMembers();
      } else {
        toast.error(data.message || 'Lỗi xóa');
      }
    } catch (err: any) {
      toast.error('Lỗi: ' + err.message);
    }
  };

  return (
    <ProtectedRoute>
      <div className="max-w-6xl mx-auto p-4 space-y-6">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-bold">Quản lý Phòng khám</h1>
          <Badge className={ROLE_COLORS[currentRole || 'staff']}>
            {ROLE_LABELS[currentRole || 'staff']}
          </Badge>
        </div>

        {/* Thông tin phòng khám */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Thông tin phòng khám</CardTitle>
            {!editTenant && (
              <Button variant="outline" size="sm" onClick={() => setEditTenant(true)}>
                Chỉnh sửa
              </Button>
            )}
          </CardHeader>
          <CardContent>
            {editTenant ? (
              <div className="space-y-4">
                <div>
                  <Label>Tên phòng khám</Label>
                  <Input value={tenantName} onChange={e => setTenantName(e.target.value)} />
                </div>
                <div>
                  <Label>Mã phòng khám</Label>
                  <Input value={tenantCode} onChange={e => setTenantCode(e.target.value)} placeholder="VD: PK001" />
                </div>
                <div>
                  <Label>Số điện thoại</Label>
                  <Input value={tenantPhone} onChange={e => setTenantPhone(e.target.value)} />
                </div>
                <div>
                  <Label>Địa chỉ</Label>
                  <Input value={tenantAddress} onChange={e => setTenantAddress(e.target.value)} />
                </div>
                <div className="pt-2 border-t">
                  <div className="flex flex-wrap items-center justify-between gap-2 mb-2">
                    <p className="text-sm font-medium text-gray-700">Cấu hình Khách cần chăm sóc (Dashboard)</p>
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="text-[11px] text-gray-500">Preset nhanh:</span>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleApplyPreset('small')}>Nhỏ</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleApplyPreset('medium')}>Vừa</Button>
                      <Button type="button" variant="outline" size="sm" onClick={() => handleApplyPreset('large')}>Lớn</Button>
                      <Button type="button" variant="outline" size="sm" onClick={handleResetCrmDefaults}>Khôi phục mặc định</Button>
                    </div>
                  </div>
                  <p className="text-xs text-gray-500 mb-2">Preset chỉ áp dụng tạm vào biểu mẫu. Cần bấm Lưu để cập nhật chính thức.</p>
                  <div className="rounded-lg border border-gray-200 overflow-hidden">
                    <div className="grid grid-cols-12 bg-gray-50 px-3 py-2 text-xs font-semibold text-gray-600">
                      <div className="col-span-4">Thông số</div>
                      <div className="col-span-3">Giá trị</div>
                      <div className="col-span-5">Chú thích</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Ngưỡng ngày chưa quay lại</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={30} max={365} value={crmDaysThreshold} onChange={e => setCrmDaysThreshold(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Lọc khách đã lâu chưa quay lại. Khuyên dùng 60-120 ngày.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Số khách hiển thị tối đa</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={5} max={100} value={crmLimit} onChange={e => setCrmLimit(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Số lượng khách hiển thị trên card mỗi lần tải.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Mốc điểm Rất khẩn (A)</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={60} max={400} value={crmPriorityAThreshold} onChange={e => setCrmPriorityAThreshold(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Điểm từ mốc này trở lên sẽ vào nhóm Rất khẩn.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Mốc điểm Khẩn (B)</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={30} max={300} value={crmPriorityBThreshold} onChange={e => setCrmPriorityBThreshold(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Từ mốc này tới dưới A là nhóm Khẩn. Hệ thống sẽ tự đảm bảo B nhỏ hơn A.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Giá trị đơn / 1 điểm ưu tiên</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={50000} max={2000000} value={crmValuePerPoint} onChange={e => setCrmValuePerPoint(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Ví dụ 200000 nghĩa là mỗi 200k của đơn gần nhất sẽ cộng 1 điểm.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Trần điểm cộng từ doanh thu</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0} max={200} value={crmValueBonusCap} onChange={e => setCrmValueBonusCap(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Giới hạn tác động của đơn giá cao để không lấn át yếu tố số ngày.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Tổng tiền dịch vụ / 1 điểm</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={100000} max={10000000} value={crmLifetimeValuePerPoint} onChange={e => setCrmLifetimeValuePerPoint(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Dựa trên tổng chi tiêu lịch sử tại phòng khám. Ví dụ 1.500.000đ = 1 điểm.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Trần điểm từ tổng tiền dịch vụ</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0} max={200} value={crmLifetimeValueBonusCap} onChange={e => setCrmLifetimeValueBonusCap(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Khống chế ảnh hưởng của khách hàng chi tiêu rất cao.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Điểm mỗi lần sử dụng dịch vụ</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0} max={20} value={crmServiceCountPoint} onChange={e => setCrmServiceCountPoint(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Tăng ưu tiên cho khách quay lại nhiều lần (khách thân thiết).</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Trần điểm từ số lần dịch vụ</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0} max={200} value={crmServiceCountBonusCap} onChange={e => setCrmServiceCountBonusCap(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Giới hạn điểm cộng tích lũy từ số lần đã dùng dịch vụ.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Điểm mỗi hẹn khám lại quá hạn</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0} max={100} value={crmOverduePoint} onChange={e => setCrmOverduePoint(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Mỗi lịch hẹn quá hạn sẽ đẩy mức ưu tiên chăm sóc lên cao hơn.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Trần điểm từ hẹn quá hạn</Label>
                      </div>
                      <div className="col-span-3">
                        <Input type="number" min={0} max={300} value={crmOverdueBonusCap} onChange={e => setCrmOverdueBonusCap(e.target.value)} />
                      </div>
                      <div className="col-span-5 text-xs text-gray-500">Tránh trường hợp quá nhiều hẹn quá hạn làm méo ưu tiên tổng thể.</div>
                    </div>

                    <div className="grid grid-cols-12 px-3 py-2 border-t items-center gap-2">
                      <div className="col-span-4">
                        <Label>Bộ lọc & chiến lược</Label>
                      </div>
                      <div className="col-span-8 flex flex-col md:flex-row md:items-center gap-3">
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={crmOnlyHasPhone}
                            onChange={e => setCrmOnlyHasPhone(e.target.checked)}
                          />
                          Chỉ hiện khách có số điện thoại
                        </label>
                        <label className="flex items-center gap-2 text-sm text-gray-700">
                          <input
                            type="checkbox"
                            checked={crmPrioritizeHighValue}
                            onChange={e => setCrmPrioritizeHighValue(e.target.checked)}
                          />
                          Ưu tiên khách có đơn gần nhất giá cao
                        </label>
                      </div>
                    </div>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button onClick={handleUpdateTenant}>Lưu</Button>
                  <Button variant="outline" onClick={() => setEditTenant(false)}>Hủy</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p><span className="font-medium">Tên:</span> {currentTenant?.name || '—'}</p>
                <p><span className="font-medium">Mã:</span> {currentTenant?.code || '—'}</p>
                <p><span className="font-medium">CRM chăm sóc:</span> {crmDaysThreshold}+ ngày, tối đa {crmLimit} khách</p>
                <p><span className="font-medium">Bộ lọc:</span> {crmOnlyHasPhone ? 'Chỉ khách có SĐT' : 'Bao gồm cả khách chưa có SĐT'}</p>
                <p><span className="font-medium">Ưu tiên:</span> {crmPrioritizeHighValue ? 'Đơn gần nhất giá cao' : 'Theo số ngày chưa quay lại'}</p>
                <p><span className="font-medium">Mốc ưu tiên:</span> Rất khẩn từ {crmPriorityAThreshold} điểm, Khẩn từ {crmPriorityBThreshold} điểm</p>
                <p><span className="font-medium">Quy đổi doanh thu:</span> {Number(crmValuePerPoint || 0).toLocaleString('vi-VN')}đ = 1 điểm, trần {crmValueBonusCap} điểm</p>
                <p><span className="font-medium">Quy đổi tổng tiền dịch vụ:</span> {Number(crmLifetimeValuePerPoint || 0).toLocaleString('vi-VN')}đ = 1 điểm, trần {crmLifetimeValueBonusCap} điểm</p>
                <p><span className="font-medium">Điểm số lần dịch vụ:</span> {crmServiceCountPoint} điểm/lần, trần {crmServiceCountBonusCap} điểm</p>
                <p><span className="font-medium">Điểm hẹn quá hạn:</span> {crmOverduePoint} điểm/lần, trần {crmOverdueBonusCap} điểm</p>
                <p><span className="font-medium">Trạng thái:</span>{' '}
                  <Badge variant="outline" className="text-green-700">Hoạt động</Badge>
                </p>

                {/* Thông tin gói dịch vụ */}
                {planInfo && (
                  <div className="mt-4 pt-4 border-t">
                    <p className="font-medium text-gray-700 mb-2">Gói dịch vụ</p>
                    <div className="flex items-center gap-2 mb-2">
                      <span className={`px-2.5 py-1 rounded-full text-sm font-semibold ${
                        planInfo.plan === 'pro' ? 'bg-purple-100 text-purple-700' :
                        planInfo.plan === 'basic' ? 'bg-blue-100 text-blue-700' :
                        'bg-gray-100 text-gray-600'
                      }`}>
                        {planInfo.plan === 'pro' ? '💎 Chuyên nghiệp' : planInfo.plan === 'basic' ? '🔵 Cơ bản' : '🎁 Dùng thử'}
                      </span>
                    </div>

                    {planInfo.plan === 'trial' && planInfo.trial && (
                      <div className="space-y-1 text-sm text-gray-600">
                        <p>Ngày còn lại: <span className={`font-semibold ${planInfo.trial.daysRemaining <= 7 ? 'text-red-600' : planInfo.trial.daysRemaining <= 30 ? 'text-yellow-600' : 'text-green-600'}`}>{planInfo.trial.daysRemaining}</span> / {planInfo.trial.totalDays} ngày</p>
                        <p>Đơn đã dùng: <span className="font-semibold">{planInfo.trial.usedPrescriptions}</span> / {planInfo.trial.maxPrescriptions}</p>
                        {planInfo.trial.isExpired && (
                          <p className="text-red-600 font-semibold">⚠️ Gói dùng thử đã hết hạn!</p>
                        )}
                      </div>
                    )}

                    {planInfo.plan !== 'trial' && planInfo.planExpiresAt && (
                      <p className="text-sm text-gray-600">
                        Hạn sử dụng:{' '}
                        <span className={`font-semibold ${new Date(planInfo.planExpiresAt) < new Date() ? 'text-red-600' : 'text-green-600'}`}>
                          {new Date(planInfo.planExpiresAt).toLocaleDateString('vi-VN')}
                        </span>
                        {new Date(planInfo.planExpiresAt) < new Date() && ' (Đã hết hạn)'}
                      </p>
                    )}

                    <Link
                      href="/billing"
                      className="inline-flex items-center gap-1.5 mt-3 px-4 py-2 bg-blue-600 text-white rounded-lg text-sm font-medium hover:bg-blue-700 transition"
                    >
                      {planInfo.plan === 'trial' || (planInfo.planExpiresAt && new Date(planInfo.planExpiresAt) < new Date())
                        ? '🚀 Nâng cấp gói'
                        : '💳 Quản lý gói dịch vụ'}
                    </Link>
                  </div>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Danh sách thành viên */}
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Thành viên phòng khám ({members.filter(m => m.active !== false).length})</CardTitle>
            <Dialog open={showAddMember} onOpenChange={setShowAddMember}>
              <DialogTrigger asChild>
                <Button>+ Thêm thành viên</Button>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Thêm thành viên mới</DialogTitle>
                </DialogHeader>
                <div className="space-y-4 pt-2">
                  <div>
                    <Label>Email</Label>
                    <Input
                      type="email"
                      value={newEmail}
                      onChange={e => setNewEmail(e.target.value)}
                      placeholder="email@example.com"
                    />
                  </div>
                  <div>
                    <Label>Mật khẩu (nếu tạo tài khoản mới)</Label>
                    <Input
                      type="password"
                      value={newPassword}
                      onChange={e => setNewPassword(e.target.value)}
                      placeholder="Tối thiểu 6 ký tự"
                    />
                    <p className="text-xs text-gray-500 mt-1">
                      Bỏ trống nếu người dùng đã có tài khoản
                    </p>
                  </div>
                  <div>
                    <Label>Vai trò</Label>
                    <select
                      className="w-full h-10 border rounded-md px-3"
                      value={newRole}
                      onChange={e => setNewRole(e.target.value as any)}
                    >
                      <option value="staff">Nhân viên</option>
                      <option value="doctor">Bác sĩ</option>
                      <option value="admin">Quản trị viên</option>
                    </select>
                  </div>
                  <Button onClick={handleAddMember} className="w-full">
                    Thêm thành viên
                  </Button>
                </div>
              </DialogContent>
            </Dialog>
          </CardHeader>
          <CardContent>
            {loading ? (
              <p className="text-center text-gray-500 py-4">Đang tải...</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Họ tên</TableHead>
                    <TableHead>Vai trò</TableHead>
                    <TableHead>Trạng thái</TableHead>
                    <TableHead>Đăng nhập gần nhất</TableHead>
                    <TableHead className="text-right">Thao tác</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {members.filter(m => m.active !== false).map(member => (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.email}</TableCell>
                      <TableCell>{member.full_name || '—'}</TableCell>
                      <TableCell>
                        {member.role === 'owner' ? (
                          <Badge className={ROLE_COLORS.owner}>{ROLE_LABELS.owner}</Badge>
                        ) : (
                          <select
                            className="h-8 border rounded px-2 text-sm"
                            value={member.role}
                            onChange={e => handleUpdateRole(member.id, e.target.value)}
                          >
                            <option value="admin">Quản trị viên</option>
                            <option value="doctor">Bác sĩ</option>
                            <option value="staff">Nhân viên</option>
                          </select>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-green-700">Hoạt động</Badge>
                      </TableCell>
                      <TableCell className="text-sm text-gray-500">
                        {member.last_login_at 
                          ? new Date(member.last_login_at).toLocaleString('vi-VN')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right">
                        {member.role !== 'owner' && member.user_id !== user?.id && (
                          <Button
                            variant="destructive"
                            size="sm"
                            onClick={() => handleRemoveMember(member.id, member.email)}
                          >
                            Xóa
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {members.filter(m => m.active !== false).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6} className="text-center text-gray-500 py-8">
                        Chưa có thành viên nào
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </ProtectedRoute>
  );
}
