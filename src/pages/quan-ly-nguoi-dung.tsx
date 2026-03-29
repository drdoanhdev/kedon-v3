import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import ProtectedRoute from '../components/ProtectedRoute'
import toast from 'react-hot-toast'
import { useConfirm } from '@/components/ui/confirm-dialog'
import Link from 'next/link'
import { fetchWithAuth } from '../lib/fetchWithAuth'

interface UserWithRole {
  id: string
  email: string
  role: 'admin' | 'doctor' | 'staff' | null
  created_at?: string
  last_login_at?: string
}

export default function QuanLyNguoiDung() {
  const { confirm } = useConfirm()
  const { userRole, signOut } = useAuth()
  const [users, setUsers] = useState<UserWithRole[]>([])
  const [loading, setLoading] = useState(false)
  const [selectedRole, setSelectedRole] = useState<'admin' | 'doctor' | 'staff' | null>(null)
  const [editingUserId, setEditingUserId] = useState<string | null>(null)
  const [newEmail, setNewEmail] = useState('')
  const [showCreateForm, setShowCreateForm] = useState(false)
  const [createEmail, setCreateEmail] = useState('')
  const [createPassword, setCreatePassword] = useState('')
  const [createRole, setCreateRole] = useState<'admin' | 'doctor' | 'staff'>('staff')

  // Chỉ admin mới được vào trang này
  if (userRole !== 'admin') {
    return (
      <ProtectedRoute requiredRole="admin">
        <div className="min-h-screen flex items-center justify-center bg-gray-50">
          <div className="text-center">
            <h1 className="text-2xl font-bold text-red-600 mb-4">Không có quyền truy cập</h1>
            <p className="text-gray-600">Bạn cần quyền Admin để quản lý người dùng.</p>
            <Link href="/" className="text-blue-600 hover:underline mt-4 block">
              Quay lại trang chủ
            </Link>
          </div>
        </div>
      </ProtectedRoute>
    )
  }

  // Lấy danh sách người dùng
  const fetchUsers = async () => {
    setLoading(true)
    try {
      const response = await fetchWithAuth('/api/users')
      const data = await response.json()

      if (data.success) {
        setUsers(data.data)
        toast.success(`Tải ${data.count} người dùng thành công`)
      } else {
        toast.error(data.error || 'Lỗi lấy danh sách')
      }
    } catch (error: any) {
      toast.error('Lỗi: ' + (error.message || 'Không xác định'))
    } finally {
      setLoading(false)
    }
  }

  // Cập nhật role
  const handleUpdateRole = async (userId: string, newRole: string) => {
    if (!['admin', 'doctor', 'staff'].includes(newRole)) {
      toast.error('Role không hợp lệ')
      return
    }

    try {
      const response = await fetchWithAuth('/api/users', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ userId, role: newRole })
      })

      const data = await response.json()

      if (data.success) {
        setUsers(users.map(u => 
          u.id === userId ? { ...u, role: newRole as any } : u
        ))
        setSelectedRole(null)
        toast.success(`Cập nhật role thành công: ${newRole}`)
      } else {
        toast.error(data.error || 'Lỗi cập nhật')
      }
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message)
    }
  }

  // Xóa user
  const handleDeleteUser = async (userId: string, userEmail: string) => {
    if (!await confirm(`Bạn có chắc muốn xóa ${userEmail}?\n\nThao tác này không thể hoàn tác!`)) {
      return
    }

    try {
      const response = await fetch(`/api/users?userId=${userId}`, {
        method: 'DELETE'
      })

      const data = await response.json()

      if (data.success) {
        setUsers(users.filter(u => u.id !== userId))
        toast.success('Xóa user thành công')
      } else {
        toast.error(data.error || 'Lỗi xóa')
      }
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message)
    }
  }

  // Tạo user mới
  const handleCreateUser = async () => {
    if (!createEmail || !createPassword) {
      toast.error('Vui lòng nhập email và mật khẩu')
      return
    }

    if (createPassword.length < 6) {
      toast.error('Mật khẩu phải ít nhất 6 ký tự')
      return
    }

    setLoading(true)
    try {
      const response = await fetchWithAuth('/api/auth/create-user', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email: createEmail,
          password: createPassword,
          role: createRole
        })
      })

      const data = await response.json()

      if (data.success) {
        setCreateEmail('')
        setCreatePassword('')
        setCreateRole('staff')
        setShowCreateForm(false)
        toast.success(`Tạo user thành công: ${createEmail}`)
        await fetchUsers()
      } else {
        toast.error(data.error || 'Lỗi tạo user')
      }
    } catch (error: any) {
      toast.error('Lỗi: ' + error.message)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchUsers()
  }, [])

  const getRoleBadgeColor = (role: string | null) => {
    switch (role) {
      case 'admin':
        return 'bg-red-100 text-red-800'
      case 'doctor':
        return 'bg-blue-100 text-blue-800'
      case 'staff':
        return 'bg-green-100 text-green-800'
      default:
        return 'bg-gray-100 text-gray-800'
    }
  }

  const getRoleLabel = (role: string | null) => {
    const labels: Record<string, string> = {
      admin: 'Admin',
      doctor: 'Bác sĩ',
      staff: 'Nhân viên',
      null: 'Chưa cấp'
    }
    return labels[role || 'null']
  }

  return (
    <ProtectedRoute>
      <div className="min-h-screen bg-gray-50">

        {/* Header */}
        <header className="bg-white shadow">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex justify-between h-16">
              <div className="flex items-center">
                <Link href="/" className="text-blue-600 hover:text-blue-800 mr-4">
                  ← Về trang chủ
                </Link>
                <h1 className="text-xl font-semibold">👥 Quản lý người dùng</h1>
              </div>
              <div className="flex items-center space-x-4">
                <span className="px-3 py-1 bg-red-100 text-red-800 rounded-full text-sm font-medium">
                  Admin
                </span>
                <button
                  onClick={signOut}
                  className="bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
                >
                  Đăng xuất
                </button>
              </div>
            </div>
          </div>
        </header>

        <main className="max-w-7xl mx-auto py-8 px-4">
          {/* Buttons */}
          <div className="flex gap-2 mb-6">
            <button
              onClick={fetchUsers}
              disabled={loading}
              className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50"
            >
              🔄 Làm mới
            </button>
            <button
              onClick={() => setShowCreateForm(!showCreateForm)}
              className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700"
            >
              ➕ Tạo user mới
            </button>
          </div>

          {/* Tạo user mới form */}
          {showCreateForm && (
            <div className="bg-white rounded-lg shadow p-6 mb-6">
              <h2 className="text-lg font-semibold mb-4">Tạo người dùng mới</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Email
                  </label>
                  <input
                    type="email"
                    value={createEmail}
                    onChange={(e) => setCreateEmail(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="user@example.com"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Mật khẩu (ít nhất 6 ký tự)
                  </label>
                  <input
                    type="password"
                    value={createPassword}
                    onChange={(e) => setCreatePassword(e.target.value)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="••••••"
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Vai trò
                  </label>
                  <select
                    value={createRole}
                    onChange={(e) => setCreateRole(e.target.value as any)}
                    className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="staff">Nhân viên</option>
                    <option value="doctor">Bác sĩ</option>
                    <option value="admin">Admin</option>
                  </select>
                </div>

                <div className="flex gap-2">
                  <button
                    onClick={handleCreateUser}
                    disabled={loading}
                    className="px-4 py-2 bg-green-600 text-white rounded hover:bg-green-700 disabled:opacity-50"
                  >
                    Tạo
                  </button>
                  <button
                    onClick={() => {
                      setShowCreateForm(false)
                      setCreateEmail('')
                      setCreatePassword('')
                    }}
                    className="px-4 py-2 bg-gray-400 text-white rounded hover:bg-gray-500"
                  >
                    Hủy
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Danh sách người dùng */}
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <div className="px-6 py-4 bg-gray-100 border-b">
              <h2 className="text-lg font-semibold">
                Danh sách người dùng ({users.length})
              </h2>
            </div>

            {loading && users.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                Đang tải dữ liệu...
              </div>
            ) : users.length === 0 ? (
              <div className="p-6 text-center text-gray-500">
                Không có người dùng nào
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead className="bg-gray-50 border-b">
                    <tr>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                        Email
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                        Vai trò
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                        Tạo lúc
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                        Lần đăng nhập cuối
                      </th>
                      <th className="px-6 py-3 text-left text-sm font-medium text-gray-700">
                        Hành động
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {users.map((user) => (
                      <tr key={user.id} className="hover:bg-gray-50">
                        <td className="px-6 py-4 text-sm text-gray-900">
                          {user.email}
                        </td>
                        <td className="px-6 py-4 text-sm">
                          <span className={`px-3 py-1 rounded-full text-xs font-medium ${getRoleBadgeColor(user.role)}`}>
                            {getRoleLabel(user.role)}
                          </span>
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {user.created_at ? new Date(user.created_at).toLocaleDateString('vi-VN') : '-'}
                        </td>
                        <td className="px-6 py-4 text-sm text-gray-500">
                          {user.last_login_at ? new Date(user.last_login_at).toLocaleDateString('vi-VN') : 'Chưa đăng nhập'}
                        </td>
                        <td className="px-6 py-4 text-sm space-x-2">
                          <select
                            value={user.role || ''}
                            onChange={(e) => handleUpdateRole(user.id, e.target.value)}
                            className="px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                          >
                            <option value="">Chọn vai trò...</option>
                            <option value="staff">Nhân viên</option>
                            <option value="doctor">Bác sĩ</option>
                            <option value="admin">Admin</option>
                          </select>
                          <button
                            onClick={() => handleDeleteUser(user.id, user.email)}
                            className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600"
                          >
                            Xóa
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Legend */}
          <div className="mt-8 bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Hướng dẫn vai trò</h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="p-4 bg-red-50 rounded border border-red-200">
                <h4 className="font-bold text-red-800 mb-2">👑 Admin</h4>
                <p className="text-sm text-red-700">
                  Toàn quyền quản lý hệ thống, người dùng và cài đặt
                </p>
              </div>
              <div className="p-4 bg-blue-50 rounded border border-blue-200">
                <h4 className="font-bold text-blue-800 mb-2">🩺 Bác sĩ</h4>
                <p className="text-sm text-blue-700">
                  Toàn quyền với bệnh nhân, đơn thuốc, kê đơn kính
                </p>
              </div>
              <div className="p-4 bg-green-50 rounded border border-green-200">
                <h4 className="font-bold text-green-800 mb-2">👤 Nhân viên</h4>
                <p className="text-sm text-green-700">
                  Quyền hạn chế, hỗ trợ bác sĩ
                </p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </ProtectedRoute>
  )
}
