export interface BenhNhan {
  id?: number;
  mabenhnhan?: string | null;
  ten: string;
  namsinh: string; // dd/mm/yyyy hoặc yyyy
  gioitinh?: string | null; // Nam | Nữ | null
  dienthoai: string;
  diachi: string;
  ghichu?: string | null;
  tuoi?: number;
  created_at?: string;
  ngay_kham_gan_nhat?: string | null;
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

export interface PatientNote {
  id: number;
  benhnhan_id: number;
  branch_id?: string | null;
  content: string;
  note_type: 'important' | 'normal';
  deleted_at?: string | null;
  created_at: string;
}

export interface DonThuoc {
  id: number;
  madonthuoc: string;
  chandoan: string;
  ngay_kham: string;
  tongtien: number;
  trangthai_thanh_toan: string;
  sotien_da_thanh_toan: number;
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

export interface DonKinh {
  id: number;
  madonkinh: string;
  benhnhanid: number;
  ngaykham: string;
  sokinh_moi_mp?: string;
  sokinh_moi_mt?: string;
  sokinh_cu_mp?: string;
  sokinh_cu_mt?: string;
  ten_gong?: string;
  giatrong: number;
  giagong: number;
  no: boolean;
  sotien_da_thanh_toan: number;
  trangthai_thanh_toan: string;
  branch?: { id: string; ten_chi_nhanh: string } | null;
}

export interface ChiTietDonThuoc {
  thuoc: {
    id: number;
    tenthuoc: string;
  };
  soluong: number;
}

export interface DienTien {
  id: number;
  ngay: string;
  noidung: string;
}

export interface HenKham {
  id: number;
  benhnhanid: number;
  ten_benhnhan: string;
  dienthoai: string;
  ngay_hen: string;
  gio_hen: string | null;
  ly_do: string;
  trang_thai: string;
  ghichu: string;
}

export type SortField =
  | 'ten'
  | 'namsinh'
  | 'tuoi'
  | 'dienthoai'
  | 'diachi'
  | 'created_at'
  | 'ngay_kham_gan_nhat';

export type SortDirection = 'asc' | 'desc';

export type SortConfigItem = { field: SortField; direction: SortDirection };

export type NotesViewMode = 'active' | 'all' | 'trash';

export interface ChainHistoryBranchStat {
  ten: string;
  don_kinh: number;
  don_thuoc: number;
}

export interface ChainHistoryDonKinh {
  id: number;
  ngay_kham?: string | null;
  sph_mp?: string | null;
  cyl_mp?: string | null;
  sph_mt?: string | null;
  cyl_mt?: string | null;
  lab_status?: string | null;
  branch?: { ten_chi_nhanh?: string | null } | null;
}

export interface ChainHistoryDonThuoc {
  id: number;
  ngay_kham?: string | null;
  branch?: { ten_chi_nhanh?: string | null } | null;
}

export interface ChainHistory {
  by_branch?: ChainHistoryBranchStat[];
  don_kinh?: ChainHistoryDonKinh[];
  don_thuoc?: ChainHistoryDonThuoc[];
}
