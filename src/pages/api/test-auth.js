/**
 * Endpoint test đã bị vô hiệu hóa vì lý do bảo mật.
 * Không cho phép tạo user / đăng nhập qua API công khai.
 */
export default function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).json({
    success: false,
    message: 'Not found',
  });
}
