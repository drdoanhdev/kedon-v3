export type PageMeta = {
  title: string;
  subtitle?: string;
  documentTitle?: string;
};

type PageMetaEntry = {
  match: (pathname: string) => boolean;
  meta: PageMeta;
};

/** Paths that render their own mobile header (skip shared sticky bar). */
export const customMobileHeaderPaths = ['/benh-nhan', '/don-kinh', '/ke-don'];

const pageMetaByPath: PageMetaEntry[] = [
  {
    match: (p) => p === '/',
    meta: { title: 'Trang chủ', subtitle: 'Tổng quan hoạt động hôm nay' },
  },
  {
    match: (p) => p.startsWith('/lich-hen'),
    meta: { title: 'Lịch hẹn', subtitle: 'Theo dõi lịch khám và nhắc hẹn' },
  },
  {
    match: (p) => p.startsWith('/don-thuoc-mau'),
    meta: { title: 'Đơn thuốc mẫu', subtitle: 'Mẫu kê đơn dùng nhanh' },
  },
  {
    match: (p) => p.startsWith('/don-thuoc'),
    meta: { title: 'Đơn thuốc', subtitle: 'Quản lý đơn thuốc đã kê' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-kho-thuoc'),
    meta: { title: 'Kho thuốc', subtitle: 'Theo dõi tồn kho và nhập xuất' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-kho-gong'),
    meta: { title: 'Kho gọng', subtitle: 'Theo dõi tồn kho và nhập gọng' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-kho'),
    meta: { title: 'Kho tròng', subtitle: 'Theo dõi tồn kho tròng và đặt hàng' },
  },
  {
    match: (p) => p.startsWith('/thuoc'),
    meta: { title: 'Thuốc', subtitle: 'Danh sách và thông tin thuốc' },
  },
  {
    match: (p) => p.startsWith('/bao-cao-super'),
    meta: { title: 'Báo cáo Pro', subtitle: 'Phân tích nâng cao' },
  },
  {
    match: (p) => p.startsWith('/bao-cao-chuoi'),
    meta: { title: 'Báo cáo chuỗi', subtitle: 'Tổng hợp theo hệ thống chi nhánh' },
  },
  {
    match: (p) => p.startsWith('/bao-cao'),
    meta: { title: 'Báo cáo', subtitle: 'Số liệu kinh doanh và vận hành' },
  },
  {
    match: (p) => p.startsWith('/cham-soc-khach-hang'),
    meta: { title: 'Chăm sóc KH', subtitle: 'Quản lý chăm sóc khách hàng' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-ghi-chu-khach-hang'),
    meta: { title: 'Việc cần làm KH', subtitle: 'Theo dõi công việc chăm sóc' },
  },
  {
    match: (p) => p.startsWith('/tra-cuu-khach-hang'),
    meta: { title: 'Tra cứu khách hàng', subtitle: 'Tìm khách hàng toàn hệ thống' },
  },
  {
    match: (p) => p.startsWith('/nhac-viec'),
    meta: { title: 'Nhắc việc nội bộ', subtitle: 'Lịch việc và công việc trong ngày' },
  },
  {
    match: (p) => p.startsWith('/dieu-chuyen-kho'),
    meta: { title: 'Điều chuyển kho', subtitle: 'Chuyển hàng giữa chi nhánh' },
  },
  {
    match: (p) => p.startsWith('/thong-bao'),
    meta: { title: 'Thông báo', subtitle: 'Cập nhật hoạt động mới' },
  },
  {
    match: (p) => p.startsWith('/tin-nhan'),
    meta: { title: 'Tin nhắn', subtitle: 'Trao đổi nội bộ và hỗ trợ' },
  },
  {
    match: (p) => p.startsWith('/danh-muc'),
    meta: { title: 'Danh mục', subtitle: 'Cấu hình dữ liệu danh mục' },
  },
  {
    match: (p) => p.startsWith('/cau-hinh-in'),
    meta: { title: 'Cấu hình in', subtitle: 'Thiết lập máy in và mẫu in' },
  },
  {
    match: (p) => p.startsWith('/tem-kinh'),
    meta: { title: 'In tem kính', subtitle: 'Thiết kế và in tem từ danh mục gọng' },
  },
  {
    match: (p) => p.startsWith('/cai-dat-nhan-tin'),
    meta: { title: 'Nhắn tin tự động', subtitle: 'Thiết lập kịch bản gửi tin' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-phong-kham'),
    meta: { title: 'Phòng khám', subtitle: 'Cài đặt thông tin phòng khám' },
  },
  {
    match: (p) => p.startsWith('/huong-dan'),
    meta: { title: 'Hướng dẫn', subtitle: 'Tài liệu và hướng dẫn sử dụng' },
  },
  {
    match: (p) => p.startsWith('/tinh-nang'),
    meta: { title: 'Tính năng', subtitle: 'Giới thiệu đầy đủ tính năng phần mềm' },
  },
  {
    match: (p) => p.startsWith('/cai-dat'),
    meta: { title: 'Cài đặt', subtitle: 'Tuỳ chỉnh hệ thống' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-chuoi'),
    meta: { title: 'Quản lý chuỗi', subtitle: 'Quản trị hệ thống đa chi nhánh' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-nguoi-dung'),
    meta: { title: 'Người dùng', subtitle: 'Phân quyền và tài khoản' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-vai-tro'),
    meta: { title: 'Vai trò', subtitle: 'Cấu hình vai trò và quyền hạn' },
  },
  {
    match: (p) => p.startsWith('/billing'),
    meta: { title: 'Gói dịch vụ', subtitle: 'Quản lý gói và thanh toán' },
  },
  {
    match: (p) => p.startsWith('/admin'),
    meta: { title: 'Quản trị nền tảng', subtitle: 'Quản lý hệ thống trung tâm' },
  },
  {
    match: (p) => p.startsWith('/tien-luong-ksct'),
    meta: { title: 'Tiên lượng KSCT', subtitle: 'Dự báo tiến triển cận thị' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-kinh'),
    meta: { title: 'Quản lý kính', subtitle: 'Danh mục và cấu hình kính' },
  },
  {
    match: (p) => p.startsWith('/loc-trung'),
    meta: { title: 'Lọc trùng', subtitle: 'Gộp hồ sơ bệnh nhân trùng' },
  },
];

export function resolvePageMeta(pathname: string): PageMeta {
  const found = pageMetaByPath.find((item) => item.match(pathname));
  if (found) return found.meta;

  const clean = pathname.replace(/^\//, '').replace(/-/g, ' ').trim();
  if (!clean) {
    return { title: 'Màn hình' };
  }

  const normalizedTitle = clean
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return { title: normalizedTitle };
}

export function hasCustomMobileHeader(pathname: string): boolean {
  return customMobileHeaderPaths.some((path) => pathname.startsWith(path));
}
