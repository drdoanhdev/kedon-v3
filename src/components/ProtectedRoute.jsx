import { useAuth } from '../contexts/AuthContext'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ProtectedRoute({ children, requiredRole = null, allowedRoles = null }) {
  const { user, loading, userRole, tenancyLoading, currentTenantId, currentTenant, signOut } = useAuth()
  const router = useRouter()

  useEffect(() => {
    if (!loading && !user && router.pathname !== '/login') {
      router.push('/login')
    }
  }, [user, loading, router])

  if (loading || (user && tenancyLoading)) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Đang tải...</p>
        </div>
      </div>
    )
  }

  if (!user && router.pathname !== '/login') {
    return null
  }

  // Kiểm tra requiredRole (một role)
  if (requiredRole && userRole !== requiredRole) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Không có quyền truy cập</h1>
          <p className="text-gray-600">Bạn cần quyền {requiredRole} để truy cập trang này.</p>
          <p className="text-sm text-gray-500 mt-2">Vai trò hiện tại: {userRole || 'Chưa cấp'}</p>
        </div>
      </div>
    )
  }

  // Kiểm tra allowedRoles (nhiều roles)
  if (allowedRoles && allowedRoles.length > 0 && !allowedRoles.includes(userRole)) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-red-600">Không có quyền truy cập</h1>
          <p className="text-gray-600">
            Bạn cần một trong những quyền sau: {allowedRoles.join(', ')}
          </p>
          <p className="text-sm text-gray-500 mt-2">Vai trò hiện tại: {userRole || 'Chưa cấp'}</p>
        </div>
      </div>
    )
  }

  // Kiểm tra trạng thái phòng khám
  if (currentTenant && currentTenant.status && currentTenant.status !== 'active') {
    const isSuspended = currentTenant.status === 'suspended'
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-red-50 via-white to-orange-50">
        <div className="text-center max-w-lg mx-auto px-6">
          <div className="w-24 h-24 mx-auto mb-6 rounded-full flex items-center justify-center bg-red-100">
            <span className="text-5xl">{isSuspended ? '⛔' : '🚫'}</span>
          </div>

          <h1 className="text-3xl font-extrabold text-red-600 mb-3">
            {isSuspended ? 'Phòng khám đang bị tạm ngưng' : 'Phòng khám đã ngưng hoạt động'}
          </h1>

          <div className="bg-white border-2 border-red-200 rounded-2xl p-6 mb-6 shadow-lg">
            <p className="text-gray-700 text-lg leading-relaxed">
              {isSuspended
                ? 'Phòng khám của bạn đang bị tạm ngưng hoạt động. Tất cả dữ liệu vẫn được bảo toàn an toàn.'
                : 'Phòng khám của bạn đã ngưng hoạt động. Tất cả dữ liệu vẫn được bảo toàn an toàn.'}
            </p>
            <p className="text-gray-500 mt-3 text-base">
              Vui lòng liên hệ quản trị viên nền tảng để được hỗ trợ kích hoạt lại.
            </p>
          </div>

          <div className="bg-orange-50 border border-orange-200 rounded-xl p-4 mb-6">
            <p className="text-sm font-semibold text-orange-800 mb-1">📞 Liên hệ hỗ trợ</p>
            <p className="text-orange-700 text-sm">Zalo / Điện thoại: <a href="tel:0905123456" className="font-bold underline">0905.123.456</a></p>
          </div>

          <p className="text-sm text-gray-400 mb-4">
            Phòng khám: <span className="font-medium text-gray-600">{currentTenant.name || 'Không rõ'}</span>
          </p>

          <button
            onClick={async () => { await signOut(); router.push('/login'); }}
            className="px-6 py-2.5 bg-gray-200 text-gray-700 rounded-lg font-medium hover:bg-gray-300 transition text-sm"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    )
  }

  return children
}