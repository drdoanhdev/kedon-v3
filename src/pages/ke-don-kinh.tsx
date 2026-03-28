//src/pages/ke-don-kinh.tsx giới, năm sinh
'use client';

import { useEffect, useState, useMemo } from 'react';
import axios, { AxiosError } from 'axios';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { useSearchParams } from 'next/navigation';
import toast, { Toaster } from 'react-hot-toast';
import { Pencil, Copy, Trash2, FilePlus, Calendar, Phone, MapPin } from 'lucide-react';
import SoKinhInput from '../components/SoKinhInput';
import ProtectedRoute from '../components/ProtectedRoute';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { isOwnerRole } from '../lib/tenantRoles';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';

interface BenhNhan {
  id: number;
  ten: string;
  namsinh: string; // yyyy hoặc dd/mm/yyyy
  dienthoai?: string;
  diachi?: string;
  tuoi?: number;
}

interface HangTrong {
  id: number;
  ten_hang: string;
  gia_nhap: number;
  gia_ban: number;
}

interface GongKinh {
  id: number;
  ten_gong: string;
  gia_nhap: number;
  gia_ban: number;
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

interface DonKinh {
  id?: number;
  benhnhanid: number;
  chandoan?: string;
  ngaykham?: string;
  ngay_kham?: string; // Alternative field name from database
  giatrong?: number;
  giagong?: number;
  gianhap_trong?: number; // NEW: lens cost
  gianhap_gong?: number;  // NEW: frame cost
  ten_gong?: string; // Tên gọng đã chọn
  ghichu?: string;
  thiluc_khongkinh_mp?: string;
  thiluc_kinhcu_mp?: string;
  thiluc_kinhmoi_mp?: string;
  sokinh_cu_mp?: string;
  sokinh_moi_mp?: string;
  hangtrong_mp?: string;
  ax_mp?: number; // DEPRECATED legacy lens cost (temporary for backward compatibility)
  thiluc_khongkinh_mt?: string;
  thiluc_kinhcu_mt?: string;
  thiluc_kinhmoi_mt?: string;
  sokinh_cu_mt?: string;
  sokinh_moi_mt?: string;
  hangtrong_mt?: string;
  ax_mt?: number; // DEPRECATED legacy frame cost (temporary for backward compatibility)
  no?: boolean; // Trạng thái nợ
  sotien_da_thanh_toan?: number;
  lai?: number;
}

interface HistoryProps { items: DonKinh[]; onSelect: (don: DonKinh) => void; highlightId?: number | null; }
const History: React.FC<HistoryProps> = ({ items, onSelect, highlightId }) => (
  <div className="h-full overflow-y-auto p-2 bg-blue-50/30">
    <h2 className="font-bold text-blue-800 text-sm tracking-tight mb-2">Lịch sử đơn kính</h2>
    {items.length === 0 ? (
      <p className="text-xs text-gray-500">Chưa có đơn kính nào</p>
    ) : (
      <div className="space-y-2 lg:space-y-1">
        {items.map((don) => (
          <div
            key={don.id}
            className={`px-1.5 py-1 rounded-lg cursor-pointer transition-colors border shadow-sm ${don.id === highlightId ? 'bg-yellow-50 border-yellow-300' : 'bg-white border-gray-100 hover:border-gray-200'}`}
            onClick={() => onSelect(don)}
          >
            <div className="block md:hidden">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-semibold">
                    {new Date(don.ngaykham || don.ngay_kham || '').toLocaleDateString('vi-VN')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(don.ngaykham || don.ngay_kham || '').toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-semibold">{(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k</p>
                  {(don.giatrong || 0) + (don.giagong || 0) - (don.sotien_da_thanh_toan || 0) > 0 && (
                    <p className="text-xs text-red-600">Nợ: {(((don.giatrong || 0) + (don.giagong || 0) - (don.sotien_da_thanh_toan || 0)) / 1000).toFixed(0)}k</p>
                  )}
                </div>
              </div>
              <div className="grid grid-cols-1 gap-1 text-xs">
                <div><span className="text-gray-500">MP:</span> {don.sokinh_moi_mp || 'N/A'} {don.thiluc_kinhmoi_mp ? `→ ${don.thiluc_kinhmoi_mp}` : ''}</div>
                <div><span className="text-gray-500">MT:</span> {don.sokinh_moi_mt || 'N/A'} {don.thiluc_kinhmoi_mt ? `→ ${don.thiluc_kinhmoi_mt}` : ''}</div>
                <div className="grid grid-cols-2 gap-2">
                  <div><span className="text-gray-500">Tròng:</span> {((don.giatrong || 0) / 1000).toFixed(0)}k</div>
                  <div><span className="text-gray-500">Gọng:</span> {((don.giagong || 0) / 1000).toFixed(0)}k</div>
                </div>
              </div>
            </div>
            <div className="hidden md:block">
              <p className="text-xs"><strong>Ngày:</strong> {new Date(don.ngaykham || don.ngay_kham || '').toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-xs"><strong>MP:</strong> {don.sokinh_moi_mp || 'N/A'} {don.thiluc_kinhmoi_mp ? `→ ${don.thiluc_kinhmoi_mp}` : ''}</p>
              <p className="text-xs"><strong>MT:</strong> {don.sokinh_moi_mt || 'N/A'} {don.thiluc_kinhmoi_mt ? `→ ${don.thiluc_kinhmoi_mt}` : ''}</p>
              <p className="text-xs"><strong>Tiền tròng:</strong> {((don.giatrong || 0) / 1000).toFixed(0)}k</p>
              <p className="text-xs"><strong>Tiền gọng:</strong> {((don.giagong || 0) / 1000).toFixed(0)}k</p>
              <p className="text-xs"><strong>Nợ:</strong> {(don.giatrong || 0) + (don.giagong || 0) - (don.sotien_da_thanh_toan || 0) > 0 ? `${(((don.giatrong || 0) + (don.giagong || 0) - (don.sotien_da_thanh_toan || 0)) / 1000).toFixed(0)}k` : '-'}</p>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

export default function KeDonKinh() {
  const searchParams = useSearchParams();
  const benhnhanid = searchParams.get('bn');
  const { currentRole } = useAuth();
  const isAdmin = isOwnerRole(currentRole);

  const [benhNhan, setBenhNhan] = useState<BenhNhan | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]); // lịch sử đơn kính
  const [highlightId, setHighlightId] = useState<number | null>(null); // id đơn kính mới / vừa cập nhật để highlight
  // Edit patient dialog state
  const [openEditPatient, setOpenEditPatient] = useState(false);
  const [patientForm, setPatientForm] = useState<BenhNhan | null>(null);

  // Hẹn khám lại inline state
  const [henKhamEnabled, setHenKhamEnabled] = useState(false);
  const [henKhamForm, setHenKhamForm] = useState({ ngay_hen: '', ly_do: 'Lấy kính', ghichu: '' });
  const [henSoNgay, setHenSoNgay] = useState('');
  const lyDoOptions = ['Lấy kính', 'Kiểm tra kính mới', 'Tái khám', 'Khác'];
  const addDaysToToday = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };
  const addMonthsToToday = (months: number) => {
    const d = new Date(); d.setMonth(d.getMonth() + months);
    return d.toISOString().split('T')[0];
  };

  // Cập nhật tiêu đề tab theo tên bệnh nhân
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (benhNhan?.ten) {
      document.title = benhNhan.ten;
    } else {
      document.title = 'Kê đơn kính';
    }
  }, [benhNhan?.ten]);
  
  // Payment states (similar to ke-don.tsx)
  const [ghiNo, setGhiNo] = useState(false);
  const [sotienDaThanhToan, setSotienDaThanhToan] = useState(0);
  const [sotienDaThanhToanInput, setSotienDaThanhToanInput] = useState('');
  const [tienKhachDua, setTienKhachDua] = useState(0);
  const [tienKhachDuaInput, setTienKhachDuaInput] = useState('');
  
  // Admin panel toggle state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  // Category data states
  const [hangTrongs, setHangTrongs] = useState<HangTrong[]>([]);
  const [gongKinhs, setGongKinhs] = useState<GongKinh[]>([]);
  const [mauThiLucs, setMauThiLucs] = useState<MauThiLuc[]>([]);
  const [mauSoKinhs, setMauSoKinhs] = useState<MauSoKinh[]>([]);
  
  // Stock status states
  const [frameStock, setFrameStock] = useState<number | null>(null);
  const [lensStockMp, setLensStockMp] = useState<{ ton: number | null; trang_thai: string } | null>(null);
  const [lensStockMt, setLensStockMt] = useState<{ ton: number | null; trang_thai: string } | null>(null);
  const [form, setForm] = useState<Partial<DonKinh>>({
    chandoan: '',
    ngaykham: (() => {
      const now = new Date();
      const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
      return vietnamTime.toISOString().slice(0, 16);
    })(),
    giatrong: 0,
    giagong: 0,
  gianhap_trong: 0,
    ten_gong: '', // Thêm field tên gọng
    ghichu: '',
    thiluc_khongkinh_mp: '',
    thiluc_kinhcu_mp: '',
    thiluc_kinhmoi_mp: '',
    sokinh_cu_mp: '',
    sokinh_moi_mp: '',
    hangtrong_mp: '',
    ax_mp: 0,
    thiluc_khongkinh_mt: '',
    thiluc_kinhcu_mt: '',
    thiluc_kinhmoi_mt: '',
    sokinh_cu_mt: '',
    sokinh_moi_mt: '',
    hangtrong_mt: '',
    ax_mt: 0,
    gianhap_gong: 0,
    no: false,
    lai: 0,
  });

  // Fetch bệnh nhân
  useEffect(() => {
    const fetchBenhNhan = async () => {
      if (!benhnhanid) {
        toast.error('Không có ID bệnh nhân được cung cấp');
        return;
      }

      try {
        // Thêm cache-busting parameters
        const timestamp = Date.now();
        const res = await axios.get(`/api/benh-nhan?benhnhanid=${benhnhanid}&_t=${timestamp}`, {
          headers: {
            'Cache-Control': 'no-cache, no-store, must-revalidate',
            'Pragma': 'no-cache',
            'Expires': '0'
          }
        });
        let benhNhanData: BenhNhan | undefined;
        if (res.data && res.data.data) {
          benhNhanData = res.data.data as BenhNhan;
        }

        if (benhNhanData && typeof benhNhanData === 'object' && benhNhanData.id) {
          setBenhNhan({
            id: benhNhanData.id,
            ten: benhNhanData.ten || '',
            namsinh: benhNhanData.namsinh || '',
            dienthoai: benhNhanData.dienthoai || '',
            diachi: benhNhanData.diachi || '',
            tuoi: benhNhanData.tuoi,
          });
        } else {
          toast.error('Bệnh nhân không tồn tại hoặc dữ liệu không hợp lệ');
          setBenhNhan(null);
        }
      } catch (error: unknown) {
        let message: string;
        if (axios.isAxiosError(error)) {
          message = error.response?.data?.message || error.message;
        } else if (error instanceof Error) {
          message = error.message;
        } else {
          message = String(error);
        }
        toast.error(`Lỗi khi tải thông tin bệnh nhân: ${message}`);
        setBenhNhan(null);
      }
    };

    fetchBenhNhan();
  }, [benhnhanid]);

  // Fetch lịch sử đơn kính
  useEffect(() => {
    const fetchDonKinh = async () => {
      if (!benhnhanid) { setDonKinhs([]); return; }
      try {
        const timestamp = Date.now();
        const res = await axios.get(`/api/don-kinh?benhnhanid=${benhnhanid}&limit=100&_t=${timestamp}`, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        const data: DonKinh[] = res.data.data || [];
        // đảm bảo order đúng mới nhất trước
        const sorted = [...data].sort((a,b) => {
          const ta = new Date(a.ngaykham || a.ngay_kham || '').getTime();
          const tb = new Date(b.ngaykham || b.ngay_kham || '').getTime();
          return tb - ta;
        });
        setDonKinhs(sorted);
      } catch (e) {
        // quiet
      }
    };
    fetchDonKinh();
  }, [benhnhanid]);

  // Fetch category data
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        
        // Fetch lens brands
        const hangTrongRes = await axios.get(`/api/hang-trong?_t=${timestamp}&_r=${random}`, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        setHangTrongs(hangTrongRes.data || []);

        // Fetch frame types
        const gongKinhRes = await axios.get(`/api/gong-kinh?_t=${timestamp}&_r=${random}`, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        setGongKinhs(gongKinhRes.data || []);

        // Fetch vision samples
        const thilucRes = await axios.get(`/api/mau-kinh?type=thiluc&_t=${timestamp}&_r=${random}`, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        setMauThiLucs(thilucRes.data || []);

        // Fetch lens power samples
        const sokinhRes = await axios.get(`/api/mau-kinh?type=sokinh&_t=${timestamp}&_r=${random}`, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        setMauSoKinhs(sokinhRes.data || []);
      } catch (error) {
        console.error('Error fetching categories:', error);
      }
    };

    fetchCategories();
  }, []);

  // Helper: Check stock for a lens or frame
  const checkStock = async (hangTrong: string | undefined, sokinh: string | undefined, tenGong: string | undefined) => {
    try {
      const params = new URLSearchParams();
      if (hangTrong) params.set('hang_trong', hangTrong);
      if (sokinh) params.set('sokinh', sokinh);
      if (tenGong) params.set('ten_gong', tenGong);
      if (params.toString()) {
        const res = await axios.get(`/api/inventory/check-stock?${params.toString()}`);
        return res.data;
      }
    } catch { /* silent */ }
    return null;
  };

  // Auto-check stock when lens/frame/sokinh changes
  useEffect(() => {
    const checkLensStock = async () => {
      if (form.hangtrong_mp && form.sokinh_moi_mp) {
        const data = await checkStock(form.hangtrong_mp, form.sokinh_moi_mp, undefined);
        if (data?.lens) setLensStockMp({ ton: data.lens.ton_hien_tai, trang_thai: data.lens.trang_thai });
        else setLensStockMp(null);
      } else {
        setLensStockMp(null);
      }
      if (form.hangtrong_mt && form.sokinh_moi_mt) {
        const data = await checkStock(form.hangtrong_mt, form.sokinh_moi_mt, undefined);
        if (data?.lens) setLensStockMt({ ton: data.lens.ton_hien_tai, trang_thai: data.lens.trang_thai });
        else setLensStockMt(null);
      } else {
        setLensStockMt(null);
      }
    };
    const t = setTimeout(checkLensStock, 300);
    return () => clearTimeout(t);
  }, [form.hangtrong_mp, form.hangtrong_mt, form.sokinh_moi_mp, form.sokinh_moi_mt]);

  useEffect(() => {
    const checkFrameStock = async () => {
      if (form.ten_gong) {
        const data = await checkStock(undefined, undefined, form.ten_gong);
        if (data?.frame) setFrameStock(data.frame.ton_kho);
        else setFrameStock(null);
      } else {
        setFrameStock(null);
      }
    };
    const t = setTimeout(checkFrameStock, 300);
    return () => clearTimeout(t);
  }, [form.ten_gong]);

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Ctrl + S to save
      if (e.ctrlKey && e.key === 's') {
        e.preventDefault();
        if (!isEditing) {
          luuDonKinh();
        } else {
          handleUpdate();
        }
      }
      // Ctrl + N for new prescription
      if (e.ctrlKey && e.key === 'n') {
        e.preventDefault();
        resetForm();
      }
      // Escape to reset
      if (e.key === 'Escape') {
        resetForm();
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isEditing]);

  // Save patient info from dialog
  const savePatientInfo = async () => {
    if (!patientForm) return;
    const { ten, namsinh, diachi } = patientForm;
    if (!ten || !namsinh || !diachi) {
      toast.error('Họ tên, năm/ngày sinh và địa chỉ là bắt buộc!');
      return;
    }
    const namsinhStr = namsinh.trim();
    if (!/^\d{4}$/.test(namsinhStr) && !/^\d{2}\/\d{2}\/\d{4}$/.test(namsinhStr)) {
      toast.error('Năm sinh phải là yyyy hoặc dd/mm/yyyy');
      return;
    }
    try {
      const payload = { ...patientForm, namsinh: namsinhStr };
      await axios.put('/api/benh-nhan', payload);
      toast.success('Đã cập nhật thông tin bệnh nhân');
      setBenhNhan(payload);
      setOpenEditPatient(false);
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error(`Lỗi khi cập nhật bệnh nhân: ${message}`);
    }
  };

  // Điều hướng Enter tuần tự giữa các ô nhập theo data-order
  useEffect(() => {
    const selector = '[data-nav="presc"][data-order]';
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement;
      if (!target || !target.hasAttribute('data-order')) return;
      if (target.getAttribute('data-nav') !== 'presc') return;
      // Nếu SoKinhInput đang ở chế độ tách 3 ô thì để nó tự xử lý
      if (target.closest('.sokinh-split-active')) return;
      e.preventDefault();
      const inputs = Array.from(document.querySelectorAll<HTMLElement>(selector))
        .sort((a,b) => Number(a.getAttribute('data-order')) - Number(b.getAttribute('data-order')));
      const currentOrder = Number(target.getAttribute('data-order'));
      const idx = inputs.findIndex(el => Number(el.getAttribute('data-order')) === currentOrder);
      if (idx >= 0 && idx < inputs.length - 1) {
        const next = inputs[idx + 1];
        (next as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).focus();
        (next as HTMLInputElement | HTMLTextAreaElement).select?.();
      }
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, []);

  // Focus mặc định vào ô thị lực không kính mắt phải khi mở trang hoặc reset form
  useEffect(() => {
    const el = document.querySelector<HTMLInputElement>('[data-first-focus="thiluc_khongkinh_mp"]');
    if (el) {
      setTimeout(() => { el.focus(); el.select(); }, 50);
    }
  }, [form.id]);

  // Auto-populate left eye from right eye for lens brand
  const handleRightEyeLensBrandChange = (value: string) => {
    const selectedBrand = hangTrongs.find(h => h.ten_hang === value);
    if (selectedBrand) {
      setForm({ 
        ...form, 
        hangtrong_mp: value,
        hangtrong_mt: value, // Auto-populate left eye
        ax_mp: selectedBrand.gia_nhap, // legacy
        gianhap_trong: selectedBrand.gia_nhap,
        giatrong: selectedBrand.gia_ban // Giá bán tròng
      });
    } else {
      // Khi xóa hãng tròng, chỉ reset tròng, không ảnh hưởng đến gọng
      setForm({
        ...form,
        hangtrong_mp: value,
        hangtrong_mt: value,
        ax_mp: 0,
        gianhap_trong: 0,
        giatrong: 0 // Chỉ reset giá bán tròng
      });
    }
  };

  // Auto-populate left eye lens brand change separately  
  const handleLeftEyeLensBrandChange = (value: string) => {
    const selectedBrand = hangTrongs.find(h => h.ten_hang === value);
    setForm({
      ...form,
      hangtrong_mt: value,
      // ax_mt is for frame price, not lens price for left eye
    });
  };

  // Auto-populate lens prices when frame is selected
  const handleFrameChange = (value: string) => {
    const selectedFrame = gongKinhs.find(g => g.ten_gong === value);
    if (selectedFrame) {
      setForm({
        ...form,
        ten_gong: value,
        ax_mt: selectedFrame.gia_nhap, // legacy
        gianhap_gong: selectedFrame.gia_nhap,
        giagong: selectedFrame.gia_ban // Giá bán gọng
      });
    } else {
      setForm({
        ...form,
        ten_gong: value,
        ax_mt: 0,
        gianhap_gong: 0,
        giagong: 0
      });
    }
  };

  // Cập nhật lịch sử cục bộ
  const addHistory = (don: DonKinh) => {
    setDonKinhs(prev => {
      if (!don.id) return prev;
      const exists = prev.some(d => d.id === don.id);
      const list = exists ? prev : [don, ...prev];
      return list.sort((a,b)=>{
        const ta = new Date(a.ngaykham || a.ngay_kham || '').getTime();
        const tb = new Date(b.ngaykham || b.ngay_kham || '').getTime();
        return tb - ta;
      });
    });
    if (don.id) {
      setHighlightId(don.id);
      setTimeout(() => setHighlightId(current => current === don.id ? null : current), 3000);
    }
  };
  const updateHistory = (don: DonKinh) => {
    setDonKinhs(prev => prev.map(d => d.id === don.id ? { ...d, ...don } : d));
    if (don.id) {
      setHighlightId(don.id);
      setTimeout(() => setHighlightId(current => current === don.id ? null : current), 3000);
    }
  };
  const removeHistory = (id?: number) => {
    if (!id) return;
    setDonKinhs(prev => prev.filter(d => d.id !== id));
  };

  // Tính toán tổng tiền, số tiền nợ, và lãi (similar to ke-don.tsx)
  const tongTien = useMemo(() => (form.giatrong || 0) + (form.giagong || 0), [form.giatrong, form.giagong]);
  const tienTraLai = useMemo(() => Math.max(0, tienKhachDua - tongTien), [tienKhachDua, tongTien]);
  const sotienConNo = useMemo(() => Math.max(0, tongTien - sotienDaThanhToan), [tongTien, sotienDaThanhToan]);
  const lai = useMemo(() => {
    const costLens = form.gianhap_trong ?? form.ax_mp ?? 0;
    const costFrame = form.gianhap_gong ?? form.ax_mt ?? 0;
    return (form.giatrong || 0) - costLens + (form.giagong || 0) - costFrame;
  }, [form.giatrong, form.gianhap_trong, form.ax_mp, form.giagong, form.gianhap_gong, form.ax_mt]);

  // Lưu đơn kính
  const luuDonKinh = async () => {
    if (!form.ngaykham) {
      toast.error('Vui lòng nhập ngày khám');
      return;
    }
    if (!benhnhanid) {
      toast.error('Không có ID bệnh nhân để lưu đơn kính');
      return;
    }
    if (!window.confirm('Bạn có chắc muốn lưu đơn kính này?')) return;

    const payload: DonKinh = {
      ...form,
      benhnhanid: parseInt(benhnhanid),
      ngaykham: form.ngaykham, // Sử dụng ngaykham cho database
  ax_mp: typeof form.ax_mp === 'number' ? form.ax_mp : form.gianhap_trong || 0,
  ax_mt: typeof form.ax_mt === 'number' ? form.ax_mt : form.gianhap_gong || 0,
      giatrong: typeof form.giatrong === 'number' ? form.giatrong : 0,
      giagong: typeof form.giagong === 'number' ? form.giagong : 0,
      gianhap_trong: typeof form.gianhap_trong === 'number' ? form.gianhap_trong : (typeof form.ax_mp === 'number' ? form.ax_mp : 0),
      gianhap_gong: typeof form.gianhap_gong === 'number' ? form.gianhap_gong : (typeof form.ax_mt === 'number' ? form.ax_mt : 0),
      no: ghiNo, // Thêm trường no
      sotien_da_thanh_toan: ghiNo ? sotienDaThanhToan : tongTien,
      lai: lai || 0,
    };

    try {
      const res = await axios.post('/api/don-kinh', payload);
      if (res.status === 200) {
        toast.success('Đã lưu đơn kính');
        // Show inventory warnings
        const warnings: string[] = res.data.inventoryWarnings || [];
        warnings.forEach((w: string) => toast(w, { duration: 6000, icon: '📦' }));
  addHistory(res.data.data);
        // Lưu hẹn khám lại nếu được bật
        if (henKhamEnabled && henKhamForm.ngay_hen) {
          try {
            await axios.post('/api/hen-kham-lai', {
              benhnhanid: parseInt(benhnhanid || '0'),
              donkinhid: res.data.data?.id || null,
              ten_benhnhan: benhNhan?.ten || '',
              dienthoai: benhNhan?.dienthoai || '',
              ngay_hen: henKhamForm.ngay_hen,
              gio_hen: null,
              ly_do: henKhamForm.ly_do,
              ghichu: henKhamForm.ghichu,
            });
            toast.success('Đã lưu lịch hẹn khám lại');
          } catch {
            toast.error('Lỗi khi lưu lịch hẹn');
          }
        }
        resetForm();
      } else {
        toast.error(`Lỗi khi lưu đơn kính: ${res.data.message || 'Không rõ nguyên nhân'}`);
      }
    } catch (error: unknown) {
      let message: string;
      if (axios.isAxiosError(error)) {
        message = error.response?.data?.message || error.message;
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      toast.error(`Lỗi khi lưu đơn kính: ${message}`);
    }
  };

  // Cập nhật đơn kính
  const handleUpdate = async () => {
    if (!form.ngaykham) {
      toast.error('Vui lòng nhập ngày khám');
      return;
    }
    if (!form.id) {
      toast.error('Không có ID đơn kính để cập nhật');
      return;
    }
    if (!window.confirm('Bạn có chắc muốn cập nhật đơn kính này?')) return;

    const payload: DonKinh = {
      ...form,
      benhnhanid: parseInt(benhnhanid || '0'),
      ngaykham: form.ngaykham, // Sử dụng ngaykham cho database
  ax_mp: typeof form.ax_mp === 'number' ? form.ax_mp : form.gianhap_trong || 0,
  ax_mt: typeof form.ax_mt === 'number' ? form.ax_mt : form.gianhap_gong || 0,
      giatrong: typeof form.giatrong === 'number' ? form.giatrong : 0,
      giagong: typeof form.giagong === 'number' ? form.giagong : 0,
      gianhap_trong: typeof form.gianhap_trong === 'number' ? form.gianhap_trong : (typeof form.ax_mp === 'number' ? form.ax_mp : 0),
      gianhap_gong: typeof form.gianhap_gong === 'number' ? form.gianhap_gong : (typeof form.ax_mt === 'number' ? form.ax_mt : 0),
      no: ghiNo, // Thêm trường no
      sotien_da_thanh_toan: ghiNo ? sotienDaThanhToan : tongTien,
      lai: lai || 0,
    };

    try {
      const res = await axios.put('/api/don-kinh', payload);
      if (res.status === 200) {
        toast.success('Đã cập nhật đơn kính');
        // Show inventory warnings
        const warnings: string[] = res.data.inventoryWarnings || [];
        warnings.forEach((w: string) => toast(w, { duration: 6000, icon: '📦' }));
  updateHistory(res.data.data);
        resetForm();
      } else {
        toast.error(`Lỗi khi cập nhật đơn kính: ${res.data.message || 'Không rõ nguyên nhân'}`);
      }
    } catch (error: unknown) {
      let message: string;
      if (axios.isAxiosError(error)) {
        message = error.response?.data?.message || error.message;
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      toast.error(`Lỗi khi cập nhật đơn kính: ${message}`);
    }
  };

  // Sao chép đơn kính
  const handleCopy = () => {
  const now = new Date();
  const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
  setForm({ ...form, id: undefined, ngaykham: vietnamTime.toISOString().slice(0, 16) });
    setIsEditing(false);
    toast.success('Đã sao chép đơn kính');
  };

  // Xóa đơn kính
  const handleDelete = async () => {
    if (!form.id) {
      toast.error('Không có ID đơn kính để xóa');
      return;
    }
    if (!window.confirm('Bạn có chắc muốn xóa đơn kính này?')) return;

    try {
      const res = await axios.delete(`/api/don-kinh?id=${form.id}`);
      if (res.status === 200) {
        toast.success('Đã xóa đơn kính');
  removeHistory(form.id);
        resetForm();
      } else {
        toast.error(`Lỗi khi xóa đơn kính: ${res.data.message || 'Không rõ nguyên nhân'}`);
      }
    } catch (error: unknown) {
      let message: string;
      if (axios.isAxiosError(error)) {
        message = error.response?.data?.message || error.message;
      } else if (error instanceof Error) {
        message = error.message;
      } else {
        message = String(error);
      }
      toast.error(`Lỗi khi xóa đơn kính: ${message}`);
    }
  };

  // Reset form (Đơn mới)
  const resetForm = () => {
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    setForm({
      chandoan: '',
      ngaykham: vietnamTime.toISOString().slice(0, 16),
      giatrong: 0,
      giagong: 0,
      ten_gong: '', // Reset tên gọng
      ghichu: '',
      thiluc_khongkinh_mp: '',
      thiluc_kinhcu_mp: '',
      thiluc_kinhmoi_mp: '',
      sokinh_cu_mp: '',
      sokinh_moi_mp: '',
      hangtrong_mp: '',
      ax_mp: 0,
      thiluc_khongkinh_mt: '',
      thiluc_kinhcu_mt: '',
      thiluc_kinhmoi_mt: '',
      sokinh_cu_mt: '',
      sokinh_moi_mt: '',
      hangtrong_mt: '',
      ax_mt: 0,
      gianhap_gong: 0,
      no: false,
      lai: 0,
    });
    // Reset payment states
    setGhiNo(false);
    setSotienDaThanhToan(0);
    setSotienDaThanhToanInput('');
    setTienKhachDua(0);
    setTienKhachDuaInput('');
    setIsEditing(false);
    // Reset stock states
    setFrameStock(null);
    setLensStockMp(null);
    setLensStockMt(null);
    // Reset hẹn khám
    setHenKhamEnabled(false);
    setHenKhamForm({ ngay_hen: '', ly_do: 'Lấy kính', ghichu: '' });
    setHenSoNgay('');
  };

  // Chọn đơn từ lịch sử
  const handleSelectDon = (don: DonKinh) => {
    // Xử lý ngày giờ - chuyển đổi sang múi giờ local để hiển thị đúng
    const ngayKhamValue = don.ngaykham || don.ngay_kham;
    let ngayKhamFormatted = '';
    if (ngayKhamValue) {
      const ngayKhamDate = new Date(ngayKhamValue);
      const localTime = new Date(ngayKhamDate.getTime() + (7 * 60 * 60 * 1000)); // Chuyển sang UTC+7
      ngayKhamFormatted = localTime.toISOString().slice(0, 16); // Lấy cả ngày và giờ
    }
    
    setForm({
      ...don,
      ngaykham: ngayKhamFormatted // Đảm bảo ngày giờ được hiển thị đúng
    });
    
    // Set payment states from selected don
    const tongTienDon = (don.giatrong || 0) + (don.giagong || 0);
    const sotienDaThanhToanDon = don.sotien_da_thanh_toan || 0;
    // Sử dụng trường no nếu có, nếu không thì tính toán từ số tiền
    const isNo = don.no !== undefined ? don.no : sotienDaThanhToanDon < tongTienDon;
    setGhiNo(isNo);
    setSotienDaThanhToan(sotienDaThanhToanDon);
    setSotienDaThanhToanInput((sotienDaThanhToanDon / 1000).toString());
    setIsEditing(true);
  };

  if (!benhnhanid) {
    return (
      <div className="p-1">
        <Toaster position="top-right" />
        <Card>
          <CardContent className="p-1">
            <p className="text-sm text-red-500">Vui lòng chọn một bệnh nhân để kê đơn kính.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <ProtectedRoute>
      {/* Mobile: Stack layout, Desktop: Keep sidebar */}
      <div className="flex flex-col lg:flex-row" style={{ height: 'calc(100vh - 72px)' }}>
        <Toaster position="top-right" />
        
        {/* History sidebar - Hidden on mobile, shown on desktop */}
        <aside className="hidden md:block w-72 flex-shrink-0 border-r border-gray-100 bg-blue-50/30 overflow-hidden">
          <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} />
        </aside>

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-3 bg-gray-50/50">
          {/* Profit display - Mobile only */}
          <div className="fixed top-1 right-1 text-sm p-1 bg-white rounded-lg shadow lg:hidden">
            {(lai / 1000).toFixed(0)}
          </div>
            {/* Patient info */}
            {benhNhan ? (
              <div className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  {/* Mobile: stacked */}
                  <div className="md:hidden">
                    <h1 className="font-extrabold text-lg text-blue-700 tracking-tight truncate">{benhNhan.ten}</h1>
                    <div className="flex items-center gap-2 mt-1 text-sm text-gray-500 flex-wrap">
                      <Calendar className="w-4 h-4 text-gray-400 flex-shrink-0" />
                      <span>{benhNhan.namsinh}{benhNhan.tuoi !== undefined ? ` (${benhNhan.tuoi} tuổi)` : ''}</span>
                      {benhNhan.dienthoai && (
                        <>
                          <Phone className="w-4 h-4 text-gray-400 flex-shrink-0" />
                          <span>{benhNhan.dienthoai}</span>
                        </>
                      )}
                    </div>
                    {benhNhan.diachi && (
                      <div className="flex items-center gap-2 mt-0.5 text-sm text-gray-500">
                        <MapPin className="w-4 h-4 text-gray-400 flex-shrink-0" />
                        <span>{benhNhan.diachi}</span>
                      </div>
                    )}
                  </div>
                  {/* Desktop: single line */}
                  <div className="hidden md:flex items-center gap-3 flex-wrap">
                    <span className="font-extrabold text-base text-blue-700 tracking-tight">{benhNhan.ten}</span>
                    <span className="flex items-center gap-1 text-sm text-gray-500"><Calendar className="w-3.5 h-3.5 text-gray-400" />{benhNhan.namsinh}{benhNhan.tuoi !== undefined ? ` (${benhNhan.tuoi} tuổi)` : ''}</span>
                    {benhNhan.dienthoai && <span className="flex items-center gap-1 text-sm text-gray-500"><Phone className="w-3.5 h-3.5 text-gray-400" />{benhNhan.dienthoai}</span>}
                    {benhNhan.diachi && <span className="flex items-center gap-1 text-sm text-gray-500"><MapPin className="w-3.5 h-3.5 text-gray-400" />{benhNhan.diachi}</span>}
                  </div>
                </div>
                <div className="flex gap-1 flex-shrink-0">
                  <Link href={`/ke-don?bn=${benhnhanid}`}>
                    <Button className="h-8 bg-orange-500 hover:bg-orange-600 text-white text-xs px-2" size="sm">
                      Kê thuốc
                    </Button>
                  </Link>
                  <Button variant="outline" size="sm" className="h-8 text-xs px-2" onClick={() => { if (benhNhan) { setPatientForm({ ...benhNhan }); setOpenEditPatient(true); } }}>
                    <Pencil className="w-3 h-3" />
                  </Button>
                </div>
              </div>
            ) : (
              <div className="bg-white rounded-xl shadow-sm p-3">
                <p className="text-sm text-gray-400">Không tìm thấy thông tin bệnh nhân.</p>
              </div>
            )}

            {/* Mobile History Section */}
            <div className="block md:hidden">
              <Card>
                <CardContent className="p-3">
                  <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} />
                </CardContent>
              </Card>
            </div>

            {/* Form kê đơn kính - Responsive Layout */}
            <div className="space-y-3">
              {/* Thông tin chung */}
              <div className="bg-white rounded-xl shadow-sm p-3">
                  <div className="space-y-2">
                    <div className="flex flex-col lg:flex-row gap-2">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1">
                        <label className="w-full sm:w-20 text-xs font-bold text-gray-500 uppercase">Chẩn đoán</label>
                        <input
                          list="chandoan-list"
                          value={form.chandoan || ''}
                          onChange={(e) => setForm({ ...form, chandoan: e.target.value })}
                          className="h-10 sm:h-8 bg-blue-50 border-none rounded-xl px-4 text-sm font-medium flex-1 focus:ring-2 focus:ring-blue-200"
                          placeholder="Nhập chẩn đoán..."
                          data-nav="presc"
                          data-order="0"
                        />
                      </div>
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1">
                        <label className="w-full sm:w-24 text-xs font-bold text-gray-500 uppercase whitespace-nowrap">Ngày giờ khám</label>
                        <div className="flex-1">
                          <Input
                            type="datetime-local"
                            value={form.ngaykham || ''}
                            onChange={(e) => setForm({ ...form, ngaykham: e.target.value })}
                            className="h-10 sm:h-8 w-full bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-200"
                            style={{ colorScheme: 'light' }}
                            step="60"
                          />
                        </div>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                      <label className="w-full sm:w-16 text-xs font-bold text-gray-500 uppercase sm:pt-1">Ghi chú</label>
                      <Textarea
                        rows={1}
                        value={form.ghichu || ''}
                        onChange={(e) => setForm({ ...form, ghichu: e.target.value })}
                        className="flex-1 min-h-[36px] bg-gray-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-200"
                        placeholder="Ghi chú thêm..."
                      />
                    </div>
                    {/* Hẹn khám lại - inline compact */}
                    <div className={`rounded-xl p-2 ${henKhamEnabled ? 'border border-blue-300 bg-blue-50/60' : 'border border-gray-200 bg-gray-50/50'}`}>
                      <div className="flex items-center gap-2">
                        <input type="checkbox" checked={henKhamEnabled} onChange={(e) => {
                          setHenKhamEnabled(e.target.checked);
                          if (e.target.checked && !henKhamForm.ngay_hen) {
                            setHenKhamForm(f => ({ ...f, ngay_hen: addDaysToToday(7) }));
                          }
                        }} className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-200" />
                        <span className="text-xs font-bold text-blue-700">Hẹn khám lại</span>
                        {henKhamEnabled && (
                          <div className="flex items-center gap-1 ml-auto flex-wrap">
                            {[7, 14, 30, 90, 180].map(d => (
                              <button key={d} type="button" className="px-1.5 py-0.5 text-[10px] bg-blue-100 text-blue-700 rounded hover:bg-blue-200 font-medium" onClick={() => { setHenKhamForm(f => ({ ...f, ngay_hen: addDaysToToday(d) })); setHenSoNgay(''); }}>
                                {d < 30 ? `+${d}d` : d === 30 ? '+1th' : d === 90 ? '+3th' : '+6th'}
                              </button>
                            ))}
                            <div className="flex items-center">
                              <span className="text-[10px] text-gray-500">+</span>
                              <input type="number" min="1" value={henSoNgay} onChange={(e) => {
                                setHenSoNgay(e.target.value);
                                const n = parseInt(e.target.value);
                                if (n > 0) setHenKhamForm(f => ({ ...f, ngay_hen: addDaysToToday(n) }));
                              }} className="w-10 h-5 text-[10px] text-center border border-gray-300 rounded px-0.5 [&::-webkit-inner-spin-button]:appearance-none [-moz-appearance:textfield]" placeholder="N" />
                              <span className="text-[10px] text-gray-500">d</span>
                            </div>
                          </div>
                        )}
                      </div>
                      {henKhamEnabled && (
                        <div className="flex items-center gap-1.5 mt-1.5">
                          <Input type="date" value={henKhamForm.ngay_hen} onChange={(e) => setHenKhamForm(f => ({ ...f, ngay_hen: e.target.value }))} className="h-7 text-xs flex-1" />
                          <select className="h-7 border border-gray-300 rounded-md px-1.5 text-xs" value={henKhamForm.ly_do} onChange={(e) => setHenKhamForm(f => ({ ...f, ly_do: e.target.value }))}>
                            {lyDoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                          </select>
                          <Input value={henKhamForm.ghichu} onChange={(e) => setHenKhamForm(f => ({ ...f, ghichu: e.target.value }))} placeholder="Ghi chú..." className="h-7 text-xs flex-1" />
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100">
                      {/* Mobile: Simplified stacked layout */}
                      <div className="block sm:hidden space-y-3">
                        {/* Mắt Phải - Mobile */}
                        <div className="border rounded p-2 bg-blue-50">
                          <h4 className="font-semibold text-sm mb-2">Mắt Phải (MP)</h4>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-600">Thị lực không kính</label>
                              <input data-nav="presc" data-order="1" data-first-focus="thiluc_khongkinh_mp" list="thiluc-list" value={form.thiluc_khongkinh_mp || ''} onChange={(e) => setForm({ ...form, thiluc_khongkinh_mp: e.target.value })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Thị lực kính cũ</label>
                              <input data-nav="presc" data-order="3" list="thiluc-list" value={form.thiluc_kinhcu_mp || ''} onChange={(e) => setForm({ ...form, thiluc_kinhcu_mp: e.target.value })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Thị lực kính mới</label>
                              <input data-nav="presc" data-order="5" list="thiluc-list" value={form.thiluc_kinhmoi_mp || ''} onChange={(e) => setForm({ ...form, thiluc_kinhmoi_mp: e.target.value })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Số kính cũ</label>
                              <SoKinhInput dataNavOrder={7} onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="8"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_cu_mp || ''} onChange={(val) => setForm({ ...form, sokinh_cu_mp: val })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-gray-600">Số kính mới</label>
                              <SoKinhInput dataNavOrder={9} onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="10"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_moi_mp || ''} onChange={(val) => setForm({ ...form, sokinh_moi_mp: val })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                          </div>
                        </div>
                        
                        {/* Mắt Trái - Mobile */}
                        <div className="border rounded p-2 bg-green-50">
                          <h4 className="font-semibold text-sm mb-2">Mắt Trái (MT)</h4>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <label className="text-xs text-gray-600">Thị lực không kính</label>
                              <input data-nav="presc" data-order="2" list="thiluc-list" value={form.thiluc_khongkinh_mt || ''} onChange={(e) => setForm({ ...form, thiluc_khongkinh_mt: e.target.value })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Thị lực kính cũ</label>
                              <input data-nav="presc" data-order="4" list="thiluc-list" value={form.thiluc_kinhcu_mt || ''} onChange={(e) => setForm({ ...form, thiluc_kinhcu_mt: e.target.value })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Thị lực kính mới</label>
                              <input data-nav="presc" data-order="6" list="thiluc-list" value={form.thiluc_kinhmoi_mt || ''} onChange={(e) => setForm({ ...form, thiluc_kinhmoi_mt: e.target.value })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                            <div>
                              <label className="text-xs text-gray-600">Số kính cũ</label>
                              <SoKinhInput dataNavOrder={8} onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="9"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_cu_mt || ''} onChange={(val) => setForm({ ...form, sokinh_cu_mt: val })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                            <div className="col-span-2">
                              <label className="text-xs text-gray-600">Số kính mới</label>
                              <SoKinhInput dataNavOrder={10} onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="11"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_moi_mt || ''} onChange={(val) => setForm({ ...form, sokinh_moi_mt: val })} className="h-10 w-full border rounded px-2 text-sm bg-yellow-50 focus:bg-yellow-100" />
                            </div>
                          </div>
                        </div>
                      </div>

                      {/* Desktop: Keep original table */}
                      <div className="hidden sm:block overflow-x-auto">
                        <table className="w-full border-collapse text-sm">
                          <thead>
                            <tr className="bg-gray-100">
                              <th className="p-1 border w-16">Mắt</th>
                              <th className="p-1 border text-center w-32" colSpan={3}>Thị lực</th>
                              <th className="p-1 border text-center" colSpan={2}>Số kính</th>
                            </tr>
                            <tr className="bg-gray-50">
                              <th className="p-1 border"></th>
                              <th className="p-1 border font-normal text-xs w-20">Không kính</th>
                              <th className="p-1 border font-normal text-xs w-20">Kính cũ</th>
                              <th className="p-1 border font-normal text-xs w-20">Kính mới</th>
                              <th className="p-1 border font-normal text-xs w-40">Kính cũ</th>
                              <th className="p-1 border font-normal text-xs w-40">Kính mới</th>
                            </tr>
                          </thead>
                          <tbody>
                            {/* Mắt Phải */}
                            <tr>
                              <td className="p-1 border font-semibold text-center">MP</td>
                              <td className="p-1 border"><input data-nav="presc" data-order="1" data-first-focus="thiluc_khongkinh_mp" list="thiluc-list" value={form.thiluc_khongkinh_mp || ''} onChange={(e) => setForm({ ...form, thiluc_khongkinh_mp: e.target.value })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                              <td className="p-1 border"><input data-nav="presc" data-order="3" list="thiluc-list" value={form.thiluc_kinhcu_mp || ''} onChange={(e) => setForm({ ...form, thiluc_kinhcu_mp: e.target.value })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                              <td className="p-1 border"><input data-nav="presc" data-order="5" list="thiluc-list" value={form.thiluc_kinhmoi_mp || ''} onChange={(e) => setForm({ ...form, thiluc_kinhmoi_mp: e.target.value })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                              <td className="p-1 border"><SoKinhInput onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="8"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_cu_mp || ''} onChange={(val) => setForm({ ...form, sokinh_cu_mp: val })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                              <td className="p-1 border"><SoKinhInput onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="10"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_moi_mp || ''} onChange={(val) => setForm({ ...form, sokinh_moi_mp: val })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                            </tr>
                            {/* Mắt Trái */}
                            <tr>
                              <td className="p-1 border font-semibold text-center">MT</td>
                              <td className="p-1 border"><input data-nav="presc" data-order="2" list="thiluc-list" value={form.thiluc_khongkinh_mt || ''} onChange={(e) => setForm({ ...form, thiluc_khongkinh_mt: e.target.value })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                              <td className="p-1 border"><input data-nav="presc" data-order="4" list="thiluc-list" value={form.thiluc_kinhcu_mt || ''} onChange={(e) => setForm({ ...form, thiluc_kinhcu_mt: e.target.value })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                              <td className="p-1 border"><input data-nav="presc" data-order="6" list="thiluc-list" value={form.thiluc_kinhmoi_mt || ''} onChange={(e) => setForm({ ...form, thiluc_kinhmoi_mt: e.target.value })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                              <td className="p-1 border"><SoKinhInput onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="9"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_cu_mt || ''} onChange={(val) => setForm({ ...form, sokinh_cu_mt: val })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                              <td className="p-1 border"><SoKinhInput onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="11"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_moi_mt || ''} onChange={(val) => setForm({ ...form, sokinh_moi_mt: val })} className="h-7 w-full border rounded px-1 text-sm bg-yellow-50 focus:bg-yellow-100" /></td>
                            </tr>
                          </tbody>
                        </table>
                      </div>
                  </div>
              </div>

              {/* Sản phẩm */}
              <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
                  <h3 className="font-bold text-blue-800 text-sm tracking-tight mb-2">Sản phẩm</h3>
                  <div className="space-y-3">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                      <label className="w-full sm:w-28 text-xs font-bold text-gray-500 uppercase whitespace-nowrap flex-shrink-0">Chọn gọng</label>
                        <div className="flex-1 flex items-center gap-1">
                          <input
                            list="gongkinh-list"
                            value={form.ten_gong || ''}
                            onChange={(e) => handleFrameChange(e.target.value)}
                            className="h-10 sm:h-8 bg-blue-50 border-none rounded-xl px-4 text-sm font-medium flex-1 focus:ring-2 focus:ring-blue-200"
                            placeholder="Chọn loại gọng"
                            data-nav="presc"
                            data-order="11"
                          />
                          {frameStock !== null && (
                            <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                              frameStock <= 0 ? 'bg-red-100 text-red-700' : frameStock <= 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {frameStock <= 0 ? 'Hết' : `Tồn: ${frameStock}`}
                            </span>
                          )}
                        </div>
                    </div>
                    <div className="flex flex-col lg:flex-row gap-4">
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1">
                        <label className="w-full sm:w-28 text-xs font-bold text-gray-500 uppercase whitespace-nowrap flex-shrink-0">Hãng tròng MP</label>
                        <div className="flex-1 flex items-center gap-1">
                          <input 
                            list="hangtrong-list" 
                            value={form.hangtrong_mp || ''} 
                            onChange={(e) => handleRightEyeLensBrandChange(e.target.value)} 
                            className="h-10 sm:h-8 bg-blue-50 border-none rounded-xl px-4 text-sm font-medium flex-1 focus:ring-2 focus:ring-blue-200" 
                            placeholder="Chọn hãng tròng MP" 
                            data-nav="presc"
                            data-order="12"
                          />
                          {lensStockMp && (
                            <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                              lensStockMp.trang_thai === 'HET' || lensStockMp.trang_thai === 'CHUA_CO' ? 'bg-red-100 text-red-700'
                              : lensStockMp.trang_thai === 'SAP_HET' ? 'bg-yellow-100 text-yellow-700'
                              : lensStockMp.trang_thai === 'DAT_HANG' ? 'bg-blue-100 text-blue-700'
                              : lensStockMp.trang_thai === 'CHUA_NHAP_DO' ? 'bg-gray-100 text-gray-500'
                              : 'bg-green-100 text-green-700'
                            }`}>
                              {lensStockMp.trang_thai === 'DAT_HANG' ? 'Đặt hàng'
                              : lensStockMp.trang_thai === 'CHUA_NHAP_DO' ? '...'
                              : lensStockMp.trang_thai === 'CHUA_CO' ? 'Chưa có'
                              : lensStockMp.ton !== null ? (lensStockMp.ton <= 0 ? 'Hết' : `Tồn: ${lensStockMp.ton}`) : ''}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 lg:flex-1">
                        <label className="w-full sm:w-28 text-xs font-bold text-gray-500 uppercase whitespace-nowrap flex-shrink-0">Hãng tròng MT</label>
                        <div className="flex-1 flex items-center gap-1">
                          <input 
                            list="hangtrong-list" 
                            value={form.hangtrong_mt || ''} 
                            onChange={(e) => handleLeftEyeLensBrandChange(e.target.value)} 
                            className="h-10 sm:h-8 bg-blue-50 border-none rounded-xl px-4 text-sm font-medium flex-1 focus:ring-2 focus:ring-blue-200" 
                            placeholder="Chọn hãng tròng MT" 
                            data-nav="presc"
                            data-order="13"
                          />
                          {lensStockMt && (
                            <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                              lensStockMt.trang_thai === 'HET' || lensStockMt.trang_thai === 'CHUA_CO' ? 'bg-red-100 text-red-700'
                              : lensStockMt.trang_thai === 'SAP_HET' ? 'bg-yellow-100 text-yellow-700'
                              : lensStockMt.trang_thai === 'DAT_HANG' ? 'bg-blue-100 text-blue-700'
                              : lensStockMt.trang_thai === 'CHUA_NHAP_DO' ? 'bg-gray-100 text-gray-500'
                              : 'bg-green-100 text-green-700'
                            }`}>
                              {lensStockMt.trang_thai === 'DAT_HANG' ? 'Đặt hàng'
                              : lensStockMt.trang_thai === 'CHUA_NHAP_DO' ? '...'
                              : lensStockMt.trang_thai === 'CHUA_CO' ? 'Chưa có'
                              : lensStockMt.ton !== null ? (lensStockMt.ton <= 0 ? 'Hết' : `Tồn: ${lensStockMt.ton}`) : ''}
                            </span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
              </div>

              {/* Mobile Thanh toán - ẩn trên desktop */}
              <div className="block lg:hidden">
                <div className="bg-white rounded-xl shadow-sm p-3 space-y-3">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-blue-800 text-sm tracking-tight">Thanh toán</h3>
                      {isAdmin && (
                        <button type="button" onClick={() => setShowAdminPanel(!showAdminPanel)} className={`text-gray-400 hover:text-gray-600 p-0.5 touch-manipulation transition-transform ${showAdminPanel ? 'rotate-180' : ''}`} title="Giá nhập">
                          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                        </button>
                      )}
                    </div>
                    {/* Giá nhập - chỉ owner/admin mới thấy */}
                    {isAdmin && showAdminPanel && (
                      <div className="space-y-2 pb-2 mb-1 border-b border-dashed border-gray-200">
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-400 whitespace-nowrap shrink-0">Nhập tròng</label>
                          <Input type="number" value={form.gianhap_trong ? (form.gianhap_trong / 1000) : ''} onChange={(e) => setForm({ ...form, gianhap_trong: e.target.value ? Number(e.target.value) * 1000 : 0 })} className="h-8 text-xs flex-1 min-w-0" placeholder="nghìn" />
                        </div>
                        <div className="flex items-center gap-2">
                          <label className="text-xs font-medium text-gray-400 whitespace-nowrap shrink-0">Nhập gọng</label>
                          <Input type="number" value={form.gianhap_gong ? (form.gianhap_gong / 1000) : ''} onChange={(e) => setForm({ ...form, gianhap_gong: e.target.value ? Number(e.target.value) * 1000 : 0 })} className="h-8 text-xs flex-1 min-w-0" placeholder="nghìn" />
                        </div>
                      </div>
                    )}
                    {/* Giá tròng - inline */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-500 whitespace-nowrap shrink-0">Giá tròng</label>
                      <Input type="number" value={form.giatrong ? (form.giatrong / 1000) : ''} onChange={(e) => setForm({ ...form, giatrong: e.target.value ? Number(e.target.value) * 1000 : 0 })} className="h-8 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-200 flex-1 min-w-0" placeholder="nghìn" />
                    </div>
                    {/* Giá gọng - inline */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-500 whitespace-nowrap shrink-0">Giá gọng</label>
                      <Input type="number" value={form.giagong ? (form.giagong / 1000) : ''} onChange={(e) => setForm({ ...form, giagong: e.target.value ? Number(e.target.value) * 1000 : 0 })} className="h-8 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-200 flex-1 min-w-0" placeholder="nghìn" />
                    </div>
                    {/* Summary */}
                    {ghiNo && (
                      <>
                        <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                          <span className="text-xs text-gray-500 font-medium">Đã thanh toán</span>
                          <span className="text-sm font-bold text-gray-800">{sotienDaThanhToan.toLocaleString()}đ</span>
                        </div>
                        <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                          <span className="text-xs text-gray-500 font-medium">Còn nợ</span>
                          <span className="text-sm font-bold text-red-500">{sotienConNo.toLocaleString()}đ</span>
                        </div>
                      </>
                    )}
                    <div className="border-t pt-2 flex justify-between items-center">
                      <span className="text-xs font-bold text-gray-500">Tổng tiền</span>
                      <span className="text-xl font-extrabold text-blue-700">{tongTien.toLocaleString()}đ</span>
                    </div>
                    {/* Khách đưa - inline */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-500 whitespace-nowrap shrink-0">khách đưa</label>
                        <Input
                          type="number"
                          value={tienKhachDuaInput}
                          onChange={(e) => {
                            const val = e.target.value;
                            setTienKhachDuaInput(val);
                            const raw = val ? +val * 1000 : 0;
                            setTienKhachDua(Math.max(0, raw));
                            if (raw > 0 && raw < tongTien) {
                              setGhiNo(true);
                              setSotienDaThanhToan(Math.max(0, raw));
                              setSotienDaThanhToanInput(val);
                            } else if (raw >= tongTien) {
                              setGhiNo(false);
                              setSotienDaThanhToan(tongTien);
                              setSotienDaThanhToanInput((tongTien / 1000).toString());
                            } else {
                              setGhiNo(false);
                              setSotienDaThanhToan(0);
                              setSotienDaThanhToanInput('');
                            }
                          }}
                          className="h-8 bg-gray-100 border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-200 flex-1 min-w-0"
                          placeholder="nghìn"
                        />
                      </div>
                      {tienKhachDua > 0 && tienTraLai > 0 && (
                        <div className="flex justify-between items-center">
                          <span className="text-xs text-gray-500 font-medium">Trả lại</span>
                          <span className="text-sm font-bold text-blue-600">{tienTraLai.toLocaleString()}đ</span>
                        </div>
                      )}
                    </div>
                    {/* Ghi nợ */}
                    <div className="flex items-center gap-2">
                      <input type="checkbox" checked={ghiNo} onChange={(e) => setGhiNo(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-200" />
                      <span className={`text-sm font-semibold ${ghiNo ? 'text-red-500' : 'text-gray-700'}`}>
                        Ghi nợ{ghiNo && sotienConNo > 0 ? `: ${sotienConNo.toLocaleString()}đ` : ''}
                      </span>
                    </div>
                    <div className="border-t pt-2 text-sm">
                      Lãi: <span className="font-bold text-blue-800">{(lai / 1000).toFixed(0)}</span>
                    </div>
                </div>
                {/* Nút hành động */}
                <div className="flex flex-wrap gap-2 pt-3 border-t">
                  {!isEditing && (
                    <button className="w-full bg-blue-700 hover:bg-blue-800 text-white font-extrabold py-3 rounded-xl shadow-sm active:scale-[0.98] transition-all text-sm touch-manipulation" onClick={luuDonKinh}>Lưu đơn</button>
                  )}
                  {isEditing && form.id && (
                    <>
                      <button className="flex-1 bg-blue-700 hover:bg-blue-800 text-white font-extrabold py-3 rounded-xl shadow-sm active:scale-[0.98] transition-all text-sm touch-manipulation" onClick={handleUpdate}>Sửa đơn</button>
                      <button className="bg-white border border-gray-200 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-xl hover:bg-gray-50 touch-manipulation" onClick={handleCopy}>Sao chép</button>
                    </>
                  )}
                  <button className="bg-white border border-gray-200 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-xl hover:bg-gray-50 touch-manipulation" onClick={resetForm}>
                    <FilePlus className="w-4 h-4 mr-1 inline" /> Đơn mới
                  </button>
                  {isEditing && form.id && (
                    <button className="bg-white border border-red-200 text-red-500 font-bold text-sm py-2.5 px-3 rounded-xl hover:bg-red-50 touch-manipulation" onClick={handleDelete}>
                      <Trash2 className="w-4 h-4 mr-1 inline" /> Xóa
                    </button>
                  )}
                </div>
              </div>

              {/* Datalists for autocompletion */}
              <datalist id="thiluc-list">
                {mauThiLucs.map(tl => (<option key={tl.id} value={tl.gia_tri} />))}
              </datalist>
              <datalist id="sokinh-list">
                {mauSoKinhs.map(sk => (<option key={sk.id} value={sk.so_kinh} />))}
              </datalist>
              <datalist id="chandoan-list">
                <option value="Cận thị" />
                <option value="Loạn thị" />
                <option value="Cận loạn" />
                <option value="Viễn loạn" />
                <option value="Viễn thị" />
                <option value="Lão thị" />
                <option value="Nhược thị" />
                <option value="Lác quy tụ / lác ly khai" />
                <option value="Co quắp điều tiết" />
                <option value="Mỏi mắt (asthenopia)" />
              </datalist>
              <datalist id="hangtrong-list">
                {hangTrongs.map(ht => (<option key={ht.id} value={ht.ten_hang} />))}
              </datalist>
              <datalist id="gongkinh-list">
                {gongKinhs.map(gk => (<option key={gk.id} value={gk.ten_gong} />))}
              </datalist>
            </div>
        </div>

        {/* ═══ RIGHT SIDEBAR: Thanh toán & Hành động ═══ */}
        <aside className="hidden lg:flex w-[clamp(220px,16.67%,320px)] flex-shrink-0 border-l border-gray-100 bg-gray-50/50 flex-col h-full">
          {/* Scrollable payment zone */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-bold text-blue-800 text-xs tracking-tight">Thanh toán</h2>
            {isAdmin && (
              <button type="button" onClick={() => setShowAdminPanel(!showAdminPanel)} className={`text-gray-400 hover:text-gray-600 p-0.5 touch-manipulation transition-transform ${showAdminPanel ? 'rotate-180' : ''}`} title="Giá nhập">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
            )}
          </div>

          {/* Payment inputs */}
          <div className="bg-white rounded-xl p-2.5 shadow-sm space-y-1.5 mb-2">
            {/* Giá nhập - chỉ owner/admin mới thấy */}
            {isAdmin && showAdminPanel && (
              <div className="space-y-1.5 pb-1.5 mb-1 border-b border-dashed border-gray-200">
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-medium text-gray-400 whitespace-nowrap shrink-0">Nhập tròng</label>
                  <div className="flex items-center bg-gray-100 rounded-lg px-2 h-7 flex-1 min-w-0">
                    <input type="number" value={form.gianhap_trong ? (form.gianhap_trong / 1000) : ''} onChange={(e) => setForm({ ...form, gianhap_trong: e.target.value ? Number(e.target.value) * 1000 : 0 })} placeholder="Nhập số" className="bg-transparent w-full outline-none text-[11px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                    {form.gianhap_trong && form.gianhap_trong > 0 && (
                      <span className="text-[11px] text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[10px] font-medium text-gray-400 whitespace-nowrap shrink-0">Nhập gọng</label>
                  <div className="flex items-center bg-gray-100 rounded-lg px-2 h-7 flex-1 min-w-0">
                    <input type="number" value={form.gianhap_gong ? (form.gianhap_gong / 1000) : ''} onChange={(e) => setForm({ ...form, gianhap_gong: e.target.value ? Number(e.target.value) * 1000 : 0 })} placeholder="Nhập số" className="bg-transparent w-full outline-none text-[11px] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                    {form.gianhap_gong && form.gianhap_gong > 0 && (
                      <span className="text-[11px] text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Giá tròng - inline */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap shrink-0">Giá tròng</label>
              <div className="flex items-center bg-gray-100 rounded-lg px-2 h-7 flex-1 min-w-0">
                <input type="number" value={form.giatrong ? (form.giatrong / 1000) : ''} onChange={(e) => setForm({ ...form, giatrong: e.target.value ? Number(e.target.value) * 1000 : 0 })} placeholder="Nhập số" className="bg-transparent w-full outline-none text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" data-nav="presc" data-order="14" />
                {form.giatrong && form.giatrong > 0 && (
                  <span className="text-xs text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                )}
              </div>
            </div>
            {/* Giá gọng - inline */}
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap shrink-0">Giá gọng</label>
              <div className="flex items-center bg-gray-100 rounded-lg px-2 h-7 flex-1 min-w-0">
                <input type="number" value={form.giagong ? (form.giagong / 1000) : ''} onChange={(e) => setForm({ ...form, giagong: e.target.value ? Number(e.target.value) * 1000 : 0 })} placeholder="Nhập số" className="bg-transparent w-full outline-none text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" data-nav="presc" data-order="15" />
                {form.giagong && form.giagong > 0 && (
                  <span className="text-xs text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                )}
              </div>
            </div>
            {/* Summary rows */}
            {ghiNo && (
              <>
                <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                  <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap">Đã thanh toán</span>
                  <span className="text-xs font-bold text-gray-800 whitespace-nowrap">{sotienDaThanhToan.toLocaleString()}đ</span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-gray-100">
                  <span className="text-[11px] text-gray-500 font-medium whitespace-nowrap">Còn nợ</span>
                  <span className="text-xs font-bold text-red-500 whitespace-nowrap">{sotienConNo.toLocaleString()}đ</span>
                </div>
              </>
            )}
            {/* Tổng cộng */}
            <div className="pt-1.5 flex justify-between items-center border-t border-gray-100">
              <span className="font-extrabold text-xs text-blue-800 tracking-tight whitespace-nowrap">TỔNG CỘNG</span>
              <span className="font-extrabold text-base text-blue-700 whitespace-nowrap">{tongTien.toLocaleString()}đ</span>
            </div>
          </div>

          {/* Khách đưa - inline */}
          <div className="space-y-1 mb-2 px-0.5">
            <div className="flex items-center gap-1.5">
              <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap shrink-0">khách đưa</label>
              <div className="flex items-center bg-gray-100 rounded-lg px-2 h-7 flex-1 min-w-0">
                <input
                  type="number"
                  value={tienKhachDuaInput}
                  onChange={(e) => {
                    const val = e.target.value;
                    setTienKhachDuaInput(val);
                    const raw = val ? +val * 1000 : 0;
                    setTienKhachDua(Math.max(0, raw));
                    if (raw > 0 && raw < tongTien) {
                      setGhiNo(true);
                      setSotienDaThanhToan(Math.max(0, raw));
                      setSotienDaThanhToanInput(val);
                    } else if (raw >= tongTien) {
                      setGhiNo(false);
                      setSotienDaThanhToan(tongTien);
                      setSotienDaThanhToanInput((tongTien / 1000).toString());
                    } else {
                      setGhiNo(false);
                      setSotienDaThanhToan(0);
                      setSotienDaThanhToanInput('');
                    }
                  }}
                  placeholder="Nhập số"
                  className="bg-transparent w-full outline-none text-xs [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                {tienKhachDuaInput && Number(tienKhachDuaInput) !== 0 && (
                  <span className="text-xs text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                )}
              </div>
            </div>
            {tienKhachDua > 0 && tienTraLai > 0 && (
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-gray-500 font-medium">Trả lại</span>
                <span className="text-xs font-bold text-blue-600">{tienTraLai.toLocaleString()}đ</span>
              </div>
            )}
          </div>

          {/* Ghi nợ */}
          <div className="mb-2 px-0.5">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ghiNo-desktop" checked={ghiNo} onChange={(e) => setGhiNo(e.target.checked)} className="h-3.5 w-3.5 rounded border-gray-300 text-red-500 focus:ring-red-200" />
              <label htmlFor="ghiNo-desktop" className={`text-xs font-semibold cursor-pointer ${ghiNo ? 'text-red-500' : 'text-gray-700'}`}>
                Ghi nợ{ghiNo && sotienConNo > 0 ? `: ${sotienConNo.toLocaleString()}đ` : ''}
              </label>
            </div>
          </div>

          </div>
          {/* end scrollable zone */}

          {/* Fixed-bottom action buttons */}
          <div className="flex-shrink-0 p-3 border-t border-gray-100 space-y-1.5">
            {!isEditing && (
              <button className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]" onClick={luuDonKinh}>
                ✓ LƯU ĐƠN
              </button>
            )}
            {isEditing && form.id && (
              <button className="w-full bg-blue-700 hover:bg-blue-800 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]" onClick={handleUpdate}>
                ✓ CẬP NHẬT
              </button>
            )}
            <div className="grid grid-cols-2 gap-1.5">
              <button className="bg-white border border-gray-200 text-gray-700 font-bold text-[11px] py-2 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1" onClick={resetForm}>
                <FilePlus className="w-3.5 h-3.5" /> Mới
              </button>
              {isEditing && form.id ? (
                <button className="bg-white border border-gray-200 text-gray-700 font-bold text-[11px] py-2 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1" onClick={handleCopy}>
                  📋 Chép
                </button>
              ) : (
                <div />
              )}
            </div>
            {isEditing && form.id && (
              <button className="w-full bg-white border border-red-200 text-red-500 font-bold text-[11px] py-2 rounded-xl hover:bg-red-50 transition-colors" onClick={handleDelete}>
                Xóa đơn
              </button>
            )}
          </div>
          <p className="text-[11px] text-gray-400 text-right px-3 pb-1">{(lai / 1000).toFixed(0)}</p>
        </aside>
      </div>
      {/* Edit Patient Dialog */}
      <Dialog open={openEditPatient} onOpenChange={setOpenEditPatient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa thông tin bệnh nhân</DialogTitle>
            {patientForm?.id && (
              <div className="text-sm text-gray-500">Mã BN: {patientForm.id}</div>
            )}
          </DialogHeader>
          <div className="space-y-2 py-2">
            <Label>Họ Tên *</Label>
            <Input
              value={patientForm?.ten || ''}
              onChange={(e) => setPatientForm((prev) => prev ? { ...prev, ten: e.target.value } as BenhNhan : prev)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); savePatientInfo(); } }}
            />
            <Label>Năm sinh hoặc ngày sinh (yyyy hoặc dd/mm/yyyy) *</Label>
            <Input
              value={patientForm?.namsinh || ''}
              onChange={(e) => setPatientForm((prev) => prev ? { ...prev, namsinh: e.target.value } as BenhNhan : prev)}
              placeholder="VD: 1980 hoặc 01/01/1980"
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); savePatientInfo(); } }}
            />
            <Label>Điện Thoại</Label>
            <Input
              value={patientForm?.dienthoai || ''}
              onChange={(e) => setPatientForm((prev) => prev ? { ...prev, dienthoai: e.target.value } as BenhNhan : prev)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); savePatientInfo(); } }}
            />
            <Label>Địa Chỉ *</Label>
            <Input
              value={patientForm?.diachi || ''}
              onChange={(e) => setPatientForm((prev) => prev ? { ...prev, diachi: e.target.value } as BenhNhan : prev)}
              onKeyDown={(e) => { if (e.key === 'Enter' && e.ctrlKey) { e.preventDefault(); savePatientInfo(); } }}
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenEditPatient(false)}>Hủy</Button>
            <Button onClick={savePatientInfo}>Lưu</Button>
          </div>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}