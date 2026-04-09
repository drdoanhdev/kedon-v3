-- Tạo bảng hãng tròng kính
CREATE TABLE IF NOT EXISTS "HangTrong" (
  "id" SERIAL PRIMARY KEY,
  "ten_hang" TEXT UNIQUE NOT NULL,
  "gia_nhap" INTEGER DEFAULT 0,
  "gia_ban" INTEGER DEFAULT 0,
  "mo_ta" TEXT,
  "ngay_tao" TIMESTAMP DEFAULT NOW(),
  "trang_thai" BOOLEAN DEFAULT true
);

-- Tạo bảng gọng kính
CREATE TABLE IF NOT EXISTS "GongKinh" (
  "id" SERIAL PRIMARY KEY,
  "ten_gong" TEXT UNIQUE NOT NULL,
  "chat_lieu" TEXT,
  "gia_nhap" INTEGER DEFAULT 0,
  "gia_ban" INTEGER DEFAULT 0,
  "mo_ta" TEXT,
  "ngay_tao" TIMESTAMP DEFAULT NOW(),
  "trang_thai" BOOLEAN DEFAULT true
);

-- Tạo bảng mẫu thị lực
CREATE TABLE IF NOT EXISTS "MauThiLuc" (
  "id" SERIAL PRIMARY KEY,
  "gia_tri" TEXT UNIQUE NOT NULL,
  "thu_tu" INTEGER DEFAULT 0
);

-- Tạo bảng mẫu số kính
CREATE TABLE IF NOT EXISTS "MauSoKinh" (
  "id" SERIAL PRIMARY KEY,
  "so_kinh" TEXT UNIQUE NOT NULL,
  "thu_tu" INTEGER DEFAULT 0
);

-- Thêm dữ liệu mẫu hãng tròng
INSERT INTO "HangTrong" ("ten_hang", "gia_nhap", "gia_ban", "mo_ta") VALUES
('Essilor', 300000, 500000, 'Hãng tròng kính hàng đầu Pháp'),
('Hoya', 250000, 450000, 'Hãng tròng kính Nhật Bản'),
('Zeiss', 400000, 650000, 'Hãng tròng kính Đức cao cấp'),
('Kodak', 200000, 350000, 'Hãng tròng kính Mỹ'),
('Chemi', 150000, 280000, 'Hãng tròng kính Hàn Quốc'),
('Ming', 100000, 200000, 'Hãng tròng kính giá rẻ')
ON CONFLICT ("ten_hang") DO NOTHING;

-- Thêm dữ liệu mẫu gọng kính  
INSERT INTO "GongKinh" ("ten_gong", "chat_lieu", "gia_nhap", "gia_ban") VALUES
('Gọng nhựa cơ bản', 'Nhựa', 50000, 150000),
('Gọng kim loại', 'Kim loại', 80000, 200000),
('Gọng titan', 'Titan', 150000, 350000),
('Gọng nhựa cao cấp', 'Nhựa TR90', 120000, 280000),
('Gọng không viền', 'Kim loại', 100000, 250000),
('Gọng nửa viền', 'Kim loại', 90000, 220000)
ON CONFLICT ("ten_gong") DO NOTHING;

-- Thêm dữ liệu mẫu thị lực
INSERT INTO "MauThiLuc" ("gia_tri", "thu_tu") VALUES
('10/10', 1), ('9/10', 2), ('8/10', 3), ('7/10', 4), ('6/10', 5),
('5/10', 6), ('4/10', 7), ('3/10', 8), ('2/10', 9), ('1/10', 10),
('CF', 11), ('HM', 12), ('LP', 13)
ON CONFLICT ("gia_tri") DO NOTHING;

-- Thêm dữ liệu mẫu số kính
INSERT INTO "MauSoKinh" ("so_kinh", "thu_tu") VALUES
('0.00', 1), ('+0.25', 2), ('+0.50', 3), ('+0.75', 4), ('+1.00', 5),
('+1.25', 6), ('+1.50', 7), ('+1.75', 8), ('+2.00', 9), ('+2.25', 10),
('+2.50', 11), ('+2.75', 12), ('+3.00', 13), ('+3.25', 14), ('+3.50', 15),
('-0.25', 16), ('-0.50', 17), ('-0.75', 18), ('-1.00', 19), ('-1.25', 20),
('-1.50', 21), ('-1.75', 22), ('-2.00', 23), ('-2.25', 24), ('-2.50', 25),
('-2.75', 26), ('-3.00', 27), ('-3.25', 28), ('-3.50', 29), ('-3.75', 30),
('-4.00', 31), ('-4.25', 32), ('-4.50', 33), ('-4.75', 34), ('-5.00', 35),
('-5.25', 36), ('-5.50', 37), ('-5.75', 38), ('-6.00', 39), ('-6.25', 40),
('-6.50', 41), ('-6.75', 42), ('-7.00', 43), ('-7.25', 44), ('-7.50', 45),
('-7.75', 46), ('-8.00', 47), ('-8.25', 48), ('-8.50', 49), ('-8.75', 50),
('-9.00', 51), ('-9.25', 52), ('-9.50', 53), ('-9.75', 54), ('-10.00', 55)
ON CONFLICT ("so_kinh") DO NOTHING;
