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
| V036 | V036_add_fk_columns_donkinh.sql | Thêm hang_trong_mp_id, hang_trong_mt_id, gong_kinh_id vào DonKinh | ✅ | ✅ |

## Phase 9: Pricing model v2

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V049 | V049_branch_pricing_and_cost_snapshots.sql | Nền tảng giá theo chi nhánh + snapshot giá/vốn chi tiết đơn thuốc | ✅ | ✅ |

## Phase 10: Branch transfer hardening

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V050 | V050_branch_transfer_inventory_audit_and_gong_unique.sql | Hoàn thiện điều chuyển thuốc/tròng/gọng: log audit điều chuyển + unique gọng theo chi nhánh | ✅ | ✅ |

## Phase 11: Lens transfer schema fix

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V051 | V051_fix_lens_stock_unique_per_branch.sql | Sửa unique lens_stock theo tenant + chi nhánh để tránh lỗi duplicate khi điều chuyển tròng | ✅ | ✅ |

## Phase 12: Messaging automation (Zalo OA)

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V052 | V052_create_messaging_automation.sql | Tạo `clinic_messaging_channels`, `message_workflows`, `message_jobs`, `message_logs` + RLS + cleanup func |  ✅ |  ✅ |

## Phase 13: FAB Activity Hub sync

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V057 | V057_create_recent_activity_events.sql | Tạo bảng đồng bộ Activity Hub đa thiết bị (`recent_activity_events`) + RLS + indexes |  ✅ |  ✅ |

## Phase 14: Waiting room cleanup governance

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V058 | V058_add_waiting_cleanup_audit_and_done_at.sql | Thêm `done_at` cho `ChoKham` + bảng `waiting_cleanup_logs` (audit dọn ca) + RLS | ✅ | ✅ |

## Phase 15: Waiting room cleanup hardening follow-up

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V059 | V059_waiting_room_cleanup_hardening.sql | Bản follow-up sau V058: index + trigger `done_at` + audit log dọn ca + RLS | ✅ | ✅ |

## Phase 16: Waiting room cleanup cron backend

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V060 | V060_waiting_room_cleanup_cron_backend.sql | RPC dọn ca đã xong dùng cho cron backend + mở rộng `actor_role` cho `system` | ✅ | ✅ |

## Phase 17: Waiting room cleanup optimization

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V061 | V061_waiting_room_cleanup_optimization.sql | Tối ưu RPC dọn ca, bỏ temp table, thêm index cho log theo role | ✅ | ✅ |

## Phase 18: Waiting room cleanup log archival

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V062 | V062_waiting_room_cleanup_log_archival.sql | Lưu trữ log dọn ca cũ sang bảng archive + RPC archive + cron backend | ✅ | ✅ |

## Phase 19: Patient notes governance

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V063 | V063_create_patient_alerts_and_contact_tasks.sql | Tạo bảng cảnh báo bệnh nhân và nhiệm vụ liên hệ | ✅ | ✅ |
| V064 | V064_patient_notes_soft_delete_and_history.sql | Soft delete + lịch sử chỉnh sửa/xóa/khôi phục cho cảnh báo và nhiệm vụ liên hệ | ✅ | ✅ |

## Phase 20: Patient notes simplification

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V065 | V065_simplify_patient_notes_single_table.sql | Đơn giản hóa về 1 bảng ghi chú bệnh nhân (`patient_notes_simple`) + migrate dữ liệu từ V063/V064 | ✅ | ✅ |

## Phase 21: Patient notes legacy cleanup

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V066 | V066_drop_legacy_patient_notes_tables.sql | Xóa thẳng bảng ghi chú legacy (`patient_alerts`, `patient_contact_tasks` và history) sau khi đã chạy V065 | ✅ | ✅ |

## Phase 22: DonKinh media storage foundation

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V067 | V067_don_kinh_media_storage_foundation.sql | Tạo bảng `don_kinh_media` + RLS + bucket private Supabase cho ảnh đơn kính/gọng/khúc xạ, sẵn sàng chuyển provider sang R2 |✅|  |

## Phase 23: DonKinh media ordering MVP

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V068 | V068_add_sort_order_to_don_kinh_media.sql | Thêm `sort_order` cho `don_kinh_media`, backfill dữ liệu cũ và tạo index để hỗ trợ kéo-thả sắp xếp thumbnail |✅|✅|

## Phase 24: Family Group CRM (hồ sơ gia đình khách hàng)

| #     | File | Mô tả | Optigo | Sáng Mắt |
|-------|------|-------|:------:|:--------:|
| V069  | V069_create_family_groups.sql | Tạo `family_groups` + `family_members` (UNIQUE benhnhan_id, partial UNIQUE 1-primary/group) + RLS pattern V067 + trigger đồng bộ tenant_id | | |
| V069b | V069b_seed_family_groups_dev.sql | Seed dev: 1 gia đình 4 người từ 4 bệnh nhân đầu của tenant |✅|✅|

## Phase 25: GongKinh media storage (ảnh gọng kính)

| #     | File | Mô tả | Optigo | Sáng Mắt |
|-------|------|-------|:------:|:--------:|
| V070  | V070_gong_kinh_media.sql | Tạo `gong_kinh_media` (max 3 loại ảnh: mặt trước, trái, phải) + RLS + bucket Supabase |✅|✅|
| V071  | V071_gong_kinh_media_bucket_and_trigger.sql | Bổ sung trigger `updated_at` + đảm bảo bucket `gong-kinh-media` tồn tại (upsert) cho các DB đã chạy V070 |✅|✅|

## Phase 26: Branch + frame metadata

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V077 | V077_branch_address_and_frame_attrs.sql | Bổ sung `branches.dia_chi_full` và `GongKinh.hang_san_xuat` (metadata dùng chung) | | |

## Phase 27: Tem kinh templates

| #    | File | Mô tả | Optigo | Sáng Mắt |
|------|------|-------|:------:|:--------:|
| V078 | V078_create_tem_kinh_templates.sql | Tạo bảng `tem_kinh_templates` để lưu mẫu in tem kính theo tenant/user (JSON elements + default template theo user) | | |
| V079 | V079_tem_kinh_templates_user_scope_and_print_settings.sql | Bổ sung cột cấu hình in (dpi, gap, speed, density, bitmap) + ràng buộc unique theo user + cập nhật RLS user-owned templates | | |

---

## Files không phải migration (không đánh số)

| File | Mục đích |
|------|---------|
| danh muc bang trong supabase.sql | Tài liệu tra cứu |
| danh mục bảng trong supabase.sql | Tài liệu tra cứu |
| delete_all_data.sql | Utility xóa data (NGUY HIỂM) |
