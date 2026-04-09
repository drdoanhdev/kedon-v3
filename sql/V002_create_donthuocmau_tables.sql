-- Migration: Create DonThuocMau table for prescription templates
-- This table stores predefined prescription templates for quick prescribing

-- Create DonThuocMau table
CREATE TABLE IF NOT EXISTS "DonThuocMau" (
    "id" SERIAL PRIMARY KEY,
    "ten_mau" VARCHAR(255) NOT NULL,
    "mo_ta" TEXT,
    "chuyen_khoa" VARCHAR(100),
    "created_at" TIMESTAMPTZ DEFAULT NOW(),
    "updated_at" TIMESTAMPTZ DEFAULT NOW()
);

-- Create ChiTietDonThuocMau table for template details
CREATE TABLE IF NOT EXISTS "ChiTietDonThuocMau" (
    "id" SERIAL PRIMARY KEY,
    "donthuocmauid" INTEGER NOT NULL REFERENCES "DonThuocMau"("id") ON DELETE CASCADE,
    "thuocid" INTEGER NOT NULL REFERENCES "Thuoc"("id") ON DELETE CASCADE,
    "soluong" INTEGER NOT NULL DEFAULT 1,
    "ghi_chu" TEXT,
    UNIQUE("donthuocmauid", "thuocid")
);

-- Create indexes for better performance
CREATE INDEX IF NOT EXISTS "idx_donthuocmau_chuyen_khoa" ON "DonThuocMau"("chuyen_khoa");
CREATE INDEX IF NOT EXISTS "idx_chitietdonthuocmau_donthuocmauid" ON "ChiTietDonThuocMau"("donthuocmauid");
CREATE INDEX IF NOT EXISTS "idx_chitietdonthuocmau_thuocid" ON "ChiTietDonThuocMau"("thuocid");

-- Insert some sample templates
INSERT INTO "DonThuocMau" ("ten_mau", "mo_ta", "chuyen_khoa") VALUES
('Viêm kết mạc thông thường', 'Đơn thuốc cơ bản cho viêm kết mạc', 'Mắt'),
('Nhiễm trùng mắt nặng', 'Đơn thuốc cho nhiễm trùng mắt cần điều trị mạnh', 'Mắt'),
('Khô mắt', 'Đơn thuốc điều trị khô mắt', 'Mắt'),
('Viêm bờ mi', 'Đơn thuốc điều trị viêm bờ mi', 'Mắt');
