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
import toast, { Toaster } from 'react-hot-toast';
import Link from 'next/link';
import { fetchWithAuth } from '../lib/fetchWithAuth';

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
}

export default function QuanLyPhongKham() {
  const { currentTenant, currentRole, user } = useAuth();
  const [members, setMembers] = useState<Member[]>([]);
  const [loading, setLoading] = useState(false);
  const [tenantInfo, setTenantInfo] = useState<TenantInfo | null>(null);
  
  // Form state
  const [editTenant, setEditTenant] = useState(false);
  const [tenantName, setTenantName] = useState('');
  const [tenantCode, setTenantCode] = useState('');
  const [tenantPhone, setTenantPhone] = useState('');
  const [tenantAddress, setTenantAddress] = useState('');
  
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
    if (currentTenant) {
      setTenantInfo({
        id: currentTenant.id,
        name: currentTenant.name || '',
        code: currentTenant.code || null,
        phone: null,
        address: null,
      });
      setTenantName(currentTenant.name || '');
      setTenantCode(currentTenant.code || '');
    }
  }, [fetchMembers, currentTenant]);

  const handleUpdateTenant = async () => {
    if (!tenantInfo) return;
    try {
      const res = await fetchWithAuth('/api/tenants', {
        method: 'PUT',
        body: JSON.stringify({
          id: tenantInfo.id,
          name: tenantName,
          code: tenantCode,
          phone: tenantPhone,
          address: tenantAddress,
        }),
      });
      const data = await res.json();
      if (res.ok) {
        toast.success('Đã cập nhật thông tin phòng khám');
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
    if (!confirm(`Bạn có chắc chắn muốn xóa ${email} khỏi phòng khám?`)) return;
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
      <Toaster position="top-right" />
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
                <div className="flex gap-2">
                  <Button onClick={handleUpdateTenant}>Lưu</Button>
                  <Button variant="outline" onClick={() => setEditTenant(false)}>Hủy</Button>
                </div>
              </div>
            ) : (
              <div className="space-y-2">
                <p><span className="font-medium">Tên:</span> {currentTenant?.name || '—'}</p>
                <p><span className="font-medium">Mã:</span> {currentTenant?.code || '—'}</p>
                <p><span className="font-medium">Trạng thái:</span>{' '}
                  <Badge variant="outline" className="text-green-700">Hoạt động</Badge>
                </p>
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
