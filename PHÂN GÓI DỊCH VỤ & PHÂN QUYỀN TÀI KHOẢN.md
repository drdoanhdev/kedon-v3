# PHÂN GÓI DỊCH VỤ & PHÂN QUYỀN TÀI KHOẢN — Kedon V3

> Tài liệu chi tiết mô tả toàn bộ hệ thống kiểm soát truy cập SaaS.
> Cập nhật: 19/04/2026

---

## MỤC LỤC

1. [Tổng quan kiến trúc](#1-tổng-quan-kiến-trúc)
2. [Bảng gói dịch vụ (subscription_plans)](#2-bảng-gói-dịch-vụ)
3. [Chi tiết từng gói](#3-chi-tiết-từng-gói)
4. [Danh sách tính năng (Feature Keys)](#4-danh-sách-tính-năng)
5. [Ma trận: Gói → Tính năng](#5-ma-trận-gói--tính-năng)
6. [Phân quyền vai trò (Roles & Permissions)](#6-phân-quyền-vai-trò)
7. [Ma trận: Vai trò → Quyền hạn](#7-ma-trận-vai-trò--quyền-hạn)
8. [Giới hạn sử dụng (Usage Limits)](#8-giới-hạn-sử-dụng)
9. [Cơ chế kiểm tra truy cập](#9-cơ-chế-kiểm-tra-truy-cập)
10. [Mã lỗi trả về Frontend](#10-mã-lỗi-trả-về-frontend)
11. [Luồng nâng cấp gói](#11-luồng-nâng-cấp-gói)
12. [Hướng dẫn thay đổi cấu hình](#12-hướng-dẫn-thay-đổi-cấu-hình)

---

## 1. TỔNG QUAN KIẾN TRÚC

```
┌─────────────┐     ┌──────────────────┐     ┌─────────────────┐
│  Frontend   │────▶│  API Route       │────▶│  Supabase DB    │
│  (React)    │     │  (Next.js API)   │     │  (PostgreSQL)   │
└─────────────┘     └──────────────────┘     └─────────────────┘
      │                     │                        │
      ▼                     ▼                        ▼
useFeatureGate()    requireFeature()         subscription_plans
FeatureGate.tsx     checkTrialLimit()        tenants (plan, trial_*)
                    checkAccess()            tenantmembership (role)
```

**Luồng kiểm tra:**
1. **Frontend**: `useFeatureGate()` kiểm tra plan/role → hiện UI khóa hoặc modal nâng cấp
2. **API**: `requireFeature()` kiểm tra plan + permission → trả 403 nếu không đủ quyền
3. **API**: `checkTrialLimit()` kiểm tra hết hạn trial + giới hạn đơn → trả 403 nếu vượt

**File cấu hình trung tâm:** `src/lib/featureConfig.ts`
- Tất cả mapping plan→features và role→permissions nằm TẬP TRUNG ở file này
- Muốn thay đổi tính năng nào thuộc gói nào → chỉ sửa file này

---

## 2. BẢNG GÓI DỊCH VỤ

**Bảng: `subscription_plans`**

| Cột | Kiểu | Mô tả |
|-----|------|-------|
| `id` | UUID | ID gói |
| `plan_key` | TEXT | Key duy nhất: trial, basic, pro, enterprise |
| `name` | TEXT | Tên hiển thị: "Dùng thử", "Cơ bản"... |
| `price` | BIGINT | Giá VND (0, 99000, 199000...) |
| `period_label` | TEXT | "/tháng", "3 tháng hoặc 1.000 đơn" |
| `max_users` | INTEGER | Số user tối đa (1, 1, 10, 50) |
| `max_branches` | INTEGER | Số chi nhánh tối đa (1, 1, 1, 20) |
| `trial_days` | INTEGER | Số ngày dùng thử (90 cho trial, NULL cho gói khác) |
| `trial_max_prescriptions` | INTEGER | Giới hạn đơn trial (1000 cho trial, NULL cho gói khác) |
| `features` | TEXT[] | Danh sách mô tả tính năng (hiển thị trên UI billing) |
| `allowed_features` | TEXT[] | Danh sách feature keys kỹ thuật (dùng cho gating logic) |
| `is_popular` | BOOLEAN | Đánh dấu gói nổi bật |
| `is_active` | BOOLEAN | Gói đang hoạt động (hiện trên trang billing) |
| `sort_order` | INTEGER | Thứ tự sắp xếp |
| `branch_addon_price` | BIGINT | Giá mỗi chi nhánh thêm (chỉ enterprise) |

**Bảng: `tenants`** (các cột liên quan)

| Cột | Mô tả |
|-----|-------|
| `plan` | Gói hiện tại: 'trial' / 'basic' / 'pro' / 'enterprise' |
| `trial_start` | Ngày bắt đầu trial |
| `trial_days` | Số ngày trial (mặc định 90) |
| `trial_max_prescriptions` | Giới hạn đơn trial (mặc định 1000) |
| `plan_expires_at` | Ngày hết hạn gói trả phí |

**Bảng: `tenantmembership`** (các cột liên quan)

| Cột | Mô tả |
|-----|-------|
| `role` | Vai trò: 'owner' / 'admin' / 'doctor' / 'staff' |
| `status` | Trạng thái: 'active' / 'inactive' / 'pending' |

---

## 3. CHI TIẾT TỪNG GÓI

### 🆓 Trial — Dùng thử
| Thuộc tính | Giá trị |
|-----------|---------|
| Giá | 0đ |
| Thời hạn | 3 tháng HOẶC 1.000 đơn (cái nào đến trước) |
| Số user | 1 (chủ phòng khám) |
| Số chi nhánh | 1 |
| Phân quyền | Không (1 user = full quyền) |

**Tính năng được phép:**
- ✅ Quản lý bệnh nhân
- ✅ Kê đơn thuốc
- ✅ Kê đơn kính
- ✅ Phòng chờ khám
- ✅ Danh mục thuốc cơ bản
- ✅ Báo cáo cơ bản
- ✅ Quản lý danh mục
- ❌ Lịch hẹn khám
- ❌ Cấu hình mẫu in
- ❌ Kho kính/thuốc
- ❌ Báo cáo nâng cao
- ❌ CRM
- ❌ Quản lý nhân viên

---

### 💰 Basic — Cơ bản (99.000đ/tháng)
| Thuộc tính | Giá trị |
|-----------|---------|
| Giá | 99.000đ/tháng |
| Đơn thuốc/kính | Không giới hạn |
| Số user | 1 |
| Số chi nhánh | 1 |
| Phân quyền | Không (1 user = full quyền) |

**Tính năng được phép** (= Trial + thêm):
- ✅ Tất cả của Trial
- ✅ Lịch hẹn khám
- ✅ Cấu hình mẫu in
- ✅ Thông báo
- ❌ Kho kính/thuốc
- ❌ Báo cáo nâng cao
- ❌ CRM
- ❌ Quản lý nhân viên

---

### ⭐ Pro — Chuyên nghiệp (199.000đ/tháng)
| Thuộc tính | Giá trị |
|-----------|---------|
| Giá | 199.000đ/tháng |
| Đơn thuốc/kính | Không giới hạn |
| Số user | Tối đa 10 |
| Số chi nhánh | 1 |
| Phân quyền | 4 cấp: owner / admin / doctor / staff |

**Tính năng được phép** (= Basic + thêm):
- ✅ Tất cả của Basic
- ✅ Quản lý kho kính
- ✅ Quản lý kho thuốc
- ✅ Báo cáo nâng cao
- ✅ Chăm sóc khách hàng (CRM)
- ✅ Quản lý nhân viên (nhiều user)
- ✅ Cài đặt phòng khám
- ❌ Đa chi nhánh
- ❌ Điều chuyển kho/nhân viên

---

### 🏢 Enterprise — Cao cấp (199.000đ + 79.000đ/chi nhánh)
| Thuộc tính | Giá trị |
|-----------|---------|
| Giá | 199.000đ + 79.000đ/chi nhánh thêm |
| Đơn thuốc/kính | Không giới hạn |
| Số user | Tối đa 50 |
| Số chi nhánh | Tối đa 20 |
| Phân quyền | 4 cấp + quản lý chuỗi |

**Tính năng được phép** (= Pro + thêm):
- ✅ Tất cả của Pro
- ✅ Quản lý đa chi nhánh
- ✅ Điều chuyển kho giữa chi nhánh
- ✅ Báo cáo chuỗi
- ✅ Chấm công nhân viên
- ✅ Điều chuyển nhân viên

> ⚠️ Enterprise hiện đang **chưa kích hoạt** (is_active = false). Sẽ bật khi sẵn sàng.

---

## 4. DANH SÁCH TÍNH NĂNG (Feature Keys)

Mỗi tính năng có 1 key kỹ thuật duy nhất, dùng trong code và DB:

| # | Feature Key | Tên hiển thị | Gói tối thiểu |
|---|-------------|-------------|---------------|
| 1 | `patient_management` | Quản lý bệnh nhân | Trial |
| 2 | `prescription_medicine` | Kê đơn thuốc | Trial |
| 3 | `prescription_glasses` | Kê đơn kính | Trial |
| 4 | `waiting_room` | Phòng chờ khám | Trial |
| 5 | `drug_catalog` | Danh mục thuốc | Trial |
| 6 | `basic_reports` | Báo cáo cơ bản | Trial |
| 7 | `categories` | Danh mục | Trial |
| 8 | `appointments` | Lịch hẹn khám | Basic |
| 9 | `print_config` | Cấu hình mẫu in | Basic |
| 10 | `notifications` | Thông báo | Basic |
| 11 | `inventory_lens` | Quản lý kho kính | Pro |
| 12 | `inventory_drug` | Quản lý kho thuốc | Pro |
| 13 | `advanced_reports` | Báo cáo nâng cao | Pro |
| 14 | `crm` | Chăm sóc khách hàng | Pro |
| 15 | `multi_staff` | Quản lý nhân viên | Pro |
| 16 | `clinic_settings` | Cài đặt phòng khám | Pro |
| 17 | `multi_branch` | Quản lý đa chi nhánh | Enterprise |
| 18 | `branch_transfer` | Điều chuyển kho | Enterprise |
| 19 | `chain_reports` | Báo cáo chuỗi | Enterprise |
| 20 | `staff_attendance` | Chấm công | Enterprise |
| 21 | `staff_transfer` | Điều chuyển nhân viên | Enterprise |

---

## 5. MA TRẬN: GÓI → TÍNH NĂNG

| Tính năng | Trial | Basic | Pro | Enterprise |
|-----------|:-----:|:-----:|:---:|:----------:|
| Quản lý bệnh nhân | ✅ | ✅ | ✅ | ✅ |
| Kê đơn thuốc | ✅ | ✅ | ✅ | ✅ |
| Kê đơn kính | ✅ | ✅ | ✅ | ✅ |
| Phòng chờ khám | ✅ | ✅ | ✅ | ✅ |
| Danh mục thuốc | ✅ | ✅ | ✅ | ✅ |
| Báo cáo cơ bản | ✅ | ✅ | ✅ | ✅ |
| Danh mục | ✅ | ✅ | ✅ | ✅ |
| Lịch hẹn khám | ❌ | ✅ | ✅ | ✅ |
| Cấu hình mẫu in | ❌ | ✅ | ✅ | ✅ |
| Thông báo | ❌ | ✅ | ✅ | ✅ |
| Quản lý kho kính | ❌ | ❌ | ✅ | ✅ |
| Quản lý kho thuốc | ❌ | ❌ | ✅ | ✅ |
| Báo cáo nâng cao | ❌ | ❌ | ✅ | ✅ |
| CRM | ❌ | ❌ | ✅ | ✅ |
| Quản lý nhân viên | ❌ | ❌ | ✅ | ✅ |
| Cài đặt phòng khám | ❌ | ❌ | ✅ | ✅ |
| Đa chi nhánh | ❌ | ❌ | ❌ | ✅ |
| Điều chuyển kho | ❌ | ❌ | ❌ | ✅ |
| Báo cáo chuỗi | ❌ | ❌ | ❌ | ✅ |
| Chấm công | ❌ | ❌ | ❌ | ✅ |
| Điều chuyển NV | ❌ | ❌ | ❌ | ✅ |

---

## 6. PHÂN QUYỀN VAI TRÒ

> Chỉ áp dụng cho gói **Pro** và **Enterprise** (nhiều user).
> Gói Trial/Basic chỉ có 1 user (owner) → bỏ qua kiểm tra quyền.

### 4 cấp vai trò:

| Vai trò | Mô tả | Gán bởi |
|---------|-------|---------|
| **owner** | Chủ phòng khám. Toàn quyền, kể cả billing và quản lý thành viên. | Hệ thống (người tạo tenant) |
| **admin** | Quản lý. Gần như toàn quyền, trừ billing. | Owner |
| **doctor** | Bác sĩ. Kê đơn, quản lý bệnh nhân, xem báo cáo. | Owner hoặc Admin |
| **staff** | Nhân viên. Tiếp nhận bệnh nhân, quản lý phòng chờ. | Owner hoặc Admin |

---

## 7. MA TRẬN: VAI TRÒ → QUYỀN HẠN

| Quyền hạn (Permission) | Mô tả | Owner | Admin | Doctor | Staff |
|------------------------|-------|:-----:|:-----:|:------:|:-----:|
| `manage_billing` | Quản lý gói & thanh toán | ✅ | ❌ | ❌ | ❌ |
| `manage_clinic` | Cài đặt phòng khám | ✅ | ✅ | ❌ | ❌ |
| `manage_members` | Quản lý thành viên | ✅ | ✅ | ❌ | ❌ |
| `manage_inventory` | Quản lý kho | ✅ | ✅ | ❌ | ❌ |
| `view_revenue` | Xem doanh thu & giá bán | ✅ | ✅ | ❌ | ❌ |
| `view_reports` | Xem báo cáo | ✅ | ✅ | ✅ | ❌ |
| `manage_crm` | Chăm sóc khách hàng | ✅ | ✅ | ❌ | ❌ |
| `write_prescription` | Kê đơn thuốc/kính | ✅ | ✅ | ✅ | ❌ |
| `manage_patients` | Thêm/sửa bệnh nhân | ✅ | ✅ | ✅ | ✅ |
| `view_patients` | Xem danh sách bệnh nhân | ✅ | ✅ | ✅ | ✅ |
| `manage_waiting_room` | Quản lý phòng chờ | ✅ | ✅ | ✅ | ✅ |
| `manage_categories` | Quản lý danh mục | ✅ | ✅ | ❌ | ❌ |
| `manage_appointments` | Quản lý lịch hẹn | ✅ | ✅ | ✅ | ✅ |
| `manage_print_config` | Cấu hình in | ✅ | ✅ | ❌ | ❌ |

**Tổng quyền:** Owner: 14 | Admin: 13 | Doctor: 6 | Staff: 4

---

## 8. GIỚI HẠN SỬ DỤNG (Usage Limits)

| Giới hạn | Trial | Basic | Pro | Enterprise |
|----------|:-----:|:-----:|:---:|:----------:|
| Số đơn (thuốc + kính) | 1.000 | ∞ | ∞ | ∞ |
| Thời gian | 90 ngày | Theo thanh toán | Theo thanh toán | Theo thanh toán |
| Số user | 1 | 1 | 10 | 50 |
| Số chi nhánh | 1 | 1 | 1 | 20 |

### Khi nào bị chặn:
- **Trial hết hạn ngày**: Không tạo được đơn mới (GET vẫn xem được dữ liệu cũ)
- **Trial hết số đơn**: Không tạo được đơn mới
- **Vượt max_users**: Không thêm được thành viên mới
- **Tính năng bị khóa**: API trả 403, Frontend hiện modal nâng cấp

---

## 9. CƠ CHẾ KIỂM TRA TRUY CẬP

### 9.1 Backend (API Routes)

```
Mỗi API route kiểm tra theo thứ tự:
1. requireTenant()       → Xác thực user + lấy tenantId
2. requireFeature()      → Kiểm tra plan có feature + role có permission
3. checkTrialLimit()     → Kiểm tra giới hạn trial (chỉ cho POST tạo đơn)
```

**File:** `src/lib/tenantApi.ts`

- `requireFeature(ctx, res, feature, permission?)` — Kiểm tra plan + quyền
- `checkTrialLimit(ctx, res)` — Kiểm tra hết hạn trial (ngày + số đơn)

### 9.2 Frontend (React)

**File:** `src/hooks/useFeatureGate.ts`

```typescript
const { canAccessFeature, hasPermission, canAccess, getUpgradePlan } = useFeatureGate();

// Kiểm tra plan
canAccessFeature('inventory_lens')  // → true/false

// Kiểm tra quyền
hasPermission('manage_inventory')   // → true/false

// Kiểm tra cả hai
canAccess('inventory_lens', 'manage_inventory')  // → true/false
```

**File:** `src/components/FeatureGate.tsx`

```tsx
<FeatureGate feature="inventory_lens" permission="manage_inventory">
  <QuanLyKho />
</FeatureGate>
```

---

## 10. MÃ LỖI TRẢ VỀ FRONTEND

Khi API trả 403, body JSON có cấu trúc:

| Code | Ý nghĩa | Khi nào |
|------|---------|---------|
| `PLAN_REQUIRED` | Gói hiện tại không có tính năng này | Truy cập feature bị khóa |
| `PERMISSION_DENIED` | Vai trò không đủ quyền | staff truy cập kho |
| `TRIAL_EXPIRED` | Trial hết hạn ngày | Tạo đơn khi trial quá 90 ngày |
| `TRIAL_LIMIT_REACHED` | Trial hết số đơn | Tạo đơn khi đã đạt 1.000 |
| `MAX_USERS_REACHED` | Đã đạt giới hạn user | Mời thành viên khi đủ quota |

**Response mẫu:**
```json
{
  "message": "Gói dùng thử đã đạt giới hạn 1000 đơn. Vui lòng nâng cấp.",
  "code": "TRIAL_LIMIT_REACHED"
}
```

```json
{
  "message": "Tính năng 'Quản lý kho kính' yêu cầu gói Chuyên nghiệp trở lên.",
  "code": "PLAN_REQUIRED",
  "requiredPlan": "pro",
  "requiredFeature": "inventory_lens"
}
```

---

## 11. LUỒNG NÂNG CẤP GÓI

```
User click tính năng bị khóa
    │
    ▼
Frontend nhận 403 hoặc useFeatureGate() trả false
    │
    ▼
Hiện modal: "Tính năng này yêu cầu gói [Tên gói]"
    + Nút: "Nâng cấp ngay" → /billing
    │
    ▼
Trang Billing hiển thị bảng giá
    + Nút thanh toán → tạo payment_order → chuyển khoản SePay
    │
    ▼
Webhook SePay xác nhận → cập nhật tenant.plan
    │
    ▼
User refresh → plan mới → tính năng mở khóa
```

---

## 12. HƯỚNG DẪN THAY ĐỔI CẤU HÌNH

### 🔧 Thêm tính năng mới vào 1 gói

**Bước 1:** Thêm feature key vào `src/lib/featureConfig.ts`:
```
1. Thêm vào type FeatureKey
2. Thêm vào PLAN_FEATURES[<plan>]
3. Thêm vào FEATURE_MIN_PLAN
4. Thêm vào FEATURE_LABELS
```

**Bước 2:** Cập nhật DB (chạy SQL):
```sql
UPDATE subscription_plans
SET allowed_features = array_append(allowed_features, 'ten_feature_moi')
WHERE plan_key = 'pro';
```

### 🔧 Thêm quyền mới cho vai trò

Chỉ sửa `src/lib/featureConfig.ts`:
```
1. Thêm vào type Permission
2. Thêm vào ROLE_PERMISSIONS[<role>]
```

### 🔧 Thay đổi giá gói

```sql
UPDATE subscription_plans SET price = 149000 WHERE plan_key = 'basic';
```
(Trang billing tự lấy giá mới từ DB)

### 🔧 Di chuyển tính năng sang gói khác

Sửa `PLAN_FEATURES` và `FEATURE_MIN_PLAN` trong `featureConfig.ts`, rồi cập nhật DB.

### 🔧 Tạo gói mới

1. INSERT vào `subscription_plans`
2. Thêm vào `PlanKey` type trong `featureConfig.ts`
3. Thêm vào `PLAN_FEATURES`, `PLAN_LABELS`, `PLAN_ORDER`

### 🔧 Điều chỉnh giới hạn trial

```sql
UPDATE tenants SET trial_days = 60, trial_max_prescriptions = 500
WHERE plan = 'trial';
```

---

## TÓM TẮT CÁC FILE LIÊN QUAN

| File | Vai trò |
|------|---------|
| `src/lib/featureConfig.ts` | **CẤU HÌNH TRUNG TÂM** — Plan→Feature, Role→Permission |
| `src/lib/tenantApi.ts` | Middleware API: requireFeature(), checkTrialLimit() |
| `src/hooks/useFeatureGate.ts` | Hook React kiểm tra quyền phía client |
| `src/components/FeatureGate.tsx` | Component bọc UI theo plan/permission |
| `src/components/Header.tsx` | Navigation gating (khóa menu) |
| `src/contexts/AuthContext.tsx` | Cung cấp plan/role cho toàn app |
| `src/pages/billing.tsx` | Trang bảng giá & thanh toán |
| `src/pages/api/tenants/plans.ts` | API trả danh sách gói |
| `src/pages/api/tenants/members.ts` | API quản lý thành viên (max_users) |
| `sql/V042_feature_gating_and_role_permissions.sql` | Migration DB |
