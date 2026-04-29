/**
 * Feature Gating & Role Permission Configuration
 * 
 * Định nghĩa tập trung: feature keys, plan→features, role→permissions
 */

// ===== Feature Keys =====
export type FeatureKey =
  | 'patient_management'
  | 'prescription_medicine'
  | 'prescription_glasses'
  | 'waiting_room'
  | 'drug_catalog'
  | 'basic_reports'
  | 'categories'
  | 'appointments'
  | 'print_config'
  | 'notifications'
  | 'inventory_lens'
  | 'inventory_drug'
  | 'advanced_reports'
  | 'crm'
  | 'multi_staff'
  | 'clinic_settings'
  | 'multi_branch'
  | 'branch_transfer'
  | 'chain_reports'
  | 'staff_attendance'
  | 'staff_transfer'
  | 'messaging_automation';

// ===== Plan Types =====
export type PlanKey = 'trial' | 'basic' | 'pro' | 'enterprise';
export type TenantRole = 'owner' | 'admin' | 'doctor' | 'staff';

// ===== Plan → Feature mapping =====
// Mỗi plan bao gồm tất cả features của plan thấp hơn
const PLAN_FEATURES: Record<PlanKey, FeatureKey[]> = {
  trial: [
    'patient_management',
    'prescription_medicine',
    'prescription_glasses',
    'waiting_room',
    'drug_catalog',
    'basic_reports',
    'categories',
  ],
  basic: [
    'patient_management',
    'prescription_medicine',
    'prescription_glasses',
    'waiting_room',
    'drug_catalog',
    'basic_reports',
    'categories',
    'appointments',
    'print_config',
    'notifications',
  ],
  pro: [
    'patient_management',
    'prescription_medicine',
    'prescription_glasses',
    'waiting_room',
    'drug_catalog',
    'basic_reports',
    'categories',
    'appointments',
    'print_config',
    'notifications',
    'inventory_lens',
    'inventory_drug',
    'advanced_reports',
    'crm',
    'multi_staff',
    'clinic_settings',
    'messaging_automation',
  ],
  enterprise: [
    'patient_management',
    'prescription_medicine',
    'prescription_glasses',
    'waiting_room',
    'drug_catalog',
    'basic_reports',
    'categories',
    'appointments',
    'print_config',
    'notifications',
    'inventory_lens',
    'inventory_drug',
    'advanced_reports',
    'crm',
    'multi_staff',
    'clinic_settings',
    'multi_branch',
    'branch_transfer',
    'chain_reports',
    'staff_attendance',
    'staff_transfer',
    'messaging_automation',
  ],
};

// ===== Role → Permission mapping (cho gói pro/enterprise) =====
// Gói trial/basic chỉ có 1 user (owner) nên không cần phân quyền
export type Permission =
  | 'manage_billing'        // Quản lý gói dịch vụ & thanh toán
  | 'manage_clinic'         // Cài đặt phòng khám
  | 'manage_members'        // Quản lý thành viên
  | 'manage_inventory'      // Quản lý kho
  | 'manage_branches'       // Quản lý chi nhánh
  | 'manage_transfers'      // Quản lý điều chuyển
  | 'view_revenue'          // Xem doanh thu & giá bán
  | 'view_reports'          // Xem báo cáo
  | 'manage_crm'            // Chăm sóc khách hàng
  | 'write_prescription'    // Kê đơn thuốc/kính
  | 'manage_patients'       // Thêm/sửa bệnh nhân
  | 'view_patients'         // Xem danh sách bệnh nhân
  | 'manage_waiting_room'   // Quản lý phòng chờ
  | 'manage_categories'     // Quản lý danh mục
  | 'manage_appointments'   // Quản lý lịch hẹn
  | 'manage_print_config'   // Cấu hình in
  | 'manage_messaging';     // Cấu hình kết nối Zalo/SMS & kịch bản

const ROLE_PERMISSIONS: Record<TenantRole, Permission[]> = {
  owner: [
    'manage_billing',
    'manage_clinic',
    'manage_members',
    'manage_inventory',
    'manage_branches',
    'manage_transfers',
    'view_revenue',
    'view_reports',
    'manage_crm',
    'write_prescription',
    'manage_patients',
    'view_patients',
    'manage_waiting_room',
    'manage_categories',
    'manage_appointments',
    'manage_print_config',
    'manage_messaging',
  ],
  admin: [
    'manage_clinic',
    'manage_members',
    'manage_inventory',
    'manage_branches',
    'manage_transfers',
    'view_revenue',
    'view_reports',
    'manage_crm',
    'write_prescription',
    'manage_patients',
    'view_patients',
    'manage_waiting_room',
    'manage_categories',
    'manage_appointments',
    'manage_print_config',
    'manage_messaging',
  ],
  doctor: [
    'write_prescription',
    'manage_patients',
    'view_patients',
    'manage_waiting_room',
    'manage_appointments',
    'view_reports',
  ],
  staff: [
    'view_patients',
    'manage_patients',
    'manage_waiting_room',
    'manage_appointments',
  ],
};

// ===== Feature → Minimum plan required =====
const FEATURE_MIN_PLAN: Record<FeatureKey, PlanKey> = {
  patient_management: 'trial',
  prescription_medicine: 'trial',
  prescription_glasses: 'trial',
  waiting_room: 'trial',
  drug_catalog: 'trial',
  basic_reports: 'trial',
  categories: 'trial',
  appointments: 'basic',
  print_config: 'basic',
  notifications: 'basic',
  inventory_lens: 'pro',
  inventory_drug: 'pro',
  advanced_reports: 'pro',
  crm: 'pro',
  multi_staff: 'pro',
  clinic_settings: 'pro',
  multi_branch: 'enterprise',
  branch_transfer: 'enterprise',
  chain_reports: 'enterprise',
  staff_attendance: 'enterprise',
  staff_transfer: 'enterprise',
  messaging_automation: 'pro',
};

// ===== Feature display names (cho UI) =====
export const FEATURE_LABELS: Record<FeatureKey, string> = {
  patient_management: 'Quản lý bệnh nhân',
  prescription_medicine: 'Kê đơn thuốc',
  prescription_glasses: 'Kê đơn kính',
  waiting_room: 'Phòng chờ khám',
  drug_catalog: 'Danh mục thuốc',
  basic_reports: 'Báo cáo cơ bản',
  categories: 'Danh mục',
  appointments: 'Lịch hẹn khám',
  print_config: 'Cấu hình mẫu in',
  notifications: 'Thông báo',
  inventory_lens: 'Quản lý kho kính',
  inventory_drug: 'Quản lý kho thuốc',
  advanced_reports: 'Báo cáo nâng cao',
  crm: 'Chăm sóc khách hàng',
  multi_staff: 'Quản lý nhân viên',
  clinic_settings: 'Cài đặt phòng khám',
  multi_branch: 'Quản lý đa chi nhánh',
  branch_transfer: 'Điều chuyển kho',
  chain_reports: 'Báo cáo chuỗi',
  staff_attendance: 'Chấm công',
  staff_transfer: 'Điều chuyển nhân viên',
  messaging_automation: 'Nhắn tin tự động (Zalo/SMS)',
};

// ===== Plan display names =====
export const PLAN_LABELS: Record<PlanKey, string> = {
  trial: 'Dùng thử',
  basic: 'Cơ bản',
  pro: 'Chuyên nghiệp',
  enterprise: 'Cao cấp',
};

// Plan hierarchy for upgrade suggestion
const PLAN_ORDER: PlanKey[] = ['trial', 'basic', 'pro', 'enterprise'];

// ===== Public API =====

/**
 * Kiểm tra plan có feature không
 */
export function planHasFeature(plan: string | null | undefined, feature: FeatureKey): boolean {
  const p = (plan || 'trial') as PlanKey;
  const features = PLAN_FEATURES[p];
  if (!features) return false;
  return features.includes(feature);
}

/**
 * Kiểm tra role có permission không
 */
export function roleHasPermission(role: string | null | undefined, permission: Permission): boolean {
  const r = (role || 'staff') as TenantRole;
  const perms = ROLE_PERMISSIONS[r];
  if (!perms) return false;
  return perms.includes(permission);
}

/**
 * Lấy gói tối thiểu cần thiết cho feature
 */
export function getMinPlanForFeature(feature: FeatureKey): PlanKey {
  return FEATURE_MIN_PLAN[feature] || 'trial';
}

/**
 * Lấy gói cần nâng cấp lên (trả về null nếu đã có quyền)
 */
export function getRequiredUpgrade(currentPlan: string | null | undefined, feature: FeatureKey): PlanKey | null {
  if (planHasFeature(currentPlan, feature)) return null;
  const minPlan = FEATURE_MIN_PLAN[feature];
  return minPlan || null;
}

/**
 * Lấy danh sách features cho plan
 */
export function getFeaturesForPlan(plan: string | null | undefined): FeatureKey[] {
  const p = (plan || 'trial') as PlanKey;
  return PLAN_FEATURES[p] || PLAN_FEATURES.trial;
}

/**
 * Lấy danh sách permissions cho role
 */
export function getPermissionsForRole(role: string | null | undefined): Permission[] {
  const r = (role || 'staff') as TenantRole;
  return ROLE_PERMISSIONS[r] || ROLE_PERMISSIONS.staff;
}

/**
 * Kiểm tra plan hiện tại có cao hơn hoặc bằng plan yêu cầu không
 */
export function isPlanAtLeast(currentPlan: string | null | undefined, requiredPlan: PlanKey): boolean {
  const current = PLAN_ORDER.indexOf((currentPlan || 'trial') as PlanKey);
  const required = PLAN_ORDER.indexOf(requiredPlan);
  if (current === -1 || required === -1) return false;
  return current >= required;
}
