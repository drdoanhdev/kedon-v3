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
import { Pencil, Copy, Trash2, FilePlus } from 'lucide-react';
import SoKinhInput from '../components/SoKinhInput';
import ProtectedRoute from '../components/ProtectedRoute';
import Link from 'next/link';
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
  <div className="h-full overflow-y-auto p-1 bg-gray-100 lg:bg-gray-100">
    <h2 className="text-base font-bold mb-2">Lịch sử đơn kính</h2>
    {items.length === 0 ? (
      <p className="text-xs text-gray-500">Chưa có đơn kính nào</p>
    ) : (
      <div className="space-y-2 lg:space-y-1">
        {items.map((don) => (
          <div
            key={don.id}
            className={`p-3 lg:p-1 rounded cursor-pointer shadow-sm lg:shadow-none border lg:border-0 transition-colors duration-300 ${don.id === highlightId ? 'bg-yellow-200 ring-2 ring-yellow-400 animate-pulse' : 'bg-white hover:bg-gray-200'}`}
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
              <div className="grid grid-cols-2 gap-2 text-xs">
                <div><span className="text-gray-500">MP:</span> {don.sokinh_moi_mp || 'N/A'}</div>
                <div><span className="text-gray-500">MT:</span> {don.sokinh_moi_mt || 'N/A'}</div>
                <div><span className="text-gray-500">Tròng:</span> {((don.giatrong || 0) / 1000).toFixed(0)}k</div>
                <div><span className="text-gray-500">Gọng:</span> {((don.giagong || 0) / 1000).toFixed(0)}k</div>
              </div>
            </div>
            <div className="hidden md:block">
              <p className="text-xs"><strong>Ngày:</strong> {new Date(don.ngaykham || don.ngay_kham || '').toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</p>
              <p className="text-xs"><strong>Số kính:</strong> MP: {don.sokinh_moi_mp || 'N/A'}, MT: {don.sokinh_moi_mt || 'N/A'}</p>
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

  const [benhNhan, setBenhNhan] = useState<BenhNhan | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]); // lịch sử đơn kính
  const [highlightId, setHighlightId] = useState<number | null>(null); // id đơn kính mới / vừa cập nhật để highlight
  // Edit patient dialog state
  const [openEditPatient, setOpenEditPatient] = useState(false);
  const [patientForm, setPatientForm] = useState<BenhNhan | null>(null);

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
  
  // Admin panel toggle state
  const [showAdminPanel, setShowAdminPanel] = useState(false);
  
  // Category data states
  const [hangTrongs, setHangTrongs] = useState<HangTrong[]>([]);
  const [gongKinhs, setGongKinhs] = useState<GongKinh[]>([]);
  const [mauThiLucs, setMauThiLucs] = useState<MauThiLuc[]>([]);
  const [mauSoKinhs, setMauSoKinhs] = useState<MauSoKinh[]>([]);
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
  addHistory(res.data.data);
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
    setIsEditing(false);
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
      <div className="flex flex-col lg:flex-row h-screen">
        <Toaster position="top-right" />
        
        {/* History sidebar - Hidden on mobile, shown on desktop */}
  <div className="hidden md:block md:w-1/6 bg-gray-100">
          <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} />
        </div>
        
        {/* Main content area */}
        <div className="flex-1 lg:w-5/6 container mx-auto p-1 space-y-1 overflow-y-auto">
          {/* Profit display - Mobile friendly */}
          <div className="fixed top-1 right-1 text-sm p-1 bg-white rounded shadow lg:bg-transparent lg:shadow-none">
            {(lai / 1000).toFixed(0)}k
          </div>

          <div className="flex flex-col space-y-1">
            {/* Patient info - Mobile responsive */}
            <Card className="w-full">
              <CardContent className="p-1">
                {benhNhan ? (
                  <>
                    <div className="flex items-center justify-between mb-2">
                      <div className="font-semibold">Thông tin bệnh nhân</div>
                      <div className="flex items-center gap-2">
                        <Link href={`/ke-don?bn=${benhnhanid}`}>
                          <Button className="h-8 bg-orange-500 hover:bg-orange-600 text-white px-3" size="sm">
                            Kê đơn thuốc
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" className="h-8" onClick={() => { if (benhNhan) { setPatientForm({ ...benhNhan }); setOpenEditPatient(true); } }}>
                          <Pencil className="w-4 h-4 mr-2" /> Sửa BN
                        </Button>
                      </div>
                    </div>
                    <div className="flex flex-col sm:flex-row gap-2 sm:gap-4 text-sm">
                      <span>
                        Mã BN: <span className="font-semibold">{benhNhan.id}</span>
                      </span>
                      <span>
                        Họ tên: <span className="font-semibold">{benhNhan.ten}</span>
                      </span>
                      <span>
                        Ngày sinh: <span className="font-semibold">{benhNhan.namsinh}</span>
                      </span>
                      {benhNhan.tuoi !== undefined && (
                        <span>
                          Tuổi: <span className="font-semibold">{benhNhan.tuoi}</span>
                        </span>
                      )}
                      <span className="sm:hidden">
                        SĐT: <span className="font-semibold">{benhNhan.dienthoai}</span>
                      </span>
                      <span className="hidden sm:block">
                        Điện thoại: <span className="font-semibold">{benhNhan.dienthoai}</span>
                      </span>
                      <span className="sm:hidden">
                        ĐC: <span className="font-semibold">{benhNhan.diachi || '-'}</span>
                      </span>
                      <span className="hidden sm:block">
                        Địa chỉ: <span className="font-semibold">{benhNhan.diachi || '-'}</span>
                      </span>
                    </div>
                  </>
                ) : (
                  <p className="text-sm text-red-500">Không tìm thấy thông tin bệnh nhân.</p>
                )}
              </CardContent>
            </Card>

            {/* Mobile History Section */}
            <div className="block md:hidden">
              <Card>
                <CardContent className="p-3">
                  <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} />
                </CardContent>
              </Card>
            </div>

            {/* Form kê đơn kính - Responsive Layout */}
            <div className="space-y-2">
              {/* Card 1 & 2: Thông tin chung và Đo mắt */}
              <div className="flex flex-col lg:grid lg:grid-cols-6 gap-2">
                {/* Cột trái cho thông tin chung */}
                <div className="lg:col-span-2">
                  <Card>
                    <CardContent className="p-2 space-y-3">
                      <h3 className="font-semibold text-base text-center">Thông tin chung</h3>
                      
                      {/* Mobile: Stack vertically, Desktop: Keep current layout */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="w-full sm:w-28 text-sm font-medium">Ngày giờ khám</label>
                        <div className="flex-1 flex items-center gap-1">
                          <Input
                            type="datetime-local"
                            value={form.ngaykham || ''}
                            onChange={(e) => setForm({ ...form, ngaykham: e.target.value })}
                            className="h-10 sm:h-8 flex-1 bg-yellow-50 focus:bg-yellow-100"
                            style={{ colorScheme: 'light' }}
                            step="60"
                          />
                          <Button
                            type="button" variant="outline" size="sm" 
                            className="h-10 w-10 sm:h-8 sm:w-8 p-0"
                            onClick={() => {
                              const now = new Date();
                              const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
                              setForm({ ...form, ngaykham: vietnamTime.toISOString().slice(0, 16) });
                            }}
                            title="Đặt về thời gian hiện tại"
                          >
                            <span role="img" aria-label="calendar">📅</span>
                          </Button>
                        </div>
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="w-full sm:w-28 text-sm font-medium">Chẩn đoán</label>
                        <input
                          list="chandoan-list"
                          value={form.chandoan || ''}
                          onChange={(e) => setForm({ ...form, chandoan: e.target.value })}
                          className="h-10 sm:h-8 border rounded px-2 text-sm flex-1 bg-yellow-50 focus:bg-yellow-100"
                          placeholder="Nhập chẩn đoán..."
                          data-nav="presc"
                          data-order="0"
                        />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-start gap-2">
                        <label className="w-full sm:w-28 text-sm font-medium sm:pt-1">Ghi chú</label>
                        <Textarea
                          rows={3}
                          value={form.ghichu || ''}
                          onChange={(e) => setForm({ ...form, ghichu: e.target.value })}
                          className="flex-1 min-h-[80px] sm:min-h-[60px] bg-yellow-50 focus:bg-yellow-100"
                          placeholder="Ghi chú thêm..."
                        />
                      </div>
                    </CardContent>
                  </Card>
                </div>

                {/* Cột phải cho đo mắt - Mobile optimized table */}
                <div className="lg:col-span-4">
                  <Card>
                    <CardContent className="p-2 space-y-2">
                      <h3 className="font-semibold text-base text-center">Đo mắt</h3>
                      
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
                    </CardContent>
                  </Card>
                </div>
              </div>

              {/* Card 3: Sản phẩm và Thanh toán - Mobile Responsive */}
              <Card>
                <CardContent className="p-2 space-y-3">
                  {/* Mobile: Stack vertically, Desktop: 3 columns */}
                  <div className="flex flex-col lg:grid lg:grid-cols-3 gap-4">
                    
                    {/* Cột 1: Chọn sản phẩm */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-base">Sản phẩm</h3>
                      
                      {/* Product selection rows: keep labels vertically aligned across breakpoints */}
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="w-full sm:w-28 text-sm font-medium whitespace-nowrap flex-shrink-0">Chọn gọng</label>
                        <input
                          list="gongkinh-list"
                          value={form.ten_gong || ''}
                          onChange={(e) => handleFrameChange(e.target.value)}
                          className="h-10 sm:h-8 border rounded px-2 text-sm flex-1 bg-yellow-50 focus:bg-yellow-100"
                          placeholder="Chọn loại gọng"
                          data-nav="presc"
                          data-order="11"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="w-full sm:w-28 text-sm font-medium whitespace-nowrap flex-shrink-0">Hãng tròng MP</label>
                        <input 
                          list="hangtrong-list" 
                          value={form.hangtrong_mp || ''} 
                          onChange={(e) => handleRightEyeLensBrandChange(e.target.value)} 
                          className="h-10 sm:h-8 border rounded px-2 text-sm flex-1 bg-yellow-50 focus:bg-yellow-100" 
                          placeholder="Chọn hãng tròng MP" 
                          data-nav="presc"
                          data-order="12"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="w-full sm:w-28 text-sm font-medium whitespace-nowrap flex-shrink-0">Hãng tròng MT</label>
                        <input 
                          list="hangtrong-list" 
                          value={form.hangtrong_mt || ''} 
                          onChange={(e) => handleLeftEyeLensBrandChange(e.target.value)} 
                          className="h-10 sm:h-8 border rounded px-2 text-sm flex-1 bg-yellow-50 focus:bg-yellow-100" 
                          placeholder="Chọn hãng tròng MT" 
                          data-nav="presc"
                          data-order="13"
                        />
                      </div>

                      {/* Nút toggle admin panel - Mobile friendly */}
                      <div className="flex justify-end">
                        <button
                          type="button"
                          onClick={() => setShowAdminPanel(!showAdminPanel)}
                          className="text-sm text-gray-400 hover:text-gray-600 p-2 touch-manipulation"
                          title="Thông tin kỹ thuật"
                        >
                          ⚙️
                        </button>
                      </div>

                      {/* Admin panel - Mobile optimized */}
                      {showAdminPanel && (
                        <div className="border border-gray-200 rounded bg-gray-50 p-3 space-y-3">
                          <div className="text-xs text-gray-500 mb-2">Thông tin kỹ thuật</div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="w-full sm:w-16 text-xs font-medium text-gray-600">Mã Tròng</label>
                            <Input
                              type="number"
                              value={form.gianhap_trong ? (form.gianhap_trong / 1000) : ''}
                              onChange={(e) => setForm({ ...form, gianhap_trong: e.target.value ? Number(e.target.value) * 1000 : 0 })}
                              className="h-10 sm:h-7 flex-1 text-xs"
                              placeholder="0"
                            />
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="w-full sm:w-16 text-xs font-medium text-gray-600">Mã Gọng</label>
                            <Input
                              type="number"
                              value={form.gianhap_gong ? (form.gianhap_gong / 1000) : ''}
                              onChange={(e) => setForm({ ...form, gianhap_gong: e.target.value ? Number(e.target.value) * 1000 : 0 })}
                              className="h-10 sm:h-7 flex-1 text-xs"
                              placeholder="0"
                            />
                          </div>
                        </div>
                      )}
                    </div>

                    {/* Cột 2: Thanh toán */}
                    <div className="space-y-3">
                      <h3 className="font-semibold text-base">Thanh toán</h3>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="w-full sm:w-24 text-sm font-medium">Giá tròng</label>
                        <Input 
                          type="number" 
                          value={form.giatrong ? (form.giatrong / 1000) : ''} 
                          onChange={(e) => setForm({ ...form, giatrong: e.target.value ? Number(e.target.value) * 1000 : 0 })} 
                          className="h-10 sm:h-8 flex-1 bg-yellow-50 focus:bg-yellow-100" 
                          placeholder="Giá tròng (nghìn)" 
                          data-nav="presc"
                          data-order="14"
                        />
                      </div>
                      
                      <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                        <label className="w-full sm:w-24 text-sm font-medium">Giá gọng</label>
                        <Input 
                          type="number" 
                          value={form.giagong ? (form.giagong / 1000) : ''} 
                          onChange={(e) => setForm({ ...form, giagong: e.target.value ? Number(e.target.value) * 1000 : 0 })} 
                          className="h-10 sm:h-8 flex-1 bg-yellow-50 focus:bg-yellow-100" 
                          placeholder="Giá gọng (nghìn)" 
                          data-nav="presc"
                          data-order="15"
                        />
                      </div>

                      <div className="flex flex-col sm:flex-row sm:items-center gap-2 text-lg font-bold text-blue-600 border-t pt-2">
                        <label className="w-full sm:w-24 text-sm font-medium">Tổng tiền</label>
                        <span className="text-xl">{(tongTien / 1000).toFixed(0)}k VND</span>
                      </div>
                      
                      <div className="flex items-center gap-3">
                        <label className="flex items-center gap-2 text-sm font-medium">
                          <input type="checkbox" checked={ghiNo} onChange={(e) => setGhiNo(e.target.checked)} className="w-5 h-5 sm:w-4 sm:h-4" />
                          Ghi nợ
                        </label>
                      </div>
                      
                      {ghiNo && (
                        <div className="space-y-3 pl-0 sm:pl-6 border-l-0 sm:border-l-2 border-gray-200">
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2">
                            <label className="w-full sm:w-28 text-sm font-medium">Đã thanh toán</label>
                            <Input 
                              type="number" 
                              value={sotienDaThanhToanInput} 
                              onChange={(e) => {
                                const val = e.target.value;
                                setSotienDaThanhToanInput(val);
                                setSotienDaThanhToan(val ? +val * 1000 : 0);
                              }} 
                              className="h-10 sm:h-8 flex-1 bg-yellow-50 focus:bg-yellow-100" 
                              placeholder="Số tiền (nghìn)" 
                              data-nav="presc"
                              data-order="16"
                            />
                          </div>
                          <div className="flex flex-col sm:flex-row sm:items-center gap-2 font-semibold text-red-600">
                            <label className="w-full sm:w-28 text-sm font-medium">Còn nợ</label>
                            <span className="text-lg">{(sotienConNo / 1000).toFixed(0)}k VND</span>
                          </div>
                        </div>
                      )}
                    </div>
                    
                    {/* Cột 3: Các nút hành động - Mobile optimized */}
                    <div className="space-y-3 flex flex-col justify-between">
                       <h3 className="font-semibold text-base lg:invisible">Hành động</h3>
                       
                       {/* Mobile: Full width buttons, Desktop: Right aligned */}
                       <div className="flex flex-col sm:flex-row lg:flex-col gap-3 lg:gap-2 lg:items-end lg:h-full lg:justify-end">
                          {!isEditing && (
                            <Button className="h-12 sm:h-9 text-base sm:text-sm bg-blue-600 hover:bg-orange-400 touch-manipulation" onClick={luuDonKinh}>Lưu đơn</Button>
                          )}
                          {isEditing && form.id && (
                            <>
                              <Button className="h-12 sm:h-9 text-base sm:text-sm bg-blue-600 hover:bg-orange-400 touch-manipulation" onClick={handleUpdate}>
                                <Pencil className="w-5 h-5 sm:w-4 sm:h-4 mr-2" /> Sửa đơn
                              </Button>
                              <Button className="h-12 sm:h-9 text-base sm:text-sm bg-gray-500 hover:bg-gray-600 touch-manipulation" onClick={handleCopy}>
                                <Copy className="w-5 h-5 sm:w-4 sm:h-4 mr-2" /> Sao chép
                              </Button>
                            </>
                          )}
                          <Button className="h-12 sm:h-9 text-base sm:text-sm bg-green-600 hover:bg-green-700 touch-manipulation" onClick={resetForm}>
                            <FilePlus className="w-5 h-5 sm:w-4 sm:h-4 mr-2" /> Đơn mới
                          </Button>
                          {isEditing && form.id && (
                            <Button className="h-12 sm:h-9 text-base sm:text-sm bg-red-600 hover:bg-red-700 touch-manipulation" onClick={handleDelete}>
                              <Trash2 className="w-5 h-5 sm:w-4 sm:h-4 mr-2" /> Xóa đơn
                            </Button>
                          )}
                       </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

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
        </div>
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