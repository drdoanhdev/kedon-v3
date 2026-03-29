import { useEffect, useState, useCallback } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { isOwnerRole } from '../lib/tenantRoles';
import Link from 'next/link';

export default function HuongDan() {
  const { currentRole } = useAuth();
  const canEdit = isOwnerRole(currentRole);

  const [title, setTitle] = useState('Hướng dẫn sử dụng');
  const [content, setContent] = useState('');
  const [isEditing, setIsEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);

  // Tải nội dung ghi chú
  const fetchNote = useCallback(async () => {
    try {
      const res = await axios.get('/api/ghi-chu?slug=huong-dan');
      setTitle(res.data.title || 'Hướng dẫn sử dụng');
      setContent(res.data.content || '');
      setLastUpdated(res.data.updated_at || null);
    } catch {
      // Nếu bảng chưa tạo → hiển thị nội dung mặc định
      setContent(DEFAULT_CONTENT);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNote();
  }, [fetchNote]);

  // Lưu ghi chú
  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await axios.put('/api/ghi-chu', {
        slug: 'huong-dan',
        title,
        content,
      });
      setLastUpdated(res.data.updated_at);
      setIsEditing(false);
      toast.success('Đã lưu ghi chú');
    } catch (error: any) {
      const msg = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : 'Có lỗi xảy ra';
      toast.error(msg);
    } finally {
      setSaving(false);
    }
  };

  // Phím tắt Ctrl+S để lưu
  useEffect(() => {
    if (!isEditing) return;
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        handleSave();
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [isEditing, title, content]);

  return (
    <ProtectedRoute>
      <div className="max-w-4xl mx-auto px-4 py-6">

        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-3">
            <Link href="/" className="text-blue-600 hover:text-blue-800 text-sm">
              ← Trang chủ
            </Link>
            <h1 className="text-xl font-bold text-gray-800">📖 {title}</h1>
          </div>
          <div className="flex items-center gap-2">
            {canEdit && !isEditing && (
              <button
                onClick={() => setIsEditing(true)}
                className="px-4 py-2 bg-blue-600 text-white text-sm font-medium rounded-lg hover:bg-blue-700 transition-colors"
              >
                ✏️ Chỉnh sửa
              </button>
            )}
            {canEdit && isEditing && (
              <>
                <button
                  onClick={() => { setIsEditing(false); fetchNote(); }}
                  className="px-4 py-2 bg-gray-200 text-gray-700 text-sm font-medium rounded-lg hover:bg-gray-300 transition-colors"
                >
                  Hủy
                </button>
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 disabled:opacity-50 transition-colors"
                >
                  {saving ? 'Đang lưu...' : '💾 Lưu (Ctrl+S)'}
                </button>
              </>
            )}
          </div>
        </div>

        {/* Thông tin cập nhật */}
        {lastUpdated && (
          <p className="text-xs text-gray-400 mb-4">
            Cập nhật lần cuối: {new Date(lastUpdated).toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh' })}
          </p>
        )}

        {/* Nội dung */}
        {loading ? (
          <div className="text-center py-12 text-gray-400">Đang tải...</div>
        ) : isEditing ? (
          <div className="space-y-3">
            {/* Tiêu đề */}
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full px-4 py-2 text-lg font-bold border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-400"
              placeholder="Tiêu đề trang"
            />
            {/* Editor */}
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={25}
              className="w-full px-4 py-3 border border-gray-300 rounded-lg font-mono text-sm leading-relaxed focus:outline-none focus:ring-2 focus:ring-blue-400 resize-y"
              placeholder="Nhập nội dung hướng dẫn tại đây..."
            />
            <p className="text-xs text-gray-400">
              💡 Mẹo: Dùng dòng trống để phân đoạn. Dùng "---" để tạo đường kẻ ngang. Dùng "## " đầu dòng để tạo tiêu đề mục.
            </p>
          </div>
        ) : (
          <div className="bg-white rounded-xl shadow-sm border border-gray-100 p-6">
            {content ? (
              <div className="prose prose-sm max-w-none">
                {content.split('\n').map((line, i) => {
                  // Tiêu đề mục
                  if (line.startsWith('## ')) {
                    return <h2 key={i} className="text-lg font-bold text-blue-800 mt-6 mb-2 border-b border-gray-100 pb-1">{line.slice(3)}</h2>;
                  }
                  if (line.startsWith('### ')) {
                    return <h3 key={i} className="text-base font-semibold text-gray-800 mt-4 mb-1">{line.slice(4)}</h3>;
                  }
                  // Đường kẻ ngang
                  if (line.trim() === '---') {
                    return <hr key={i} className="my-4 border-gray-200" />;
                  }
                  // Dòng trống → khoảng cách
                  if (line.trim() === '') {
                    return <div key={i} className="h-2" />;
                  }
                  // Bullet list
                  if (line.trimStart().startsWith('- ') || line.trimStart().startsWith('• ')) {
                    const text = line.trimStart().slice(2);
                    return <div key={i} className="flex items-start gap-2 ml-2"><span className="text-blue-400 mt-0.5">•</span><span className="text-gray-700 text-sm leading-relaxed">{text}</span></div>;
                  }
                  // Đoạn thường
                  return <p key={i} className="text-gray-700 text-sm leading-relaxed">{line}</p>;
                })}
              </div>
            ) : (
              <div className="text-center py-12">
                <p className="text-gray-400 text-lg mb-2">📝 Chưa có nội dung</p>
                {canEdit && (
                  <button
                    onClick={() => { setContent(DEFAULT_CONTENT); setIsEditing(true); }}
                    className="text-blue-600 hover:text-blue-800 text-sm font-medium"
                  >
                    Nhấn để bắt đầu soạn nội dung mẫu
                  </button>
                )}
              </div>
            )}
          </div>
        )}

        {/* Ghi chú phân quyền */}
        {!canEdit && (
          <p className="text-xs text-gray-400 mt-4 text-center">
            Chỉ chủ phòng khám hoặc quản trị viên mới có quyền chỉnh sửa trang này.
          </p>
        )}
      </div>
    </ProtectedRoute>
  );
}

// Nội dung mẫu mặc định
const DEFAULT_CONTENT = `## Hướng dẫn sử dụng hệ thống kê đơn

Chào mừng bạn đến với hệ thống quản lý phòng khám mắt!

---

## Phân quyền tài khoản

- Chủ phòng khám (owner): Toàn quyền quản lý, xem giá nhập, sửa hướng dẫn
- Quản trị viên (admin): Tương tự chủ phòng khám
- Bác sĩ (doctor): Kê đơn, xem bệnh nhân, không xem giá nhập
- Nhân viên (staff): Hỗ trợ tiếp nhận, không xem giá nhập

---

## Kê đơn kính

### Bước 1: Chọn bệnh nhân
Từ danh sách bệnh nhân, nhấn nút "Kê đơn kính" để mở trang kê đơn.

### Bước 2: Nhập thông tin thị lực
Nhập thị lực không kính, kính cũ, kính mới cho cả mắt phải (MP) và mắt trái (MT).

### Bước 3: Chọn sản phẩm
- Chọn hãng tròng → giá bán tự động điền
- Chọn gọng kính → giá bán tự động điền

### Bước 4: Thanh toán
Nhập giá tròng, giá gọng, số tiền khách đưa. Hệ thống tự tính tiền trả lại và ghi nợ nếu cần.

### Bước 5: Lưu đơn
Nhấn "Lưu đơn" hoặc Ctrl+S.

---

## Phím tắt

- Ctrl + S: Lưu đơn
- Ctrl + N: Tạo đơn mới
- Enter: Chuyển ô nhập tiếp theo
- Escape: Hủy / Reset form

---

## Ghi chú thêm

Nội dung này có thể được chỉnh sửa bởi chủ phòng khám hoặc quản trị viên.
Nhấn nút "Chỉnh sửa" ở góc phải trên để cập nhật.`;
