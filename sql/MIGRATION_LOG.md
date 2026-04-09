# SQL Migration Log

Theo dõi trạng thái migration trên từng database.
- **Optigo (dev)**: `nhoywhaintnmqlcgfduw` — DB phát triển SaaS
- **Sáng Mắt (prod)**: DB phòng khám đang sử dụng (đã chạy migrate_sangmat_to_kedon_v3.sql tổng hợp)

> **Quy tắc**: Mỗi khi tạo file SQL mới, đánh số `V0xx_ten_file.sql` và thêm 1 dòng vào bảng dưới.
> Sau khi chạy trên DB nào, đánh dấu ✅ vào cột tương ứng.

---

## Phase 1: Base tables & modifications (pre-multi-tenant)

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V001 | V001_create_kinh_tables.sql | Tạo HangTrong, GongKinh, MauThiLuc, MauSoKinh + data mẫu | ✅ | ✅ |
| V002 | V002_create_donthuocmau_tables.sql | Tạo DonThuocMau, ChiTietDonThuocMau | ✅ | ✅ |
| V003 | V003_migrate_money_to_bigint_vnd.sql | Chuyển cột tiền double → bigint (DonThuoc, DonKinh, Thuoc) | ✅ | ✅ |
| V004 | V004_add_ngay_kham_to_donthuoc.sql | Thêm ngay_kham vào DonThuoc | ✅ | ✅ |
| V005 | V005_add_trangthai_thanh_toan_to_donthuoc.sql | Thêm trangthai_thanh_toan vào DonThuoc | ✅ | ✅ |
| V006 | V006_migrate_donthuoc_is_paid.sql | Migration trạng thái thanh toán DonThuoc | ✅ | ✅ |
| V007 | V007_migrate_donkinh_add_cost_columns.sql | Thêm gianhap_trong, gianhap_gong vào DonKinh | ✅ | ✅ |
| V008 | V008_add_gong_field_to_donkinh.sql | Thêm ten_gong vào DonKinh | ✅ | ✅ |
| V009 | V009_add_pd_to_donkinh.sql | Thêm pd_mp, pd_mt vào DonKinh | ✅ | ✅ |
| V010 | V010_add_ngung_kinh_doanh_to_thuoc.sql | Thêm ngung_kinh_doanh vào Thuoc | ✅ | ✅ |
| V011 | V011_normalize_duplicate_mabenhnhan.sql | Chuẩn hóa mã bệnh nhân trùng | ✅ | ✅ |
| V012 | V012_merge_patients.sql | Function gộp bệnh nhân trùng | ✅ | ✅ |
| V013 | V013_add_task4_indexes.sql | Indexes tìm kiếm & lịch sử | ✅ | ✅ |

## Phase 2: Multi-tenant foundation

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V014 | V014_multi_tenant_setup.sql | Tạo tenants, membership, RLS, tenant_id cho tất cả bảng | ✅ | ✅ |

## Phase 3: Multi-tenant fixes & enhancements

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V015 | V015_fix_unique_constraints_multi_tenant.sql | Fix unique constraints theo tenant | ✅ | ✅ |
| V016 | V016_enforce_tenant_status_rls.sql | Kiểm tra tenant active trong RLS | ✅ | ✅ |
| V017 | V017_add_trial_to_tenants.sql | Thêm trial columns vào tenants | ✅ | ✅ |
| V018 | V018_add_plan_source_to_tenants.sql | Thêm plan_source vào tenants | ✅ | ✅ |
| V019 | V019_add_superadmin_role.sql | Mở rộng user_roles cho superadmin | ✅ | ✅ |
| V020 | V020_drop_nhom_thuoc.sql | Xóa bảng NhomThuoc (không dùng) | ✅ | ✅ |

## Phase 4: Subscription & Payment

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V021 | V021_create_subscription_plans.sql | Tạo bảng gói dịch vụ | ✅ | ✅ |
| V022 | V022_create_payment_orders.sql | Tạo bảng đơn thanh toán | ✅ | ✅ |
| V023 | V023_create_webhook_logs.sql | Tạo bảng log webhook thanh toán | ✅ | ✅ |

## Phase 5: Print config

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V024 | V024_create_cau_hinh_mau_in.sql | Tạo bảng cấu hình mẫu in | ✅ | ✅ |
| V025 | V025_add_signer_print_config.sql | Thêm cột người ký vào mẫu in | ✅ | ✅ |
| V026 | V026_add_thuoc_print_config.sql | Thêm cột cấu hình in đơn thuốc | ✅ | ✅ |

## Phase 6: Feature tables

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V027 | V027_create_ghi_chu_he_thong.sql | Tạo bảng ghi chú hệ thống | ✅ | ✅ |
| V028 | V028_create_hen_kham_lai.sql | Tạo bảng hẹn khám lại | ✅ | ✅ |
| V029 | V029_create_thongbao_tinnhan.sql | Tạo bảng thông báo & tin nhắn | ✅ | ✅ |
| V030 | V030_alter_thongbao_global_broadcast.sql | Thông báo global broadcast | ✅ | ✅ |
| V031 | V031_create_tinnhan_platform.sql | Tạo bảng tin nhắn platform | ✅ | ✅ |

## Phase 7: Inventory

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V032 | V032_create_thuoc_inventory.sql | Tạo bảng nhập kho & hủy thuốc | ✅ | ✅ |
| V033 | V033_create_thuoc_xuat_don.sql | Tạo bảng xuất kho thuốc theo đơn | ✅ | ✅ |
| V034 | V034_inventory_management.sql | Hệ thống xuất nhập tồn (tròng, gọng, vật tư) | ✅ | ✅ |
| V035 | V035_add_mat_to_lens_stock.sql | Thêm cột mắt (trái/phải) cho lens_stock | ✅ | ✅ |

## Phase 8: New migrations (từ đây trở đi)

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V036 | V036_add_fk_columns_donkinh.sql | Thêm hang_trong_mp_id, hang_trong_mt_id, gong_kinh_id vào DonKinh | ✅ | ❌ |

---

## Files không phải migration (không đánh số)

| File | Mục đích |
|------|---------|
| danh muc bang trong supabase.sql | Tài liệu tra cứu |
| danh mục bảng trong supabase.sql | Tài liệu tra cứu |
| delete_all_data.sql | Utility xóa data (NGUY HIỂM) |
