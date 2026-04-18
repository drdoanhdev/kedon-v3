//src/pages/ke-don-kinh.tsx giới, năm sinh
'use client';

import { useEffect, useState, useMemo, useCallback } from 'react';
import axios, { AxiosError } from 'axios';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { useSearchParams } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Pencil, Copy, Trash2, FilePlus, Calendar, Phone, MapPin, User, CalendarDays, Check, X, Clock, MessageSquare } from 'lucide-react';
import SoKinhInput from '../components/SoKinhInput';
import ProtectedRoute from '../components/ProtectedRoute';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useFooter } from '../contexts/FooterContext';
import { isOwnerRole } from '../lib/tenantRoles';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import PrintDonKinh from '../components/ke-don/PrintDonKinh';
import { defaultConfig, type PrintConfig } from '../components/ke-don/CauHinhMauIn';

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

interface NhomGiaGong {
  id: number;
  ten_nhom: string;
  gia_ban_tu: number;
  gia_ban_den: number;
  gia_ban_mac_dinh: number;
  gia_nhap_trung_binh: number;
  so_luong_ton: number;
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
  nhom_gia_gong_id?: number | null; // Nhóm giá gọng (nếu bán theo nhóm)
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
  pd_mp?: string; // PD/2 mắt phải
  pd_mt?: string; // PD/2 mắt trái
  no?: boolean; // Trạng thái nợ
  sotien_da_thanh_toan?: number;
  lai?: number;
}

interface HistoryProps { items: DonKinh[]; onSelect: (don: DonKinh) => void; highlightId?: number | null; }
const History: React.FC<HistoryProps> = ({ items, onSelect, highlightId }) => (
  <div className="max-h-100 lg:max-h-none lg:h-full flex flex-col bg-[#f5f6f8] rounded-xl lg:rounded-none border lg:border-0 border-gray-200">
    <h2 className="font-bold text-gray-900 text-sm tracking-tight px-3 pt-3 pb-2 flex-shrink-0">Lịch sử đơn kính {items.length > 0 && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold ml-1">{items.length}</span>}</h2>
    {items.length === 0 ? (
      <p className="text-xs text-gray-500 px-3">Chưa có đơn kính nào</p>
    ) : (
      <div className="space-y-2 overflow-y-auto flex-1 min-h-0 px-3 pb-3">
        {items.map((don) => (
          <div
            key={don.id}
            className={`px-2.5 py-2 rounded-xl cursor-pointer transition-all border shadow-sm ${don.id === highlightId ? 'bg-blue-50 border-blue-400 shadow-blue-100' : 'bg-white border-gray-200 hover:border-blue-300 hover:shadow-md'}`}
            onClick={() => onSelect(don)}
          >
            <div className="block md:hidden">
              <div className="flex justify-between items-start mb-2">
                <div>
                  <p className="text-sm font-bold text-gray-900">
                    {new Date(don.ngaykham || don.ngay_kham || '').toLocaleDateString('vi-VN')}
                  </p>
                  <p className="text-xs text-gray-500">
                    {new Date(don.ngaykham || don.ngay_kham || '').toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-gray-900">{(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k</p>
                  {(don.giatrong || 0) + (don.giagong || 0) - (don.sotien_da_thanh_toan || 0) > 0 && (
                    <p className="text-xs font-semibold text-red-600">Nợ: {(((don.giatrong || 0) + (don.giagong || 0) - (don.sotien_da_thanh_toan || 0)) / 1000).toFixed(0)}k</p>
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
              <p className="text-xs flex items-center gap-1">
                <span><strong>Ngày:</strong> {new Date(don.ngaykham || don.ngay_kham || '').toLocaleString('vi-VN', { timeZone: 'Asia/Ho_Chi_Minh', hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                {(don.giatrong || 0) + (don.giagong || 0) - (don.sotien_da_thanh_toan || 0) > 0 && (
                  <span className="text-red-600 font-semibold ml-auto">Nợ {(((don.giatrong || 0) + (don.giagong || 0) - (don.sotien_da_thanh_toan || 0)) / 1000).toFixed(0)}k</span>
                )}
              </p>
              <p className="text-xs"><strong>MP:</strong> {don.sokinh_moi_mp || 'N/A'} {don.thiluc_kinhmoi_mp ? `→ ${don.thiluc_kinhmoi_mp}` : ''}</p>
              <p className="text-xs"><strong>MT:</strong> {don.sokinh_moi_mt || 'N/A'} {don.thiluc_kinhmoi_mt ? `→ ${don.thiluc_kinhmoi_mt}` : ''}</p>
              <div className="flex items-center gap-2 text-xs">
                <span><strong>Tròng:</strong> {((don.giatrong || 0) / 1000).toFixed(0)}k</span>
                <span><strong>Gọng:</strong> {((don.giagong || 0) / 1000).toFixed(0)}k</span>
                <span className="ml-auto font-bold text-gray-900">Σ {(((don.giatrong || 0) + (don.giagong || 0)) / 1000).toFixed(0)}k</span>
              </div>
            </div>
          </div>
        ))}
      </div>
    )}
  </div>
);

// === Lịch hẹn types & helpers ===
interface HenKham {
  id: number;
  benhnhanid: number;
  donkinhid: number | null;
  ten_benhnhan: string;
  dienthoai: string;
  ngay_hen: string;
  gio_hen: string | null;
  ly_do: string;
  trang_thai: string;
  ghichu: string;
  created_at: string;
}

const TRANG_THAI_HEN: Record<string, { label: string; color: string; bg: string }> = {
  cho: { label: 'Chờ', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  da_den: { label: 'Đã đến', color: 'text-green-700', bg: 'bg-green-100' },
  huy: { label: 'Hủy', color: 'text-red-700', bg: 'bg-red-100' },
  qua_han: { label: 'Quá hạn', color: 'text-gray-700', bg: 'bg-gray-200' },
};

function getTodayStr(): string {
  const d = new Date();
  d.setHours(d.getHours() + 7);
  return d.toISOString().split('T')[0];
}

function formatNgayHen(d: string): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function getHenCountdown(dateStr: string, trangThai: string): { text: string; className: string } | null {
  if (trangThai !== 'cho' && trangThai !== 'qua_han') return null;
  const today = new Date(getTodayStr());
  const target = new Date(dateStr);
  const diff = Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0) return { text: `Quá hạn ${Math.abs(diff)} ngày`, className: 'text-red-600 bg-red-50' };
  if (diff === 0) return { text: 'Hôm nay', className: 'text-orange-700 bg-orange-100 font-bold' };
  if (diff === 1) return { text: 'Ngày mai', className: 'text-orange-600 bg-orange-50' };
  if (diff <= 7) return { text: `Còn ${diff} ngày`, className: 'text-blue-600 bg-blue-50' };
  return { text: `Còn ${diff} ngày`, className: 'text-gray-500 bg-gray-50' };
}

export default function KeDonKinh() {
  const { confirm } = useConfirm();
  const searchParams = useSearchParams();
  const benhnhanid = searchParams.get('bn');
  const { currentRole } = useAuth();
  const { setLai: setFooterLai } = useFooter();
  const isAdmin = isOwnerRole(currentRole);

  // Auto chuyển trạng thái chờ khám → đang_khám khi mở trang kê đơn kính
  useEffect(() => {
    if (!benhnhanid) return;
    const pid = parseInt(benhnhanid);
    (async () => {
      try {
        await axios.post('/api/cho-kham', { patient_id: pid });
      } catch {}
      try {
        await axios.patch('/api/cho-kham', { benhnhanid: pid, trangthai: 'đang_khám' });
      } catch {}
    })();
  }, [benhnhanid]);

  const [benhNhan, setBenhNhan] = useState<BenhNhan | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]); // lịch sử đơn kính
  const [highlightId, setHighlightId] = useState<number | null>(null); // id đơn kính mới / vừa cập nhật để highlight
  // Edit patient dialog state
  const [openEditPatient, setOpenEditPatient] = useState(false);
  const [patientForm, setPatientForm] = useState<BenhNhan | null>(null);

  const lyDoOptions = ['Lấy kính', 'Kiểm tra kính mới', 'Tái khám', 'Khác'];
  const addDaysToToday = (days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  // === Lịch hẹn của bệnh nhân ===
  const [dsHenKham, setDsHenKham] = useState<HenKham[]>([]);
  const [openHenDialog, setOpenHenDialog] = useState(false);
  const [editHenForm, setEditHenForm] = useState<{ id: number; ngay_hen: string; gio_hen: string; ly_do: string; ghichu: string } | null>(null);
  const [addHenForm, setAddHenForm] = useState({ ngay_hen: '', gio_hen: '', ly_do: 'Lấy kính', ghichu: '' });
  const henLyDoOptions = ['Lấy kính', 'Kiểm tra kính mới', 'Tái khám', 'Kiểm soát cận thị', 'Khác'];

  const fetchHenKham = useCallback(async () => {
    if (!benhnhanid) return;
    try {
      const res = await axios.get(`/api/hen-kham-lai?benhnhanid=${benhnhanid}&from=2000-01-01&to=2099-12-31&_t=${Date.now()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
      const items: HenKham[] = res.data.data || [];
      // Auto-mark overdue
      const today = getTodayStr();
      const overdueIds = items.filter(h => h.trang_thai === 'cho' && h.ngay_hen < today).map(h => h.id);
      if (overdueIds.length > 0) {
        await Promise.all(overdueIds.map(id =>
          axios.put('/api/hen-kham-lai', { id, trang_thai: 'qua_han' }).catch(() => {})
        ));
        items.forEach(h => { if (overdueIds.includes(h.id)) h.trang_thai = 'qua_han'; });
      }
      setDsHenKham(items.sort((a, b) => b.ngay_hen.localeCompare(a.ngay_hen)));
    } catch { /* quiet */ }
  }, [benhnhanid]);

  useEffect(() => { fetchHenKham(); }, [fetchHenKham]);

  const updateHenTrangThai = useCallback(async (id: number, trang_thai: string) => {
    try {
      await axios.put('/api/hen-kham-lai', { id, trang_thai });
      toast.success(trang_thai === 'da_den' ? 'Đã đánh dấu đến' : trang_thai === 'huy' ? 'Đã hủy lịch hẹn' : 'Đã cập nhật');
      fetchHenKham();
    } catch { toast.error('Lỗi khi cập nhật'); }
  }, [fetchHenKham]);

  const deleteHenKham = useCallback(async (id: number) => {
    if (!await confirm('Xóa lịch hẹn này?')) return;
    try {
      await axios.delete(`/api/hen-kham-lai?id=${id}`);
      toast.success('Đã xóa');
      fetchHenKham();
    } catch { toast.error('Lỗi khi xóa'); }
  }, [confirm, fetchHenKham]);

  const rescheduleHen = useCallback(async (id: number, days: number) => {
    const d = new Date(); d.setDate(d.getDate() + days);
    const newDate = d.toISOString().split('T')[0];
    try {
      await axios.put('/api/hen-kham-lai', { id, ngay_hen: newDate, trang_thai: 'cho' });
      toast.success(`Đã dời lịch → ${formatNgayHen(newDate)}`);
      fetchHenKham();
    } catch { toast.error('Lỗi khi dời lịch'); }
  }, [fetchHenKham]);

  const saveHenDialog = useCallback(async () => {
    if (editHenForm) {
      // Edit mode
      if (!editHenForm.ngay_hen) { toast.error('Vui lòng chọn ngày hẹn'); return; }
      try {
        await axios.put('/api/hen-kham-lai', {
          id: editHenForm.id,
          ngay_hen: editHenForm.ngay_hen,
          gio_hen: editHenForm.gio_hen || null,
          ly_do: editHenForm.ly_do,
          ghichu: editHenForm.ghichu,
        });
        toast.success('Đã cập nhật lịch hẹn');
        setOpenHenDialog(false);
        setEditHenForm(null);
        fetchHenKham();
      } catch { toast.error('Lỗi khi cập nhật'); }
    } else {
      // Add mode
      if (!addHenForm.ngay_hen) { toast.error('Vui lòng chọn ngày hẹn'); return; }
      try {
        await axios.post('/api/hen-kham-lai', {
          benhnhanid: parseInt(benhnhanid || '0'),
          ten_benhnhan: benhNhan?.ten || '',
          dienthoai: benhNhan?.dienthoai || '',
          ngay_hen: addHenForm.ngay_hen,
          gio_hen: addHenForm.gio_hen || null,
          ly_do: addHenForm.ly_do,
          ghichu: addHenForm.ghichu,
        });
        toast.success('Đã thêm lịch hẹn');
        setOpenHenDialog(false);
        setAddHenForm({ ngay_hen: '', gio_hen: '', ly_do: 'Lấy kính', ghichu: '' });
        fetchHenKham();
      } catch { toast.error('Lỗi khi thêm lịch hẹn'); }
    }
  }, [editHenForm, addHenForm, benhnhanid, benhNhan, fetchHenKham]);

  const henKhamStats = useMemo(() => ({
    cho: dsHenKham.filter(h => h.trang_thai === 'cho').length,
    qua_han: dsHenKham.filter(h => h.trang_thai === 'qua_han').length,
  }), [dsHenKham]);

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
  
  // Print config state
  const [printConfig, setPrintConfig] = useState<PrintConfig>(defaultConfig);
  
  // Category data states
  const [hangTrongs, setHangTrongs] = useState<HangTrong[]>([]);
  const [gongKinhs, setGongKinhs] = useState<GongKinh[]>([]);
  const [nhomGiaGongs, setNhomGiaGongs] = useState<NhomGiaGong[]>([]);
  const [frameMode, setFrameMode] = useState<'gong_cu_the' | 'nhom_gia'>('gong_cu_the');
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
    pd_mp: '',
    pd_mt: '',
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

        // Fetch nhóm giá gọng
        const nhomGiaRes = await axios.get(`/api/nhom-gia-gong?_t=${timestamp}&_r=${random}`, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        setNhomGiaGongs((nhomGiaRes.data || []).filter((n: NhomGiaGong) => n.so_luong_ton !== undefined));

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

  // Fetch print config
  useEffect(() => {
    axios.get('/api/cau-hinh-mau-in')
      .then(res => {
        const d = res.data?.data || res.data;
        if (d) setPrintConfig(prev => ({ ...prev, ...d }));
      })
      .catch(() => {});
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

  // Xử lý chọn nhóm giá gọng
  const handleNhomGiaChange = (nhomId: string) => {
    const id = parseInt(nhomId);
    const nhom = nhomGiaGongs.find(n => n.id === id);
    if (nhom) {
      setForm({
        ...form,
        nhom_gia_gong_id: nhom.id,
        ten_gong: `[Nhóm] ${nhom.ten_nhom}`,
        giagong: nhom.gia_ban_mac_dinh,
        gianhap_gong: nhom.gia_nhap_trung_binh,
        ax_mt: nhom.gia_nhap_trung_binh,
      });
      setFrameStock(nhom.so_luong_ton);
    } else {
      setForm({ ...form, nhom_gia_gong_id: null, ten_gong: '', giagong: 0, gianhap_gong: 0, ax_mt: 0 });
      setFrameStock(null);
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

  // Sync lãi lên Footer
  useEffect(() => { setFooterLai((lai / 1000).toFixed(0)); return () => setFooterLai(null); }, [lai, setFooterLai]);

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
    if (!await confirm('Bạn có chắc muốn lưu đơn kính này?')) return;

    const payload: DonKinh = {
      ...form,
      benhnhanid: parseInt(benhnhanid),
      ngaykham: form.ngaykham,
  ax_mp: typeof form.ax_mp === 'number' ? form.ax_mp : form.gianhap_trong || 0,
  ax_mt: typeof form.ax_mt === 'number' ? form.ax_mt : form.gianhap_gong || 0,
      giatrong: typeof form.giatrong === 'number' ? form.giatrong : 0,
      giagong: typeof form.giagong === 'number' ? form.giagong : 0,
      gianhap_trong: typeof form.gianhap_trong === 'number' ? form.gianhap_trong : (typeof form.ax_mp === 'number' ? form.ax_mp : 0),
      gianhap_gong: typeof form.gianhap_gong === 'number' ? form.gianhap_gong : (typeof form.ax_mt === 'number' ? form.ax_mt : 0),
      no: ghiNo,
      sotien_da_thanh_toan: ghiNo ? sotienDaThanhToan : tongTien,
      lai: lai || 0,
      // Nhóm giá: khi chọn nhóm giá, gửi nhom_gia_gong_id, bỏ ten_gong text match
      nhom_gia_gong_id: frameMode === 'nhom_gia' ? (form.nhom_gia_gong_id || null) : null,
      ten_gong: frameMode === 'nhom_gia' ? '' : (form.ten_gong || ''),
    };

    try {
      const res = await axios.post('/api/don-kinh', payload);
      if (res.status === 200) {
        toast.success('Đã lưu đơn kính');
        // Auto chuyển trạng thái chờ khám → đã_xong
        axios.patch('/api/cho-kham', {
          benhnhanid: parseInt(benhnhanid || '0'),
          trangthai: 'đã_xong',
        }).catch(() => {});
        // Show inventory warnings
        const warnings: string[] = res.data.inventoryWarnings || [];
        warnings.forEach((w: string) => toast(w, { duration: 6000, icon: '📦' }));
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
    if (!await confirm('Bạn có chắc muốn cập nhật đơn kính này?')) return;

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
        // Auto chuyển trạng thái chờ khám → đã_xong
        axios.patch('/api/cho-kham', {
          benhnhanid: parseInt(benhnhanid || '0'),
          trangthai: 'đã_xong',
        }).catch(() => {});
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
    if (!await confirm('Bạn có chắc muốn xóa đơn kính này?')) return;

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
      pd_mp: '',
      pd_mt: '',
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
        
        {/* History sidebar - Hidden on mobile, shown on desktop */}
        <aside className="hidden lg:flex lg:flex-col w-72 flex-shrink-0 border-r border-gray-200 bg-[#f5f6f8] overflow-hidden">
          {/* Lịch sử đơn kính: 4/7 chiều cao */}
          <div className="min-h-0 flex flex-col" style={{ flex: '4 1 0%' }}>
            <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} />
          </div>
            
          {/* Lịch hẹn: 3/7 chiều cao */}
          <div className="min-h-0 flex flex-col border-t border-gray-200" style={{ flex: '3 1 0%' }}>
            <div className="px-3 pt-2 flex-shrink-0">
              <div className="flex justify-between items-center mb-2">
                <h2 className="font-bold text-gray-900 text-sm tracking-tight flex items-center gap-1">
                  <CalendarDays className="w-4 h-4 text-blue-600" /> Lịch hẹn
                  {henKhamStats.cho > 0 && <span className="ml-1 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">{henKhamStats.cho}</span>}
                  {henKhamStats.qua_han > 0 && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">{henKhamStats.qua_han}</span>}
                </h2>
                <button
                  className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-0.5 transition-colors"
                  onClick={() => { setEditHenForm(null); setAddHenForm({ ngay_hen: addDaysToToday(7), gio_hen: '', ly_do: 'Lấy kính', ghichu: '' }); setOpenHenDialog(true); }}
                >
                  + Thêm
                </button>
              </div>
            </div>
            <div className="overflow-y-auto flex-1 min-h-0 px-3 pb-2">
              {dsHenKham.length === 0 ? (
                <p className="text-xs text-gray-400 pb-3">Chưa có lịch hẹn nào</p>
              ) : (
                <div className="space-y-1.5 pb-3">
                  {dsHenKham.map(hen => {
                    const st = TRANG_THAI_HEN[hen.trang_thai] || TRANG_THAI_HEN.cho;
                    const countdown = getHenCountdown(hen.ngay_hen, hen.trang_thai);
                    return (
                      <div key={hen.id} className={`bg-white px-2.5 py-2 rounded-xl border shadow-sm group transition-all hover:border-blue-300 hover:shadow-md ${hen.trang_thai === 'qua_han' ? 'border-red-200' : 'border-gray-200'}`}>
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1 flex-wrap mb-0.5">
                              <span className="text-[11px] font-bold text-gray-700">{formatNgayHen(hen.ngay_hen)}</span>
                              {hen.gio_hen && <span className="text-[10px] text-gray-400">{hen.gio_hen.substring(0, 5)}</span>}
                              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                            </div>
                            {countdown && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium inline-block mb-0.5 ${countdown.className}`}>{countdown.text}</span>}
                            <p className="text-[11px] text-gray-600 truncate">{hen.ly_do || ''}{hen.ghichu ? ` · ${hen.ghichu}` : ''}</p>
                          </div>
                          <div className="flex gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity flex-shrink-0">
                            {(hen.trang_thai === 'cho' || hen.trang_thai === 'qua_han') && (
                              <button className="p-1 text-green-500 hover:text-green-700 transition-colors" title="Đã đến" onClick={() => updateHenTrangThai(hen.id, 'da_den')}>
                                <Check className="w-3 h-3" />
                              </button>
                            )}
                            <button className="p-1 text-gray-400 hover:text-blue-600 transition-colors" title="Sửa" onClick={() => { setEditHenForm({ id: hen.id, ngay_hen: hen.ngay_hen, gio_hen: hen.gio_hen?.substring(0, 5) || '', ly_do: hen.ly_do || '', ghichu: hen.ghichu || '' }); setOpenHenDialog(true); }}>
                              <Pencil className="w-3 h-3" />
                            </button>
                            <button className="p-1 text-gray-400 hover:text-red-500 transition-colors" title="Xóa" onClick={() => deleteHenKham(hen.id)}>
                              <Trash2 className="w-3 h-3" />
                            </button>
                          </div>
                        </div>
                        {/* Quick reschedule for pending/overdue */}
                        {(hen.trang_thai === 'cho' || hen.trang_thai === 'qua_han') && (
                          <div className="flex items-center gap-1 mt-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <span className="text-[9px] text-gray-400">Dời:</span>
                            {[7, 14, 30].map(d => (
                              <button key={d} onClick={() => rescheduleHen(hen.id, d)} className="px-1 py-0.5 text-[9px] bg-purple-50 text-purple-600 rounded hover:bg-purple-100 font-medium">
                                +{d < 30 ? `${d}d` : '1th'}
                              </button>
                            ))}
                            {hen.trang_thai === 'cho' && (
                              <button className="px-1 py-0.5 text-[9px] bg-red-50 text-red-500 rounded hover:bg-red-100 font-medium" onClick={() => updateHenTrangThai(hen.id, 'huy')}>
                                Hủy
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </aside>

        {/* Main content area */}
        <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-4 bg-[#f5f6f8]">
            {/* Patient info */}
            {benhNhan ? (
              <div className="bg-white rounded-xl shadow-sm p-3 flex items-center gap-3 border border-gray-200">
                {/* Avatar */}
                <div className="w-10 h-10 rounded-full bg-blue-100 flex items-center justify-center flex-shrink-0">
                  <User className="w-5 h-5 text-blue-600" />
                </div>
                {/* Info */}
                <div className="flex-1 min-w-0">
                  <h1 className="font-extrabold text-base text-blue-700 tracking-tight truncate leading-tight">{benhNhan.ten}</h1>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-gray-500 flex-wrap">
                    <span className="flex items-center gap-1"><Calendar className="w-3 h-3 text-gray-400" />{benhNhan.namsinh}{benhNhan.tuoi !== undefined ? ` (${benhNhan.tuoi} tuổi)` : ''}</span>
                    {benhNhan.dienthoai && <span className="flex items-center gap-1"><Phone className="w-3 h-3 text-gray-400" />{benhNhan.dienthoai}</span>}
                    {benhNhan.diachi && <span className="flex items-center gap-1"><MapPin className="w-3 h-3 text-gray-400" />{benhNhan.diachi}</span>}
                  </div>
                </div>
                {/* Actions */}
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
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                <p className="text-sm text-gray-400">Không tìm thấy thông tin bệnh nhân.</p>
              </div>
            )}

            {/* Form kê đơn kính - Responsive Layout */}
            <div className="space-y-4">
              {/* Thông tin chung */}
              <div className="bg-white rounded-xl shadow-sm p-4 border border-gray-200">
                  <div className="space-y-2">
                    <div className="flex flex-col lg:flex-row gap-2">
                      <div className="flex items-center gap-2 lg:flex-1">
                        <label className="text-xs font-medium text-gray-700 uppercase shrink-0">Chẩn đoán</label>
                        <input
                          list="chandoan-list"
                          value={form.chandoan || ''}
                          onChange={(e) => setForm({ ...form, chandoan: e.target.value })}
                          className="h-9 bg-white border border-gray-300 rounded-lg px-3 text-sm font-medium flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                          placeholder="Nhập chẩn đoán..."
                          data-nav="presc"
                          data-order="0"
                        />
                      </div>
                      <div className="flex items-center gap-2 lg:flex-1">
                        <label className="text-xs font-medium text-gray-700 uppercase whitespace-nowrap shrink-0">Ngày khám</label>
                        <Input
                          type="datetime-local"
                          value={form.ngaykham || ''}
                          onChange={(e) => setForm({ ...form, ngaykham: e.target.value })}
                          className="h-9 flex-1 min-w-0 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                          style={{ colorScheme: 'light' }}
                          step="60"
                        />
                      </div>
                    </div>
                    <div className="flex items-start gap-2">
                      <label className="text-xs font-medium text-gray-700 uppercase shrink-0 pt-2">Ghi chú</label>
                      <textarea
                        rows={1}
                        value={form.ghichu || ''}
                        onChange={(e) => {
                          setForm({ ...form, ghichu: e.target.value });
                          e.target.style.height = 'auto';
                          e.target.style.height = e.target.scrollHeight + 'px';
                        }}
                        onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                        className="flex-1 min-h-[36px] min-w-0 bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow resize-none overflow-hidden"
                        placeholder="Ghi chú thêm..."
                      />
                    </div>

                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100">
                      {/* Mobile: Unified 2-column table layout */}
                      <div className="block sm:hidden">
                        <div className="border border-gray-200 rounded-xl bg-white shadow-sm overflow-hidden">
                          {/* Header */}
                          <div className="grid grid-cols-[3rem_1fr_1fr] bg-gray-100">
                            <div className="px-1 py-2 border-b border-r border-gray-300"></div>
                            <div className="px-1 py-2 border-b border-r border-gray-300 text-center text-xs font-bold text-gray-900">MP</div>
                            <div className="px-1 py-2 border-b border-gray-300 text-center text-xs font-bold text-gray-900">MT</div>
                          </div>
                          {/* TL Không kính */}
                          <div className="grid grid-cols-[3rem_1fr_1fr]">
                            <div className="px-1 py-1.5 border-b border-r border-gray-200 flex items-center"><span className="text-[10px] font-medium text-gray-600 leading-tight">TL KK</span></div>
                            <div className="px-1 py-1.5 border-b border-r border-gray-200">
                              <input data-nav="presc" data-order="1" data-first-focus="thiluc_khongkinh_mp" list="thiluc-list" value={form.thiluc_khongkinh_mp || ''} onChange={(e) => setForm({ ...form, thiluc_khongkinh_mp: e.target.value })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5 border-b border-gray-200">
                              <input data-nav="presc" data-order="2" list="thiluc-list" value={form.thiluc_khongkinh_mt || ''} onChange={(e) => setForm({ ...form, thiluc_khongkinh_mt: e.target.value })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                          </div>
                          {/* TL Kính cũ */}
                          <div className="grid grid-cols-[3rem_1fr_1fr]">
                            <div className="px-1 py-1.5 border-b border-r border-gray-200 flex items-center"><span className="text-[10px] font-medium text-gray-600 leading-tight">TL cũ</span></div>
                            <div className="px-1 py-1.5 border-b border-r border-gray-200">
                              <input data-nav="presc" data-order="3" list="thiluc-list" value={form.thiluc_kinhcu_mp || ''} onChange={(e) => setForm({ ...form, thiluc_kinhcu_mp: e.target.value })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5 border-b border-gray-200">
                              <input data-nav="presc" data-order="4" list="thiluc-list" value={form.thiluc_kinhcu_mt || ''} onChange={(e) => setForm({ ...form, thiluc_kinhcu_mt: e.target.value })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                          </div>
                          {/* TL Kính mới */}
                          <div className="grid grid-cols-[3rem_1fr_1fr]">
                            <div className="px-1 py-1.5 border-b border-r border-gray-200 flex items-center"><span className="text-[10px] font-medium text-gray-600 leading-tight">TL mới</span></div>
                            <div className="px-1 py-1.5 border-b border-r border-gray-200">
                              <input data-nav="presc" data-order="5" list="thiluc-list" value={form.thiluc_kinhmoi_mp || ''} onChange={(e) => setForm({ ...form, thiluc_kinhmoi_mp: e.target.value })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5 border-b border-gray-200">
                              <input data-nav="presc" data-order="6" list="thiluc-list" value={form.thiluc_kinhmoi_mt || ''} onChange={(e) => setForm({ ...form, thiluc_kinhmoi_mt: e.target.value })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                          </div>
                          {/* Số kính cũ */}
                          <div className="grid grid-cols-[3rem_1fr_1fr]">
                            <div className="px-1 py-1.5 border-b border-r border-gray-200 flex items-center"><span className="text-[10px] font-medium text-gray-600 leading-tight">Số cũ</span></div>
                            <div className="px-1 py-1.5 border-b border-r border-gray-200">
                              <SoKinhInput dataNavOrder={7} onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="8"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_cu_mp || ''} onChange={(val) => setForm({ ...form, sokinh_cu_mp: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5 border-b border-gray-200">
                              <SoKinhInput dataNavOrder={8} onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="9"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_cu_mt || ''} onChange={(val) => setForm({ ...form, sokinh_cu_mt: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                          </div>
                          {/* Số kính mới */}
                          <div className="grid grid-cols-[3rem_1fr_1fr]">
                            <div className="px-1 py-1.5 border-b border-r border-gray-200 flex items-center"><span className="text-[10px] font-medium text-gray-600 leading-tight">Số mới</span></div>
                            <div className="px-1 py-1.5 border-b border-r border-gray-200">
                              <SoKinhInput dataNavOrder={9} onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="10"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_moi_mp || ''} onChange={(val) => setForm({ ...form, sokinh_moi_mp: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5 border-b border-gray-200">
                              <SoKinhInput dataNavOrder={10} onCommitNext={() => { const n=document.querySelector<HTMLElement>('[data-nav="presc"][data-order="11"]'); n?.focus(); (n as HTMLInputElement)?.select?.(); }} datalistId="sokinh-list" value={form.sokinh_moi_mt || ''} onChange={(val) => setForm({ ...form, sokinh_moi_mt: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                          </div>
                          {/* PD/2 */}
                          <div className="grid grid-cols-[3rem_1fr_1fr]">
                            <div className="px-1 py-1.5 border-r border-gray-200 flex items-center"><span className="text-[10px] font-medium text-gray-600 leading-tight">PD/2</span></div>
                            <div className="px-1 py-1.5 border-r border-gray-200">
                              <input type="text" value={form.pd_mp || ''} onChange={(e) => setForm({ ...form, pd_mp: e.target.value })} placeholder="mm" className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5">
                              <input type="text" value={form.pd_mt || ''} onChange={(e) => setForm({ ...form, pd_mt: e.target.value })} placeholder="mm" className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                          </div>
                        </div>
                      </div>

{/* Desktop: Keep original table */}
<div className="hidden sm:block overflow-x-auto">
  <div className="w-full border border-gray-300 rounded-lg overflow-hidden">
    <table className="w-full text-sm border-separate border-spacing-0">
      
      <thead>
        <tr className="bg-gray-100">
          <th className="px-1.5 py-1 border-b border-r border-gray-300 w-16 text-gray-900 font-semibold" rowSpan={2}>Mắt</th>
          <th className="px-1.5 py-1 border-b border-r border-gray-300 text-center w-32 text-gray-900 font-semibold" colSpan={3}>
            Thị lực
          </th>
          <th className="px-1.5 py-1 border-b border-r border-gray-300 text-center text-gray-900 font-semibold" colSpan={2}>
            Số kính
          </th>
          <th className="px-1.5 py-1 border-b border-r border-gray-300 w-16 text-gray-900 font-semibold" rowSpan={2}>
            PD/2
          </th>
        </tr>

        <tr className="bg-gray-50">
          <th className="px-1.5 py-1 border-b border-r border-gray-300 font-medium text-xs text-gray-700 w-20">Không kính</th>
          <th className="px-1.5 py-1 border-b border-r border-gray-300 font-medium text-xs text-gray-700 w-20">Kính cũ</th>
          <th className="px-1.5 py-1 border-b border-r border-gray-300 font-medium text-xs text-gray-700 w-20">Kính mới</th>
          <th className="px-1.5 py-1 border-b border-r border-gray-300 font-medium text-xs text-gray-700 w-40">Kính cũ</th>
          <th className="px-1.5 py-1 border-b border-r border-gray-300 font-medium text-xs text-gray-700 w-40">Kính mới</th>
        </tr>
      </thead>

      <tbody>
        {/* Mắt Phải */}
        <tr className="hover:bg-blue-50/50 transition-colors">
          <td className="px-1.5 py-1 border-b border-r border-gray-300 font-bold text-center text-gray-900">MP</td>

          <td className="px-1.5 py-1 border-b border-r border-gray-300 bg-white">
            <input data-nav="presc" data-order="1" data-first-focus="thiluc_khongkinh_mp" list="thiluc-list"
              value={form.thiluc_khongkinh_mp || ''}
              onChange={(e) => setForm({ ...form, thiluc_khongkinh_mp: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-b border-r border-gray-300 bg-white">
            <input data-nav="presc" data-order="3" list="thiluc-list"
              value={form.thiluc_kinhcu_mp || ''}
              onChange={(e) => setForm({ ...form, thiluc_kinhcu_mp: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-b border-r border-gray-300 bg-white">
            <input data-nav="presc" data-order="5" list="thiluc-list"
              value={form.thiluc_kinhmoi_mp || ''}
              onChange={(e) => setForm({ ...form, thiluc_kinhmoi_mp: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-b border-r border-gray-300 bg-white">
            <SoKinhInput
              onCommitNext={() => {
                const n = document.querySelector<HTMLElement>('[data-nav="presc"][data-order="8"]');
                n?.focus(); (n as HTMLInputElement)?.select?.();
              }}
              datalistId="sokinh-list"
              value={form.sokinh_cu_mp || ''}
              onChange={(val) => setForm({ ...form, sokinh_cu_mp: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-b border-r border-gray-300 bg-white">
            <SoKinhInput
              onCommitNext={() => {
                const n = document.querySelector<HTMLElement>('[data-nav="presc"][data-order="10"]');
                n?.focus(); (n as HTMLInputElement)?.select?.();
              }}
              datalistId="sokinh-list"
              value={form.sokinh_moi_mp || ''}
              onChange={(val) => setForm({ ...form, sokinh_moi_mp: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-b border-gray-300 bg-white">
            <input
              type="text"
              value={form.pd_mp || ''}
              onChange={(e) => setForm({ ...form, pd_mp: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="mm"
            />
          </td>
        </tr>

        {/* Mắt Trái */}
        <tr className="hover:bg-green-50/50 transition-colors">
          <td className="px-1.5 py-1 border-r border-gray-300 font-bold text-center text-gray-900">MT</td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <input data-nav="presc" data-order="2" list="thiluc-list"
              value={form.thiluc_khongkinh_mt || ''}
              onChange={(e) => setForm({ ...form, thiluc_khongkinh_mt: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <input data-nav="presc" data-order="4" list="thiluc-list"
              value={form.thiluc_kinhcu_mt || ''}
              onChange={(e) => setForm({ ...form, thiluc_kinhcu_mt: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <input data-nav="presc" data-order="6" list="thiluc-list"
              value={form.thiluc_kinhmoi_mt || ''}
              onChange={(e) => setForm({ ...form, thiluc_kinhmoi_mt: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <SoKinhInput
              onCommitNext={() => {
                const n = document.querySelector<HTMLElement>('[data-nav="presc"][data-order="9"]');
                n?.focus(); (n as HTMLInputElement)?.select?.();
              }}
              datalistId="sokinh-list"
              value={form.sokinh_cu_mt || ''}
              onChange={(val) => setForm({ ...form, sokinh_cu_mt: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <SoKinhInput
              onCommitNext={() => {
                const n = document.querySelector<HTMLElement>('[data-nav="presc"][data-order="11"]');
                n?.focus(); (n as HTMLInputElement)?.select?.();
              }}
              datalistId="sokinh-list"
              value={form.sokinh_moi_mt || ''}
              onChange={(val) => setForm({ ...form, sokinh_moi_mt: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 bg-white">
            <input
              type="text"
              value={form.pd_mt || ''}
              onChange={(e) => setForm({ ...form, pd_mt: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="mm"
            />
          </td>
        </tr>
      </tbody>

    </table>
  </div>
</div>
                  </div>
              </div>

              {/* Sản phẩm */}
              <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-gray-200">
                  <h3 className="font-bold text-gray-900 text-sm tracking-tight mb-2">Sản phẩm</h3>
                  <div className="space-y-2 sm:space-y-3">
                    {/* Mobile: inline label + input */}
                    {nhomGiaGongs.length > 0 && (
                      <div className="flex gap-1 sm:hidden">
                        <button
                          type="button"
                          className={`text-[10px] px-2 py-1 rounded-full ${frameMode === 'gong_cu_the' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                          onClick={() => { setFrameMode('gong_cu_the'); setForm({ ...form, nhom_gia_gong_id: null }); }}
                        >Gọng cụ thể</button>
                        <button
                          type="button"
                          className={`text-[10px] px-2 py-1 rounded-full ${frameMode === 'nhom_gia' ? 'bg-blue-600 text-white' : 'bg-gray-100 text-gray-600'}`}
                          onClick={() => { setFrameMode('nhom_gia'); setForm({ ...form, ten_gong: '' }); }}
                        >Nhóm giá</button>
                      </div>
                    )}
                    <div className="flex items-center gap-2 sm:hidden">
                      <label className="text-[11px] font-medium text-gray-600 uppercase shrink-0 w-14">
                        {frameMode === 'nhom_gia' ? 'Nhóm' : 'Gọng'}
                      </label>
                      {frameMode === 'gong_cu_the' ? (
                        <input
                          list="gongkinh-list"
                          value={form.ten_gong || ''}
                          onChange={(e) => handleFrameChange(e.target.value)}
                          className="h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm font-medium flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          placeholder="Chọn loại gọng"
                          data-nav="presc"
                          data-order="11"
                        />
                      ) : (
                        <select
                          className="h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm font-medium flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                          value={form.nhom_gia_gong_id || ''}
                          onChange={(e) => handleNhomGiaChange(e.target.value)}
                          data-nav="presc"
                          data-order="11"
                        >
                          <option value="">-- Chọn nhóm giá --</option>
                          {nhomGiaGongs.filter(n => (n as any).trang_thai !== 'inactive').map(n => (
                            <option key={n.id} value={n.id}>{n.ten_nhom} (nhập: {n.gia_nhap_trung_binh.toLocaleString()}đ, bán: {n.gia_ban_mac_dinh.toLocaleString()}đ, tồn: {n.so_luong_ton})</option>
                          ))}
                        </select>
                      )}
                      {frameStock !== null && (
                        <span className={`text-[10px] px-1 py-0.5 rounded whitespace-nowrap shrink-0 ${
                          frameStock <= 0 ? 'bg-red-100 text-red-700' : frameStock <= 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                        }`}>
                          {frameStock <= 0 ? 'Hết' : `${frameStock}`}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:hidden">
                      <label className="text-[11px] font-medium text-gray-600 uppercase shrink-0 w-14">Tròng MP</label>
                      <input
                        list="hangtrong-list"
                        value={form.hangtrong_mp || ''}
                        onChange={(e) => handleRightEyeLensBrandChange(e.target.value)}
                        className="h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm font-medium flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Hãng tròng MP"
                        data-nav="presc"
                        data-order="12"
                      />
                      {lensStockMp && (
                        <span className={`text-[10px] px-1 py-0.5 rounded whitespace-nowrap shrink-0 ${
                          lensStockMp.trang_thai === 'HET' || lensStockMp.trang_thai === 'CHUA_CO' ? 'bg-red-100 text-red-700'
                          : lensStockMp.trang_thai === 'SAP_HET' ? 'bg-yellow-100 text-yellow-700'
                          : lensStockMp.trang_thai === 'DAT_HANG' ? 'bg-blue-100 text-blue-700'
                          : lensStockMp.trang_thai === 'CHUA_NHAP_DO' ? 'bg-gray-100 text-gray-500'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          {lensStockMp.trang_thai === 'DAT_HANG' ? 'ĐH'
                          : lensStockMp.trang_thai === 'CHUA_NHAP_DO' ? '...'
                          : lensStockMp.trang_thai === 'CHUA_CO' ? 'Chưa có'
                          : lensStockMp.ton !== null ? (lensStockMp.ton <= 0 ? 'Hết' : `${lensStockMp.ton}`) : ''}
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2 sm:hidden">
                      <label className="text-[11px] font-medium text-gray-600 uppercase shrink-0 w-14">Tròng MT</label>
                      <input
                        list="hangtrong-list"
                        value={form.hangtrong_mt || ''}
                        onChange={(e) => handleLeftEyeLensBrandChange(e.target.value)}
                        className="h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm font-medium flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                        placeholder="Hãng tròng MT"
                        data-nav="presc"
                        data-order="13"
                      />
                      {lensStockMt && (
                        <span className={`text-[10px] px-1 py-0.5 rounded whitespace-nowrap shrink-0 ${
                          lensStockMt.trang_thai === 'HET' || lensStockMt.trang_thai === 'CHUA_CO' ? 'bg-red-100 text-red-700'
                          : lensStockMt.trang_thai === 'SAP_HET' ? 'bg-yellow-100 text-yellow-700'
                          : lensStockMt.trang_thai === 'DAT_HANG' ? 'bg-blue-100 text-blue-700'
                          : lensStockMt.trang_thai === 'CHUA_NHAP_DO' ? 'bg-gray-100 text-gray-500'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          {lensStockMt.trang_thai === 'DAT_HANG' ? 'ĐH'
                          : lensStockMt.trang_thai === 'CHUA_NHAP_DO' ? '...'
                          : lensStockMt.trang_thai === 'CHUA_CO' ? 'Chưa có'
                          : lensStockMt.ton !== null ? (lensStockMt.ton <= 0 ? 'Hết' : `${lensStockMt.ton}`) : ''}
                        </span>
                      )}
                    </div>
                    {/* Desktop: original layout */}
                    <div className="hidden sm:flex flex-col sm:flex-row sm:items-center gap-2">
                      <label className="w-full sm:w-28 text-xs font-medium text-gray-700 uppercase whitespace-nowrap flex-shrink-0">Chọn gọng</label>
                        <div className="flex-1 flex items-center gap-2">
                          {nhomGiaGongs.length > 0 && (
                            <div className="flex gap-1 shrink-0">
                              <button
                                type="button"
                                className={`text-[10px] px-2 py-1 rounded-full ${frameMode === 'gong_cu_the' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                                onClick={() => { setFrameMode('gong_cu_the'); setForm({ ...form, nhom_gia_gong_id: null }); }}
                              >Cụ thể</button>
                              <button
                                type="button"
                                className={`text-[10px] px-2 py-1 rounded-full ${frameMode === 'nhom_gia' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-600'}`}
                                onClick={() => { setFrameMode('nhom_gia'); setForm({ ...form, ten_gong: '' }); }}
                              >Nhóm giá</button>
                            </div>
                          )}
                          {frameMode === 'gong_cu_the' ? (
                            <input
                              list="gongkinh-list"
                              value={form.ten_gong || ''}
                              onChange={(e) => handleFrameChange(e.target.value)}
                              className="h-9 bg-white border border-gray-300 rounded-lg px-3 text-sm font-medium flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                              placeholder="Chọn loại gọng"
                              data-nav="presc"
                              data-order="11"
                            />
                          ) : (
                            <select
                              className="h-9 bg-white border border-gray-300 rounded-lg px-3 text-sm font-medium flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                              value={form.nhom_gia_gong_id || ''}
                              onChange={(e) => handleNhomGiaChange(e.target.value)}
                              data-nav="presc"
                              data-order="11"
                            >
                              <option value="">-- Chọn nhóm giá --</option>
                              {nhomGiaGongs.filter(n => (n as any).trang_thai !== 'inactive').map(n => (
                              <option key={n.id} value={n.id}>{n.ten_nhom} (nhập: {n.gia_nhap_trung_binh.toLocaleString()}đ, bán: {n.gia_ban_mac_dinh.toLocaleString()}đ, tồn: {n.so_luong_ton})</option>
                              ))}
                            </select>
                          )}
                          {frameStock !== null && (
                            <span className={`text-xs px-1.5 py-0.5 rounded whitespace-nowrap ${
                              frameStock <= 0 ? 'bg-red-100 text-red-700' : frameStock <= 2 ? 'bg-yellow-100 text-yellow-700' : 'bg-green-100 text-green-700'
                            }`}>
                              {frameStock <= 0 ? 'Hết' : `Tồn: ${frameStock}`}
                            </span>
                          )}
                        </div>
                    </div>
                    <div className="hidden sm:flex flex-col lg:flex-row gap-4">
                      <div className="flex sm:items-center gap-2 lg:flex-1">
                        <label className="sm:w-28 text-xs font-medium text-gray-700 uppercase whitespace-nowrap flex-shrink-0">Hãng tròng MP</label>
                        <div className="flex-1 flex items-center gap-2">
                          <input 
                            list="hangtrong-list" 
                            value={form.hangtrong_mp || ''} 
                            onChange={(e) => handleRightEyeLensBrandChange(e.target.value)} 
                            className="h-9 bg-white border border-gray-300 rounded-lg px-3 text-sm font-medium flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow" 
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

                      <div className="flex sm:items-center gap-2 lg:flex-1">
                        <label className="sm:w-28 text-xs font-medium text-gray-700 uppercase whitespace-nowrap flex-shrink-0">Hãng tròng MT</label>
                        <div className="flex-1 flex items-center gap-2">
                          <input 
                            list="hangtrong-list" 
                            value={form.hangtrong_mt || ''} 
                            onChange={(e) => handleLeftEyeLensBrandChange(e.target.value)} 
                            className="h-9 bg-white border border-gray-300 rounded-lg px-3 text-sm font-medium flex-1 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow" 
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
                <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-gray-200">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-gray-900 text-sm tracking-tight">Thanh toán</h3>
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
                      <label className="text-xs font-medium text-gray-700 whitespace-nowrap shrink-0">Giá tròng</label>
                      <Input type="number" value={form.giatrong ? (form.giatrong / 1000) : ''} onChange={(e) => setForm({ ...form, giatrong: e.target.value ? Number(e.target.value) * 1000 : 0 })} className="h-9 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex-1 min-w-0" placeholder="nghìn" />
                    </div>
                    {/* Giá gọng - inline */}
                    <div className="flex items-center gap-2">
                      <label className="text-xs font-medium text-gray-700 whitespace-nowrap shrink-0">Giá gọng</label>
                      <Input type="number" value={form.giagong ? (form.giagong / 1000) : ''} onChange={(e) => setForm({ ...form, giagong: e.target.value ? Number(e.target.value) * 1000 : 0 })} className="h-9 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex-1 min-w-0" placeholder="nghìn" />
                    </div>
                    {/* Summary */}
                    {ghiNo && (
                      <>
                        <div className="flex justify-between items-center pb-1 border-b border-gray-200">
                          <span className="text-xs text-gray-600 font-medium">Đã thanh toán</span>
                          <span className="text-xs font-bold text-green-600">{sotienDaThanhToan.toLocaleString()}đ</span>
                        </div>
                        <div className="flex justify-between items-center pb-1 border-b border-gray-200">
                          <span className="text-xs text-gray-600 font-medium">Còn nợ</span>
                          <span className="text-xs font-bold text-red-600">{sotienConNo.toLocaleString()}đ</span>
                        </div>
                      </>
                    )}
                    <div className="border-t-2 border-gray-200 pt-2 flex justify-between items-center bg-gray-50 -mx-4 px-4 py-2 rounded-lg">
                      <span className="text-xs font-bold text-gray-900">Tổng tiền</span>
                      <span className="text-base font-extrabold text-blue-600">{tongTien.toLocaleString()}đ</span>
                    </div>
                    {/* Khách đưa - inline */}
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <label className="text-xs font-medium text-gray-700 whitespace-nowrap shrink-0">Khách đưa</label>
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
                          className="h-9 bg-white border border-gray-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 flex-1 min-w-0"
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
                </div>
                {/* Nút hành động */}
                <div className="flex flex-wrap gap-2 pt-4 border-t border-gray-200">
                  {!isEditing && (
                    <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl shadow-sm active:scale-[0.98] transition-all text-sm touch-manipulation" onClick={luuDonKinh}>Lưu đơn</button>
                  )}
                  {isEditing && form.id && (
                    <>
                      <button className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl shadow-sm active:scale-[0.98] transition-all text-sm touch-manipulation" onClick={handleUpdate}>Sửa đơn</button>
                      <button className="bg-white border border-gray-300 text-gray-700 font-bold text-sm py-2.5 px-3 rounded-xl hover:bg-gray-50 touch-manipulation" onClick={handleCopy}>Sao chép</button>
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
                  {isEditing && form.id && benhNhan && (
                    <PrintDonKinh config={printConfig} don={form as any} benhNhan={benhNhan} />
                  )}
                </div>

                {/* Mobile History Section - below action buttons */}
                <div className="block lg:hidden mt-4 pt-4 border-t border-gray-200">
                  <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} />
                </div>

                {/* Mobile Appointment Section - below history */}
                <div className="block lg:hidden mt-4 pt-4 border-t border-gray-200">
                  <div className="bg-white rounded-xl shadow-sm border border-gray-200">
                    <div className="px-3 pt-3 pb-1 flex justify-between items-center">
                      <h2 className="font-bold text-gray-900 text-sm tracking-tight flex items-center gap-1">
                        <CalendarDays className="w-4 h-4 text-blue-600" /> Lịch hẹn
                        {henKhamStats.cho > 0 && <span className="ml-1 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">{henKhamStats.cho}</span>}
                        {henKhamStats.qua_han > 0 && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">{henKhamStats.qua_han}</span>}
                      </h2>
                      <button
                        className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1 transition-colors"
                        onClick={() => { setEditHenForm(null); setAddHenForm({ ngay_hen: addDaysToToday(7), gio_hen: '', ly_do: 'Lấy kính', ghichu: '' }); setOpenHenDialog(true); }}
                      >
                        + Thêm
                      </button>
                    </div>
                    <div className="px-2 pb-2 space-y-2 max-h-64 overflow-y-auto">
                      {dsHenKham.length === 0 ? (
                        <p className="text-xs text-gray-400 px-1">Chưa có lịch hẹn nào</p>
                      ) : (
                        dsHenKham.map(hen => {
                          const st = TRANG_THAI_HEN[hen.trang_thai] || TRANG_THAI_HEN.cho;
                          const countdown = getHenCountdown(hen.ngay_hen, hen.trang_thai);
                          return (
                            <div key={hen.id} className={`bg-white px-2 py-1.5 rounded-lg border ${hen.trang_thai === 'qua_han' ? 'border-red-200' : 'border-gray-200'}`}>
                              <div className="flex justify-between items-start">
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1 flex-wrap mb-0.5">
                                    <span className="text-[11px] font-bold text-gray-700">{formatNgayHen(hen.ngay_hen)}</span>
                                    {hen.gio_hen && <span className="text-[10px] text-gray-400">{hen.gio_hen.substring(0, 5)}</span>}
                                    <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${st.bg} ${st.color}`}>{st.label}</span>
                                    {countdown && <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${countdown.className}`}>{countdown.text}</span>}
                                  </div>
                                  <p className="text-[11px] text-gray-600 truncate">{hen.ly_do || ''}{hen.ghichu ? ` · ${hen.ghichu}` : ''}</p>
                                </div>
                                <div className="flex gap-1 ml-1 flex-shrink-0">
                                  {(hen.trang_thai === 'cho' || hen.trang_thai === 'qua_han') && (
                                    <button className="p-1 text-green-500 hover:text-green-700 transition-colors" onClick={() => updateHenTrangThai(hen.id, 'da_den')}>
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                  <button className="p-1 text-gray-400 hover:text-blue-600 transition-colors" onClick={() => { setEditHenForm({ id: hen.id, ngay_hen: hen.ngay_hen, gio_hen: hen.gio_hen?.substring(0, 5) || '', ly_do: hen.ly_do || '', ghichu: hen.ghichu || '' }); setOpenHenDialog(true); }}>
                                    <Pencil className="w-3.5 h-3.5" />
                                  </button>
                                  <button className="p-1 text-gray-400 hover:text-red-500 transition-colors" onClick={() => deleteHenKham(hen.id)}>
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>
                              {/* Mobile quick reschedule */}
                              {(hen.trang_thai === 'cho' || hen.trang_thai === 'qua_han') && (
                                <div className="flex items-center gap-1 mt-1">
                                  <span className="text-[9px] text-gray-400">Dời:</span>
                                  {[7, 14, 30].map(d => (
                                    <button key={d} onClick={() => rescheduleHen(hen.id, d)} className="px-1.5 py-0.5 text-[10px] bg-purple-50 text-purple-600 rounded hover:bg-purple-100 font-medium">
                                      +{d < 30 ? `${d}d` : '1th'}
                                    </button>
                                  ))}
                                  {hen.trang_thai === 'cho' && (
                                    <button className="px-1.5 py-0.5 text-[10px] bg-red-50 text-red-500 rounded hover:bg-red-100 font-medium" onClick={() => updateHenTrangThai(hen.id, 'huy')}>
                                      Hủy
                                    </button>
                                  )}
                                  {hen.dienthoai && (
                                    <a href={`tel:${hen.dienthoai}`} className="px-1.5 py-0.5 text-[10px] bg-green-50 text-green-600 rounded hover:bg-green-100 font-medium flex items-center gap-0.5">
                                      <Phone className="w-2.5 h-2.5" /> Gọi
                                    </a>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
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
        <aside className="hidden lg:flex w-[clamp(220px,16.67%,320px)] flex-shrink-0 border-l border-gray-200 bg-[#f5f6f8] flex-col h-full">
          {/* Scrollable payment zone */}
          <div className="flex-1 overflow-y-auto p-3 min-h-0">
          <div className="flex items-center justify-between mb-3">
            <h2 className="font-bold text-gray-900 text-sm tracking-tight">Thanh toán</h2>
            {isAdmin && (
              <button type="button" onClick={() => setShowAdminPanel(!showAdminPanel)} className={`text-gray-400 hover:text-gray-600 p-0.5 touch-manipulation transition-transform ${showAdminPanel ? 'rotate-180' : ''}`} title="Giá nhập">
                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
              </button>
            )}
          </div>

          {/* Payment inputs */}
          <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200 space-y-1.5 mb-3">
            {/* Giá nhập - chỉ owner/admin mới thấy */}
            {isAdmin && showAdminPanel && (
              <div className="space-y-2 pb-2 mb-1.5 border-b border-dashed border-gray-200">
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap shrink-0">Nhập tròng</label>
                  <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2 h-8 flex-1 min-w-0">
                    <input type="number" value={form.gianhap_trong ? (form.gianhap_trong / 1000) : ''} onChange={(e) => setForm({ ...form, gianhap_trong: e.target.value ? Number(e.target.value) * 1000 : 0 })} placeholder="Nhập số" className="bg-transparent w-full outline-none text-xs text-gray-900 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                    {form.gianhap_trong && form.gianhap_trong > 0 && (
                      <span className="text-[11px] text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <label className="text-[11px] font-medium text-gray-500 whitespace-nowrap shrink-0">Nhập gọng</label>
                  <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2 h-8 flex-1 min-w-0">
                    <input type="number" value={form.gianhap_gong ? (form.gianhap_gong / 1000) : ''} onChange={(e) => setForm({ ...form, gianhap_gong: e.target.value ? Number(e.target.value) * 1000 : 0 })} placeholder="Nhập số" className="bg-transparent w-full outline-none text-xs text-gray-900 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" />
                    {form.gianhap_gong && form.gianhap_gong > 0 && (
                      <span className="text-[11px] text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                    )}
                  </div>
                </div>
              </div>
            )}
            {/* Giá tròng - inline */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-gray-700 whitespace-nowrap shrink-0">Giá tròng</label>
              <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2 h-8 flex-1 min-w-0">
                <input type="number" value={form.giatrong ? (form.giatrong / 1000) : ''} onChange={(e) => setForm({ ...form, giatrong: e.target.value ? Number(e.target.value) * 1000 : 0 })} placeholder="Nhập số" className="bg-transparent w-full outline-none text-xs text-gray-900 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" data-nav="presc" data-order="14" />
                {form.giatrong && form.giatrong > 0 && (
                  <span className="text-xs text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                )}
              </div>
            </div>
            {/* Giá gọng - inline */}
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-gray-700 whitespace-nowrap shrink-0">Giá gọng</label>
              <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2 h-8 flex-1 min-w-0">
                <input type="number" value={form.giagong ? (form.giagong / 1000) : ''} onChange={(e) => setForm({ ...form, giagong: e.target.value ? Number(e.target.value) * 1000 : 0 })} placeholder="Nhập số" className="bg-transparent w-full outline-none text-xs text-gray-900 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]" data-nav="presc" data-order="15" />
                {form.giagong && form.giagong > 0 && (
                  <span className="text-xs text-gray-400 font-mono ml-0.5 shrink-0">.000</span>
                )}
              </div>
            </div>
            {/* Summary rows */}
            {ghiNo && (
              <>
                <div className="flex justify-between items-center pb-1 border-b border-gray-200">
                  <span className="text-xs text-gray-600 font-medium whitespace-nowrap">Đã thanh toán</span>
                  <span className="text-xs font-bold text-green-600 whitespace-nowrap">{sotienDaThanhToan.toLocaleString()}đ</span>
                </div>
                <div className="flex justify-between items-center pb-1 border-b border-gray-200">
                  <span className="text-xs text-gray-600 font-medium whitespace-nowrap">Còn nợ</span>
                  <span className="text-xs font-bold text-red-600 whitespace-nowrap">{sotienConNo.toLocaleString()}đ</span>
                </div>
              </>
            )}
            {/* Tổng cộng */}
            <div className="pt-1.5 flex justify-between items-center border-t-2 border-gray-200 bg-gray-50 -mx-3 px-3 py-1.5 rounded-lg">
              <span className="font-bold text-xs text-gray-900 tracking-tight whitespace-nowrap">TỔNG CỘNG</span>
              <span className="font-extrabold text-sm text-blue-600 whitespace-nowrap">{tongTien.toLocaleString()}đ</span>
            </div>
          </div>

          {/* Khách đưa - inline */}
          <div className="space-y-1.5 mb-3 px-0.5">
            <div className="flex items-center gap-1.5">
              <label className="text-xs font-medium text-gray-700 whitespace-nowrap shrink-0">Khách đưa</label>
              <div className="flex items-center bg-white border border-gray-300 rounded-lg px-2 h-8 flex-1 min-w-0">
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
                  className="bg-transparent w-full outline-none text-xs text-gray-900 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
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
          <div className="mb-3 px-0.5">
            <div className="flex items-center gap-2">
              <input type="checkbox" id="ghiNo-desktop" checked={ghiNo} onChange={(e) => setGhiNo(e.target.checked)} className="h-4 w-4 rounded border-gray-300 text-red-500 focus:ring-red-200" />
              <label htmlFor="ghiNo-desktop" className={`text-sm font-semibold cursor-pointer ${ghiNo ? 'text-red-600' : 'text-gray-700'}`}>
                Ghi nợ{ghiNo && sotienConNo > 0 ? `: ${sotienConNo.toLocaleString()}đ` : ''}
              </label>
            </div>
          </div>

          </div>
          {/* end scrollable zone */}

          {/* Fixed-bottom action buttons */}
          <div className="flex-shrink-0 p-3 border-t border-gray-200 space-y-2">
            {!isEditing && (
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]" onClick={luuDonKinh}>
                ✓ LƯU ĐƠN
              </button>
            )}
            {isEditing && form.id && (
              <button className="w-full bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]" onClick={handleUpdate}>
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
            <div className="flex gap-1.5">
              {isEditing && form.id && benhNhan && (
                <PrintDonKinh config={printConfig} don={form as any} benhNhan={benhNhan} />
              )}
            </div>
          </div>
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

      {/* Lịch hẹn Dialog - Thêm/Sửa */}
      <Dialog open={openHenDialog} onOpenChange={(v) => { setOpenHenDialog(v); if (!v) setEditHenForm(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editHenForm ? 'Sửa lịch hẹn' : 'Thêm lịch hẹn mới'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label>Ngày hẹn *</Label>
                <Input type="date" value={editHenForm ? editHenForm.ngay_hen : addHenForm.ngay_hen} onChange={(e) => editHenForm ? setEditHenForm({ ...editHenForm, ngay_hen: e.target.value }) : setAddHenForm(f => ({ ...f, ngay_hen: e.target.value }))} />
              </div>
              <div>
                <Label>Giờ hẹn</Label>
                <Input type="time" value={editHenForm ? editHenForm.gio_hen : addHenForm.gio_hen} onChange={(e) => editHenForm ? setEditHenForm({ ...editHenForm, gio_hen: e.target.value }) : setAddHenForm(f => ({ ...f, gio_hen: e.target.value }))} />
              </div>
            </div>
            {/* Quick date buttons */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className="text-xs text-gray-500">Hẹn sau:</span>
              {[
                { days: 7, label: '7 ngày' },
                { days: 14, label: '14 ngày' },
                { days: 30, label: '1 tháng' },
                { days: 90, label: '3 tháng' },
                { days: 180, label: '6 tháng' },
              ].map(({ days, label }) => (
                <button
                  key={days}
                  type="button"
                  className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 border border-blue-200 font-medium"
                  onClick={() => {
                    const newDate = addDaysToToday(days);
                    editHenForm ? setEditHenForm({ ...editHenForm, ngay_hen: newDate }) : setAddHenForm(f => ({ ...f, ngay_hen: newDate }));
                  }}
                >
                  +{label}
                </button>
              ))}
            </div>
            <div>
              <Label>Lý do</Label>
              <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={editHenForm ? editHenForm.ly_do : addHenForm.ly_do} onChange={(e) => editHenForm ? setEditHenForm({ ...editHenForm, ly_do: e.target.value }) : setAddHenForm(f => ({ ...f, ly_do: e.target.value }))}>
                {henLyDoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
              </select>
            </div>
            <div>
              <Label>Ghi chú</Label>
              <Input value={editHenForm ? editHenForm.ghichu : addHenForm.ghichu} onChange={(e) => editHenForm ? setEditHenForm({ ...editHenForm, ghichu: e.target.value }) : setAddHenForm(f => ({ ...f, ghichu: e.target.value }))} placeholder="Ghi chú..." />
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenHenDialog(false)}>Hủy</Button>
            <Button onClick={saveHenDialog}>{editHenForm ? 'Lưu thay đổi' : 'Lưu lịch hẹn'}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </ProtectedRoute>
  );
}