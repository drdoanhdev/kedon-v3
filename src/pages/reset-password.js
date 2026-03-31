import { useState, useEffect } from 'react'
import { supabase } from '../contexts/AuthContext'
import { useRouter } from 'next/router'
import toast, { Toaster } from 'react-hot-toast'

export default function ResetPassword() {
  const [newPassword, setNewPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [sessionReady, setSessionReady] = useState(false)
  const [error, setError] = useState(null)
  const router = useRouter()

  useEffect(() => {
    // Supabase auto-detects the recovery token from URL hash (detectSessionInUrl: true)
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'PASSWORD_RECOVERY') {
        setSessionReady(true)
      }
    })

    // Also check if already in recovery session
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (session) {
        setSessionReady(true)
      }
    })

    // Timeout: nếu sau 5s vẫn chưa có session thì báo lỗi
    const timeout = setTimeout(() => {
      setSessionReady((prev) => {
        if (!prev) {
          setError('Liên kết đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.')
        }
        return prev
      })
    }, 5000)

    return () => {
      subscription.unsubscribe()
      clearTimeout(timeout)
    }
  }, [])

  const handleSubmit = async (e) => {
    e.preventDefault()

    if (newPassword.length < 6) {
      toast.error('Mật khẩu phải có ít nhất 6 ký tự')
      return
    }

    if (newPassword !== confirmPassword) {
      toast.error('Mật khẩu xác nhận không khớp')
      return
    }

    setLoading(true)
    try {
      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      })

      if (error) {
        toast.error('Lỗi đặt lại mật khẩu: ' + error.message)
      } else {
        toast.success('Đặt lại mật khẩu thành công!')
        setTimeout(() => router.push('/login'), 2000)
      }
    } catch (err) {
      toast.error('Có lỗi xảy ra, vui lòng thử lại.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-blue-50 to-indigo-100 px-4">
      <Toaster position="top-right" />
      <div className="max-w-md w-full">
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 bg-blue-600 rounded-2xl mb-4">
            <span className="text-3xl">🔐</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">
            Đặt lại mật khẩu
          </h2>
          <p className="mt-2 text-gray-600">Nhập mật khẩu mới cho tài khoản</p>
        </div>

        {error ? (
          <div className="bg-white shadow-xl rounded-2xl p-8 space-y-5 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-red-100 rounded-full mb-2">
              <span className="text-3xl">⚠️</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Liên kết không hợp lệ</h3>
            <p className="text-gray-600 text-sm">{error}</p>
            <a
              href="/forgot-password"
              className="inline-block mt-2 py-2.5 px-6 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-xl transition"
            >
              Gửi lại liên kết
            </a>
          </div>
        ) : !sessionReady ? (
          <div className="bg-white shadow-xl rounded-2xl p-8 text-center">
            <div className="animate-spin inline-block w-8 h-8 border-4 border-blue-600 border-t-transparent rounded-full mb-4"></div>
            <p className="text-gray-600">Đang xác thực liên kết...</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white shadow-xl rounded-2xl p-8 space-y-5">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Mật khẩu mới
              </label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Ít nhất 6 ký tự"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                disabled={loading}
                minLength={6}
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Xác nhận mật khẩu
              </label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Nhập lại mật khẩu mới"
                className="w-full px-4 py-2.5 border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
                disabled={loading}
                minLength={6}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50 transition duration-200 shadow-lg shadow-blue-200"
            >
              {loading ? 'Đang xử lý...' : 'Đặt lại mật khẩu'}
            </button>

            <p className="text-center text-sm text-gray-600">
              <a href="/login" className="text-blue-600 hover:text-blue-800 font-medium">
                ← Quay lại đăng nhập
              </a>
            </p>
          </form>
        )}
      </div>
    </div>
  )
}
