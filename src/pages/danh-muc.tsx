import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import ProtectedRoute from '../components/ProtectedRoute';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Textarea } from '../components/ui/textarea';
import { Label } from '../components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '../components/ui/dialog';
import { Pencil, Trash2, Plus, Package, Eye, Target, Building2 } from 'lucide-react';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import axios from 'axios';
import { usePermissions } from '../hooks/usePermissions';

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
  ngung_kinh_doanh: boolean;
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
  zalo_phone?: string;
  ghi_chu?: string;
  facebook?: string;
}







function DanhMucPage() {
  const router = useRouter();
  const { confirm } = useConfirm();
  const { userRole } = useAuth();
  const isSuperAdmin = userRole === 'superadmin';
  const { has, loading: permissionsLoading } = usePermissions();
  const canViewCategoryPage = isSuperAdmin || has('manage_categories');
  const restrictedTabs = ['so-kinh', 'thi-luc'];
  // Define tab options (thuốc/tròng/gọng đã chuyển sang trang Kho)
  const tabs = [
    { value: 'don-mau', label: 'Đơn mẫu', icon: Package },
    { value: 'nha-cung-cap', label: 'Nhà cung cấp', icon: Building2 },
    { value: 'so-kinh', label: 'Số kính', icon: Target },
    { value: 'thi-luc', label: 'Thị lực', icon: Eye },
  ];

  const [activeTab, setActiveTab] = useState('don-mau');

  useEffect(() => {
    if (!router.isReady) return;
    const tabQuery = Array.isArray(router.query.tab) ? router.query.tab[0] : router.query.tab;
    if (!tabQuery || typeof tabQuery !== 'string') return;

    // Bookmark cũ → trang Kho tương ứng
    if (tabQuery === 'thuoc') {
      router.replace('/quan-ly-kho-thuoc?tab=catalog');
      return;
    }
    if (tabQuery === 'hang-trong') {
      router.replace('/quan-ly-kho?tab=catalog');
      return;
    }
    if (tabQuery === 'gong-kinh') {
      router.replace('/quan-ly-kho-gong?tab=catalog');
      return;
    }

    const allowedTabs = ['don-mau', 'nha-cung-cap', 'so-kinh', 'thi-luc'];
    if (!allowedTabs.includes(tabQuery)) return;

    if (activeTab !== tabQuery) {
      setActiveTab(tabQuery);
    }
  }, [router.isReady, router.query.tab, activeTab, router]);

  // Đặt tiêu đề trang tĩnh
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.title = 'Danh mục';
    }
  }, []);

  // States cho thuốc (chỉ dùng cho đơn mẫu — CRUD thuốc ở /quan-ly-kho-thuoc)
  const [thuocs, setThuocs] = useState<Thuoc[]>([]);

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
  const [nccForm, setNccForm] = useState<NhaCungCap>({ id: 0, ten: '', dia_chi: '', dien_thoai: '', zalo_phone: '', ghi_chu: '', facebook: '' });


  useEffect(() => {
    if (!isSuperAdmin && restrictedTabs.includes(activeTab)) {
      setActiveTab('don-mau');
    }
  }, [activeTab, isSuperAdmin]);

  // Fetch data functions
  const fetchThuocs = async () => {
    try {
      // Thêm cache-busting parameters
      const timestamp = Date.now();
      const random = Math.random().toString(36).substring(7);
      const thuocRes = await axios.get(`/api/thuoc?scope=shared&_t=${timestamp}&_r=${random}`, {
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
    if (permissionsLoading || !canViewCategoryPage) return;
    fetchThuocs();
    fetchDonMau();
    fetchMauDuLieu();
    fetchNhaCungCap();
  }, [permissionsLoading, canViewCategoryPage]);

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
    setNccForm({ id: 0, ten: '', dia_chi: '', dien_thoai: '', zalo_phone: '', ghi_chu: '', facebook: '' });
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
  const renderDonMauTab = () => (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:justify-between sm:items-center gap-3">
        <div>
          <h2 className="text-xl md:text-2xl font-bold">Đơn thuốc mẫu</h2>
          <p className="text-sm text-gray-500 mt-1">
            Danh mục thuốc / tròng / gọng nằm ở menu{' '}
            <button type="button" className="text-blue-600 hover:underline font-medium" onClick={() => router.push('/quan-ly-kho-thuoc?tab=catalog')}>Kho thuốc</button>
            {', '}
            <button type="button" className="text-blue-600 hover:underline font-medium" onClick={() => router.push('/quan-ly-kho?tab=catalog')}>Kho tròng</button>
            {', '}
            <button type="button" className="text-blue-600 hover:underline font-medium" onClick={() => router.push('/quan-ly-kho-gong?tab=catalog')}>Kho gọng</button>
          </p>
        </div>
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
      case 'don-mau':
        return renderDonMauTab();
      case 'so-kinh':
        return isSuperAdmin ? renderSoKinhTab() : renderDonMauTab();
      case 'thi-luc':
        return isSuperAdmin ? renderThiLucTab() : renderDonMauTab();
      case 'nha-cung-cap':
        return renderNhaCungCapTab();
      default:
        return renderDonMauTab();
    }
  };

  if (permissionsLoading) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="text-sm text-gray-600">Đang kiểm tra quyền truy cập...</div>
        </div>
      </ProtectedRoute>
    );
  }

  if (!canViewCategoryPage) {
    return (
      <ProtectedRoute>
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <div className="w-full max-w-md p-6">
            <Card className="shadow-lg">
              <CardContent className="p-6 lg:p-8 text-center space-y-2">
                <h1 className="text-xl lg:text-2xl font-bold text-red-600">Không có quyền truy cập</h1>
                <p className="text-sm text-gray-600">
                  Bạn chưa được cấp quyền xem và quản lý trang danh mục.
                </p>
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
            {tabs.filter((tab) => isSuperAdmin || !restrictedTabs.includes(tab.value)).map((tab) => {
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
              <div>
                <Label>SĐT Zalo (cho đặt tròng)</Label>
                <Input
                  value={nccForm.zalo_phone || ''}
                  onChange={(e) => setNccForm({ ...nccForm, zalo_phone: e.target.value })}
                  placeholder="Ví dụ: 0901234567 (để trống → dùng điện thoại chính)"
                />
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