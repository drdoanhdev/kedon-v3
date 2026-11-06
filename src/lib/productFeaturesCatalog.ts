/**
 * Catalog tính năng sản phẩm (Optigo) — nguồn sự thật cho trang /tinh-nang.
 *
 * Khi thêm/sửa/gỡ tính năng user-facing: cập nhật PRODUCT_FEATURE_GROUPS tại đây.
 * Xem .cursor/rules/product-features-catalog.mdc
 */

import type { FeatureKey, PlanKey } from './featureConfig';
import { FEATURE_LABELS, getMinPlanForFeature, PLAN_LABELS } from './featureConfig';

export type ProductFeatureItem = {
  id: string;
  name: string;
  summary: string;
  details: string[];
  href?: string;
  featureKey?: FeatureKey;
  /** Gói tối thiểu; nếu bỏ trống và có featureKey thì lấy từ featureConfig */
  minPlan?: PlanKey;
  /** Ghi chú thêm (vd. chỉ superadmin) */
  note?: string;
};

export type ProductFeatureGroup = {
  id: string;
  title: string;
  description: string;
  items: ProductFeatureItem[];
};

export const PRODUCT_FEATURE_GROUPS: ProductFeatureGroup[] = [
  {
    id: 'overview',
    title: 'Tổng quan & truy cập',
    description: 'Đăng nhập, dashboard và các trang hỗ trợ sử dụng hàng ngày.',
    items: [
      {
        id: 'dashboard',
        name: 'Trang chủ',
        summary: 'Tổng quan hoạt động phòng khám trong ngày.',
        details: [
          'Thống kê hôm nay: bệnh nhân, đơn thuốc/kính, doanh thu nhanh',
          'Lịch hẹn sắp tới',
          'Cảnh báo tồn kho, CRM cần liên hệ',
          'Banner nhắc trial / nâng cấp gói khi áp dụng',
        ],
        href: '/',
      },
      {
        id: 'login-register',
        name: 'Đăng nhập & đăng ký',
        summary: 'Xác thực tài khoản và tạo phòng khám mới.',
        details: [
          'Đăng nhập qua Supabase Auth',
          'Đăng ký tenant + tài khoản chủ phòng khám',
          'Quên / đặt lại mật khẩu',
        ],
        href: '/login',
      },
      {
        id: 'account-settings',
        name: 'Cài đặt tài khoản',
        summary: 'Tuỳ chỉnh thông tin đăng nhập cá nhân.',
        details: ['Đổi mật khẩu và thông tin tài khoản người dùng'],
        href: '/cai-dat',
      },
      {
        id: 'huong-dan',
        name: 'Hướng dẫn sử dụng',
        summary: 'Tài liệu hướng dẫn; chủ phòng khám có thể chỉnh sửa nội dung.',
        details: [
          'Xem hướng dẫn theo slug ghi chú',
          'Owner có thể sửa và lưu nội dung hướng dẫn',
        ],
        href: '/huong-dan',
      },
      {
        id: 'offline-pwa',
        name: 'Chế độ offline (PWA)',
        summary: 'Trang dự phòng khi mất kết nối mạng.',
        details: ['Fallback offline cho ứng dụng Progressive Web App'],
        href: '/offline',
      },
    ],
  },
  {
    id: 'patients',
    title: 'Bệnh nhân & gia đình',
    description: 'Hồ sơ bệnh nhân, nhóm gia đình, gộp trùng và tra cứu liên chi nhánh.',
    items: [
      {
        id: 'patient-management',
        name: FEATURE_LABELS.patient_management,
        summary: 'CRUD bệnh nhân và xem lịch sử khám / đơn.',
        details: [
          'Thêm, sửa, tìm kiếm bệnh nhân (tên, SĐT, mã)',
          'Xem lịch sử đơn thuốc, đơn kính, lịch hẹn',
          'Gắn nhóm gia đình và ghi chú bệnh nhân',
          'Hỗ trợ giới tính và thông tin nhân khẩu cơ bản',
        ],
        href: '/benh-nhan',
        featureKey: 'patient_management',
      },
      {
        id: 'family-groups',
        name: 'Gia đình bệnh nhân',
        summary: 'Nhóm thành viên trong cùng hộ gia đình.',
        details: [
          'Tạo / gắn thành viên vào nhóm gia đình',
          'Dùng khi kê đơn để chọn nhanh người thân',
        ],
        href: '/benh-nhan',
        featureKey: 'patient_management',
      },
      {
        id: 'dedupe-patients',
        name: 'Lọc trùng bệnh nhân',
        summary: 'Phát hiện và gộp hồ sơ trùng (tên / SĐT).',
        details: [
          'Gợi ý cặp trùng dựa trên tên và số điện thoại',
          'Merge hồ sơ để giữ một bản ghi chuẩn',
        ],
        href: '/loc-trung',
        featureKey: 'patient_management',
      },
      {
        id: 'cross-branch-lookup',
        name: 'Tra cứu khách hàng liên chi nhánh',
        summary: 'Tìm khách trên toàn chuỗi và chuyển chi nhánh.',
        details: [
          'Tìm kiếm bệnh nhân đa chi nhánh',
          'Chuyển hồ sơ / ngữ cảnh sang chi nhánh khác khi cần',
          'Tab Lịch sử chuỗi trên hồ sơ bệnh nhân (đơn + số đo mọi CN)',
        ],
        href: '/tra-cuu-khach-hang',
        featureKey: 'multi_branch',
      },
      {
        id: 'global-patient-search',
        name: 'Tìm kiếm bệnh nhân toàn cục',
        summary: 'Ô tìm nhanh trên Header để mở hồ sơ bệnh nhân.',
        details: ['Tìm nhanh từ thanh điều hướng mà không cần vào trang Bệnh nhân'],
        featureKey: 'patient_management',
      },
      {
        id: 'fab-activity-hub',
        name: 'Tìm kiếm nhanh K & hoạt động gần đây',
        summary: 'Phím K / FAB tìm khách, timeline hoạt động đồng bộ theo chi nhánh.',
        details: [
          'Mở tìm kiếm nhanh bằng phím K hoặc nút FAB',
          'Timeline hoạt động gần đây nhóm theo ngày (Hôm nay / Hôm qua / ngày)',
          'Đồng bộ nền giữa thiết bị trong cùng chi nhánh, lưu khoảng 3 ngày',
          'Lọc theo tìm kiếm, lịch sử, kê đơn, đang dang dở',
        ],
        featureKey: 'patient_management',
      },
    ],
  },
  {
    id: 'appointments',
    title: 'Lịch hẹn',
    description: 'Đặt và theo dõi lịch tái khám.',
    items: [
      {
        id: 'appointments',
        name: FEATURE_LABELS.appointments,
        summary: 'Đặt, sửa, hủy lịch tái khám và theo dõi trạng thái.',
        details: [
          'Tạo lịch hẹn theo bệnh nhân và thời gian',
          'Trạng thái: chờ / đã đến / hủy / quá hạn',
          'Liên kết nhắc hẹn qua nhắn tin tự động (nếu bật)',
        ],
        href: '/lich-hen',
        featureKey: 'appointments',
      },
    ],
  },
  {
    id: 'prescription-medicine',
    title: 'Kê đơn thuốc',
    description: 'Soạn đơn thuốc, mẫu đơn, diễn tiến và in phiếu.',
    items: [
      {
        id: 'prescription-list',
        name: 'Danh sách đơn thuốc',
        summary: 'Tra cứu, lọc và mở lại đơn đã kê.',
        details: [
          'Lọc theo ngày, bệnh nhân, trạng thái',
          'Mở / sửa đơn đã lưu',
        ],
        href: '/don-thuoc',
        featureKey: 'prescription_medicine',
      },
      {
        id: 'write-prescription',
        name: FEATURE_LABELS.prescription_medicine,
        summary: 'Soạn đơn thuốc kèm diễn tiến và media.',
        details: [
          'Chọn thuốc từ danh mục / kho, liều dùng, số ngày',
          'Ghi diễn tiến bệnh, gắn gia đình',
          'Upload ảnh kèm đơn; in theo mẫu cấu hình',
        ],
        href: '/ke-don',
        featureKey: 'prescription_medicine',
      },
      {
        id: 'prescription-templates',
        name: 'Đơn thuốc mẫu',
        summary: 'Lưu mẫu kê nhanh để tái sử dụng.',
        details: [
          'CRUD mẫu đơn theo phác đồ thường dùng',
          'Áp dụng mẫu khi kê đơn mới',
        ],
        href: '/don-thuoc-mau',
        featureKey: 'prescription_medicine',
      },
    ],
  },
  {
    id: 'prescription-glasses',
    title: 'Kê đơn kính & lâm sàng',
    description: 'Đơn kính, số kính, thị lực và tiên lượng cận thị (KSCT).',
    items: [
      {
        id: 'glasses-list',
        name: 'Danh sách đơn kính',
        summary: 'Quản lý các đơn kính đã kê.',
        details: ['Tra cứu, mở và theo dõi đơn kính theo bệnh nhân / ngày'],
        href: '/don-kinh',
        featureKey: 'prescription_glasses',
      },
      {
        id: 'write-glasses',
        name: FEATURE_LABELS.prescription_glasses,
        summary: 'Soạn đơn kính đầy đủ thông số và sản phẩm.',
        details: [
          'Nhập SPH / CYL / ADD, tròng / gọng, thị lực, số kính',
          'Trừ kho hoặc đánh dấu đặt tròng khi có khách',
          'Hẹn tái khám, media ảnh, in đơn kính',
        ],
        href: '/ke-don-kinh',
        featureKey: 'prescription_glasses',
      },
      {
        id: 'ksct-forecast',
        name: 'Tiên lượng KSCT',
        summary: 'Mô phỏng tiến triển cận thị (SE / AL) và so sánh phác đồ.',
        details: [
          'Mô phỏng tiến triển theo tham số lâm sàng',
          'So sánh các phương án kiểm soát cận thị',
          'Mở theo bệnh nhân (?bn=)',
        ],
        href: '/tien-luong-ksct',
        featureKey: 'prescription_glasses',
      },
    ],
  },
  {
    id: 'inventory-lens',
    title: 'Kho tròng kính',
    description: 'Danh mục tròng, tồn theo độ, đặt hàng và lịch sử nhập.',
    items: [
      {
        id: 'lens-catalog',
        name: FEATURE_LABELS.lens_catalog,
        summary: 'Quản lý loại tròng và chính sách tồn / đặt.',
        details: [
          'Danh mục tròng: sẵn kho hoặc đặt khi có khách',
          'Thông tin NCC, giá và thuộc tính tròng',
        ],
        href: '/quan-ly-kho',
        featureKey: 'lens_catalog',
      },
      {
        id: 'lens-stock',
        name: FEATURE_LABELS.inventory_lens,
        summary: 'Tồn kho theo độ SPH/CYL/ADD và nhập xuất.',
        details: [
          'Theo dõi tồn theo từng độ',
          'Nhập kho, xuất hỏng, cảnh báo hết / sắp hết',
          'Tab tròng cần đặt và lịch sử nhập',
        ],
        href: '/quan-ly-kho',
        featureKey: 'inventory_lens',
      },
    ],
  },
  {
    id: 'inventory-frame',
    title: 'Kho gọng kính',
    description: 'Danh mục gọng, tồn kho, ảnh sản phẩm và in tem.',
    items: [
      {
        id: 'frame-catalog',
        name: FEATURE_LABELS.frame_catalog,
        summary: 'Danh mục gọng và media ảnh sản phẩm.',
        details: [
          'CRUD gọng, nhóm giá / thuộc tính',
          'Upload ảnh gọng trên catalog',
        ],
        href: '/quan-ly-kho-gong',
        featureKey: 'frame_catalog',
      },
      {
        id: 'frame-stock',
        name: 'Tồn kho gọng',
        summary: 'Tổng quan tồn, nhập xuất và lịch sử.',
        details: [
          'Tabs tổng quan / kho / lịch sử nhập',
          'Nhập xuất gọng theo chi nhánh',
        ],
        href: '/quan-ly-kho-gong',
        featureKey: 'inventory_lens',
      },
      {
        id: 'frame-labels',
        name: 'In tem kính',
        summary: 'Thiết kế và in tem từ danh mục gọng.',
        details: [
          'Designer tem trên trình duyệt',
          'In trực tiếp chất lượng cao qua Optigo Print Agent (cài 1 lần trên máy cửa hàng)',
          'In qua trình duyệt làm phương án dự phòng',
        ],
        href: '/tem-kinh',
        featureKey: 'print_config',
      },
    ],
  },
  {
    id: 'inventory-drug',
    title: 'Kho thuốc & giá',
    description: 'Danh mục thuốc, tồn, nhập hủy và gợi ý điều chỉnh giá.',
    items: [
      {
        id: 'drug-catalog',
        name: FEATURE_LABELS.drug_catalog,
        summary: 'Danh mục thuốc dùng khi kê đơn và quản kho.',
        details: ['Thông tin thuốc, đơn vị, giá bán cơ bản'],
        href: '/quan-ly-kho-thuoc',
        featureKey: 'drug_catalog',
      },
      {
        id: 'drug-stock',
        name: FEATURE_LABELS.inventory_drug,
        summary: 'Tồn kho thuốc, nhập / hủy và theo dõi giá vốn.',
        details: [
          'Tabs danh mục / tổng quan / tồn / nhập / hủy / giá',
          'Gợi ý điều chỉnh giá khi vốn tăng',
        ],
        href: '/quan-ly-kho-thuoc',
        featureKey: 'inventory_drug',
      },
    ],
  },
  {
    id: 'categories-print',
    title: 'Danh mục & cấu hình in',
    description: 'Dữ liệu dùng chung và mẫu phiếu in.',
    items: [
      {
        id: 'categories',
        name: FEATURE_LABELS.categories,
        summary: 'Danh mục phụ trợ: NCC, số kính, thị lực, đơn mẫu.',
        details: [
          'Tabs: đơn thuốc mẫu, nhà cung cấp, số kính, thị lực',
          'Dùng làm nguồn dữ liệu khi kê đơn / nhập kho',
        ],
        href: '/danh-muc',
        featureKey: 'categories',
      },
      {
        id: 'print-config',
        name: FEATURE_LABELS.print_config,
        summary: 'Cấu hình mẫu in đơn thuốc / đơn kính / phiếu.',
        details: [
          'Chỉnh bố cục và nội dung mẫu in theo phòng khám',
          'Áp dụng khi in từ màn kê đơn',
        ],
        href: '/cau-hinh-in',
        featureKey: 'print_config',
      },
    ],
  },
  {
    id: 'reports',
    title: 'Báo cáo',
    description: 'Báo cáo doanh thu, tồn kho, hiệu suất và chuỗi.',
    items: [
      {
        id: 'basic-reports',
        name: FEATURE_LABELS.basic_reports,
        summary: 'Báo cáo doanh thu và lãi cơ bản.',
        details: ['Xem doanh thu / lãi theo khoảng thời gian'],
        href: '/bao-cao',
        featureKey: 'basic_reports',
      },
      {
        id: 'advanced-reports',
        name: FEATURE_LABELS.advanced_reports,
        summary: 'Báo cáo Pro: tài chính, bệnh nhân, tồn kho, hiệu suất.',
        details: [
          'Tổng quan / tài chính / bệnh nhân / tồn kho / hiệu suất',
          'Phân tích sâu hơn báo cáo cơ bản',
        ],
        href: '/bao-cao-super',
        featureKey: 'advanced_reports',
      },
      {
        id: 'chain-reports',
        name: FEATURE_LABELS.chain_reports,
        summary: 'Báo cáo tổng hợp đa chi nhánh.',
        details: [
          'So sánh và cộng dồn số liệu giữa các chi nhánh trong chuỗi',
          'Margin ước tính, lab & tròng cần đặt',
        ],
        href: '/bao-cao-chuoi',
        featureKey: 'chain_reports',
      },
    ],
  },
  {
    id: 'crm',
    title: 'CRM & chăm sóc khách hàng',
    description: 'Chấm điểm khách, theo dõi liên hệ và việc cần làm.',
    items: [
      {
        id: 'crm-care',
        name: FEATURE_LABELS.crm,
        summary: 'Chăm sóc KH theo score A/B/C và trạng thái gọi.',
        details: [
          'Phân loại khách theo điểm chăm sóc',
          'Theo dõi trạng thái liên hệ / gọi điện',
          'Cấu hình quy tắc scoring',
        ],
        href: '/cham-soc-khach-hang',
        featureKey: 'crm',
      },
      {
        id: 'customer-todos',
        name: 'Việc cần làm khách hàng',
        summary: 'Ghi chú quan trọng, nhắc việc và ghi chú thường cho KH.',
        details: [
          'Quản lý ghi chú theo mức độ ưu tiên',
          'Nhắc follow-up chăm sóc sau khám',
        ],
        href: '/quan-ly-ghi-chu-khach-hang',
        featureKey: 'crm',
      },
    ],
  },
  {
    id: 'internal-ops',
    title: 'Nội bộ: nhắc việc, thông báo',
    description: 'Công cụ phối hợp trong phòng khám.',
    items: [
      {
        id: 'internal-tasks',
        name: 'Nhắc việc nội bộ',
        summary: 'Task list / kanban giao việc nội bộ.',
        details: [
          'Loại việc, mức ưu tiên, người nhận, hạn hoàn thành',
          'Theo dõi trạng thái công việc trong phòng khám',
        ],
        href: '/nhac-viec',
      },
      {
        id: 'notifications',
        name: FEATURE_LABELS.notifications,
        summary: 'Hộp thư thông báo và hỗ trợ nền tảng.',
        details: [
          'Inbox thông báo và hoạt động gần đây',
          'Hỗ trợ nền tảng (chủ phòng khám)',
          'Polling / badge trên Header',
        ],
        href: '/thong-bao',
        featureKey: 'notifications',
      },
    ],
  },
  {
    id: 'messaging',
    title: 'Nhắn tin tự động (Zalo / SMS)',
    description: 'Kết nối OA và kịch bản gửi tin theo sự kiện.',
    items: [
      {
        id: 'messaging-automation',
        name: FEATURE_LABELS.messaging_automation,
        summary: 'Cấu hình Zalo OA, workflow và hàng đợi gửi tin.',
        details: [
          'Kết nối Zalo OA / kênh nhắn tin',
          'Kịch bản: xác nhận hẹn, nhắc hẹn, follow-up sau khám',
          'Theo dõi job queue gửi tin',
        ],
        href: '/cai-dat-nhan-tin',
        featureKey: 'messaging_automation',
      },
    ],
  },
  {
    id: 'multi-branch',
    title: 'Đa chi nhánh & chuỗi',
    description: 'Quản lý chuỗi cửa hàng, điều chuyển kho và nhân sự.',
    items: [
      {
        id: 'chain-management',
        name: FEATURE_LABELS.multi_branch,
        summary: 'Quản lý chi nhánh và phân công nhân viên.',
        details: [
          'Tạo / sửa chi nhánh trong chuỗi',
          'Phân công NV (kéo-thả) giữa các chi nhánh',
        ],
        href: '/quan-ly-chuoi',
        featureKey: 'multi_branch',
      },
      {
        id: 'branch-transfer',
        name: FEATURE_LABELS.branch_transfer,
        summary: 'Điều chuyển tròng / gọng / thuốc / vật tư giữa chi nhánh.',
        details: [
          'Tạo phiếu điều chuyển và workflow duyệt',
          'Theo dõi trạng thái chuyển kho liên chi nhánh',
        ],
        href: '/dieu-chuyen-kho',
        featureKey: 'branch_transfer',
      },
      {
        id: 'staff-transfer',
        name: FEATURE_LABELS.staff_transfer,
        summary: 'Điều chuyển nhân viên giữa các chi nhánh.',
        details: [
          'Quản lý phân công NV trên trang Quản lý chuỗi',
          'Hỗ trợ gắn thêm chi nhánh (quản lý khu vực) mà không xoá phân công cũ',
        ],
        href: '/quan-ly-chuoi',
        featureKey: 'staff_transfer',
      },
      {
        id: 'staff-attendance',
        name: FEATURE_LABELS.staff_attendance,
        summary: 'Check-in / check-out nhân viên theo chi nhánh.',
        details: [
          'Chấm công thủ công theo cửa hàng đang chọn',
          'Xem lịch sử chấm công 14 ngày gần nhất',
        ],
        href: '/cham-cong',
        featureKey: 'staff_attendance',
      },
      {
        id: 'chain-inventory',
        name: 'Tồn kho chuỗi',
        summary: 'So sánh tồn gọng / tròng / thuốc giữa các chi nhánh.',
        details: [
          'Cảnh báo tồn thấp theo cửa hàng',
          'Gợi ý điều chuyển từ CN thừa sang CN thiếu',
        ],
        href: '/ton-kho-chuoi',
        featureKey: 'multi_branch',
      },
      {
        id: 'branch-pricing',
        name: 'Giá theo chi nhánh',
        summary: 'Override giá bán / giá vốn riêng từng cửa hàng.',
        details: [
          'Quản lý branch_price_overrides',
          'Copy bảng giá từ chi nhánh mẫu',
        ],
        href: '/gia-chi-nhanh',
        featureKey: 'multi_branch',
      },
      {
        id: 'central-lab',
        name: 'Lab / gia công trung tâm',
        summary: 'Workflow cắt kính phục vụ nhiều chi nhánh.',
        details: [
          'Trạng thái: chờ gia công → đang cắt → sẵn sàng → đã giao',
          'Gửi đơn kính sang lab (chi nhánh chính hoặc chỉ định)',
        ],
        href: '/lab-gia-cong',
        featureKey: 'multi_branch',
      },
      {
        id: 'branch-promotions',
        name: 'Khuyến mãi theo chi nhánh',
        summary: 'Chương trình / voucher theo cửa hàng hoặc toàn chuỗi.',
        details: ['Tạo KM %, số tiền hoặc mã voucher', 'Phạm vi từng CN hoặc cả chuỗi'],
        href: '/khuyen-mai-chuoi',
        featureKey: 'multi_branch',
      },
      {
        id: 'cross-branch-warranty',
        name: 'Bảo hành liên chi nhánh',
        summary: 'Tiếp nhận BH / đổi trả ở cửa khác nơi bán.',
        details: ['Ghi nhận cửa bán và cửa xử lý', 'Theo dõi trạng thái phiếu'],
        href: '/bao-hanh-lien-chi-nhanh',
        featureKey: 'multi_branch',
      },
      {
        id: 'central-lens-po',
        name: 'Đặt hàng NCC tập trung',
        summary: 'Gộp tròng cần đặt nhiều CN thành 1 phiếu PO.',
        details: ['Tạo PO nháp từ lens_order', 'Đánh dấu đã đặt / đã nhận NCC'],
        href: '/dat-hang-ncc-chuoi',
        featureKey: 'multi_branch',
      },
    ],
  },
  {
    id: 'clinic-rbac',
    title: 'Quản lý phòng khám & phân quyền',
    description: 'Thông tin phòng khám, thành viên, vai trò và bảo mật.',
    items: [
      {
        id: 'clinic-settings',
        name: FEATURE_LABELS.clinic_settings,
        summary: 'Hub cài đặt: thông tin PK, thành viên, gói, in, nhắn tin, VAT.',
        details: [
          'Thông tin phòng khám và cấu hình vận hành',
          'Liên kết nhanh tới thành viên, vai trò, chi nhánh, billing',
          'Khai thuế / VAT và bảo mật đăng nhập thiết bị',
        ],
        href: '/quan-ly-phong-kham',
        featureKey: 'clinic_settings',
      },
      {
        id: 'multi-staff',
        name: FEATURE_LABELS.multi_staff,
        summary: 'Nhiều người dùng trong cùng tenant.',
        details: [
          'Mời / quản lý thành viên phòng khám',
          'Phân vai trò owner / admin / doctor / staff (và custom role)',
        ],
        href: '/quan-ly-nguoi-dung',
        featureKey: 'multi_staff',
      },
      {
        id: 'custom-roles',
        name: 'Vai trò & quyền',
        summary: 'Tạo vai trò tuỳ chỉnh và tick quyền chi tiết.',
        details: [
          'RBAC theo permission catalog',
          'Gán quyền quản lý kho, CRM, kê đơn, báo cáo…',
        ],
        href: '/quan-ly-vai-tro',
        featureKey: 'multi_staff',
      },
    ],
  },
  {
    id: 'billing',
    title: 'Gói dịch vụ & thanh toán',
    description: 'Trial / Basic / Pro / Enterprise và thanh toán.',
    items: [
      {
        id: 'billing-plans',
        name: 'Gói dịch vụ',
        summary: 'Xem gói hiện tại, nâng cấp và thanh toán.',
        details: [
          'So sánh gói Dùng thử / Cơ bản / Chuyên nghiệp / Cao cấp',
          'Thanh toán chuyển khoản (SePay QR) khi áp dụng',
          'Feature gate khóa menu thiếu quyền gói → dẫn về trang này',
        ],
        href: '/billing',
      },
    ],
  },
  {
    id: 'platform',
    title: 'Nền tảng (superadmin)',
    description: 'Công cụ vận hành toàn hệ thống Optigo — chỉ dành cho siêu quản trị.',
    items: [
      {
        id: 'platform-admin',
        name: 'Quản trị nền tảng',
        summary: 'Dashboard vận hành đa tenant: PK, thanh toán, webhook, users, gói, tin nhắn.',
        details: [
          'Tabs: tổng quan, thống kê PK, phòng khám, thanh toán, webhook, users, gói, tin nhắn',
          'Gửi tin nhắn platform → tenant',
          'Purge dữ liệu tenant khi cần (nguy hiểm)',
        ],
        href: '/admin',
        note: 'Chỉ tài khoản superadmin.',
      },
    ],
  },
];

/** Resolve minPlan: explicit > from featureKey > undefined */
export function resolveFeatureMinPlan(item: ProductFeatureItem): PlanKey | undefined {
  if (item.minPlan) return item.minPlan;
  if (item.featureKey) return getMinPlanForFeature(item.featureKey);
  return undefined;
}

export function getPlanLabel(plan: PlanKey): string {
  return PLAN_LABELS[plan] || plan;
}

export function countCatalogFeatures(): { groups: number; items: number } {
  const items = PRODUCT_FEATURE_GROUPS.reduce((n, g) => n + g.items.length, 0);
  return { groups: PRODUCT_FEATURE_GROUPS.length, items };
}
