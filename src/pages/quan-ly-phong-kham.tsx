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
      } catch {}
    })();
  }, [currentTenantId]);

  const handleUpdateTenant = async () => {
    if (!tenantInfo) return;
    try {
      const nextDays = Math.min(Math.max(parseInt(crmDaysThreshold || '90', 10) || 90, 30), 365);
      const nextLimit = Math.min(Math.max(parseInt(crmLimit || '20', 10) || 20, 5), 100);
      const nextSettings = {
        ...(tenantInfo.settings || {}),
        dashboard: {
          ...((tenantInfo.settings || {}).dashboard || {}),
          crm: {
            ...((tenantInfo.settings || {}).dashboard?.crm || {}),
            daysThreshold: nextDays,
            limit: nextLimit,
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
                  <p className="text-sm font-medium text-gray-700 mb-2">Cấu hình Khách cần chăm sóc (Dashboard)</p>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <Label>Ngưỡng ngày chưa quay lại</Label>
                      <Input
                        type="number"
                        min={30}
                        max={365}
                        value={crmDaysThreshold}
                        onChange={e => setCrmDaysThreshold(e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">Từ 30 đến 365 ngày</p>
                    </div>
                    <div>
                      <Label>Số khách hiển thị tối đa</Label>
                      <Input
                        type="number"
                        min={5}
                        max={100}
                        value={crmLimit}
                        onChange={e => setCrmLimit(e.target.value)}
                      />
                      <p className="text-xs text-gray-500 mt-1">Từ 5 đến 100 khách</p>
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
