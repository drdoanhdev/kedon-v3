import { useState } from 'react'
import { supabase } from '../contexts/AuthContext'
import toast, { Toaster } from 'react-hot-toast'

export default function ForgotPassword() {
  const [email, setEmail] = useState('')
  const [loading, setLoading] = useState(false)
  const [sent, setSent] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)

    try {
      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: `${window.location.origin}/reset-password`,
      })

      if (error) {
        toast.error('Có lỗi xảy ra: ' + error.message)
      } else {
        setSent(true)
        toast.success('Đã gửi email khôi phục mật khẩu!')
      }
    } catch (error) {
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
            <span className="text-3xl">🔑</span>
          </div>
          <h2 className="text-3xl font-bold text-gray-900">
            Quên mật khẩu
          </h2>
          <p className="mt-2 text-gray-600">Nhập email để nhận liên kết đặt lại mật khẩu</p>
        </div>

        {sent ? (
          <div className="bg-white shadow-xl rounded-2xl p-8 space-y-5 text-center">
            <div className="inline-flex items-center justify-center w-16 h-16 bg-green-100 rounded-full mb-2">
              <span className="text-3xl">✉️</span>
            </div>
            <h3 className="text-lg font-semibold text-gray-900">Kiểm tra hộp thư</h3>
            <p className="text-gray-600 text-sm">
              Chúng tôi đã gửi email đến <strong>{email}</strong> với liên kết đặt lại mật khẩu.
              Vui lòng kiểm tra hộp thư (và thư mục spam).
            </p>
            <div className="pt-2 space-y-3">
              <button
                onClick={() => { setSent(false); setEmail('') }}
                className="w-full py-2.5 px-4 bg-gray-100 hover:bg-gray-200 text-gray-700 font-medium rounded-xl transition"
              >
                Gửi lại với email khác
              </button>
              <a
                href="/login"
                className="block w-full py-2.5 px-4 text-blue-600 hover:text-blue-800 font-medium text-center"
              >
                ← Quay lại đăng nhập
              </a>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="bg-white shadow-xl rounded-2xl p-8 space-y-5">
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

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3 px-4 bg-blue-600 hover:bg-blue-700 text-white font-semibold rounded-xl disabled:opacity-50 transition duration-200 shadow-lg shadow-blue-200"
            >
              {loading ? 'Đang gửi...' : 'Gửi liên kết khôi phục'}
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
