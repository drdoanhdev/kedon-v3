//src/pages/ke-don.tsx
'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { Trash2, Pencil, FilePlus } from 'lucide-react'; // Đã bỏ Plus vì không dùng
import { useSearchParams } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import Link from 'next/link';
import { format } from 'date-fns';
import toast, { Toaster } from 'react-hot-toast';
import ProtectedRoute from '../components/ProtectedRoute';
import { searchByStartsWith } from '@/lib/utils';

interface Thuoc {
  id: number;
  tenthuoc: string;
  donvitinh: string;
  giaban: number;
  gianhap: number;
  soluongmacdinh: number;
  nhomthuocs: number[];
  la_thu_thuat: boolean;
  cachdung: string;
  hoatchat: string;
}

interface NhomThuoc {
  id: number;
  ten: string;
}

interface ChiTietDonThuoc {
  thuoc: Thuoc;
  soluong: number;
  cachdung: string; // Có thể được override từ master data
  // Bộ đệm chuỗi cho ô số lượng để cho phép xóa tạm thời ("") rồi nhập số mới
  soluongInput?: string;
}

interface DonThuocCu {
  id: number;
  madonthuoc: string;
  chandoan: string;
  ngay_kham: string;
  tongtien: number;
  no?: boolean;
  sotien_da_thanh_toan: number;
}

interface DienTien {
  id: number;
  ngay: string;
  noidung: string;
}

interface BenhNhan {
  id: number;
  ten: string;
  namsinh: string; // yyyy hoặc dd/mm/yyyy
  dienthoai: string;
  diachi: string;
  tuoi?: number;
}

export default function KeDon() {
  const searchParams = useSearchParams();
  const benhnhanid = searchParams.get('bn');

  const [dsThuoc, setDsThuoc] = useState<Thuoc[]>([]);
  const [nhomThuoc, setNhomThuoc] = useState<NhomThuoc[]>([]);
  const [dsDonCu, setDsDonCu] = useState<DonThuocCu[]>([]);
  const [dsChiTietDonCu, setDsChiTietDonCu] = useState<{ [donthuocid: number]: ChiTietDonThuoc[] }>({});
  const [dsDienTien, setDsDienTien] = useState<DienTien[]>([]);
  const [benhNhan, setBenhNhan] = useState<BenhNhan | null>(null);
  const [selectedNhom, setSelectedNhom] = useState<number | null>(null);
  const [dsChon, setDsChon] = useState<ChiTietDonThuoc[]>([]);
  const [newDienTien, setNewDienTien] = useState({ noidung: '', ngay: new Date().toISOString().slice(0, 10) });
  const [ngayKham, setNgayKham] = useState(() => {
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    return vietnamTime.toISOString().slice(0, 16);
  });
  const [editDienTien, setEditDienTien] = useState<DienTien | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [timThuoc, setTimThuoc] = useState('');
  const [timThuocDonDangKe, setTimThuocDonDangKe] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [chandoan, setChandoan] = useState('');
  const [chandoanSuggestions, setChandoanSuggestions] = useState<string[]>([]);
  const [showChandoanSuggestions, setShowChandoanSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [ghiNo, setGhiNo] = useState(false);
  const [sotienDaThanhToan, setSotienDaThanhToan] = useState(0);
  const [sotienDaThanhToanInput, setSotienDaThanhToanInput] = useState('');
  const [editDonThuocId, setEditDonThuocId] = useState<number | null>(null);
  const [highlightId, setHighlightId] = useState<number | null>(null); // highlight đơn mới / cập nhật
  const chandoanDesktopRef = useRef<HTMLInputElement | null>(null);
  const searchDesktopRef = useRef<HTMLInputElement | null>(null);
  // Edit patient dialog state
  const [openEditPatient, setOpenEditPatient] = useState(false);
  const [patientForm, setPatientForm] = useState<BenhNhan | null>(null);
  
  // States cho đơn thuốc mẫu
  const [showMauDialog, setShowMauDialog] = useState(false);
  const [dsMau, setDsMau] = useState<any[]>([]);
  const [loadingMau, setLoadingMau] = useState(false);

  const loadChandoanHistory = useCallback(() => {
    try {
      const saved = localStorage.getItem('chandoan_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  }, []);

  const saveChandoanToHistory = useCallback((diagnosis: string) => {
    if (!diagnosis.trim()) return;
    try {
      const history = loadChandoanHistory();
      const filtered = history.filter((d: string) => d.toLowerCase() !== diagnosis.toLowerCase());
      const updated = [diagnosis, ...filtered].slice(0, 100);
      localStorage.setItem('chandoan_history', JSON.stringify(updated));
    } catch (err) {
      console.error('Error saving diagnosis:', err);
    }
  }, [loadChandoanHistory]);

  const handleChandoanChange = useCallback((value: string) => {
    setChandoan(value);
    if (value.trim() === '') {
      setShowChandoanSuggestions(false);
      return;
    }
    const history = loadChandoanHistory();
    const filtered = history.filter((d: string) =>
      d.toLowerCase().includes(value.toLowerCase())
    );
    setChandoanSuggestions(filtered);
    setShowChandoanSuggestions(filtered.length > 0);
    setSelectedSuggestionIndex(-1);
  }, [loadChandoanHistory]);

  const selectChandoanSuggestion = useCallback((suggestion: string) => {
    setChandoan(suggestion);
    setShowChandoanSuggestions(false);
    setChandoanSuggestions([]);
  }, []);

  // Cập nhật tiêu đề tab: hiển thị tên bệnh nhân nếu có
  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (benhNhan?.ten) {
      document.title = benhNhan.ten;
    } else {
      document.title = 'Kê đơn';
    }
  }, [benhNhan?.ten]);

  // Fetch initial data
  useEffect(() => {
    const fetchData = async () => {
      try {
        // Thêm cache-busting parameters
        const timestamp = Date.now();
        const random = Math.random().toString(36).substring(7);
        const cacheHeaders = {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        };

        const requests = [
          axios.get(`/api/thuoc?_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: [] } })),
          axios.get(`/api/nhom-thuoc?_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: [] } })),
          benhnhanid
            ? axios.get(`/api/don-thuoc?benhnhanid=${benhnhanid}&limit=100&_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: [] } }))
            : Promise.resolve({ data: { data: [] } }),
          benhnhanid
            ? axios.get(`/api/dien-tien?benhnhanid=${benhnhanid}&_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: [] } }))
            : Promise.resolve({ data: { data: [] } }),
          benhnhanid
            ? axios.get(`/api/benh-nhan?benhnhanid=${benhnhanid}&_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: null } }))
            : Promise.resolve({ data: { data: null } }),
        ];

        const [resThuoc, resNhom, resDonCu, resDienTien, resBenhNhan] = await Promise.all(requests);

        if ('error' in resThuoc && resThuoc.error) {
          const error = resThuoc.error as any;
          toast.error(`Lỗi tải danh sách thuốc: ${error.response?.data?.message || error.message || 'Unknown error'}`);
        }
        if ('error' in resNhom && resNhom.error) {
          const error = resNhom.error as any;
          toast.error(`Lỗi tải nhóm thuốc: ${error.response?.data?.message || error.message || 'Unknown error'}`);
        }
        if ('error' in resDonCu && resDonCu.error) {
          const error = resDonCu.error as any;
          toast.error(`Lỗi tải đơn thuốc cũ: ${error.response?.data?.message || error.message || 'Unknown error'}`);
        }
        if ('error' in resDienTien && resDienTien.error) {
          const error = resDienTien.error as any;
          toast.error(`Lỗi tải diễn tiến: ${error.response?.data?.message || error.message || 'Unknown error'}`);
        }
        if ('error' in resBenhNhan && resBenhNhan.error) {
          const error = resBenhNhan.error as any;
          toast.error(`Lỗi tải thông tin bệnh nhân: ${error.response?.data?.message || error.message || 'Unknown error'}`);
        }

        setDsThuoc(resThuoc.data.data || []);
        setNhomThuoc(resNhom.data.data || []);
        setDsDonCu(Array.isArray(resDonCu.data.data) ? resDonCu.data.data : []);
        setDsDienTien(resDienTien.data.data || []);
        setBenhNhan(resBenhNhan.data.data || null);

        if (Array.isArray(resDonCu.data.data) && resDonCu.data.data.length > 0) {
          const chiTietPromises = resDonCu.data.data.map((don: DonThuocCu) =>
            axios.get(`/api/chi-tiet-don-thuoc?donthuocid=${don.id}`).catch((err: unknown) => ({ error: err, data: { data: [] } }))
          );
          const chiTietResponses = await Promise.all(chiTietPromises);
          const chiTietMap: { [donthuocid: number]: ChiTietDonThuoc[] } = {};
          chiTietResponses.forEach((res, idx) => {
            const donId = resDonCu.data.data[idx].id;
            if ('error' in res && res.error) {
              const error = res.error as any;
              toast.error(`Lỗi tải chi tiết đơn ${donId}: ${error.response?.data?.message || error.message || 'Unknown error'}`);
              chiTietMap[donId] = [];
            } else {
              chiTietMap[donId] = res.data.data.map((item: { thuoc: Thuoc; soluong: number; cachdung: string; donvitinh?: string }) => ({
                thuoc: {
                  id: item.thuoc.id,
                  tenthuoc: item.thuoc.tenthuoc,
                  donvitinh: item.thuoc.donvitinh, // Luôn từ bảng Thuoc
                  giaban: item.thuoc.giaban,
                  gianhap: item.thuoc.gianhap || 0,
                  soluongmacdinh: item.thuoc.soluongmacdinh,
                  nhomthuocs: item.thuoc.nhomthuocs,
                  la_thu_thuat: item.thuoc.la_thu_thuat,
                  cachdung: item.thuoc.cachdung,
                  hoatchat: item.thuoc.hoatchat,
                },
                soluong: item.soluong,
                cachdung: item.cachdung, // Đã được processed từ API
              }));
            }
          });
          setDsChiTietDonCu(chiTietMap);
        }
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        toast.error(`Lỗi chung khi tải dữ liệu: ${message}`);
      }
    };
    fetchData();
  }, [benhnhanid]);

  // Focus mặc định vào ô chẩn đoán (desktop)
  useEffect(() => {
    if (typeof window !== 'undefined' && window.innerWidth >= 1024) {
      chandoanDesktopRef.current?.focus();
    }
  }, []);

  // Load diagnosis history on mount
  useEffect(() => {
    const history = loadChandoanHistory();
    if (history.length > 0) {
      setChandoanSuggestions(history);
    }
  }, []);

  const tongTien = useMemo(() => dsChon.reduce((sum, item) => sum + item.soluong * item.thuoc.giaban, 0), [dsChon]);
  const lai = useMemo(
    () => (dsChon.reduce((sum, item) => sum + (item.thuoc.giaban - (item.thuoc.gianhap || 0)) * item.soluong, 0) / 1000).toFixed(0),
    [dsChon]
  );
  const sotienConNo = useMemo(() => Math.max(0, tongTien - sotienDaThanhToan), [tongTien, sotienDaThanhToan]);

  const danhSachThuocHienThi = useMemo(() => {
    return dsThuoc.filter((t) => {
      const matchTen = searchByStartsWith(t.tenthuoc, timThuoc);
      const matchNhom = selectedNhom ? t.nhomthuocs.includes(selectedNhom) : true;
      return matchTen && matchNhom;
    });
  }, [dsThuoc, timThuoc, selectedNhom]);

  const danhSachThuocDonDangKe = useMemo(() => {
    return dsThuoc.filter((t) => searchByStartsWith(t.tenthuoc, timThuocDonDangKe));
  }, [dsThuoc, timThuocDonDangKe]);

  const themThuoc = useCallback(
    (thuoc: Thuoc) => {
      if (dsChon.some((t) => t.thuoc.id === thuoc.id)) return;
      setDsChon((prev) => [
        ...prev,
        {
          thuoc,
          soluong: thuoc.soluongmacdinh || 1,
          cachdung: thuoc.cachdung || (thuoc.donvitinh.toLowerCase().includes('lần') ? 'Thực hiện tại phòng khám' : ''),
        },
      ]);
      setTimThuocDonDangKe('');
      setHighlightedIndex(-1); // Reset highlighted index
    },
    [dsChon]
  );

  const xoaThuoc = useCallback((id: number) => {
    setDsChon((prev) => prev.filter((t) => t.thuoc.id !== id));
  }, []);

  const saoChepDon = useCallback(
    (don: DonThuocCu) => {
      if (!window.confirm('Bạn có chắc muốn sao chép đơn thuốc này?')) return;
      const chiTiet = dsChiTietDonCu[don.id] || [];
      setDsChon(chiTiet);
      setChandoan(don.chandoan);
      setSotienDaThanhToan(0);
      setSotienDaThanhToanInput('');
      setEditDonThuocId(null);
      setGhiNo(false);
      // Cập nhật ngày giờ về thời gian hiện tại khi sao chép đơn
      const now = new Date();
      const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
      setNgayKham(vietnamTime.toISOString().slice(0, 16));
      toast.success('Đã sao chép đơn thuốc');
    },
    [dsChiTietDonCu]
  );

  // Sao chép đơn đang sửa dở (giữ nguyên những sửa đổi trong form)
  const saoChepDonDangSua = useCallback(() => {
    if (!window.confirm('Bạn có chắc muốn sao chép đơn đang sửa thành một đơn mới?')) return;
    // Reset trạng thái sửa
    setEditDonThuocId(null);
    setSotienDaThanhToan(0);
    setSotienDaThanhToanInput('');
    setGhiNo(false);
    // Cập nhật ngày giờ về thời gian hiện tại
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    setNgayKham(vietnamTime.toISOString().slice(0, 16));
    toast.success('Đã sao chép đơn đang sửa thành đơn mới');
  }, []);

  const suaDon = useCallback(
    (don: DonThuocCu) => {
      const chiTiet = dsChiTietDonCu[don.id] || [];
      setDsChon(chiTiet);
      setChandoan(don.chandoan);
      setSotienDaThanhToan(don.sotien_da_thanh_toan);
      setSotienDaThanhToanInput((don.sotien_da_thanh_toan / 1000).toString());
  // Sử dụng trường no (boolean) nếu có, nếu không thì tính lại từ số tiền
  const isNo = typeof don.no === 'boolean' ? don.no : don.sotien_da_thanh_toan < don.tongtien;
  setGhiNo(isNo);
      // Sử dụng ngay_kham và chuyển đổi sang múi giờ local để hiển thị đúng
      const ngayKhamDate = new Date(don.ngay_kham);
      const localTime = new Date(ngayKhamDate.getTime() + (7 * 60 * 60 * 1000)); // Chuyển sang UTC+7
      setNgayKham(localTime.toISOString().slice(0, 16)); // Lấy cả ngày và giờ
      setEditDonThuocId(don.id);
      toast.success('Đã nạp đơn thuốc để sửa');
    },
    [dsChiTietDonCu]
  );

  const resetForm = useCallback(() => {
    setDsChon([]);
    setChandoan('');
    setGhiNo(false);
    setSotienDaThanhToan(0);
    setSotienDaThanhToanInput('');
    setEditDonThuocId(null);
    setTimThuocDonDangKe('');
    setHighlightedIndex(-1);
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    setNgayKham(vietnamTime.toISOString().slice(0, 16)); // Reset về ngày giờ hiện tại theo UTC+7
    toast.success('Đã reset form đơn thuốc');
  }, []);

  const xoaDon = useCallback(
    async (id: number) => {
      if (!window.confirm('Bạn có chắc muốn xóa đơn thuốc này?')) return;
      try {
        const res = await axios.delete(`/api/don-thuoc?id=${id}`);
        if (res.status === 200) {
          setDsDonCu((prev) => prev.filter((d) => d.id !== id));
          setDsChiTietDonCu((prev) => {
            const updated = { ...prev };
            delete updated[id];
            return updated;
          });
          resetForm();
          toast.success('Đã xóa đơn thuốc');
        } else {
          toast.error(res.data.message || 'Lỗi khi xóa đơn thuốc');
        }
      } catch (error: unknown) {
        const message = axios.isAxiosError(error)
          ? error.response?.data?.message || error.message
          : error instanceof Error
            ? error.message
            : String(error);
        toast.error(`Lỗi khi xóa đơn thuốc: ${message}`);
      }
    },
    [resetForm]
  );

  const themDienTien = useCallback(async () => {
    if (!newDienTien.noidung || !benhnhanid) {
      toast.error('Vui lòng nhập nội dung diễn tiến');
      return;
    }
    try {
      const res = await axios.post('/api/dien-tien', {
        benhnhanid: parseInt(benhnhanid),
        noidung: newDienTien.noidung,
        ngay: newDienTien.ngay,
      });
      setDsDienTien((prev) => [res.data.data, ...prev]);
      setNewDienTien({ noidung: '', ngay: new Date().toISOString().slice(0, 10) });
      setOpenDialog(false);
      toast.success('Đã thêm diễn tiến');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error(`Lỗi khi thêm diễn tiến: ${message}`);
    }
  }, [newDienTien, benhnhanid]);

  const suaDienTien = useCallback(async () => {
    if (!editDienTien) {
      toast.error('Không có diễn tiến để sửa');
      return;
    }
    try {
      const res = await axios.put('/api/dien-tien', {
        id: editDienTien.id,
        noidung: editDienTien.noidung,
        ngay: editDienTien.ngay,
      });
      setDsDienTien((prev) => prev.map((d) => (d.id === editDienTien.id ? res.data.data : d)));
      setEditDienTien(null);
      setOpenDialog(false);
      toast.success('Đã sửa diễn tiến');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error(`Lỗi khi sửa diễn tiến: ${message}`);
    }
  }, [editDienTien]);

  const xoaDienTien = useCallback(async (id: number) => {
    if (!window.confirm('Bạn có chắc muốn xóa diễn tiến này?')) return;
    try {
      const res = await axios.delete(`/api/dien-tien?id=${id}`);
      setDsDienTien((prev) => prev.filter((d) => d.id !== id));
      toast.success('Đã xóa diễn tiến');
    } catch (error: unknown) {
      const message = axios.isAxiosError(error)
        ? error.response?.data?.message || error.message
        : error instanceof Error
          ? error.message
          : String(error);
      toast.error(`Lỗi khi xóa diễn tiến: ${message}`);
    }
  }, []);

  const luuDonThuoc = useCallback(async () => {
    if (!chandoan || dsChon.length === 0) {
      toast.error('Vui lòng nhập chẩn đoán và chọn ít nhất một thuốc');
      return;
    }
    // Clamp paid amount locally to avoid blocking edits when tổng tiền giảm
    const paidClamped = Math.max(0, Math.min(sotienDaThanhToan, tongTien));
    if (sotienDaThanhToan !== paidClamped) {
      setSotienDaThanhToan(paidClamped);
      setSotienDaThanhToanInput((paidClamped / 1000).toString());
    }
    if (!window.confirm(`Bạn có chắc muốn ${editDonThuocId ? 'cập nhật' : 'lưu'} đơn thuốc này?`)) return;

    try {
      const payload = {
        benhnhanid: parseInt(benhnhanid!),
        chandoan,
        ngay_kham: ngayKham,
        thuocs: dsChon.map((t) => ({
          id: t.thuoc.id,
          soluong: Math.max(1, Math.floor(t.soluong)), // Đảm bảo là integer >= 1
          giaban: t.thuoc.giaban,
          donvitinh: t.thuoc.donvitinh,
          cachdung: t.cachdung,
        })),
  sotien_da_thanh_toan: ghiNo ? paidClamped : tongTien,
      };

      let res;
      if (editDonThuocId) {
        res = await fetch(`/api/don-thuoc`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id: editDonThuocId, ...payload }),
        });
      } else {
        res = await fetch('/api/don-thuoc', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (res.ok) {
        saveChandoanToHistory(chandoan);
        toast.success(`Đã ${editDonThuocId ? 'cập nhật' : 'lưu'} đơn thuốc: ${data.data.madonthuoc}`);
        if (!editDonThuocId) {
          const newId = data.data.id;
          setDsDonCu((prev) => [data.data, ...prev]);
          setDsChiTietDonCu((prev) => ({
            ...prev,
            [newId]: dsChon,
          }));
          if (newId) {
            setHighlightId(newId);
            setTimeout(() => setHighlightId(current => current === newId ? null : current), 3000);
          }
        } else {
          const updatedId = editDonThuocId;
          setDsDonCu((prev) =>
            prev.map((d) =>
              d.id === updatedId
                ? {
                    ...d,
                    chandoan,
                    tongtien: tongTien,
                    no: data.data.no,
                    sotien_da_thanh_toan: data.data.sotien_da_thanh_toan,
                    ngay_kham: ngayKham,
                  }
                : d
            )
          );
          setDsChiTietDonCu((prev) => ({
            ...prev,
            [updatedId]: dsChon,
          }));
          setHighlightId(updatedId);
          setTimeout(() => setHighlightId(current => current === updatedId ? null : current), 3000);
        }
        resetForm();
      } else {
        toast.error(`Lỗi khi lưu đơn thuốc: ${data.message}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi khi lưu đơn thuốc: ${message}`);
    }
  }, [benhnhanid, chandoan, dsChon, ghiNo, tongTien, sotienDaThanhToan, editDonThuocId, ngayKham, resetForm]);

  // Functions cho đơn thuốc mẫu
  const fetchDonThuocMau = useCallback(async () => {
    setLoadingMau(true);
    try {
      const response = await axios.get(`/api/don-thuoc-mau`);
      setDsMau(response.data.data || []);
    } catch (error) {
      console.error('Lỗi khi tải đơn thuốc mẫu:', error);
      toast.error('Lỗi khi tải đơn thuốc mẫu');
    } finally {
      setLoadingMau(false);
    }
  }, []);

  const apDungDonMau = useCallback(async (mauId: number) => {
    try {
      const response = await axios.get(`/api/don-thuoc-mau/ap-dung/${mauId}`);
      const { template, thuocs } = response.data.data;
      
      // Luôn áp dụng chẩn đoán từ mẫu (thay đổi điều kiện)
      if (template.mo_ta) {
        setChandoan(template.mo_ta);
      }
      
      // Chuyển đổi thuốc từ mẫu thành format hiện tại
      const thuocsMoi: ChiTietDonThuoc[] = thuocs.map((thuoc: any) => ({
        thuoc: {
          id: thuoc.id,
          tenthuoc: thuoc.tenthuoc,
          donvitinh: thuoc.donvitinh,
          giaban: thuoc.giaban,
          gianhap: thuoc.gianhap || 0,
          soluongmacdinh: thuoc.soluong,
          nhomthuocs: [],
          la_thu_thuat: false,
          cachdung: thuoc.cachdung || '',
          hoatchat: ''
        },
        soluong: thuoc.soluong,
        cachdung: thuoc.cachdung || ''
      }));
      
      // Thêm vào đơn đang kê (hoặc thay thế)
      const shouldReplace = dsChon.length === 0 || confirm('Bạn có muốn thay thế đơn thuốc hiện tại không?');
      if (shouldReplace) {
        setDsChon(thuocsMoi);
      } else {
        // Chỉ thêm những thuốc chưa có
        const thuocsMoiKhongTrung = thuocsMoi.filter(
          thuocMoi => !dsChon.some(thuocCu => thuocCu.thuoc.id === thuocMoi.thuoc.id)
        );
        setDsChon(prev => [...prev, ...thuocsMoiKhongTrung]);
      }
      
      setShowMauDialog(false);
      toast.success(`Đã áp dụng đơn mẫu: ${template.ten_mau}`);
    } catch (error) {
      console.error('Lỗi khi áp dụng đơn mẫu:', error);
      toast.error('Lỗi khi áp dụng đơn mẫu');
    }
  }, [chandoan, dsChon]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent<HTMLInputElement>) => {
      if (!timThuocDonDangKe) return;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setHighlightedIndex(prev => prev < danhSachThuocDonDangKe.length - 1 ? prev + 1 : prev);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setHighlightedIndex(prev => prev > 0 ? prev - 1 : -1);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (highlightedIndex >= 0) {
          const selectedThuoc = danhSachThuocDonDangKe[highlightedIndex];
          if (selectedThuoc) themThuoc(selectedThuoc);
        } else if (danhSachThuocDonDangKe.length > 0) {
          themThuoc(danhSachThuocDonDangKe[0]);
        }
      }
    },
    [danhSachThuocDonDangKe, highlightedIndex, themThuoc, timThuocDonDangKe]
  );

  // Global shortcut Ctrl+Enter để lưu / cập nhật đơn (desktop & mobile)
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.ctrlKey && e.key === 'Enter') {
        e.preventDefault();
        if (!editDonThuocId) {
          // Lưu đơn mới
          luuDonThuoc();
        } else {
          // Cập nhật đơn đang sửa: reuse luuDonThuoc vì nó tự phân biệt dựa vào editDonThuocId
          luuDonThuoc();
        }
      }
    };
    document.addEventListener('keydown', handler);
    return () => document.removeEventListener('keydown', handler);
  }, [editDonThuocId, luuDonThuoc]);

  if (!benhnhanid) {
    return (
      <div className="p-4">
        <Toaster position="top-right" />
        <Card>
          <CardContent className="p-4">
            <p className="text-sm text-red-500">Vui lòng chọn một bệnh nhân để kê đơn.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  // Open edit patient dialog with current data
  const openEditPatientDialog = () => {
    if (!benhNhan) return;
    setPatientForm({ ...benhNhan });
    setOpenEditPatient(true);
  };

  // Validate and save patient info
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

  return (
    <ProtectedRoute>
  {/* Mobile: Stack layout, Desktop: Keep current grid (md and up) */}
  <div className="flex flex-col md:block">
        <Toaster position="top-right" />
        
        {/* Profit display - Mobile friendly */}
        <div className="fixed top-1 right-1 lg:top-4 lg:right-4 text-sm lg:text-base p-1 lg:p-2 bg-white rounded shadow lg:bg-transparent lg:shadow-none z-10">
          {lai}k
        </div>

        {/* Mobile layout */}
  <div className="block md:hidden p-2 space-y-3">
          {/* Patient info - Mobile */}
          {benhNhan ? (
            <div className="bg-white border rounded p-3">
              <h2 className="font-semibold text-base mb-2">Thông tin bệnh nhân</h2>
              <div className="grid grid-cols-2 gap-2 text-sm">
                <div>Mã BN: <span className="font-bold">{benhNhan.id}</span></div>
                <div>Tên: <span className="font-bold">{benhNhan.ten}</span></div>
                <div>Năm sinh: <span className="font-bold">{benhNhan.namsinh}</span></div>
                <div>Tuổi: <span className="font-bold">{benhNhan.tuoi}</span></div>
                <div className="col-span-2">SĐT: <span className="font-bold">{benhNhan.dienthoai}</span></div>
              </div>
              <div className="mt-3 flex items-center gap-2">
                <Link href={`/ke-don-kinh?bn=${benhnhanid}`} className="flex-1">
                  <Button className="w-full h-8 bg-orange-500 hover:bg-orange-600 text-white text-sm px-3">
                    Kê đơn kính
                  </Button>
                </Link>
                <Button variant="outline" className="h-8 text-sm px-3" onClick={openEditPatientDialog}>
                  <Pencil className="w-4 h-4 mr-2" /> Sửa BN
                </Button>
              </div>
            </div>
          ) : (
            <div className="bg-white border rounded p-3">
              <p className="text-sm text-red-500">Không tìm thấy thông tin bệnh nhân.</p>
            </div>
          )}

          {/* Drug prescription form - Mobile */}
          <div className="bg-white border rounded p-3 space-y-3">
            <h2 className="font-semibold text-base">📝 Đơn thuốc đang kê {editDonThuocId ? '(Đang sửa)' : ''}</h2>
            
            {/* Basic info - Mobile */}
            <Button
              className="w-full h-10 bg-green-600 hover:bg-green-700 text-white mb-2"
              onClick={() => {
                setShowMauDialog(true);
                fetchDonThuocMau();
              }}
            >
              📋 Đơn mẫu
            </Button>
            <div className="space-y-3">
              <div>
                <label className="block text-sm font-medium mb-1">Chẩn đoán</label>
                <div className="relative">
                  <Input
                    placeholder="Nhập chẩn đoán..."
                    value={chandoan}
                    onChange={(e) => handleChandoanChange(e.target.value)}
                    onFocus={() => chandoanSuggestions.length > 0 && setShowChandoanSuggestions(true)}
                    className="h-10"
                  />
                  {showChandoanSuggestions && chandoanSuggestions.length > 0 && (
                    <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg z-50 max-h-48 overflow-y-auto">
                      {chandoanSuggestions.map((suggestion, idx) => (
                        <div
                          key={idx}
                          className={`px-3 py-2 cursor-pointer ${
                            idx === selectedSuggestionIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
                          } border-b last:border-b-0`}
                          onClick={() => selectChandoanSuggestion(suggestion)}
                        >
                          {suggestion}
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
              
              <div>
                <label className="block text-sm font-medium mb-1">Ngày giờ khám</label>
                <div className="flex gap-2">
                  <Input
                    type="datetime-local"
                    value={ngayKham}
                    onChange={(e) => setNgayKham(e.target.value)}
                    className="h-10 flex-1"
                    style={{ colorScheme: 'light' }}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-10 w-10 p-0"
                    onClick={() => {
                      const now = new Date();
                      const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
                      setNgayKham(vietnamTime.toISOString().slice(0, 16));
                    }}
                    title="Đặt về thời gian hiện tại"
                  >
                    📅
                  </Button>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium mb-1">Thêm thuốc vào đơn</label>
                <Input
                  placeholder="Tìm thuốc để thêm..."
                  value={timThuocDonDangKe}
                  onChange={(e) => {
                    setTimThuocDonDangKe(e.target.value);
                    setHighlightedIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  className="h-10"
                />
                {timThuocDonDangKe && (
                  <div className="mt-2 max-h-40 overflow-y-auto bg-white border rounded">
                    {danhSachThuocDonDangKe.map((t, index) => (
                      <div
                        key={t.id}
                        className={`p-2 cursor-pointer border-b ${index === highlightedIndex ? 'bg-blue-100' : 'hover:bg-gray-100'} ${dsChon.some((item) => item.thuoc.id === t.id) ? 'text-green-600' : ''}`}
                        onClick={() => themThuoc(t)}
                      >
                        {dsChon.some((item) => item.thuoc.id === t.id) && '✓ '} {t.tenthuoc}
                      </div>
                    ))}
                    {danhSachThuocDonDangKe.length === 0 && (
                      <div className="p-2 text-gray-500">Không tìm thấy thuốc</div>
                    )}
                  </div>
                )}
              </div>
            </div>

            {/* Selected drugs - Mobile cards */}
            {dsChon.length === 0 ? (
              <p className="text-sm text-gray-500">Chưa có thuốc nào được chọn.</p>
            ) : (
              <div className="space-y-2">
                <h3 className="font-medium">Thuốc đã chọn:</h3>
                {dsChon.map((item, idx) => (
                  <div key={item.thuoc.id} className={`border rounded p-3 ${item.thuoc.donvitinh.toLowerCase().includes('lần') ? 'bg-yellow-100 border-yellow-300' : 'bg-gray-50'}`}>
                    <div className="flex justify-between items-start mb-2">
                      <div className="flex-1">
                        <div className="font-medium">
                          {idx + 1}. {item.thuoc.tenthuoc}
                        </div>
                        <div className="text-sm text-gray-600">{item.thuoc.hoatchat || '-'}</div>
                      </div>
                      <Button 
                        size="sm" 
                        variant="ghost" 
                        className="h-8 w-8 p-0 text-red-500"
                        onClick={() => xoaThuoc(item.thuoc.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                    
                    <div className="grid grid-cols-2 gap-2 text-sm mb-2">
                      <div>Đơn vị: {item.thuoc.donvitinh}</div>
                      <div>Đơn giá: {item.thuoc.giaban.toLocaleString()}đ</div>
                    </div>
                    
                    <div className="space-y-2">
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Số lượng</label>
                        <Input
                          type="number"
                          className="h-10 with-spinner"
                          min={1}
                          step={1}
                          value={item.soluongInput !== undefined ? item.soluongInput : String(item.soluong)}
                          onChange={(e) => {
                            const raw = e.target.value;
                            setDsChon((prev) => {
                              const updated = [...prev];
                              updated[idx].soluongInput = raw;
                              // Khi người dùng đang nhập số (không rỗng), cập nhật số lượng tạm thời theo số đã nhập
                              if (raw !== '') {
                                const parsed = parseInt(raw, 10);
                                if (!Number.isNaN(parsed)) {
                                  updated[idx].soluong = parsed;
                                }
                              }
                              return updated;
                            });
                          }}
                          onBlur={() => {
                            setDsChon((prev) => {
                              const updated = [...prev];
                              const buf = updated[idx].soluongInput;
                              const parsed = buf !== undefined && buf !== '' ? parseInt(buf, 10) : NaN;
                              // Commit: nếu rỗng/invalid hoặc < 1 thì đưa về 1, sau đó xóa bộ đệm để hiển thị số chuẩn
                              if (Number.isNaN(parsed) || parsed < 1) {
                                updated[idx].soluong = 1;
                              } else {
                                updated[idx].soluong = parsed;
                              }
                              delete updated[idx].soluongInput;
                              return updated;
                            });
                          }}
                        />
                      </div>
                      <div>
                        <label className="block text-xs text-gray-600 mb-1">Cách dùng</label>
                        <Input
                          className="h-10"
                          value={item.cachdung}
                          onChange={(e) => {
                            const val = e.target.value;
                            setDsChon((prev) => {
                              const updated = [...prev];
                              updated[idx].cachdung = val;
                              return updated;
                            });
                          }}
                        />
                      </div>
                    </div>
                    
                    <div className="mt-2 text-right font-medium">
                      Thành tiền: {(item.soluong * item.thuoc.giaban).toLocaleString()}đ
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Payment section - Mobile */}
            <div className="border-t pt-3 space-y-3">
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  id="ghiNo-mobile"
                  checked={ghiNo}
                  onChange={(e) => setGhiNo(e.target.checked)}
                  className="w-5 h-5"
                />
                <label htmlFor="ghiNo-mobile" className="text-sm font-medium">Ghi nợ</label>
              </div>
              
              {ghiNo && (
                <div className="space-y-2">
                  <div>
                    <label className="block text-sm font-medium mb-1">Đã thanh toán (nghìn VND)</label>
                    <Input
                      type="number"
                      value={sotienDaThanhToanInput}
                      onChange={(e) => {
                        const val = e.target.value;
                        // nhập theo nghìn
                        const raw = val ? +val * 1000 : 0;
                        const clamped = Math.max(0, Math.min(raw, tongTien));
                        // nếu người dùng nhập vượt tổng tiền, tự động hạ về tổng tiền
                        if (raw !== clamped) {
                          setSotienDaThanhToanInput((clamped / 1000).toString());
                        } else {
                          setSotienDaThanhToanInput(val);
                        }
                        setSotienDaThanhToan(clamped);
                      }}
                      placeholder="Nhập số tiền (nghìn)"
                      className="h-10"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium mb-1">Còn nợ</label>
                    <div className="h-10 px-3 border rounded bg-gray-100 flex items-center font-medium text-red-600">
                      {sotienConNo.toLocaleString()}đ
                    </div>
                  </div>
                </div>
              )}
              
              <div className="bg-blue-50 border border-blue-200 rounded p-3">
                <div className="text-lg font-bold text-blue-600">
                  Tổng tiền: {tongTien.toLocaleString()} VND
                </div>
              </div>
            </div>

            {/* Action buttons - Mobile */}
            <div className="space-y-2">
              {!editDonThuocId && (
                <Button
                  className="w-full h-12 bg-blue-600 hover:bg-orange-400 text-lg"
                  onClick={luuDonThuoc}
                  disabled={!chandoan || dsChon.length === 0}
                >
                  <span className="flex flex-col leading-tight items-center">
                    <span>Lưu đơn thuốc</span>
                    <span className="text-[10px] font-normal">Ctrl+Enter</span>
                  </span>
                </Button>
              )}
              {editDonThuocId && (
                <>
                  <Button
                    className="w-full h-12 bg-blue-600 hover:bg-orange-400 text-lg"
                    onClick={luuDonThuoc}
                    disabled={!chandoan || dsChon.length === 0}
                  >
                    <span className="flex flex-col leading-tight items-center">
                      <span>Cập nhật đơn</span>
                      <span className="text-[10px] font-normal">Ctrl+Enter</span>
                    </span>
                  </Button>
                  <div className="grid grid-cols-2 gap-2">
                    <Button
                      className="h-10 bg-gray-500 hover:bg-gray-600"
                      onClick={() => saoChepDonDangSua()}
                    >
                      Sao chép đơn
                    </Button>
                    <Button
                      className="h-10 bg-red-500 hover:bg-red-600"
                      onClick={() => xoaDon(editDonThuocId)}
                    >
                      Xóa đơn
                    </Button>
                  </div>
                </>
              )}
              <Button
                className="w-full h-10 bg-green-600 hover:bg-green-700"
                onClick={resetForm}
              >
                <FilePlus className="w-4 h-4 mr-2" /> Đơn mới
              </Button>
            </div>
          </div>

          {/* Medical Progress - Mobile */}
          <div className="bg-white border rounded p-3">
            <div className="flex justify-between items-center mb-2">
              <h2 className="font-semibold text-base">📈 Diễn tiến bệnh</h2>
              <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogTrigger asChild>
                  <Button size="sm" className="h-8 px-3 text-sm">
                    Thêm
                  </Button>
                </DialogTrigger>
                <DialogContent>
                  <DialogHeader>
                    <DialogTitle>{editDienTien ? 'Sửa diễn tiến' : 'Thêm diễn tiến'}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-4">
                    <Input
                      type="date"
                      value={editDienTien ? editDienTien.ngay.slice(0, 10) : newDienTien.ngay}
                      onChange={(e) =>
                        editDienTien
                          ? setEditDienTien({ ...editDienTien, ngay: e.target.value })
                          : setNewDienTien({ ...newDienTien, ngay: e.target.value })
                      }
                      className="h-10"
                    />
                    <Textarea
                      rows={4}
                      placeholder="Nhập diễn tiến bệnh..."
                      value={editDienTien ? editDienTien.noidung : newDienTien.noidung}
                      onChange={(e) =>
                        editDienTien
                          ? setEditDienTien({ ...editDienTien, noidung: e.target.value })
                          : setNewDienTien({ ...newDienTien, noidung: e.target.value })
                      }
                      className="min-h-20"
                    />
                    <Button 
                      onClick={editDienTien ? suaDienTien : themDienTien}
                      className="w-full h-10"
                    >
                      {editDienTien ? 'Lưu' : 'Thêm'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            <div className="max-h-40 overflow-y-auto space-y-2">
              {dsDienTien.length === 0 ? (
                <p className="text-sm text-gray-500">Chưa có diễn tiến nào.</p>
              ) : (
                dsDienTien.map((d) => (
                  <div key={d.id} className="border rounded p-2">
                    <div className="flex justify-between items-start">
                      <div className="flex-1">
                        <p className="text-sm font-semibold">{format(new Date(d.ngay), 'dd/MM/yyyy')}</p>
                        <p className="text-sm text-gray-700 mt-1">{d.noidung}</p>
                      </div>
                      <div className="flex gap-1 ml-2">
                        <Button
                          size="sm"
                          variant="ghost"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            setEditDienTien(d);
                            setOpenDialog(true);
                          }}
                        >
                          <Pencil className="w-4 h-4" />
                        </Button>
                        <Button 
                          size="sm" 
                          variant="ghost" 
                          className="h-8 w-8 p-0 text-red-500"
                          onClick={() => xoaDienTien(d.id)}
                        >
                          <Trash2 className="w-4 h-4" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* History - Mobile */}
          <div className="bg-white border rounded p-3">
            <h2 className="font-semibold text-base mb-2">🕘 Lịch sử đơn thuốc</h2>
            <div className="max-h-60 overflow-y-auto space-y-2">
              {dsDonCu.length === 0 ? (
                <p className="text-sm text-gray-500">Chưa có đơn thuốc nào.</p>
              ) : (
                dsDonCu.map((don) => (
                  <div
                    key={don.id}
                    className={`border rounded p-2 cursor-pointer transition-colors duration-300 ${don.id === highlightId ? 'bg-yellow-200 animate-pulse' : 'hover:bg-gray-100'}`}
                    onClick={() => suaDon(don)}
                  >
                    <div className="font-medium text-sm">{don.chandoan || 'Không có chẩn đoán'}</div>
                    <div className="text-xs text-gray-600">
                      {new Date(don.ngay_kham).toLocaleString('vi-VN', { 
                        timeZone: 'Asia/Ho_Chi_Minh', 
                        hour12: false,
                        year: 'numeric',
                        month: '2-digit', 
                        day: '2-digit',
                        hour: '2-digit',
                        minute: '2-digit'
                      })}
                    </div>
                    <div className="text-xs text-gray-600">
                      {dsChiTietDonCu[don.id]?.map((item) => 
                        `${item.thuoc.tenthuoc}`
                      ).join(', ') || 'Không có thuốc'}
                    </div>
                    <div className="text-sm font-medium text-blue-600">
                      {(don.tongtien / 1000).toFixed(0)}k VND
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>

  {/* Desktop layout - Keep original (md and up) */}
  <div className="hidden md:block p-4 space-y-4 relative">
          <div className="grid grid-cols-5 gap-4 h-[calc(100vh-60px)]">
            <div className="col-span-2 grid grid-rows-2 gap-4">
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardContent className="p-2 space-y-2">
                  <h2 className="font-semibold text-sm my-1">🕘 Quá trình điều trị</h2>
                  <div className="text-xs max-h-[50vh] overflow-y-auto">
                    {dsDonCu.length === 0 && <p className="text-muted-foreground">Chưa có đơn thuốc nào.</p>}
                    {dsDonCu.length > 0 && (
                      <table className="min-w-full text-xs">
                        <thead>
                          <tr className="border-b">
                            <th className="text-left py-1">Ngày</th>
                            <th className="text-left py-1">Chẩn đoán</th>
                            <th className="text-left py-1">Đơn thuốc</th>
                            <th className="text-right py-1">Số tiền</th>
                          </tr>
                        </thead>
                        <tbody>
                          {dsDonCu.map((don) => (
                            <tr
                              key={don.id}
                              className={`border-b cursor-pointer transition-colors duration-300 ${don.id === highlightId ? 'bg-yellow-200 animate-pulse' : 'hover:bg-gray-100'}`}
                              onClick={() => suaDon(don)}
                            >
                              <td className="py-1">{new Date(don.ngay_kham).toLocaleString('vi-VN', { 
                                timeZone: 'Asia/Ho_Chi_Minh', 
                                hour12: false,
                                year: 'numeric',
                                month: '2-digit', 
                                day: '2-digit',
                                hour: '2-digit',
                                minute: '2-digit'
                              })}</td>
                              <td className="py-1">{don.chandoan || 'Không có chẩn đoán'}</td>
                              <td className="py-1">
                                {dsChiTietDonCu[don.id]?.map((item) => 
                                  `${item.thuoc.tenthuoc}`
                                ).join(', ') || 'Không có thuốc'}
                              </td>
                              <td className="text-right py-1">{(don.tongtien / 1000).toFixed(0)}k</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-2 space-y-2">
                  <h2 className="font-semibold text-sm my-1 flex justify-between items-center">
                    📈 Diễn tiến bệnh
                    <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                      <DialogTrigger asChild>
                        <Button size="sm" className="text-xs px-2 py-1">
                          Thêm
                        </Button>
                      </DialogTrigger>
                      <DialogContent>
                        <DialogHeader>
                          <DialogTitle>{editDienTien ? 'Sửa diễn tiến' : 'Thêm diễn tiến'}</DialogTitle>
                        </DialogHeader>
                        <div className="space-y-4">
                          <Input
                            type="date"
                            value={editDienTien ? editDienTien.ngay.slice(0, 10) : newDienTien.ngay}
                            onChange={(e) =>
                              editDienTien
                                ? setEditDienTien({ ...editDienTien, ngay: e.target.value })
                                : setNewDienTien({ ...newDienTien, ngay: e.target.value })
                            }
                          />
                          <Textarea
                            rows={4}
                            placeholder="Nhập diễn tiến bệnh..."
                            value={editDienTien ? editDienTien.noidung : newDienTien.noidung}
                            onChange={(e) =>
                              editDienTien
                                ? setEditDienTien({ ...editDienTien, noidung: e.target.value })
                                : setNewDienTien({ ...newDienTien, noidung: e.target.value })
                            }
                          />
                          <Button onClick={editDienTien ? suaDienTien : themDienTien}>
                            {editDienTien ? 'Lưu' : 'Thêm'}
                          </Button>
                        </div>
                      </DialogContent>
                    </Dialog>
                  </h2>
                  <div className="h-[48vh] overflow-y-auto">
                    {dsDienTien.length === 0 && (
                      <p className="text-xs text-muted-foreground">Chưa có diễn tiến nào.</p>
                    )}
                    {dsDienTien.map((d) => (
                      <div key={d.id} className="flex justify-between items-center border-b py-1">
                        <div>
                          <p className="text-xs font-semibold">{format(new Date(d.ngay), 'dd/MM/yyyy')}</p>
                          <p className="text-xs">{d.noidung}</p>
                        </div>
                        <div className="space-x-2">
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => {
                              setEditDienTien(d);
                              setOpenDialog(true);
                            }}
                          >
                            <Pencil className="w-4 h-4" />
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => xoaDienTien(d.id)}>
                            <Trash2 className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </CardContent>
              </Card>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Card>
                <CardContent className="p-2 space-y-2">
                  <h2 className="font-semibold text-sm my-1">🧪 Nhóm thuốc</h2>
                  <ul className="text-sm space-y-1 max-h-[40vh] overflow-y-auto">
                    <li
                      className={`cursor-pointer px-2 py-1 rounded ${selectedNhom === null ? 'bg-blue-100' : ''}`}
                      onClick={() => setSelectedNhom(null)}
                    >
                      Tất cả
                    </li>
                    {nhomThuoc.map((n) => (
                      <li
                        key={n.id}
                        className={`cursor-pointer px-2 py-1 rounded ${selectedNhom === n.id ? 'bg-blue-100' : 'hover:bg-gray-100'}`}
                        onClick={() => setSelectedNhom(n.id)}
                      >
                        {n.ten}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="p-2 space-y-2">
                  <h2 className="font-semibold text-sm my-1">💊 Danh sách thuốc</h2>
                  <Input
                    placeholder="Tìm thuốc..."
                    value={timThuoc}
                    onChange={(e) => setTimThuoc(e.target.value)}
                    className="text-sm py-1"
                  />
                  <ul className="text-sm max-h-[40vh] overflow-y-auto">
                    {danhSachThuocHienThi.map((t) => (
                      <li
                        key={t.id}
                        className={`cursor-pointer hover:bg-gray-100 px-2 py-1 ${dsChon.some((item) => item.thuoc.id === t.id) ? 'text-green-600' : ''}`}
                        onClick={() => themThuoc(t)}
                      >
                        {dsChon.some((item) => item.thuoc.id === t.id) && '✓ '} {t.tenthuoc}
                      </li>
                    ))}
                  </ul>
                </CardContent>
              </Card>
            </div>
          </div>

          <div className="col-span-3 space-y-4">
            {benhNhan ? (
                <Card>
                  <CardHeader className="py-2">
                    <div className="flex items-center justify-between gap-2">
                      <CardTitle className="text-lg my-1">Thông tin bệnh nhân</CardTitle>
                      <div className="flex items-center gap-2">
                        <Link href={`/ke-don-kinh?bn=${benhnhanid}`}>
                          <Button className="h-8 bg-orange-500 hover:bg-orange-600 text-white px-3" size="sm">
                            Kê đơn kính
                          </Button>
                        </Link>
                        <Button variant="outline" size="sm" className="h-8" onClick={openEditPatientDialog}>
                          <Pencil className="w-4 h-4 mr-2" /> Sửa BN
                        </Button>
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-1">
                    <div className="flex flex-wrap gap-4 text-sm">
                      <p>
                        Mã BN: <span className="font-bold">{benhNhan.id}</span>
                      </p>
                      <p>
                        Họ tên: <span className="font-bold">{benhNhan.ten}</span>
                      </p>
                      <p>
                        Ngày sinh: <span className="font-bold">{benhNhan.namsinh}</span>
                      </p>
                      <p>
                        {benhNhan.tuoi !== undefined && (
                          <>
                            Tuổi: <span className="font-bold">{benhNhan.tuoi}</span>
                          </>
                        )}
                      </p>
                      <p>
                        Điện thoại: <span className="font-bold">{benhNhan.dienthoai}</span>
                      </p>
                      <p>
                        Địa chỉ: <span className="font-bold">{benhNhan.diachi}</span>
                      </p>
                    </div>
                  </CardContent>
                </Card>
              ) : (
              <Card>
                <CardContent className="p-4">
                  <p className="text-sm text-muted-foreground">Không tìm thấy thông tin bệnh nhân.</p>
                </CardContent>
              </Card>
            )}

            <Card>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between mb-2">
                  <h2 className="text-lg font-semibold">
                    📝 Đơn thuốc đang kê {editDonThuocId ? '(Đang sửa)' : ''}
                  </h2>
                  <Dialog open={showMauDialog} onOpenChange={setShowMauDialog}>
                    <DialogTrigger asChild>
                      <Button 
                        variant="outline" 
                        size="sm"
                        onClick={() => {
                          setShowMauDialog(true);
                          fetchDonThuocMau();
                        }}
                      >
                        📋 Đơn mẫu
                      </Button>
                    </DialogTrigger>
                    <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
                      <DialogHeader>
                        <DialogTitle>Chọn đơn thuốc mẫu</DialogTitle>
                      </DialogHeader>
                      
                      {loadingMau ? (
                        <div className="text-center py-4">Đang tải...</div>
                      ) : dsMau.length === 0 ? (
                        <div className="text-center py-4 text-gray-500">
                          Không có đơn thuốc mẫu nào
                        </div>
                      ) : (
                        <div className="space-y-2">
                          {dsMau.map((mau) => (
                            <div 
                              key={mau.id} 
                              className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                              onClick={() => apDungDonMau(mau.id)}
                            >
                              <h3 className="font-semibold">{mau.ten_mau}</h3>
                              {mau.mo_ta && (
                                <p className="text-sm text-gray-600 mb-2">{mau.mo_ta}</p>
                              )}
                              <div className="text-xs text-gray-500">
        {/* Đã xóa dòng chuyên khoa và số lượng thuốc theo yêu cầu */}
                              </div>
                              {mau.chitiet && mau.chitiet.length > 0 && (
                                <div className="mt-2 text-xs">
                                  <strong>Thuốc:</strong> {mau.chitiet.map((ct: any) => 
                                    `${ct.thuoc.tenthuoc} x${ct.soluong}`
                                  ).join(', ')}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </DialogContent>
                  </Dialog>
                </div>
                <div className="space-y-2">
                  <div className="flex items-center gap-4">
                    <div className="flex-1">
                      <label className="text-sm font-semibold">Chẩn đoán</label>
                      <div className="relative">
                        <Input
                          ref={chandoanDesktopRef}
                          placeholder="Nhập chẩn đoán..."
                          value={chandoan}
                          onChange={(e) => handleChandoanChange(e.target.value)}
                          onFocus={() => chandoanSuggestions.length > 0 && setShowChandoanSuggestions(true)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter' && !showChandoanSuggestions) {
                              e.preventDefault();
                              searchDesktopRef.current?.focus();
                            } else if (e.key === 'ArrowDown' && showChandoanSuggestions) {
                              e.preventDefault();
                              setSelectedSuggestionIndex(prev => 
                                prev < chandoanSuggestions.length - 1 ? prev + 1 : prev
                              );
                            } else if (e.key === 'ArrowUp' && showChandoanSuggestions) {
                              e.preventDefault();
                              setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
                            } else if (e.key === 'Enter' && showChandoanSuggestions && selectedSuggestionIndex >= 0) {
                              e.preventDefault();
                              selectChandoanSuggestion(chandoanSuggestions[selectedSuggestionIndex]);
                            }
                          }}
                          className="text-sm py-1"
                        />
                        {showChandoanSuggestions && chandoanSuggestions.length > 0 && (
                          <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded shadow-lg z-50 max-h-48 overflow-y-auto">
                            {chandoanSuggestions.map((suggestion, idx) => (
                              <div
                                key={idx}
                                className={`px-3 py-2 cursor-pointer text-sm ${
                                  idx === selectedSuggestionIndex ? 'bg-blue-100' : 'hover:bg-gray-100'
                                } border-b last:border-b-0`}
                                onClick={() => selectChandoanSuggestion(suggestion)}
                              >
                                {suggestion}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>
                    <div>
                      <label className="text-sm font-semibold">Ngày giờ khám</label>
                      <div className="flex items-center gap-1">
                        <Input
                          type="datetime-local"
                          value={ngayKham}
                          onChange={(e) => setNgayKham(e.target.value)}
                          className="text-sm py-1 flex-1"
                          style={{ colorScheme: 'light' }}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 w-8 p-0"
                          onClick={() => {
                            const now = new Date();
                            const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000));
                            setNgayKham(vietnamTime.toISOString().slice(0, 16));
                          }}
                          title="Đặt về thời gian hiện tại"
                        >
                          <span role="img" aria-label="calendar">📅</span>
                        </Button>
                      </div>
                    </div>
                  </div>
                  <div>
                    <label className="text-sm font-semibold">Thêm thuốc vào đơn</label>
                    <Input
                      ref={searchDesktopRef}
                      placeholder="Tìm thuốc để thêm..."
                      value={timThuocDonDangKe}
                      onChange={(e) => {
                        setTimThuocDonDangKe(e.target.value);
                        setHighlightedIndex(-1); // Reset highlighted index when typing
                      }}
                      onKeyDown={handleKeyDown}
                      className="text-sm py-1"
                    />
                    {timThuocDonDangKe && (
                      <ul className="text-sm max-h-40 overflow-y-auto bg-white border rounded-md mt-1">
                        {danhSachThuocDonDangKe.map((t, index) => (
                          <li
                            key={t.id}
                            className={`cursor-pointer px-2 py-1 ${index === highlightedIndex ? 'bg-blue-100' : 'hover:bg-gray-100'} ${dsChon.some((item) => item.thuoc.id === t.id) ? 'text-green-600' : ''}`}
                            onClick={() => themThuoc(t)}
                          >
                            {dsChon.some((item) => item.thuoc.id === t.id) && '✓ '} {t.tenthuoc}
                          </li>
                        ))}
                        {danhSachThuocDonDangKe.length === 0 && (
                          <li className="px-2 py-1 text-muted-foreground">Không tìm thấy thuốc</li>
                        )}
                      </ul>
                    )}
                  </div>
                </div>
                {dsChon.length === 0 && <p className="text-sm text-muted-foreground">Chưa có thuốc nào được chọn.</p>}
                {dsChon.length > 0 && (
                  <table className="min-w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-center py-1">TT</th>
                        <th className="text-left py-1">Tên</th>
                        <th className="text-center py-1">Đơn vị</th>
                        <th className="text-center py-1">SL</th>
                        <th className="text-left py-1">Cách dùng</th>
                        <th className="text-left py-1">Hoạt chất</th>
                        <th className="text-right py-1">Đơn giá</th>
                        <th className="text-right py-1">Thành tiền</th>
                        <th className="py-1"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {dsChon.map((item, idx) => (
                        <tr
                          key={item.thuoc.id}
                          className={`border-b ${item.thuoc.donvitinh.toLowerCase().includes('lần') ? 'bg-yellow-100' : ''}`}
                        >
                          <td className="text-center py-1">{idx + 1}</td>
                          <td className="py-1">
                            {item.thuoc.tenthuoc}
                          </td>
                          <td className="text-center py-1">{item.thuoc.donvitinh}</td>
                          <td className="text-center py-1">
                            <Input
                              type="number"
                              className="w-12 text-sm py-1 px-2 rounded-md border with-spinner"
                              min={1}
                              step={1}
                              value={item.soluongInput !== undefined ? item.soluongInput : String(item.soluong)}
                              onChange={(e) => {
                                const raw = e.target.value;
                                setDsChon((prev) => {
                                  const updated = [...prev];
                                  updated[idx].soluongInput = raw;
                                  if (raw !== '') {
                                    const parsed = parseInt(raw, 10);
                                    if (!Number.isNaN(parsed)) {
                                      updated[idx].soluong = parsed;
                                    }
                                  }
                                  return updated;
                                });
                              }}
                              onBlur={() => {
                                setDsChon((prev) => {
                                  const updated = [...prev];
                                  const buf = updated[idx].soluongInput;
                                  const parsed = buf !== undefined && buf !== '' ? parseInt(buf, 10) : NaN;
                                  if (Number.isNaN(parsed) || parsed < 1) {
                                    updated[idx].soluong = 1;
                                  } else {
                                    updated[idx].soluong = parsed;
                                  }
                                  delete updated[idx].soluongInput;
                                  return updated;
                                });
                              }}
                            />
                          </td>
                          <td className="py-1">
                            <Input
                              className="text-sm py-1 px-2 rounded-md border"
                              value={item.cachdung}
                              onChange={(e) => {
                                const val = e.target.value;
                                setDsChon((prev) => {
                                  const updated = [...prev];
                                  updated[idx].cachdung = val;
                                  return updated;
                                });
                              }}
                            />
                          </td>
                          <td className="py-1">{item.thuoc.hoatchat || '-'}</td>
                          <td className="text-right py-1">{item.thuoc.giaban.toLocaleString()}</td>
                          <td className="text-right py-1">{(item.soluong * item.thuoc.giaban).toLocaleString()}</td>
                          <td className="py-1">
                            <Button size="sm" variant="ghost" onClick={() => xoaThuoc(item.thuoc.id)}>
                              <Trash2 className="w-4 h-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                )}
                <div className="flex justify-between items-center pt-2">
                  <div className="flex items-center gap-4">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id="ghiNo"
                        checked={ghiNo}
                        onChange={(e) => setGhiNo(e.target.checked)}
                        className="w-4 h-4 border-gray-300 rounded focus:ring-blue-500"
                      />
                      <label htmlFor="ghiNo" className="text-sm font-semibold">
                        Ghi nợ
                      </label>
                    </div>
                    {ghiNo && (
                      <div className="flex gap-4">
                        <div>
                          <label className="text-sm font-semibold">Đã thanh toán (nghìn VND)</label>
                          <Input
                            type="number"
                            value={sotienDaThanhToanInput}
                            onChange={(e) => {
                              const val = e.target.value;
                              const raw = val ? +val * 1000 : 0;
                              const clamped = Math.max(0, Math.min(raw, tongTien));
                              if (raw !== clamped) {
                                setSotienDaThanhToanInput((clamped / 1000).toString());
                              } else {
                                setSotienDaThanhToanInput(val);
                              }
                              setSotienDaThanhToan(clamped);
                            }}
                            placeholder="Nhập số tiền (nghìn)"
                            className="text-sm py-1 w-24"
                          />
                        </div>
                        <div>
                          <label className="text-sm font-semibold">Còn nợ</label>
                          <Input
                            value={sotienConNo.toLocaleString()}
                            disabled
                            className="text-sm py-1 w-24 bg-gray-100"
                          />
                        </div>
                      </div>
                    )}
                  </div>
                  <div className="text-right font-semibold">
                    Tổng tiền: {tongTien.toLocaleString()} VND
                    <div className="flex gap-2 mt-2">
                      {!editDonThuocId && (
                        <Button
                          className="bg-blue-600 hover:bg-orange-400"
                          onClick={luuDonThuoc}
                          disabled={!chandoan || dsChon.length === 0}
                        >
                          <span className="flex flex-col leading-tight items-center">
                            <span>Lưu đơn thuốc</span>
                            <span className="text-[10px] font-normal">Ctrl+Enter</span>
                          </span>
                        </Button>
                      )}
                      {editDonThuocId && (
                        <>
                          <Button
                            className="bg-blue-600 hover:bg-orange-400"
                            onClick={luuDonThuoc}
                            disabled={!chandoan || dsChon.length === 0}
                          >
                            <span className="flex flex-col leading-tight items-center">
                              <span>Cập nhật đơn</span>
                              <span className="text-[10px] font-normal">Ctrl+Enter</span>
                            </span>
                          </Button>
                          <Button
                            className="bg-blue-600 hover:bg-orange-400"
                            onClick={() => saoChepDonDangSua()}
                          >
                            Sao chép đơn
                          </Button>
                        </>
                      )}
                      <Button
                        className="bg-blue-600 hover:bg-orange-400"
                        onClick={resetForm}
                      >
                        <FilePlus className="w-4 h-4 mr-2" /> Đơn mới
                      </Button>
                      {editDonThuocId && (
                        <Button
                          className="bg-red-500 hover:bg-orange-400"
                          onClick={() => xoaDon(editDonThuocId)}
                        >
                          Xóa đơn
                        </Button>
                      )}
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
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