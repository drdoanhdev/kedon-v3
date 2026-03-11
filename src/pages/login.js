import { useState, useEffect } from 'react'
import { useAuth } from '../contexts/AuthContext'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'

export default function Login() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const { signIn, user, loading: authLoading, tenants, memberships, currentTenantId, switchTenant, tenancyLoading, currentRole } = useAuth()
  const router = useRouter()

  // Redirect nếu đã đăng nhập (chỉ khi không loading)
  useEffect(() => {
    if (!authLoading && user && tenants.length === 1 && !currentTenantId) {
      switchTenant(tenants[0].id)
    }
    if (!authLoading && user && (currentTenantId || tenants.length === 0)) {
      // Nếu đã có tenant (hoặc không dùng multi-tenant) thì chuyển
      router.push('/')
    }
  }, [user, authLoading, router, currentTenantId, tenants, switchTenant])

  const handleLogin = async (e) => {
    e.preventDefault()
    setLoading(true)

    console.log('🚀 Login attempt with:', { email, password: '***' })

    try {
      const { error } = await signIn(email, password)
      
      console.log('📋 SignIn response:', { error: error?.message || 'no error' })
      
      if (error) {
        console.error('❌ Login failed:', error)
        toast.error(error.message || 'Đăng nhập thất bại')
      } else {
        console.log('✅ Login successful')
        toast.success('Đăng nhập thành công!')
        router.push('/')
      }
    } catch (error) {
      console.error('💥 Login exception:', error)
      toast.error('Có lỗi xảy ra khi đăng nhập: ' + (error.message || error))
    } finally {
      setLoading(false)
    }
  }

  // Nếu đang loading hoặc đã đăng nhập thì hiện loading
  if (authLoading) {
    return <div className="min-h-screen flex items-center justify-center bg-gray-50">
      <div>Đang tải...</div>
    </div>
  }

  if (user && !currentTenantId && tenants.length > 1) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50">
        <Toaster position="top-right" />
        <div className="max-w-md w-full space-y-6 bg-white p-6 rounded shadow">
          <h2 className="text-xl font-semibold text-gray-800 text-center">Chọn cơ sở làm việc</h2>
          {tenancyLoading && <div className="text-sm text-gray-500">Đang tải danh sách...</div>}
          <div className="space-y-3 max-h-64 overflow-y-auto">
            {tenants.map(t => {
              const role = memberships.find(m => m.tenant_id === t.id)?.role
              return (
                <button
                  key={t.id}
                  onClick={() => switchTenant(t.id)}
                  className="w-full flex flex-col items-start p-3 border rounded hover:bg-blue-50 text-left"
                >
                  <span className="font-medium">{t.name || t.code || t.id}</span>
                  <span className="text-xs text-gray-600">Vai trò: {role || 'unknown'}</span>
                </button>
              )
            })}
          </div>
          <button
            onClick={() => router.push('/')} // fallback
            className="w-full py-2 px-4 rounded bg-gray-200 hover:bg-gray-300 text-sm"
          >
            Bỏ qua tạm thời
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Toaster position="top-right" />
      <div className="max-w-md w-full">
        {/* Logo / Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-3xl">🏥</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">
            Đăng nhập
          </h2>
          <p className="mt-2 text-gray-600">Hệ thống quản lý phòng khám</p>
        </div>

        <form onSubmit={handleLogin} className="bg-white shadow-xl rounded-2xl p-8 space-y-5">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Email
            </label>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="email@example.com"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              disabled={loading}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Mật khẩu
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Nhập mật khẩu"
              className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              disabled={loading}
            />
          </div>

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50 transition duration-200 shadow-lg shadow-blue-200"
          >
            {loading ? 'Đang đăng nhập...' : 'Đăng nhập'}
          </button>

          <p className="text-center text-sm text-gray-600">
            Chưa có tài khoản?{' '}
            <a href="/register" className="text-blue-600 hover:text-blue-800 font-medium">
              Đăng ký miễn phí
            </a>
          </p>
        </form>
      </div>
    </div>
  )
}