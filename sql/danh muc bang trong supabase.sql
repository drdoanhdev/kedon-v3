-- =============================================
-- BẢNG TRA CỨU DATABASE - TIẾNG VIỆT
-- Tài liệu giải thích tên bảng, cột, giá trị
-- =============================================

-- =============================================
-- 1. DANH SÁCH BẢNG
-- =============================================
-- tenants                = Phong kham (co so)
-- tenantmembership       = Thanh vien phong kham
-- user_profiles          = Ho so nguoi dung
-- user_roles             = Vai tro nguoi dung (toan he thong)
-- tenant_invitations     = Loi moi tham gia phong kham
-- payment_orders         = Don thanh toan
-- BenhNhan               = Benh nhan
-- DonThuoc               = Don thuoc
-- DonKinh                = Don kinh
-- Thuoc                  = Thuoc
-- NhomThuoc              = Nhom thuoc
-- ChoKham                = Cho kham (hang doi)
-- DienTien               = Dien tien benh
-- DonThuocMau            = Don thuoc mau
-- GongKinh               = Gong kinh
-- HangTrong              = Hang ton kho
-- PhieuNhapKho           = Phieu nhap kho
-- NhaCungCap             = Nha cung cap
-- GhiChuHeThong          = Ghi chu / huong dan he thong
-- ChiTietDonThuoc        = Chi tiet don thuoc
-- ChiTietDonThuocMau     = Chi tiet don thuoc mau
-- NoBenhNhan             = Cong no benh nhan

-- =============================================
-- 2. CỘT DÙNG CHUNG (XUẤT HIỆN Ở NHIỀU BẢNG)
-- =============================================
-- id                     = Ma dinh danh (tu dong tao)
-- tenant_id              = Ma phong kham (lien ket voi bang tenants)
-- user_id                = Ma nguoi dung (lien ket voi auth.users)
-- owner_id               = Ma chu phong kham
-- role                   = Vai tro
-- status                 = Trang thai
-- active                 = Dang hoat dong (true/false)
-- created_at             = Ngay tao
-- updated_at             = Ngay cap nhat gan nhat
-- email                  = Dia chi email

-- =============================================
-- 3. CỘT RIÊNG TỪNG BẢNG
-- =============================================

-- === tenants (Phong kham) ===
-- name                   = Ten phong kham
-- code                   = Ma phong kham (VD: PK001)
-- phone                  = So dien thoai
-- address                = Dia chi
-- plan                   = Goi dich vu (trial/basic/pro/enterprise)
-- plan_expires_at        = Ngay het han goi
-- trial_start            = Ngay bat dau dung thu
-- trial_days             = So ngay dung thu
-- trial_max_prescriptions = So don toi da khi dung thu
-- settings               = Cai dat rieng (JSON)

-- === tenantmembership (Thanh vien PK) ===
-- invited_by             = Duoc moi boi (user_id)
-- last_login_at          = Lan dang nhap cuoi

-- === user_profiles (Ho so nguoi dung) ===
-- full_name              = Ho ten
-- avatar_url             = Anh dai dien
-- default_tenant_id      = Phong kham mac dinh

-- === payment_orders (Don thanh toan) ===
-- amount                 = So tien (VND)
-- months                 = So thang mua
-- transfer_code          = Ma chuyen khoan (VD: KD4X7Y2Z)
-- paid_at                = Ngay thanh toan
-- expires_at             = Ngay het han don
-- bank_ref               = Ma giao dich ngan hang

-- === tenant_invitations (Loi moi) ===
-- expires_at             = Ngay het han loi moi

-- === GhiChuHeThong ===
-- slug                   = Ma dinh danh trang (VD: huong-dan, footer-ke-don)
-- title                  = Tieu de
-- content                = Noi dung
-- updated_by             = Nguoi cap nhat cuoi

-- =============================================
-- 4. GIÁ TRỊ CÁC TRƯỜNG QUAN TRỌNG
-- =============================================

-- === role (Vai tro) ===
-- superadmin             = Quan tri vien nen tang (ban - quan ly TOAN BO he thong)
-- owner                  = Chu phong kham
-- admin                  = Quan tri vien phong kham
-- doctor                 = Bac si
-- staff                  = Nhan vien

-- === status (Trang thai phong kham) ===
-- active                 = Dang hoat dong
-- suspended              = Tam dinh chi
-- inactive               = Ngung hoat dong

-- === plan (Goi dich vu) ===
-- trial                  = Dung thu mien phi (90 ngay / 1000 don)
-- basic                  = Co ban (299.000d/thang)
-- pro                    = Chuyen nghiep (599.000d/thang)
-- enterprise             = Doanh nghiep

-- === payment status (Trang thai thanh toan) ===
-- pending                = Cho thanh toan
-- paid                   = Da thanh toan
-- cancelled              = Da huy
-- expired                = Het han

-- =============================================
-- 5. PHÂN BIỆT 2 LOẠI ROLE
-- =============================================
-- Bang user_roles: VAI TRO TOAN HE THONG (global role)
--   → superadmin/admin/doctor/staff
--   → Dung de phan quyen trang admin nen tang
--
-- Bang tenantmembership: VAI TRO TRONG PHONG KHAM (tenant role)  
--   → owner/admin/doctor/staff
--   → Dung de phan quyen trong 1 phong kham cu the
--
-- Vi du: Bac si A co the la "doctor" trong PK1, nhung la "owner" cua PK2
