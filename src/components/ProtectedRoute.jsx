import { useAuth } from '../contexts/AuthContext'
import { useRouter } from 'next/router'
import { useEffect } from 'react'

export default function ProtectedRoute({ children, requiredRole = null, allowedRoles = null }) {
  const { user, loading, userRole, tenancyLoading, currentTenantId } = useAuth()
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

  return children
}