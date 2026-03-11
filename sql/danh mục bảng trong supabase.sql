-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.BenhNhan (
  ten text NOT NULL,
  diachi text,
  dienthoai text,
  mabenhnhan text,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  namsinh text,
  CONSTRAINT BenhNhan_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ChiTietDonThuoc (
  donthuocid integer,
  soluong integer,
  thuocid integer,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT ChiTietDonThuoc_pkey PRIMARY KEY (id),
  CONSTRAINT ChiTietDonThuoc_thuocid_fkey FOREIGN KEY (thuocid) REFERENCES public.Thuoc(id),
  CONSTRAINT ChiTietDonThuoc_donthuocid_fkey FOREIGN KEY (donthuocid) REFERENCES public.DonThuoc(id)
);
CREATE TABLE public.ChiTietDonThuocMau (
  donthuocmauid integer NOT NULL,
  thuocid integer NOT NULL,
  ghi_chu text,
  id integer NOT NULL DEFAULT nextval('"ChiTietDonThuocMau_id_seq"'::regclass),
  soluong integer NOT NULL DEFAULT 1,
  CONSTRAINT ChiTietDonThuocMau_pkey PRIMARY KEY (id),
  CONSTRAINT ChiTietDonThuocMau_thuocid_fkey FOREIGN KEY (thuocid) REFERENCES public.Thuoc(id),
  CONSTRAINT ChiTietDonThuocMau_donthuocmauid_fkey FOREIGN KEY (donthuocmauid) REFERENCES public.DonThuocMau(id)
);
CREATE TABLE public.ChiTietNhapKho (
  phieunhapkhoid integer,
  thuocid integer,
  soluong integer,
  dongia double precision,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT ChiTietNhapKho_pkey PRIMARY KEY (id),
  CONSTRAINT ChiTietNhapKho_phieunhapkhoid_fkey FOREIGN KEY (phieunhapkhoid) REFERENCES public.PhieuNhapKho(id),
  CONSTRAINT ChiTietNhapKho_thuocid_fkey FOREIGN KEY (thuocid) REFERENCES public.DonThuoc(id)
);
CREATE TABLE public.ChoKham (
  benhnhanid integer,
  thoigian timestamp without time zone DEFAULT now(),
  trangthai character varying DEFAULT 'chờ'::character varying,
  id integer NOT NULL DEFAULT nextval('"ChoKham_id_seq"'::regclass),
  CONSTRAINT ChoKham_pkey PRIMARY KEY (id),
  CONSTRAINT ChoKham_benhnhanid_fkey FOREIGN KEY (benhnhanid) REFERENCES public.BenhNhan(id)
);
CREATE TABLE public.DienTien (
  benhnhanid integer,
  ngay timestamp without time zone,
  noidung text,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT DienTien_pkey PRIMARY KEY (id),
  CONSTRAINT DienTien_benhnhanid_fkey FOREIGN KEY (benhnhanid) REFERENCES public.BenhNhan(id)
);
CREATE TABLE public.DonKinh (
  benhnhanid integer NOT NULL,
  chandoan text,
  giatrong double precision,
  giagong double precision,
  ghichu text,
  thiluc_khongkinh_mp text,
  thiluc_kinhcu_mp text,
  thiluc_kinhmoi_mp text,
  sokinh_cu_mp text,
  sokinh_moi_mp text,
  hangtrong_mp text,
  thiluc_khongkinh_mt text,
  thiluc_kinhcu_mt text,
  thiluc_kinhmoi_mt text,
  sokinh_cu_mt text,
  sokinh_moi_mt text,
  hangtrong_mt text,
  ax_mp double precision,
  ax_mt double precision,
  lai double precision,
  no boolean DEFAULT false,
  id integer NOT NULL DEFAULT nextval('donkinh_id_seq'::regclass),
  sotien_da_thanh_toan integer DEFAULT 0,
  ten_gong text,
  ngaykham timestamp without time zone NOT NULL,
  CONSTRAINT DonKinh_pkey PRIMARY KEY (id),
  CONSTRAINT donkinh_benhnhanid_fkey FOREIGN KEY (benhnhanid) REFERENCES public.BenhNhan(id)
);
CREATE TABLE public.DonThuoc (
  benhnhanid integer,
  chandoan text,
  madonthuoc text,
  tongtien double precision,
  chuyen_khoa character varying,
  sotien_da_thanh_toan integer DEFAULT 0,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  ngay_kham timestamp without time zone,
  no boolean,
  ngaylap timestamp without time zone,
  lai bigint DEFAULT 0,
  CONSTRAINT DonThuoc_pkey PRIMARY KEY (id),
  CONSTRAINT DonThuoc_benhnhanid_fkey FOREIGN KEY (benhnhanid) REFERENCES public.BenhNhan(id)
);
CREATE TABLE public.DonThuocMau (
  ten_mau character varying NOT NULL,
  mo_ta text,
  chuyen_khoa character varying,
  id integer NOT NULL DEFAULT nextval('"DonThuocMau_id_seq"'::regclass),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT DonThuocMau_pkey PRIMARY KEY (id)
);
CREATE TABLE public.GongKinh (
  ten_gong text NOT NULL UNIQUE,
  chat_lieu text,
  mo_ta text,
  id integer NOT NULL DEFAULT nextval('"GongKinh_id_seq"'::regclass),
  gia_nhap integer DEFAULT 0,
  gia_ban integer DEFAULT 0,
  ngay_tao timestamp without time zone DEFAULT now(),
  trang_thai boolean DEFAULT true,
  CONSTRAINT GongKinh_pkey PRIMARY KEY (id)
);
CREATE TABLE public.HangTrong (
  ten_hang text NOT NULL UNIQUE,
  mo_ta text,
  id integer NOT NULL DEFAULT nextval('"HangTrong_id_seq"'::regclass),
  gia_nhap integer DEFAULT 0,
  gia_ban integer DEFAULT 0,
  ngay_tao timestamp without time zone DEFAULT now(),
  trang_thai boolean DEFAULT true,
  CONSTRAINT HangTrong_pkey PRIMARY KEY (id)
);
CREATE TABLE public.MauSoKinh (
  so_kinh text NOT NULL UNIQUE,
  id integer NOT NULL DEFAULT nextval('"MauSoKinh_id_seq"'::regclass),
  thu_tu integer DEFAULT 0,
  CONSTRAINT MauSoKinh_pkey PRIMARY KEY (id)
);
CREATE TABLE public.MauThiLuc (
  gia_tri text NOT NULL UNIQUE,
  id integer NOT NULL DEFAULT nextval('"MauThiLuc_id_seq"'::regclass),
  thu_tu integer DEFAULT 0,
  CONSTRAINT MauThiLuc_pkey PRIMARY KEY (id)
);
CREATE TABLE public.NhaCungCap (
  ten text NOT NULL,
  dia_chi text,
  dien_thoai text,
  ghi_chu text,
  id bigint NOT NULL DEFAULT nextval('nha_cung_cap_id_seq'::regclass),
  facebook text,
  CONSTRAINT NhaCungCap_pkey PRIMARY KEY (id)
);
CREATE TABLE public.NhomThuoc (
  ten text,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT NhomThuoc_pkey PRIMARY KEY (id)
);
CREATE TABLE public.PhieuNhapKho (
  ngaylap timestamp without time zone,
  nhacungcap text,
  tongtien double precision,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT PhieuNhapKho_pkey PRIMARY KEY (id)
);
CREATE TABLE public.Thuoc (
  mathuoc text,
  tenthuoc text,
  donvitinh text,
  cachdung text,
  nhomthuoc text,
  giaban double precision,
  gianhap double precision,
  hoatchat text,
  tonkho integer,
  soluongmacdinh integer,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  la_thu_thuat boolean DEFAULT false,
  CONSTRAINT Thuoc_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ThuocNhom (
  thuocId integer NOT NULL,
  nhomId integer NOT NULL,
  id integer GENERATED ALWAYS AS IDENTITY NOT NULL,
  CONSTRAINT ThuocNhom_pkey PRIMARY KEY (id, thuocId, nhomId),
  CONSTRAINT ThuocNhom_nhomId_fkey FOREIGN KEY (nhomId) REFERENCES public.NhomThuoc(id),
  CONSTRAINT ThuocNhom_thuocId_fkey FOREIGN KEY (thuocId) REFERENCES public.Thuoc(id)
);