import React, { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Pencil, Trash2, Plus, Pill, Package, Glasses, Frame, Eye, Target, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import axios from 'axios';

// Interfaces
interface Thuoc {
  id?: number;
  mathuoc: string;
  tenthuoc: string;
  donvitinh: string;
  cachdung: string;
  hoatchat: string;
  giaban: number;
  gianhap: number;
  tonkho: number;
  soluongmacdinh: number;
  la_thu_thuat: boolean;
}

interface DonThuocMau {
  id: number;
  ten_mau: string;
  mo_ta: string;
  chuyen_khoa: string;
  chitiet: any[];
}

interface ThuocMau {
  thuocid: number;
  soluong: number;
  ghi_chu: string;
}

interface HangTrong {
  id: number;
  ten_hang: string;
  gia_nhap: number;
  gia_ban: number;
  mo_ta?: string;
}

interface GongKinh {
  id: number;
  ten_gong: string;
  chat_lieu?: string;
  gia_nhap: number;
  gia_ban: number;
  mo_ta?: string;
}

interface MauThiLuc {
  id: number;
  gia_tri: string;
  thu_tu: number;
}

interface MauSoKinh {
  id: number;
  so_kinh: string;
  thu_tu: number;
}

interface NhaCungCap {
  id: number;
  ten: string;
  dia_chi?: string;
  dien_thoai?: string;
  ghi_chu?: string;
  facebook?: string;
}

function DanhMucPage() {
  const { confirm } = useConfirm();
  // Define tab options
  const tabs = [
    { value: 'thuoc', label: 'Thuốc', icon: Pill },
    { value: 'don-mau', label: 'Đơn mẫu', icon: Package },
    { value: 'hang-trong', label: 'Tròng', icon: Glasses },
    { value: 'gong-kinh', label: 'Gọng', icon: Frame },
  { value: 'nha-cung-cap', label: 'Nhà cung cấp', icon: Building2 },
    { value: 'so-kinh', label: 'Số kính', icon: Target },
    { value: 'thi-luc', label: 'Thị lực', icon: Eye },
  ];

  const [activeTab, setActiveTab] = useState('thuoc');

  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Danh mục';
    }
  }, []);

  // States cho thuốc
  const [thuocs, setThuocs] = useState<Thuoc[]>([]);
  const [searchThuoc, setSearchThuoc] = useState('');
  const [openThuoc, setOpenThuoc] = useState(false);
  const [isEditingThuoc, setIsEditingThuoc] = useState(false);
  const [thuocForm, setThuocForm] = useState<Thuoc>({
    mathuoc: '',
    tenthuoc: '',
    donvitinh: '',
    cachdung: '',
    hoatchat: '',
    giaban: 0,
    gianhap: 0,
    tonkho: 0,
    soluongmacdinh: 1,
    la_thu_thuat: false,
  });

  // States cho đơn mẫu
  const [dsMau, setDsMau] = useState<DonThuocMau[]>([]);
  const [showDonMauForm, setShowDonMauForm] = useState(false);
  const [editingMau, setEditingMau] = useState<DonThuocMau | null>(null);
  const [tenMau, setTenMau] = useState('');
  const [moTa, setMoTa] = useState('');
  const [thuocsMau, setThuocsMau] = useState<ThuocMau[]>([]);
  const [soLuong, setSoLuong] = useState(1);
  const [ghiChu, setGhiChu] = useState('');
  const [timKiemThuoc, setTimKiemThuoc] = useState('');

  // States cho hãng tròng
  const [dsHangTrong, setDsHangTrong] = useState<HangTrong[]>([]);
  const [openHangTrongDialog, setOpenHangTrongDialog] = useState(false);
  const [isEditingHangTrong, setIsEditingHangTrong] = useState(false);
  const [searchHangTrong, setSearchHangTrong] = useState('');
  const [hangTrongForm, setHangTrongForm] = useState<HangTrong>({
    id: 0,
    ten_hang: '',
    gia_nhap: 0,
    gia_ban: 0,
    mo_ta: '',
  });

  // States cho gọng kính
  const [dsGongKinh, setDsGongKinh] = useState<GongKinh[]>([]);
  const [openGongKinhDialog, setOpenGongKinhDialog] = useState(false);
  const [isEditingGongKinh, setIsEditingGongKinh] = useState(false);
  const [searchGongKinh, setSearchGongKinh] = useState('');
  const [gongKinhForm, setGongKinhForm] = useState<GongKinh>({
    id: 0,
    ten_gong: '',
    chat_lieu: '',
    gia_nhap: 0,
    gia_ban: 0,
    mo_ta: '',
  });

  // States cho mẫu dữ liệu (Số kính, Thị lực)
  const [dsThiLuc, setDsThiLuc] = useState<MauThiLuc[]>([]);
  const [dsSoKinh, setDsSoKinh] = useState<MauSoKinh[]>([]);
  const [openSoKinhDialog, setOpenSoKinhDialog] = useState(false);
  const [openThiLucDialog, setOpenThiLucDialog] = useState(false);
  const [isEditingSoKinh, setIsEditingSoKinh] = useState(false);
  const [isEditingThiLuc, setIsEditingThiLuc] = useState(false);
  const [soKinhForm, setSoKinhForm] = useState<MauSoKinh>({ id: 0, so_kinh: '', thu_tu: 0 });
  const [thiLucForm, setThiLucForm] = useState<MauThiLuc>({ id: 0, gia_tri: '', thu_tu: 0 });

  // States cho Nhà cung cấp
  const [dsNhaCungCap, setDsNhaCungCap] = useState<NhaCungCap[]>([]);
  const [searchNCC, setSearchNCC] = useState('');
  const [openNCCDialog, setOpenNCCDialog] = useState(false);
  const [isEditingNCC, setIsEditingNCC] = useState(false);
  const [nccForm, setNccForm] = useState<NhaCungCap>({ id: 0, ten: '', dia_chi: '', dien_thoai: '', ghi_chu: '', facebook: '' });

  // Xác thực lại bằng mật khẩu tài khoản Supabase
  const { user, signIn } = useAuth();
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [password, setPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  // Fetch data functions
  const fetchThuocs = async () => {
    try {
      // Thêm cache-busting parameters
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const thuocRes = await axios.get(`/api/thuoc?_t=${timestamp}&_r=${random}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
      setThuocs(thuocRes.data.data || []);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error('Lỗi khi tải dữ liệu: ' + message);
    }
  };

  const fetchDonMau = async () => {
    try {
      const response = await axios.get('/api/don-thuoc-mau');
      setDsMau(response.data.data || []);
    } catch (error) {
      console.error('Lỗi khi tải đơn mẫu:', error);
      toast.error('Lỗi khi tải danh sách đơn mẫu');
    }
  };

  const fetchHangTrong = async () => {
    try {
      const response = await axios.get('/api/hang-trong');
      setDsHangTrong(response.data || []);
    } catch (error) {
      console.error('Lỗi khi tải hãng tròng:', error);
      toast.error('Lỗi khi tải danh sách hãng tròng');
    }
  };

  const fetchGongKinh = async () => {
    try {
      const response = await axios.get('/api/gong-kinh');
      setDsGongKinh(response.data || []);
    } catch (error) {
      console.error('Lỗi khi tải gọng kính:', error);
      toast.error('Lỗi khi tải danh sách gọng kính');
    }
  };

  const fetchMauDuLieu = async () => {
    try {
      const [resThiLuc, resSoKinh] = await Promise.all([
        axios.get('/api/mau-kinh?type=thiluc'),
        axios.get('/api/mau-kinh?type=sokinh')
      ]);
      setDsThiLuc(resThiLuc.data || []);
      setDsSoKinh(resSoKinh.data || []);
    } catch (error) {
      console.error('Lỗi khi tải mẫu dữ liệu:', error);
      toast.error('Lỗi khi tải mẫu dữ liệu kính');
    }
  };

  useEffect(() => {
    fetchThuocs();
    fetchDonMau();
    fetchHangTrong();
    fetchGongKinh();
    fetchMauDuLieu();
  fetchNhaCungCap();
  }, []);

  // Helper functions
  const generateMaThuoc = (list: Thuoc[]) => {
    if (!list || list.length === 0) {
      return 'TH00001';
    }
    const max = list.reduce((acc, cur) => {
      const match = cur.mathuoc?.match(/TH(\d+)/);
      const num = match ? parseInt(match[1], 10) : 0;
      return Math.max(acc, num);
    }, 0);
    return `TH${(max + 1).toString().padStart(5, '0')}`;
  };

  const handleSubmitThuoc = async () => {
    if (!thuocForm.tenthuoc || !thuocForm.donvitinh) {
      toast.error('Vui lòng nhập tên thuốc và đơn vị.');
      return;
    }
    try {
      // Chuyển đổi dữ liệu gửi đi
      const { id, ...basePayload } = thuocForm;
      
      // Làm sạch và chuẩn hóa dữ liệu
      const payload: any = { 
        ...basePayload,
        tenthuoc: thuocForm.tenthuoc?.trim() || '',
        donvitinh: thuocForm.donvitinh?.trim() || '',
        cachdung: thuocForm.cachdung?.trim() || '',
        hoatchat: thuocForm.hoatchat?.trim() || '',
        giaban: Number(thuocForm.giaban) || 0,
        gianhap: Number(thuocForm.gianhap) || 0,
        tonkho: Number(thuocForm.tonkho) || 0,
        soluongmacdinh: Number(thuocForm.soluongmacdinh) || 1,
        la_thu_thuat: Boolean(thuocForm.la_thu_thuat)
      };
      
      console.log('🚀 Payload gửi đến API:', payload);
      
      if (!isEditingThuoc) {
        // Không gửi id khi tạo mới, để auto-increment tự động tạo
        // Chỉ generate mathuoc nếu chưa có
        if (!payload.mathuoc) {
          payload.mathuoc = generateMaThuoc(thuocs);
        }
        console.log('📝 POST payload (no id):', payload);
        await axios.post('/api/thuoc', payload);
        toast.success('Đã thêm thuốc');
      } else {
        // Thêm id vào payload khi cập nhật
        payload.id = thuocForm.id;
        console.log('✏️ PUT payload (with id):', payload);
        await axios.put('/api/thuoc', payload);
        toast.success('Đã cập nhật thuốc');
      }
      setOpenThuoc(false);
      fetchThuocs();
    } catch (error: unknown) {
      console.log('❌ Chi tiết lỗi:', error);
      if (axios.isAxiosError(error)) {
        console.log('📊 Response data:', error.response?.data);
        console.log('📊 Response status:', error.response?.status);
      }
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error('Lỗi khi lưu thuốc: ' + message);
    }
  };

  const handleEditThuoc = (t: Thuoc) => {
    setThuocForm(t);
    setIsEditingThuoc(true);
    setOpenThuoc(true);
  };

  const deleteThuoc = async (id: number) => {
    if (!await confirm('Bạn có chắc muốn xoá thuốc này?')) return;
    try {
      await axios.delete(`/api/thuoc?id=${id}`);
      toast.success('Đã xoá thuốc');
      fetchThuocs();
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error('Lỗi khi xoá thuốc: ' + message);
    }
  };

  // === START: Logic cho Đơn thuốc mẫu ===
  const resetDonMauForm = () => {
    setTenMau('');
    setMoTa('');
    setThuocsMau([]);
    setSoLuong(1);
    setGhiChu('');
    setTimKiemThuoc('');
    setEditingMau(null);
  };

  const handleEditDonMau = (mau: DonThuocMau) => {
    setEditingMau(mau);
    setTenMau(mau.ten_mau);
    setMoTa(mau.mo_ta);
    setThuocsMau(mau.chitiet.map(ct => ({
      thuocid: ct.thuoc.id,
      soluong: ct.soluong,
      ghi_chu: ct.ghi_chu
    })));
    setShowDonMauForm(true);
  };

  const handleSubmitDonMau = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!tenMau.trim() || thuocsMau.length === 0) {
      toast.error('Vui lòng nhập tên mẫu và chọn ít nhất một thuốc');
      return;
    }

    try {
      const payload = {
        ten_mau: tenMau,
        mo_ta: moTa,
        thuocs: thuocsMau
      };

      const response = await axios({
        method: editingMau ? 'PUT' : 'POST',
        url: '/api/don-thuoc-mau',
        data: editingMau ? { id: editingMau.id, ...payload } : payload,
      });

      toast.success(response.data.message);
      setShowDonMauForm(false);
      resetDonMauForm();
      fetchDonMau();
    } catch (error) {
      console.error('Lỗi:', error);
      toast.error('Lỗi khi lưu đơn thuốc mẫu');
    }
  };

  const handleDeleteDonMau = async (id: number) => {
    if (!await confirm('Bạn có chắc chắn muốn xóa đơn thuốc mẫu này?')) return;

    try {
      const response = await axios.delete(`/api/don-thuoc-mau?id=${id}`);
      toast.success(response.data.message);
      fetchDonMau();
    } catch (error) {
      console.error('Lỗi:', error);
      toast.error('Lỗi khi xóa đơn thuốc mẫu');
    }
  };

  const removeThuocFromMau = (thuocid: number) => {
    setThuocsMau(thuocsMau.filter(t => t.thuocid !== thuocid));
  };

  const getThuocInfo = (thuocid: number) => {
    return thuocs.find(t => t.id === thuocid);
  };

  const handleSoLuongChange = (thuocid: number, newSoLuong: number) => {
    setThuocsMau(currentThuocs =>
      currentThuocs.map(t =>
        t.thuocid === thuocid ? { ...t, soluong: Math.max(1, newSoLuong) } : t
      )
    );
  };

  const handleGhiChuChange = (thuocid: number, newGhiChu: string) => {
    setThuocsMau(currentThuocs =>
      currentThuocs.map(t =>
        t.thuocid === thuocid ? { ...t, ghi_chu: newGhiChu } : t
      )
    );
  };
  // === END: Logic cho Đơn thuốc mẫu ===

  // === START: Logic cho Hãng Tròng ===
  const resetHangTrongForm = () => {
    setIsEditingHangTrong(false);
    setHangTrongForm({
      id: 0,
      ten_hang: '',
      gia_nhap: 0,
      gia_ban: 0,
      mo_ta: '',
    });
  };

  const handleEditHangTrong = (hang: HangTrong) => {
    setIsEditingHangTrong(true);
    setHangTrongForm(hang);
    setOpenHangTrongDialog(true);
  };

  const handleSubmitHangTrong = async () => {
    if (!hangTrongForm.ten_hang) {
      toast.error('Vui lòng nhập tên hãng tròng.');
      return;
    }
    try {
      if (isEditingHangTrong) {
        await axios.put('/api/hang-trong', hangTrongForm);
        toast.success('Đã cập nhật hãng tròng');
      } else {
        const { id, ...payload } = hangTrongForm;
        await axios.post('/api/hang-trong', payload);
        toast.success('Đã thêm hãng tròng');
      }
      setOpenHangTrongDialog(false);
      fetchHangTrong();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : 'Lỗi không xác định';
      toast.error(`Lỗi khi lưu hãng tròng: ${message}`);
    }
  };

  const handleDeleteHangTrong = async (id: number) => {
    if (!await confirm('Bạn có chắc chắn muốn xóa hãng tròng này?')) return;
    try {
      // Ưu tiên gọi xoá với query param (API đã hỗ trợ). Nếu lỗi thử fallback body.
      try {
        await axios.delete(`/api/hang-trong?id=${id}`);
      } catch (e) {
        // Fallback cho môi trường không pass query id
        await axios.delete('/api/hang-trong', { data: { id } });
      }
      toast.success('Xóa hãng tròng thành công');
      fetchHangTrong();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : 'Lỗi không xác định';
      toast.error(`Lỗi khi xóa hãng tròng: ${message}`);
    }
  };
  // === END: Logic cho Hãng Tròng ===

  // === START: Logic cho Gọng Kính ===
  const resetGongKinhForm = () => {
    setIsEditingGongKinh(false);
    setGongKinhForm({
      id: 0,
      ten_gong: '',
      chat_lieu: '',
      gia_nhap: 0,
      gia_ban: 0,
      mo_ta: '',
    });
  };

  const handleEditGongKinh = (gong: GongKinh) => {
    setIsEditingGongKinh(true);
    setGongKinhForm(gong);
    setOpenGongKinhDialog(true);
  };

  const handleSubmitGongKinh = async () => {
    if (!gongKinhForm.ten_gong) {
      toast.error('Vui lòng nhập tên gọng kính.');
      return;
    }
    try {
      if (isEditingGongKinh) {
        await axios.put('/api/gong-kinh', gongKinhForm);
        toast.success('Đã cập nhật gọng kính');
      } else {
        const { id, ...payload } = gongKinhForm;
        await axios.post('/api/gong-kinh', payload);
        toast.success('Đã thêm gọng kính');
      }
      setOpenGongKinhDialog(false);
      resetGongKinhForm();
      fetchGongKinh();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : 'Lỗi không xác định';
      toast.error(`Lỗi khi lưu gọng kính: ${message}`);
    }
  };

  const handleDeleteGongKinh = async (id: number) => {
    if (!await confirm('Bạn có chắc chắn muốn xóa gọng kính này?')) return;
    try {
      await axios.delete('/api/gong-kinh', { data: { id } });
      toast.success('Xóa gọng kính thành công');
      fetchGongKinh();
    } catch (error) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : 'Lỗi không xác định';
      toast.error(`Lỗi khi xóa gọng kính: ${message}`);
    }
  };
  // === END: Logic cho Gọng Kính ===

  // === START: Logic cho Mẫu Dữ Liệu (Số Kính, Thị Lực) ===
  const resetSoKinhForm = () => {
    setIsEditingSoKinh(false);
    setSoKinhForm({ id: 0, so_kinh: '', thu_tu: 0 });
  };

  const resetThiLucForm = () => {
    setIsEditingThiLuc(false);
    setThiLucForm({ id: 0, gia_tri: '', thu_tu: 0 });
  };

  const handleEditSoKinh = (item: MauSoKinh) => {
    setIsEditingSoKinh(true);
    setSoKinhForm(item);
    setOpenSoKinhDialog(true);
  };

  const handleEditThiLuc = (item: MauThiLuc) => {
    setIsEditingThiLuc(true);
    setThiLucForm(item);
    setOpenThiLucDialog(true);
  };

  const handleSubmitSoKinh = async () => {
    if (!soKinhForm.so_kinh.trim()) {
      toast.error('Vui lòng nhập số kính.');
      return;
    }
    try {
      const { id, ...rest } = soKinhForm;
      const payload = {
        type: 'sokinh',
        so_kinh: rest.so_kinh,
        thu_tu: Number(rest.thu_tu) || 0
      };

      if (isEditingSoKinh) {
        await axios.put('/api/mau-kinh', { ...payload, id: id });
        toast.success('Đã cập nhật mẫu số kính');
      } else {
        // Khi tạo mới, không gửi `id`
        await axios.post('/api/mau-kinh', payload);
        toast.success('Đã thêm mẫu số kính');
      }
      setOpenSoKinhDialog(false);
      fetchMauDuLieu();
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : 'Lỗi không xác định';
      toast.error(`Lỗi khi lưu số kính: ${message}`);
    }
  };

  const handleSubmitThiLuc = async () => {
    if (!thiLucForm.gia_tri.trim()) {
      toast.error('Vui lòng nhập giá trị thị lực.');
      return;
    }
    try {
      const { id, ...rest } = thiLucForm;
      const payload = {
        type: 'thiluc',
        gia_tri: rest.gia_tri,
        thu_tu: Number(rest.thu_tu) || 0
      };
      if (isEditingThiLuc) {
        await axios.put('/api/mau-kinh', { ...payload, id: id });
        toast.success('Đã cập nhật mẫu thị lực');
      } else {
        await axios.post('/api/mau-kinh', payload);
        toast.success('Đã thêm mẫu thị lực');
      }
      setOpenThiLucDialog(false);
      fetchMauDuLieu();
    } catch (error) {
      const message = axios.isAxiosError(error) ? error.response?.data?.message : 'Lỗi không xác định';
      toast.error(`Lỗi khi lưu thị lực: ${message}`);
    }
  };

  const handleDeleteSoKinh = async (id: number) => {
    if (!await confirm('Bạn có chắc chắn muốn xóa mẫu số kính này?')) return;
    try {
      await axios.delete(`/api/mau-kinh?id=${id}&type=sokinh`);
      toast.success('Xóa mẫu số kính thành công');
      fetchMauDuLieu();
    } catch (error) {
      toast.error('Lỗi khi xóa mẫu số kính');
    }
  };

  const handleDeleteThiLuc = async (id: number) => {
    if (!await confirm('Bạn có chắc chắn muốn xóa mẫu thị lực này?')) return;
    try {
      await axios.delete(`/api/mau-kinh?id=${id}&type=thiluc`);
      toast.success('Xóa mẫu thị lực thành công');
      fetchMauDuLieu();
    } catch (error) {
      toast.error('Lỗi khi xóa mẫu thị lực');
    }
  };
  // === END: Logic cho Mẫu Dữ Liệu ===

  // === START: Logic cho Nhà Cung Cấp ===
  const fetchNhaCungCap = async () => {
    try {
      const res = await axios.get('/api/nha-cung-cap');
      setDsNhaCungCap(res.data?.data || res.data || []);
    } catch (e) {
      toast.error('Lỗi khi tải nhà cung cấp');
    }
  };

  const resetNccForm = () => {
    setIsEditingNCC(false);
    setNccForm({ id: 0, ten: '', dia_chi: '', dien_thoai: '', ghi_chu: '', facebook: '' });
  };

  const handleEditNCC = (ncc: NhaCungCap) => {
    setIsEditingNCC(true);
    setNccForm(ncc);
    setOpenNCCDialog(true);
  };

  const handleSubmitNCC = async () => {
    if (!nccForm.ten.trim()) {
      toast.error('Tên nhà cung cấp bắt buộc');
      return;
    }
    try {
      if (isEditingNCC) {
        await axios.put('/api/nha-cung-cap', nccForm);
        toast.success('Đã cập nhật nhà cung cấp');
      } else {
    const { id, ...payload } = nccForm;
        await axios.post('/api/nha-cung-cap', payload);
        toast.success('Đã thêm nhà cung cấp');
      }
      setOpenNCCDialog(false);
      resetNccForm();
      fetchNhaCungCap();
    } catch (e) {
      toast.error('Lỗi khi lưu nhà cung cấp');
    }
  };

  const handleDeleteNCC = async (id: number) => {
    if (!await confirm('Xóa nhà cung cấp này?')) return;
    try {
      await axios.delete(`/api/nha-cung-cap?id=${id}`);
      toast.success('Đã xóa');
      fetchNhaCungCap();
    } catch (e) {
      toast.error('Lỗi khi xóa');
    }
  };
  // === END: Logic cho Nhà Cung Cấp ===

  // Tab content components
  const renderThuocTab = () => {
    const filtered = thuocs.filter((t) => {
      return t.tenthuoc.toLowerCase().includes(searchThuoc.toLowerCase());
    });

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
            <h1 className="text-xl md:text-2xl font-semibold">Danh sách thuốc</h1>
            <Button
              onClick={() => {
                setIsEditingThuoc(false);
                setThuocForm({
                  mathuoc: '',
                  tenthuoc: '',
                  donvitinh: '',
                  cachdung: '',
                  hoatchat: '',
                  giaban: 0,
                  gianhap: 0,
                  tonkho: 0,
                  soluongmacdinh: 1,
                  la_thu_thuat: false,
                });
                setOpenThuoc(true);
              }}
            >
              Thêm thuốc
            </Button>
          </div>

          <Input
            placeholder="Tìm kiếm thuốc..."
            value={searchThuoc}
            onChange={(e) => setSearchThuoc(e.target.value)}
            className="w-full md:w-1/2"
          />

          <Card>
            <CardContent className="p-0 overflow-x-auto">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-100 border-b">
                  <tr>
                    <th className="px-2 py-1">Mã</th>
                    <th className="px-2 py-1">Tên</th>
                    <th className="px-2 py-1">Hoạt chất</th>
                    <th className="px-2 py-1">Cách dùng</th>
                    <th className="px-2 py-1">Giá bán</th>
                    <th className="px-2 py-1">Tồn</th>
                    <th className="px-2 py-1">Thủ thuật</th>
                    <th className="px-2 py-1 text-center">Hành động</th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.map((t) => (
                    <tr key={t.id} className="border-b hover:bg-gray-50">
                      <td className="px-2 py-1 font-mono">{t.mathuoc}</td>
                      <td className="px-2 py-1">{t.tenthuoc}</td>
                      <td className="px-2 py-1">{t.hoatchat}</td>
                      <td className="px-2 py-1">{t.cachdung}</td>
                      <td className="px-2 py-1">{t.giaban.toLocaleString()}</td>
                      <td className="px-2 py-1">{t.tonkho}</td>
                      <td className="px-2 py-1">{t.la_thu_thuat ? 'Có' : 'Không'}</td>
                      <td className="px-2 py-1 text-center">
                        <div className="flex items-center justify-center space-x-1 whitespace-nowrap">
                          <Button size="sm" variant="outline" onClick={() => handleEditThuoc(t)}>
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="destructive" onClick={() => deleteThuoc(t.id!)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </CardContent>
          </Card>
      </div>
    );
  };

  const renderDonMauTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl md:text-2xl font-bold">Đơn thuốc mẫu</h2>
        <Button onClick={() => { resetDonMauForm(); setShowDonMauForm(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Tạo đơn thuốc mẫu
        </Button>
      </div>
      
      <Card>
        <CardContent>
          <table className="min-w-full text-sm">
            <thead className="bg-gray-100 border-b">
              <tr>
                <th className="px-4 py-2 text-left">Tên mẫu</th>
                <th className="px-4 py-2 text-left">Mô tả</th>
                <th className="px-4 py-2 text-left">Số thuốc</th>
                <th className="px-4 py-2 text-center">Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {dsMau.map((mau) => (
                <tr key={mau.id} className="border-b hover:bg-gray-50">
                  <td className="px-4 py-2 font-medium">{mau.ten_mau}</td>
                  <td className="px-4 py-2">{mau.mo_ta}</td>
                  <td className="px-4 py-2">{mau.chitiet?.length || 0}</td>
                  <td className="px-4 py-2 text-center">
                    <div className="flex items-center justify-center space-x-2">
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleEditDonMau(mau)}
                      >
                        <Pencil className="w-4 h-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="destructive"
                        onClick={() => handleDeleteDonMau(mau.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </CardContent>
      </Card>

      {/* Dialog for Don Thuoc Mau */}
      <Dialog open={showDonMauForm} onOpenChange={setShowDonMauForm}>
        <DialogContent className="max-w-4xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingMau ? 'Chỉnh sửa đơn thuốc mẫu' : 'Tạo đơn thuốc mẫu mới'}
            </DialogTitle>
          </DialogHeader>
          
          <form onSubmit={handleSubmitDonMau} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label htmlFor="tenMau">Tên mẫu *</Label>
                <Input
                  id="tenMau"
                  value={tenMau}
                  onChange={(e) => setTenMau(e.target.value)}
                  required
                />
              </div>
            </div>
            
            <div>
              <Label htmlFor="moTa">Mô tả</Label>
              <Textarea
                id="moTa"
                value={moTa}
                onChange={(e) => setMoTa(e.target.value)}
                rows={3}
              />
            </div>

            <div className="border-t pt-4">
              <h3 className="text-lg font-semibold mb-4">Danh sách thuốc</h3>
              
              <div className="space-y-3 mb-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <Label>Tìm kiếm thuốc</Label>
                    <Input
                      placeholder="Nhập tên thuốc để tìm kiếm..."
                      value={timKiemThuoc}
                      onChange={(e) => setTimKiemThuoc(e.target.value)}
                    />
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                    <div>
                      <Label>Số lượng</Label>
                      <Input
                        type="number"
                        value={soLuong}
                        onChange={(e) => setSoLuong(Number(e.target.value))}
                        min="1"
                      />
                    </div>
                    <div className="col-span-full md:col-span-2">
                      <Label>Ghi chú</Label>
                      <Input
                        placeholder="Ghi chú (tùy chọn)"
                        value={ghiChu}
                        onChange={(e) => setGhiChu(e.target.value)}
                      />
                    </div>
                  </div>
                </div>
                
                {timKiemThuoc && (
                  <div className="border rounded-md max-h-40 overflow-y-auto">
                    {thuocs
                      .filter(thuoc => 
                        thuoc.tenthuoc.toLowerCase().includes(timKiemThuoc.toLowerCase())
                      )
                      .slice(0, 10)
                      .map((thuoc) => (
                        <div
                          key={thuoc.id}
                          className="p-2 hover:bg-gray-100 cursor-pointer border-b last:border-b-0"
                          onClick={() => {
                            if (soLuong <= 0) {
                              toast.error('Vui lòng nhập số lượng hợp lệ');
                              return;
                            }
                            if (thuocsMau.some(t => t.thuocid === thuoc.id)) {
                              toast.error('Thuốc này đã có trong danh sách');
                              return;
                            }
                            setThuocsMau([...thuocsMau, {
                              thuocid: thuoc.id!,
                              soluong: soLuong,
                              ghi_chu: ghiChu
                            }]);
                            setTimKiemThuoc('');
                            setSoLuong(1);
                            setGhiChu('');
                            toast.success(`Đã thêm ${thuoc.tenthuoc}`);
                          }}
                        >
                          <div className="font-medium">{thuoc.tenthuoc}</div>
                          <div className="text-xs text-gray-500">
                            {thuoc.donvitinh} • {thuoc.giaban.toLocaleString()}đ
                          </div>
                        </div>
                      ))
                    }
                    {thuocs.filter(thuoc => 
                      thuoc.tenthuoc.toLowerCase().includes(timKiemThuoc.toLowerCase())
                    ).length === 0 && (
                      <div className="p-3 text-center text-gray-500">
                        Không tìm thấy thuốc nào
                      </div>
                    )}
                  </div>
                )}
              </div>

              {thuocsMau.length > 0 && (
                <table className="min-w-full text-sm">
                  <thead className="bg-gray-100 border-b">
                    <tr>
                      <th className="px-2 py-1 text-left">Tên thuốc</th>
                      <th className="px-2 py-1 text-left">Số lượng</th>
                      <th className="px-2 py-1 text-left">Đơn vị</th>
                      <th className="px-2 py-1 text-left">Ghi chú</th>
                      <th className="px-2 py-1 text-center">Thao tác</th>
                    </tr>
                  </thead>
                  <tbody>
                    {thuocsMau.map((thuocMau) => {
                      const thuocInfo = getThuocInfo(thuocMau.thuocid);
                      return (
                        <tr key={thuocMau.thuocid} className="border-b">
                          <td className="px-2 py-1 align-middle">{thuocInfo?.tenthuoc}</td>
                          <td className="px-2 py-1">
                            <Input
                              type="number"
                              value={thuocMau.soluong}
                              onChange={(e) => handleSoLuongChange(thuocMau.thuocid, Number(e.target.value))}
                              className="w-20 h-8"
                              min="1"
                            />
                          </td>
                          <td className="px-2 py-1 align-middle">{thuocInfo?.donvitinh}</td>
                          <td className="px-2 py-1">
                             <Input
                              value={thuocMau.ghi_chu}
                              onChange={(e) => handleGhiChuChange(thuocMau.thuocid, e.target.value)}
                              className="h-8"
                            />
                          </td>
                          <td className="px-2 py-1 text-center align-middle">
                            <Button
                              type="button"
                              variant="destructive"
                              size="sm"
                              onClick={() => removeThuocFromMau(thuocMau.thuocid)}
                            >
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <DialogFooter className="flex justify-end space-x-2 pt-4">
              <Button type="button" variant="outline" onClick={() => setShowDonMauForm(false)}>
                Hủy
              </Button>
              <Button type="submit">
                {editingMau ? 'Cập nhật' : 'Tạo mẫu'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );

  const renderHangTrongTab = () => {
    const filtered = dsHangTrong.filter((hang) =>
      hang.ten_hang.toLowerCase().includes(searchHangTrong.toLowerCase())
    );

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl md:text-2xl font-bold">Hãng tròng kính</h2>
          <Button onClick={() => { resetHangTrongForm(); setOpenHangTrongDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Thêm hãng tròng
          </Button>
        </div>
        
        <Input
          placeholder="Tìm kiếm hãng tròng..."
          value={searchHangTrong}
          onChange={(e) => setSearchHangTrong(e.target.value)}
          className="w-full md:w-1/2"
        />

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Tên hãng</th>
                  <th className="px-4 py-2 text-left">Giá nhập</th>
                  <th className="px-4 py-2 text-left">Giá bán</th>
                  <th className="px-4 py-2 text-left">Mô tả</th>
                  <th className="px-4 py-2 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((hang) => (
                  <tr key={hang.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{hang.ten_hang}</td>
                    <td className="px-4 py-2">{hang.gia_nhap.toLocaleString()}đ</td>
                    <td className="px-4 py-2 font-medium">{hang.gia_ban.toLocaleString()}đ</td>
                    <td className="px-4 py-2">{hang.mo_ta || '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditHangTrong(hang)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteHangTrong(hang.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderGongKinhTab = () => {
    const filtered = dsGongKinh.filter((gong) =>
      gong.ten_gong.toLowerCase().includes(searchGongKinh.toLowerCase()) ||
      (gong.chat_lieu && gong.chat_lieu.toLowerCase().includes(searchGongKinh.toLowerCase()))
    );

    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl md:text-2xl font-bold">Gọng kính</h2>
          <Button onClick={() => { resetGongKinhForm(); setOpenGongKinhDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" />
            Thêm gọng kính
          </Button>
        </div>
        
        <Input
          placeholder="Tìm kiếm gọng kính..."
          value={searchGongKinh}
          onChange={(e) => setSearchGongKinh(e.target.value)}
          className="w-full md:w-1/2"
        />

        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Tên gọng</th>
                  <th className="px-4 py-2 text-left">Chất liệu</th>
                  <th className="px-4 py-2 text-left">Giá nhập</th>
                  <th className="px-4 py-2 text-left">Giá bán</th>
                  <th className="px-4 py-2 text-left">Mô tả</th>
                  <th className="px-4 py-2 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((gong) => (
                  <tr key={gong.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{gong.ten_gong}</td>
                    <td className="px-4 py-2">{gong.chat_lieu || '-'}</td>
                    <td className="px-4 py-2">{gong.gia_nhap.toLocaleString()}đ</td>
                    <td className="px-4 py-2 font-medium">{gong.gia_ban.toLocaleString()}đ</td>
                    <td className="px-4 py-2">{gong.mo_ta || '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => handleEditGongKinh(gong)}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDeleteGongKinh(gong.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderSoKinhTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl md:text-2xl font-bold">Mẫu số kính</h2>
        <Button onClick={() => { resetSoKinhForm(); setOpenSoKinhDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Thêm mẫu số kính
        </Button>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {dsSoKinh.sort((a, b) => a.thu_tu - b.thu_tu).map((item) => (
              <div key={item.id} className="group relative inline-flex items-center gap-1 px-3 py-1.5 border rounded-md hover:bg-gray-50 transition-colors">
                <span className="font-medium text-sm">{item.so_kinh}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEditSoKinh(item)} className="p-0.5 hover:text-blue-600">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDeleteSoKinh(item.id)} className="p-0.5 hover:text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderThiLucTab = () => (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl md:text-2xl font-bold">Mẫu thị lực</h2>
        <Button onClick={() => { resetThiLucForm(); setOpenThiLucDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />
          Thêm mẫu thị lực
        </Button>
      </div>
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-2">
            {dsThiLuc.sort((a, b) => a.thu_tu - b.thu_tu).map((item) => (
              <div key={item.id} className="group relative inline-flex items-center gap-1 px-3 py-1.5 border rounded-md hover:bg-gray-50 transition-colors">
                <span className="font-medium text-sm">{item.gia_tri}</span>
                <div className="flex gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
                  <button onClick={() => handleEditThiLuc(item)} className="p-0.5 hover:text-blue-600">
                    <Pencil className="w-3 h-3" />
                  </button>
                  <button onClick={() => handleDeleteThiLuc(item.id)} className="p-0.5 hover:text-red-600">
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );

  const renderNhaCungCapTab = () => {
    const filtered = dsNhaCungCap.filter(n =>
      n.ten.toLowerCase().includes(searchNCC.toLowerCase()) ||
      (n.dien_thoai || '').toLowerCase().includes(searchNCC.toLowerCase()) ||
      (n.facebook || '').toLowerCase().includes(searchNCC.toLowerCase())
    );
    return (
      <div className="space-y-4">
        <div className="flex justify-between items-center">
          <h2 className="text-xl md:text-2xl font-bold">Nhà cung cấp</h2>
          <Button onClick={() => { resetNccForm(); setOpenNCCDialog(true); }}>
            <Plus className="h-4 w-4 mr-2" /> Thêm NCC
          </Button>
        </div>
        <Input
          placeholder="Tìm kiếm..."
            value={searchNCC}
            onChange={(e) => setSearchNCC(e.target.value)}
            className="w-full md:w-1/2"
        />
        <Card>
          <CardContent className="p-0 overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-gray-100 border-b">
                <tr>
                  <th className="px-4 py-2 text-left">Tên</th>
                  <th className="px-4 py-2 text-left">Địa chỉ</th>
                  <th className="px-4 py-2 text-left">Điện thoại</th>
                  <th className="px-4 py-2 text-left">Facebook</th>
                  <th className="px-4 py-2 text-left">Ghi chú</th>
                  <th className="px-4 py-2 text-center">Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(n => (
                  <tr key={n.id} className="border-b hover:bg-gray-50">
                    <td className="px-4 py-2 font-medium">{n.ten}</td>
                    <td className="px-4 py-2">{n.dia_chi || '-'}</td>
                    <td className="px-4 py-2">{n.dien_thoai || '-'}</td>
                    <td className="px-4 py-2">{n.facebook || '-'}</td>
                    <td className="px-4 py-2">{n.ghi_chu || '-'}</td>
                    <td className="px-4 py-2 text-center">
                      <div className="flex items-center justify-center space-x-2">
                        <Button size="sm" variant="outline" onClick={() => handleEditNCC(n)}>
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button size="sm" variant="destructive" onClick={() => handleDeleteNCC(n.id)}>
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && (
                  <tr>
                    <td colSpan={5} className="px-4 py-6 text-center text-gray-500">Không có dữ liệu</td>
                  </tr>
                )}
              </tbody>
            </table>
          </CardContent>
        </Card>
      </div>
    );
  };

  const renderTabContent = () => {
    switch (activeTab) {
      case 'thuoc':
        return renderThuocTab();
      case 'don-mau':
        return renderDonMauTab();
      case 'hang-trong':
        return renderHangTrongTab();
      case 'gong-kinh':
        return renderGongKinhTab();
      case 'so-kinh':
        return renderSoKinhTab();
      case 'thi-luc':
        return renderThiLucTab();
      case 'nha-cung-cap':
        return renderNhaCungCapTab();
      default:
        return renderThuocTab();
    }
  };

  const handlePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setPasswordError('');
    if (!user?.email) {
      setPasswordError('Không tìm thấy email người dùng.');
      setLoading(false);
      return;
    }
    try {
      const { error } = await signIn(user.email, password);
      if (!error) {
        setIsAuthenticated(true);
        setPasswordError('');
        toast.success('Xác thực lại thành công!');
      } else {
        setPasswordError('Mật khẩu không đúng. Vui lòng thử lại.');
        setPassword('');
        toast.error('Mật khẩu không đúng');
      }
    } catch (err) {
      setPasswordError('Có lỗi xảy ra khi xác thực lại.');
    }
    setLoading(false);
  };

  if (!isAuthenticated) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-full max-w-md p-6">

            <Card className="shadow-lg">
              <CardContent className="p-6 lg:p-8">
                <div className="text-center mb-6">
                  <div className="mx-auto w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mb-4">
                    <svg className="w-8 h-8 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                  </div>
                  <h1 className="text-xl lg:text-2xl font-bold text-gray-900 mb-2">Xác thực truy cập Danh mục</h1>
                  <p className="text-sm text-gray-600">Vui lòng nhập lại mật khẩu tài khoản để tiếp tục</p>
                </div>

                <form onSubmit={handlePasswordSubmit} className="space-y-4">
                  <div>
                    <label className="block text-sm font-medium text-gray-700 mb-2">
                      Mật khẩu
                    </label>
                    <div className="relative">
                      <Input
                        type={showPassword ? 'text' : 'password'}
                        value={password}
                        onChange={(e) => {
                          setPassword(e.target.value);
                          setPasswordError('');
                        }}
                        className="w-full h-12 pr-12"
                        placeholder="Nhập lại mật khẩu tài khoản..."
                        required
                        disabled={loading}
                      />
                      <button
                        type="button"
                        onClick={() => setShowPassword(!showPassword)}
                        className="absolute inset-y-0 right-0 pr-3 flex items-center text-gray-400 hover:text-gray-600"
                      >
                        {showPassword ? (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.878 9.878L3 3m6.878 6.878L21 21" />
                          </svg>
                        ) : (
                          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" />
                          </svg>
                        )}
                      </button>
                    </div>
                    {passwordError && (
                      <p className="mt-2 text-sm text-red-600">{passwordError}</p>
                    )}
                  </div>

                  <Button
                    type="submit"
                    className="w-full h-12 bg-blue-600 hover:bg-blue-700 text-white font-medium"
                    disabled={loading}
                  >
                    {loading ? 'Đang xác thực...' : 'Xác thực lại'}
                  </Button>
                </form>

                <div className="mt-6 text-center">
                  <p className="text-xs text-gray-500">
                    Danh mục chứa thông tin quan trọng của hệ thống
                  </p>
                </div>
              </CardContent>
            </Card>
          </div>
        </div>
      </ProtectedRoute>
    );
  }

  return (
    <ProtectedRoute>
      <div className="p-3 md:p-4 md:p-6">

        {/* Custom Tabs Implementation */}
        <div className="space-y-6">
          {/* Tab Navigation */}
          <div className="flex space-x-1 rounded-lg bg-gray-100 p-1 overflow-x-auto">
            {tabs.map((tab) => {
              const IconComponent = tab.icon;
              return (
                <button
                  key={tab.value}
                  onClick={() => setActiveTab(tab.value)}
                  className={`flex items-center gap-2 px-3 py-2 rounded-md text-sm font-medium whitespace-nowrap transition-colors ${
                    activeTab === tab.value
                      ? 'bg-white text-gray-900 shadow-sm'
                      : 'text-gray-600 hover:text-gray-900'
                  }`}
                >
                  <IconComponent className="h-4 w-4" />
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Tab Content */}
          <div className="mt-6">
            {renderTabContent()}
          </div>
        </div>

        {/* Dialog thêm/sửa thuốc */}
        <Dialog open={openThuoc} onOpenChange={setOpenThuoc}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditingThuoc ? 'Sửa thuốc' : 'Thêm thuốc'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-2">
              <Label>Tên thuốc</Label>
              <Input
                value={thuocForm.tenthuoc}
                onChange={(e) => setThuocForm({ ...thuocForm, tenthuoc: e.target.value })}
              />
              <Label>Đơn vị</Label>
              <Input
                value={thuocForm.donvitinh}
                onChange={(e) => setThuocForm({ ...thuocForm, donvitinh: e.target.value })}
              />
              <Label>Hoạt chất</Label>
              <Input
                value={thuocForm.hoatchat}
                onChange={(e) => setThuocForm({ ...thuocForm, hoatchat: e.target.value })}
              />
              <Label>Cách dùng</Label>
              <Input
                value={thuocForm.cachdung}
                onChange={(e) => setThuocForm({ ...thuocForm, cachdung: e.target.value })}
              />
              <Label>Giá bán</Label>
              <Input
                type="number"
                value={thuocForm.giaban}
                onChange={(e) => setThuocForm({ ...thuocForm, giaban: +e.target.value })}
              />
              <Label>Giá nhập</Label>
              <Input
                type="number"
                value={thuocForm.gianhap}
                onChange={(e) => setThuocForm({ ...thuocForm, gianhap: +e.target.value })}
              />
              <Label>Tồn kho</Label>
              <Input
                type="number"
                value={thuocForm.tonkho}
                onChange={(e) => setThuocForm({ ...thuocForm, tonkho: +e.target.value })}
              />
              <Label>Số lượng mặc định</Label>
              <Input
                type="number"
                value={thuocForm.soluongmacdinh}
                onChange={(e) => setThuocForm({ ...thuocForm, soluongmacdinh: +e.target.value })}
              />
              <Label>Là thủ thuật</Label>
              <input
                type="checkbox"
                checked={thuocForm.la_thu_thuat}
                onChange={(e) => setThuocForm({ ...thuocForm, la_thu_thuat: e.target.checked })}
                className="w-4 h-4 border-gray-300 rounded focus:ring-blue-500"
              />
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setOpenThuoc(false)}>
                Huỷ
              </Button>
              <Button onClick={handleSubmitThuoc}>Lưu</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog thêm/sửa hãng tròng */}
        <Dialog open={openHangTrongDialog} onOpenChange={setOpenHangTrongDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditingHangTrong ? 'Sửa hãng tròng' : 'Thêm hãng tròng'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tên hãng *</Label>
                <Input
                  value={hangTrongForm.ten_hang}
                  onChange={(e) => setHangTrongForm({ ...hangTrongForm, ten_hang: e.target.value })}
                  placeholder="Nhập tên hãng tròng"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Giá nhập</Label>
                  <Input
                    type="number"
                    value={hangTrongForm.gia_nhap}
                    onChange={(e) => setHangTrongForm({ ...hangTrongForm, gia_nhap: +e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Giá bán</Label>
                  <Input
                    type="number"
                    value={hangTrongForm.gia_ban}
                    onChange={(e) => setHangTrongForm({ ...hangTrongForm, gia_ban: +e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <Label>Mô tả</Label>
                <Textarea
                  value={hangTrongForm.mo_ta}
                  onChange={(e) => setHangTrongForm({ ...hangTrongForm, mo_ta: e.target.value })}
                  placeholder="Mô tả hãng tròng (tùy chọn)"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setOpenHangTrongDialog(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmitHangTrong}>
                {isEditingHangTrong ? 'Cập nhật' : 'Thêm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog thêm/sửa gọng kính */}
        <Dialog open={openGongKinhDialog} onOpenChange={setOpenGongKinhDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditingGongKinh ? 'Sửa gọng kính' : 'Thêm gọng kính'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tên gọng *</Label>
                <Input
                  value={gongKinhForm.ten_gong}
                  onChange={(e) => setGongKinhForm({ ...gongKinhForm, ten_gong: e.target.value })}
                  placeholder="Nhập tên gọng kính"
                />
              </div>
              <div>
                <Label>Chất liệu</Label>
                <Input
                  value={gongKinhForm.chat_lieu}
                  onChange={(e) => setGongKinhForm({ ...gongKinhForm, chat_lieu: e.target.value })}
                  placeholder="Nhập chất liệu (VD: Nhựa, Kim loại, Titan...)"
                />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Giá nhập</Label>
                  <Input
                    type="number"
                    value={gongKinhForm.gia_nhap}
                    onChange={(e) => setGongKinhForm({ ...gongKinhForm, gia_nhap: +e.target.value })}
                    placeholder="0"
                  />
                </div>
                <div>
                  <Label>Giá bán</Label>
                  <Input
                    type="number"
                    value={gongKinhForm.gia_ban}
                    onChange={(e) => setGongKinhForm({ ...gongKinhForm, gia_ban: +e.target.value })}
                    placeholder="0"
                  />
                </div>
              </div>
              <div>
                <Label>Mô tả</Label>
                <Textarea
                  value={gongKinhForm.mo_ta}
                  onChange={(e) => setGongKinhForm({ ...gongKinhForm, mo_ta: e.target.value })}
                  placeholder="Mô tả gọng kính (tùy chọn)"
                  rows={3}
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setOpenGongKinhDialog(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmitGongKinh}>
                {isEditingGongKinh ? 'Cập nhật' : 'Thêm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog thêm/sửa mẫu số kính */}
        <Dialog open={openSoKinhDialog} onOpenChange={setOpenSoKinhDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditingSoKinh ? 'Sửa mẫu số kính' : 'Thêm mẫu số kính'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Số kính *</Label>
                <Input
                  value={soKinhForm.so_kinh}
                  onChange={(e) => setSoKinhForm({ ...soKinhForm, so_kinh: e.target.value })}
                  placeholder="VD: -1.75"
                />
              </div>
              <div>
                <Label>Thứ tự</Label>
                <Input
                  type="number"
                  value={soKinhForm.thu_tu}
                  onChange={(e) => setSoKinhForm({ ...soKinhForm, thu_tu: +e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setOpenSoKinhDialog(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmitSoKinh}>
                {isEditingSoKinh ? 'Cập nhật' : 'Thêm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog thêm/sửa mẫu thị lực */}
        <Dialog open={openThiLucDialog} onOpenChange={setOpenThiLucDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditingThiLuc ? 'Sửa mẫu thị lực' : 'Thêm mẫu thị lực'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Giá trị thị lực *</Label>
                <Input
                  value={thiLucForm.gia_tri}
                  onChange={(e) => setThiLucForm({ ...thiLucForm, gia_tri: e.target.value })}
                  placeholder="VD: 10/10"
                />
              </div>
              <div>
                <Label>Thứ tự</Label>
                <Input
                  type="number"
                  value={thiLucForm.thu_tu}
                  onChange={(e) => setThiLucForm({ ...thiLucForm, thu_tu: +e.target.value })}
                  placeholder="0"
                />
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setOpenThiLucDialog(false)}>
                Hủy
              </Button>
              <Button onClick={handleSubmitThiLuc}>
                {isEditingThiLuc ? 'Cập nhật' : 'Thêm'}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>

        {/* Dialog thêm/sửa Nhà cung cấp */}
        <Dialog open={openNCCDialog} onOpenChange={setOpenNCCDialog}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>{isEditingNCC ? 'Sửa nhà cung cấp' : 'Thêm nhà cung cấp'}</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div>
                <Label>Tên *</Label>
                <Input value={nccForm.ten} onChange={(e) => setNccForm({ ...nccForm, ten: e.target.value })} />
              </div>
              <div>
                <Label>Địa chỉ</Label>
                <Input value={nccForm.dia_chi} onChange={(e) => setNccForm({ ...nccForm, dia_chi: e.target.value })} />
              </div>
              <div>
                <Label>Điện thoại</Label>
                <Input value={nccForm.dien_thoai} onChange={(e) => setNccForm({ ...nccForm, dien_thoai: e.target.value })} />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <Label>Facebook</Label>
                  <Input value={nccForm.facebook} onChange={(e) => setNccForm({ ...nccForm, facebook: e.target.value })} placeholder="link hoặc username" />
                </div>
                <div>
                  <Label>Ghi chú</Label>
                  <Textarea value={nccForm.ghi_chu} onChange={(e) => setNccForm({ ...nccForm, ghi_chu: e.target.value })} rows={2} />
                </div>
              </div>
            </div>
            <DialogFooter className="mt-4">
              <Button variant="outline" onClick={() => setOpenNCCDialog(false)}>Hủy</Button>
              <Button onClick={handleSubmitNCC}>{isEditingNCC ? 'Cập nhật' : 'Thêm'}</Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </ProtectedRoute>
  );
}

// Default export
export default DanhMucPage;