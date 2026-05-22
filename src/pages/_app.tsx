import '../styles/globals.css';
import type { AppProps } from 'next/app';
import Head from 'next/head';
import { useRouter } from 'next/router';
import { AuthProvider } from '../contexts/AuthContext';
import { BranchProvider } from '../contexts/BranchContext';
import { ConfirmProvider } from '../components/ui/confirm-dialog';
import Header from '../components/Header';
import Footer from '../components/Footer';
import MobileBottomNav from '../components/MobileBottomNav';
import { FooterProvider } from '../contexts/FooterContext';
import { PageTabsProvider } from '../contexts/PageTabsContext';
import { initializeApiAuthHeaders } from '../lib/apiAuthHeaders';
import { Toaster } from 'react-hot-toast';

// Register auth interceptors at module level (before any component effects run)
initializeApiAuthHeaders();

const noHeaderPages = ['/login', '/register'];
type MobileHeaderThemeKey =
  | 'overview'
  | 'schedule'
  | 'prescriptions'
  | 'inventory'
  | 'reporting'
  | 'crm'
  | 'operations'
  | 'settings'
  | 'platform';

const mobileHeaderThemes: Record<MobileHeaderThemeKey, { container: string; chip: string }> = {
  overview: {
    container: 'border-[#1565C0] bg-gradient-to-r from-[#1f78d1] via-[#2d80d7] to-[#1f6cc0]',
    chip: 'bg-white/15',
  },
  schedule: {
    container: 'border-[#0b7285] bg-gradient-to-r from-[#0e7490] via-[#0891b2] to-[#0284c7]',
    chip: 'bg-white/15',
  },
  prescriptions: {
    container: 'border-[#1e40af] bg-gradient-to-r from-[#1d4ed8] via-[#2563eb] to-[#3b82f6]',
    chip: 'bg-white/15',
  },
  inventory: {
    container: 'border-[#166534] bg-gradient-to-r from-[#15803d] via-[#16a34a] to-[#22c55e]',
    chip: 'bg-white/15',
  },
  reporting: {
    container: 'border-[#9a3412] bg-gradient-to-r from-[#b45309] via-[#d97706] to-[#ea580c]',
    chip: 'bg-white/15',
  },
  crm: {
    container: 'border-[#9f1239] bg-gradient-to-r from-[#be123c] via-[#e11d48] to-[#f43f5e]',
    chip: 'bg-white/15',
  },
  operations: {
    container: 'border-[#0f766e] bg-gradient-to-r from-[#0f766e] via-[#0d9488] to-[#14b8a6]',
    chip: 'bg-white/15',
  },
  settings: {
    container: 'border-[#334155] bg-gradient-to-r from-[#334155] via-[#475569] to-[#64748b]',
    chip: 'bg-white/15',
  },
  platform: {
    container: 'border-[#991b1b] bg-gradient-to-r from-[#b91c1c] via-[#dc2626] to-[#ef4444]',
    chip: 'bg-white/15',
  },
};

type MobileHeaderConfig = {
  title: string;
  subtitle: string;
  groupLabel: string;
  theme: MobileHeaderThemeKey;
};

const mobileHeaderByPath: Array<{ match: (pathname: string) => boolean; config: MobileHeaderConfig }> = [
  {
    match: (p) => p === '/',
    config: { title: 'Trang chủ', subtitle: 'Tổng quan hoạt động hôm nay', groupLabel: 'Tổng quan', theme: 'overview' },
  },
  {
    match: (p) => p.startsWith('/lich-hen'),
    config: { title: 'Lịch hẹn', subtitle: 'Theo dõi lịch khám và nhắc hẹn', groupLabel: 'Lịch khám', theme: 'schedule' },
  },
  {
    match: (p) => p.startsWith('/cho-kham'),
    config: { title: 'Chờ khám', subtitle: 'Sắp xếp bệnh nhân theo lượt', groupLabel: 'Lịch khám', theme: 'schedule' },
  },
  {
    match: (p) => p.startsWith('/don-thuoc-mau'),
    config: { title: 'Đơn thuốc mẫu', subtitle: 'Mẫu kê đơn dùng nhanh', groupLabel: 'Kê đơn', theme: 'prescriptions' },
  },
  {
    match: (p) => p.startsWith('/don-thuoc'),
    config: { title: 'Đơn thuốc', subtitle: 'Quản lý đơn thuốc đã kê', groupLabel: 'Kê đơn', theme: 'prescriptions' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-kho-thuoc'),
    config: { title: 'Kho thuốc', subtitle: 'Theo dõi tồn kho và nhập xuất', groupLabel: 'Kho hàng', theme: 'inventory' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-kho'),
    config: { title: 'Kho kính', subtitle: 'Theo dõi tồn kho kính và tròng', groupLabel: 'Kho hàng', theme: 'inventory' },
  },
  {
    match: (p) => p.startsWith('/thuoc'),
    config: { title: 'Thuốc', subtitle: 'Danh sách và thông tin thuốc', groupLabel: 'Kho hàng', theme: 'inventory' },
  },
  {
    match: (p) => p.startsWith('/bao-cao-super'),
    config: { title: 'Báo cáo Pro', subtitle: 'Phân tích nâng cao', groupLabel: 'Báo cáo', theme: 'reporting' },
  },
  {
    match: (p) => p.startsWith('/bao-cao-chuoi'),
    config: { title: 'Báo cáo chuỗi', subtitle: 'Tổng hợp theo hệ thống chi nhánh', groupLabel: 'Báo cáo', theme: 'reporting' },
  },
  {
    match: (p) => p.startsWith('/bao-cao'),
    config: { title: 'Báo cáo', subtitle: 'Số liệu kinh doanh và vận hành', groupLabel: 'Báo cáo', theme: 'reporting' },
  },
  {
    match: (p) => p.startsWith('/cham-soc-khach-hang'),
    config: { title: 'Chăm sóc KH', subtitle: 'Quản lý chăm sóc khách hàng', groupLabel: 'CRM', theme: 'crm' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-ghi-chu-khach-hang'),
    config: { title: 'Việc cần làm KH', subtitle: 'Theo dõi công việc chăm sóc', groupLabel: 'CRM', theme: 'crm' },
  },
  {
    match: (p) => p.startsWith('/tra-cuu-khach-hang'),
    config: { title: 'Tra cứu khách hàng', subtitle: 'Tìm khách hàng toàn hệ thống', groupLabel: 'CRM', theme: 'crm' },
  },
  {
    match: (p) => p.startsWith('/nhac-viec'),
    config: { title: 'Nhắc việc nội bộ', subtitle: 'Lịch việc và công việc trong ngày', groupLabel: 'Nội bộ', theme: 'operations' },
  },
  {
    match: (p) => p.startsWith('/dieu-chuyen-kho'),
    config: { title: 'Điều chuyển kho', subtitle: 'Chuyển hàng giữa chi nhánh', groupLabel: 'Nội bộ', theme: 'operations' },
  },
  {
    match: (p) => p.startsWith('/thong-bao'),
    config: { title: 'Thông báo', subtitle: 'Cập nhật hoạt động mới', groupLabel: 'Nội bộ', theme: 'operations' },
  },
  {
    match: (p) => p.startsWith('/tin-nhan'),
    config: { title: 'Tin nhắn', subtitle: 'Trao đổi nội bộ và khách hàng', groupLabel: 'Nội bộ', theme: 'operations' },
  },
  {
    match: (p) => p.startsWith('/danh-muc'),
    config: { title: 'Danh mục', subtitle: 'Cấu hình dữ liệu danh mục', groupLabel: 'Thiết lập', theme: 'settings' },
  },
  {
    match: (p) => p.startsWith('/cau-hinh-in'),
    config: { title: 'Cấu hình in', subtitle: 'Thiết lập máy in và mẫu in', groupLabel: 'Thiết lập', theme: 'settings' },
  },
  {
    match: (p) => p.startsWith('/tem-kinh'),
    config: { title: 'In tem kính', subtitle: 'Thiết kế và in tem từ danh mục gọng', groupLabel: 'Thiết lập', theme: 'settings' },
  },
  {
    match: (p) => p.startsWith('/cai-dat-nhan-tin'),
    config: { title: 'Nhắn tin tự động', subtitle: 'Thiết lập kịch bản gửi tin', groupLabel: 'Thiết lập', theme: 'settings' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-phong-kham'),
    config: { title: 'Phòng khám', subtitle: 'Cài đặt thông tin phòng khám', groupLabel: 'Thiết lập', theme: 'settings' },
  },
  {
    match: (p) => p.startsWith('/huong-dan'),
    config: { title: 'Hướng dẫn', subtitle: 'Tài liệu và hướng dẫn sử dụng', groupLabel: 'Thiết lập', theme: 'settings' },
  },
  {
    match: (p) => p.startsWith('/cai-dat'),
    config: { title: 'Cài đặt', subtitle: 'Tuỳ chỉnh hệ thống', groupLabel: 'Thiết lập', theme: 'settings' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-chuoi'),
    config: { title: 'Quản lý chuỗi', subtitle: 'Quản trị hệ thống đa chi nhánh', groupLabel: 'Quản trị', theme: 'platform' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-nguoi-dung'),
    config: { title: 'Người dùng', subtitle: 'Phân quyền và tài khoản', groupLabel: 'Quản trị', theme: 'platform' },
  },
  {
    match: (p) => p.startsWith('/quan-ly-vai-tro'),
    config: { title: 'Vai trò', subtitle: 'Cấu hình vai trò và quyền hạn', groupLabel: 'Quản trị', theme: 'platform' },
  },
  {
    match: (p) => p.startsWith('/billing'),
    config: { title: 'Gói dịch vụ', subtitle: 'Quản lý gói và thanh toán', groupLabel: 'Quản trị', theme: 'platform' },
  },
  {
    match: (p) => p.startsWith('/admin'),
    config: { title: 'Quản trị nền tảng', subtitle: 'Quản lý hệ thống trung tâm', groupLabel: 'Quản trị', theme: 'platform' },
  },
];

const customMobileHeaderPaths = ['/benh-nhan', '/don-kinh', '/ke-don'];

function resolveMobileHeader(pathname: string): MobileHeaderConfig {
  const found = mobileHeaderByPath.find((item) => item.match(pathname));
  if (found) return found.config;

  const clean = pathname.replace(/^\//, '').replace(/-/g, ' ').trim();
  if (!clean) {
    return {
      title: 'Màn hình',
      subtitle: 'Thông tin trang',
      groupLabel: 'Tổng quan',
      theme: 'overview',
    };
  }

  const normalizedTitle = clean
    .split(' ')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');

  return {
    title: normalizedTitle,
    subtitle: 'Thông tin theo trang hiện tại',
    groupLabel: 'Tổng quan',
    theme: 'overview',
  };
}

export default function App({ Component, pageProps }: AppProps) {
  const router = useRouter();
  const showHeader = !noHeaderPages.includes(router.pathname);
  const mobileThemeColor = router.pathname === '/benh-nhan'
    ? '#3a7efb'
    : router.pathname === '/lich-hen'
      ? '#1976D2'
      : router.pathname === '/don-kinh'
        ? '#1f6cc0'
      : '#065f46';
  const hasCustomMobileHeader = customMobileHeaderPaths.some((path) => router.pathname.startsWith(path));
  const shouldShowMobileHeader = showHeader && !hasCustomMobileHeader;
  const mobileHeader = resolveMobileHeader(router.pathname);
  const mobileHeaderTheme = mobileHeaderThemes[mobileHeader.theme];
  const mobileTodayLabel = new Date().toLocaleDateString('vi-VN', {
    weekday: 'short',
    day: '2-digit',
    month: '2-digit',
  });
  const mainClass = showHeader
    ? 'pb-8 md:pt-10'
    : '';
  return (
    <AuthProvider>
      <BranchProvider>
      <FooterProvider>
      <PageTabsProvider>
      <ConfirmProvider>
      <div className="min-h-screen bg-[#f6faf7]">
        <Head>
          {/* Viewport optimised for mobile / PWA standalone (notch-safe) */}
          <meta
            name="viewport"
            content="width=device-width, initial-scale=1, viewport-fit=cover, maximum-scale=5"
          />

          {/* App identity */}
          <meta name="application-name" content="Optigo" />
          <meta name="description" content="Optigo - Phần mềm quản lý phòng khám mắt & cửa hàng kính." />

          {/* Favicon: con mắt màu xanh + PNG fallbacks */}
          <link rel="icon" href="/eye-blue.svg?v=2" type="image/svg+xml" />
          <link rel="icon" type="image/png" sizes="32x32" href="/icons/favicon-32.png" />
          <link rel="icon" type="image/png" sizes="16x16" href="/icons/favicon-16.png" />

          {/* Web App Manifest */}
          <link rel="manifest" href="/manifest.webmanifest" />

          {/* Android / Chrome theme */}
          <meta name="theme-color" content={mobileThemeColor} />
          <meta name="mobile-web-app-capable" content="yes" />

          {/* iOS / Safari standalone */}
          <meta name="apple-mobile-web-app-capable" content="yes" />
          <meta name="apple-mobile-web-app-status-bar-style" content="default" />
          <meta name="apple-mobile-web-app-title" content="Optigo" />
          <link rel="apple-touch-icon" href="/icons/apple-touch-icon.png" />
          <link rel="apple-touch-icon" sizes="180x180" href="/icons/apple-touch-icon.png" />

          {/* Windows tiles */}
          <meta name="msapplication-TileColor" content="#0ea5e9" />
          <meta name="msapplication-TileImage" content="/icons/icon-192.png" />

          {/* Format detection (prevent iOS auto-linking phone numbers) */}
          <meta name="format-detection" content="telephone=no" />
        </Head>
        {showHeader && (
          <div className="hidden md:block">
            <Header />
          </div>
        )}
        {shouldShowMobileHeader && (
          <div className={`sticky top-0 z-30 border-b text-white shadow-sm md:hidden ${mobileHeaderTheme.container}`}>
            <div className="px-4 pb-2 pt-2.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="truncate text-xl font-extrabold leading-tight tracking-tight text-white">{mobileHeader.title}</h1>
                  <p className="mt-0.5 text-xs text-white/85">{mobileHeader.subtitle}</p>
                </div>
                <span className="text-[11px] text-white/90">{mobileTodayLabel}</span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 ${mobileHeaderTheme.chip}`}>● {mobileHeader.groupLabel}</span>
                <span className={`rounded-full px-2 py-0.5 ${mobileHeaderTheme.chip}`}>• {mobileHeader.title}</span>
              </div>
            </div>
          </div>
        )}
        <main className={mainClass}>
          <Component {...pageProps} />
        </main>
        {showHeader && <Footer />}
        {showHeader && <MobileBottomNav />}
        <Toaster
          position="top-center"
          toastOptions={{
            duration: 3000,
            style: {
              borderRadius: '12px',
              padding: '12px 20px',
              fontSize: '14px',
              fontWeight: '500',
              boxShadow: '0 8px 30px rgba(0,0,0,0.12)',
              border: '1px solid rgba(0,0,0,0.05)',
              maxWidth: '420px',
            },
            success: {
              style: {
                background: '#eff6ff',
                color: '#1e3a5f',
                border: '1px solid #bfdbfe',
              },
              iconTheme: {
                primary: '#2563eb',
                secondary: '#eff6ff',
              },
            },
            error: {
              style: {
                background: '#fef2f2',
                color: '#991b1b',
                border: '1px solid #fecaca',
              },
              iconTheme: {
                primary: '#dc2626',
                secondary: '#fef2f2',
              },
            },
          }}
        />
      </div>
      </ConfirmProvider>
      </PageTabsProvider>
      </FooterProvider>
      </BranchProvider>
    </AuthProvider>
  );
}