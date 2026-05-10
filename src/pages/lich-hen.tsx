'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Phone, MessageSquare, Check, X, Trash2, CalendarDays, Clock, RefreshCw, Copy, Pencil, Plus, Settings, AlertTriangle } from 'lucide-react';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Input } from '../components/ui/input';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import Link from 'next/link';
import { Textarea } from '../components/ui/textarea';

interface HenKham {
  id: number;
  benhnhanid: number;
  donkinhid: number | null;
  ten_benhnhan: string;
  dienthoai: string;
  ngay_hen: string;
  gio_hen: string | null;
  ly_do: string;
  trang_thai: string; // 'cho' | 'da_den' | 'huy' | 'qua_han'
  ghichu: string;
  created_at: string;
}

type FilterTab = 'hom_nay' | '7_ngay_toi' | '1_thang_toi' | 'khoang_ngay';

const TRANG_THAI_MAP: Record<string, { label: string; color: string; bg: string }> = {
  cho: { label: 'Chờ', color: 'text-yellow-700', bg: 'bg-yellow-100' },
  da_den: { label: 'Đã đến', color: 'text-green-700', bg: 'bg-green-100' },
  huy: { label: 'Hủy', color: 'text-red-700', bg: 'bg-red-100' },
  qua_han: { label: 'Quá hạn', color: 'text-gray-700', bg: 'bg-gray-200' },
};

function getToday(): string {
  const d = new Date();
  d.setHours(d.getHours() + 7); // UTC+7
  return d.toISOString().split('T')[0];
}

function formatNgay(d: string): string {
  if (!d) return '';
  const parts = d.split('-');
  if (parts.length === 3) return `${parts[2]}/${parts[1]}/${parts[0]}`;
  return d;
}

function formatGio(t: string | null): string {
  if (!t) return '';
  return t.substring(0, 5); // "HH:mm"
}

function getDaysDiff(dateStr: string): number {
  const today = new Date(getToday());
  const target = new Date(dateStr);
  return Math.round((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getCountdownLabel(dateStr: string, trangThai: string): { text: string; className: string } | null {
  if (trangThai !== 'cho' && trangThai !== 'qua_han') return null;
  const diff = getDaysDiff(dateStr);
  if (diff < 0) return { text: `Quá hạn ${Math.abs(diff)} ngày`, className: 'text-red-600 bg-red-50 border border-red-200' };
  if (diff === 0) return { text: 'Hôm nay', className: 'text-orange-700 bg-orange-100 border border-orange-200 font-bold' };
  if (diff === 1) return { text: 'Ngày mai', className: 'text-orange-600 bg-orange-50 border border-orange-200' };
  if (diff <= 3) return { text: `Còn ${diff} ngày`, className: 'text-yellow-700 bg-yellow-50 border border-yellow-200' };
  if (diff <= 7) return { text: `Còn ${diff} ngày`, className: 'text-blue-600 bg-blue-50 border border-blue-200' };
  return { text: `Còn ${diff} ngày`, className: 'text-gray-500 bg-gray-50 border border-gray-200' };
}

function addDaysFromToday(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return d.toISOString().split('T')[0];
}

const MOBILE_SWIPE_ACTION_WIDTH = 180;
const MOBILE_SWIPE_OPEN_THRESHOLD = 80;

export default function LichHen() {
  const { confirm } = useConfirm();
  const [data, setData] = useState<HenKham[]>([]);
  const [loading, setLoading] = useState(false);
  const [tab, setTab] = useState<FilterTab>('hom_nay');
  const [fromDate, setFromDate] = useState(getToday());
  const [toDate, setToDate] = useState(getToday());
  const [filterTrangThai, setFilterTrangThai] = useState('tat_ca');
  const [search, setSearch] = useState('');

  // SMS dialog
  const [openSms, setOpenSms] = useState(false);
  const [smsTarget, setSmsTarget] = useState<HenKham | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState(0);

  // Zalo dialog
  const [openZalo, setOpenZalo] = useState(false);
  const [zaloTarget, setZaloTarget] = useState<HenKham | null>(null);
  const [selectedZaloTemplate, setSelectedZaloTemplate] = useState(0);

  // Quản lý mẫu tin nhắn tùy chỉnh
  const [openTemplateManager, setOpenTemplateManager] = useState(false);
  const [customTemplates, setCustomTemplates] = useState<{ label: string; text: string }[]>([]);
  const [editingTemplate, setEditingTemplate] = useState<{ index: number; label: string; text: string } | null>(null);

  // Load custom templates từ localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem('custom_sms_templates');
      if (saved) setCustomTemplates(JSON.parse(saved));
    } catch { /* ignore */ }
  }, []);

  const saveCustomTemplates = (templates: { label: string; text: string }[]) => {
    setCustomTemplates(templates);
    localStorage.setItem('custom_sms_templates', JSON.stringify(templates));
  };

  // Thêm lịch hẹn mới dialog
  const [openAdd, setOpenAdd] = useState(false);
  const [addForm, setAddForm] = useState({ ten_benhnhan: '', dienthoai: '', ngay_hen: getToday(), gio_hen: '08:00', ly_do: 'Tái khám', ghichu: '' });
  const lyDoOptions = ['Lấy kính', 'Kiểm tra kính mới', 'Tái khám', 'Khác'];

  // Edit dialog
  const [openEdit, setOpenEdit] = useState(false);
  const [editForm, setEditForm] = useState({ id: 0, ngay_hen: '', gio_hen: '', ly_do: '', ghichu: '' });

  // Patient search in Add dialog
  const [patientSearch, setPatientSearch] = useState('');
  const [patientResults, setPatientResults] = useState<{ id: number; ten: string; dienthoai: string }[]>([]);
  const [selectedPatientId, setSelectedPatientId] = useState<number>(0);
  const [searchingPatient, setSearchingPatient] = useState(false);

  // Debounce patient search
  useEffect(() => {
    if (!patientSearch.trim()) { setPatientResults([]); return; }
    const timer = setTimeout(async () => {
      setSearchingPatient(true);
      try {
        const res = await axios.get(`/api/benh-nhan?search=${encodeURIComponent(patientSearch)}&pageSize=10&_t=${Date.now()}`);
        setPatientResults(res.data.data || []);
      } catch { /* ignore */ }
      setSearchingPatient(false);
    }, 300);
    return () => clearTimeout(timer);
  }, [patientSearch]);

  const getBuiltInTemplates = (hen: HenKham | null) => {
    if (!hen) return [];
    const ten = hen.ten_benhnhan || 'Anh/Chị';
    const ngay = formatNgay(hen.ngay_hen);
    const gio = formatGio(hen.gio_hen);
    const thoiGian = gio ? `vào ${ngay} lúc ${gio}` : `vào ${ngay}`;
    return [
      { label: 'Nhắc lịch', text: `Xin chào ${ten}, phòng khám nhắc bạn có lịch hẹn ${thoiGian}. Vui lòng đến đúng giờ ạ.` },
      { label: 'Lấy kính', text: `Xin chào ${ten}, kính của bạn đã làm xong, mời bạn đến lấy vào ${ngay} ạ.` },
      { label: 'Tái khám', text: `Xin chào ${ten}, đã đến lịch tái khám định kỳ của bạn. Phòng khám mời bạn đến vào ${ngay} ạ.` },
      { label: 'Nhắc trước 1 ngày', text: `Xin chào ${ten}, nhắc bạn ngày mai ${ngay} có lịch hẹn tại phòng khám. Hẹn gặp bạn ạ.` },
    ];
  };

  // Gộp mẫu có sẵn + mẫu tùy chỉnh, thay thế [Tên] [Ngày] [Giờ] trong mẫu custom
  const getAllTemplates = (hen: HenKham | null) => {
    const builtIn = getBuiltInTemplates(hen);
    if (!hen) return builtIn;
    const ten = hen.ten_benhnhan || 'Anh/Chị';
    const ngay = formatNgay(hen.ngay_hen);
    const gio = formatGio(hen.gio_hen) || '';
    const custom = customTemplates.map(t => ({
      label: t.label + ' ✏️',
      text: t.text
        .replace(/\[Tên\]/gi, ten)
        .replace(/\[Ngày\]/gi, ngay)
        .replace(/\[Giờ\]/gi, gio),
    }));
    return [...builtIn, ...custom];
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      let from = '', to = '';
      if (tab === 'hom_nay') {
        from = to = getToday();
      } else if (tab === '7_ngay_toi') {
        from = getToday();
        const d = new Date();
        d.setHours(d.getHours() + 7);
        d.setDate(d.getDate() + 6);
        to = d.toISOString().split('T')[0];
      } else if (tab === '1_thang_toi') {
        from = getToday();
        const d = new Date();
        d.setHours(d.getHours() + 7);
        d.setMonth(d.getMonth() + 1);
        to = d.toISOString().split('T')[0];
      } else {
        from = fromDate;
        to = toDate;
      }

      const params = new URLSearchParams();
      params.set('from', from);
      params.set('to', to);
      if (filterTrangThai !== 'tat_ca') params.set('trang_thai', filterTrangThai);
      params.set('_t', Date.now().toString());

      const res = await axios.get(`/api/hen-kham-lai?${params.toString()}`, {
        headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' },
      });
      const items: HenKham[] = res.data.data || [];

      // Auto-mark overdue appointments as qua_han
      const today = getToday();
      const overdueIds = items.filter(h => h.trang_thai === 'cho' && h.ngay_hen < today).map(h => h.id);
      if (overdueIds.length > 0) {
        await Promise.all(overdueIds.map(id =>
          axios.put('/api/hen-kham-lai', { id, trang_thai: 'qua_han' }).catch(() => {})
        ));
        // Update local data
        items.forEach(h => {
          if (overdueIds.includes(h.id)) h.trang_thai = 'qua_han';
        });
      }

      setData(items);
    } catch {
      toast.error('Lỗi khi tải lịch hẹn');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [tab, filterTrangThai]);

  const filteredData = useMemo(() => {
    if (!search.trim()) return data;
    const s = search.toLowerCase();
    return data.filter(h =>
      h.ten_benhnhan?.toLowerCase().includes(s) ||
      h.dienthoai?.includes(s) ||
      h.ly_do?.toLowerCase().includes(s)
    );
  }, [data, search]);

  const [expandedCardId, setExpandedCardId] = useState<number | null>(null);
  const [swipedCardId, setSwipedCardId] = useState<number | null>(null);
  const [draggingCardId, setDraggingCardId] = useState<number | null>(null);
  const [dragOffsetX, setDragOffsetX] = useState(0);
  const dragOffsetRef = useRef(0);
  const swipeStartXRef = useRef(0);
  const swipeCardIdRef = useRef<number | null>(null);
  const swipeMovedRef = useRef(false);

  useEffect(() => {
    if (filteredData.length === 0) {
      setExpandedCardId(null);
      setSwipedCardId(null);
      return;
    }

    if (!expandedCardId || !filteredData.some(item => item.id === expandedCardId)) {
      setExpandedCardId(filteredData[0].id);
    }

    if (swipedCardId && !filteredData.some(item => item.id === swipedCardId)) {
      setSwipedCardId(null);
    }
  }, [filteredData, expandedCardId, swipedCardId]);

  const openEditDialog = (hen: HenKham) => {
    setEditForm({
      id: hen.id,
      ngay_hen: hen.ngay_hen,
      gio_hen: hen.gio_hen ? formatGio(hen.gio_hen) : '',
      ly_do: hen.ly_do || '',
      ghichu: hen.ghichu || '',
    });
    setOpenEdit(true);
  };

  const openSmsDialog = (hen: HenKham) => {
    setSmsTarget(hen);
    setSelectedTemplate(0);
    setOpenSms(true);
  };

  const openZaloDialog = (hen: HenKham) => {
    setZaloTarget(hen);
    setSelectedZaloTemplate(0);
    setOpenZalo(true);
  };

  const getCardTranslateX = (id: number) => {
    if (draggingCardId === id) return dragOffsetX;
    return swipedCardId === id ? -MOBILE_SWIPE_ACTION_WIDTH : 0;
  };

  const handleCardTouchStart = (id: number, clientX: number) => {
    swipeCardIdRef.current = id;
    swipeStartXRef.current = clientX;
    swipeMovedRef.current = false;
    setDraggingCardId(id);
    const initialOffset = swipedCardId === id ? -MOBILE_SWIPE_ACTION_WIDTH : 0;
    dragOffsetRef.current = initialOffset;
    setDragOffsetX(initialOffset);
  };

  const handleCardTouchMove = (id: number, clientX: number) => {
    if (swipeCardIdRef.current !== id) return;

    const deltaX = clientX - swipeStartXRef.current;
    const base = swipedCardId === id ? -MOBILE_SWIPE_ACTION_WIDTH : 0;
    let nextOffset = base + deltaX;

    // Chỉ cho phép vuốt trái để mở action; vuốt phải chỉ dùng để đóng action đã mở.
    if (swipedCardId !== id && nextOffset > 0) {
      nextOffset = 0;
    }

    if (Math.abs(deltaX) > 8) {
      swipeMovedRef.current = true;
    }

    nextOffset = Math.max(-MOBILE_SWIPE_ACTION_WIDTH, Math.min(0, nextOffset));
    dragOffsetRef.current = nextOffset;
    setDragOffsetX(nextOffset);
  };

  const handleCardTouchEnd = (id: number) => {
    if (swipeCardIdRef.current !== id) return;

    const shouldOpen = dragOffsetRef.current <= -MOBILE_SWIPE_OPEN_THRESHOLD;
    setSwipedCardId(shouldOpen ? id : null);
    setDraggingCardId(null);
    setDragOffsetX(0);
    dragOffsetRef.current = 0;
    swipeCardIdRef.current = null;
  };

  const handleCardTap = (id: number) => {
    if (swipeMovedRef.current) {
      swipeMovedRef.current = false;
      return;
    }

    if (swipedCardId === id) {
      setSwipedCardId(null);
      return;
    }

    setExpandedCardId(prev => (prev === id ? null : id));
  };

  const resetSwipeGesture = () => {
    setDraggingCardId(null);
    setDragOffsetX(0);
    dragOffsetRef.current = 0;
    swipeCardIdRef.current = null;
    swipeMovedRef.current = false;
  };

  const updateTrangThai = async (id: number, trang_thai: string) => {
    try {
      await axios.put('/api/hen-kham-lai', { id, trang_thai });
      const successMessage = {
        da_den: 'Đã đánh dấu đến',
        cho: 'Đã chuyển về trạng thái chưa đến',
        huy: 'Đã hủy lịch hẹn',
        qua_han: 'Đã đánh dấu quá hạn',
      }[trang_thai] || 'Đã cập nhật trạng thái';
      toast.success(successMessage);
      fetchData();
    } catch {
      toast.error('Lỗi khi cập nhật');
    }
  };

  const deleteHen = async (id: number) => {
    if (!await confirm('Xóa lịch hẹn này?')) return;
    try {
      await axios.delete(`/api/hen-kham-lai?id=${id}`);
      toast.success('Đã xóa');
      fetchData();
    } catch {
      toast.error('Lỗi khi xóa');
    }
  };

  const editHenKham = async () => {
    if (!editForm.ngay_hen) { toast.error('Vui lòng chọn ngày hẹn'); return; }
    try {
      await axios.put('/api/hen-kham-lai', {
        id: editForm.id,
        ngay_hen: editForm.ngay_hen,
        gio_hen: editForm.gio_hen || null,
        ly_do: editForm.ly_do,
        ghichu: editForm.ghichu,
      });
      toast.success('Đã cập nhật lịch hẹn');
      setOpenEdit(false);
      fetchData();
    } catch {
      toast.error('Lỗi khi cập nhật lịch hẹn');
    }
  };

  const reschedule = useCallback(async (id: number, days: number) => {
    const newDate = addDaysFromToday(days);
    try {
      await axios.put('/api/hen-kham-lai', { id, ngay_hen: newDate, trang_thai: 'cho' });
      toast.success(`Đã dời lịch → ${formatNgay(newDate)}`);
      fetchData();
    } catch {
      toast.error('Lỗi khi dời lịch');
    }
  }, []);

  const addHenKham = async () => {
    if (!addForm.ten_benhnhan || !addForm.ngay_hen) {
      toast.error('Vui lòng nhập tên và ngày hẹn');
      return;
    }
    try {
      await axios.post('/api/hen-kham-lai', {
        benhnhanid: selectedPatientId || 0,
        ten_benhnhan: addForm.ten_benhnhan,
        dienthoai: addForm.dienthoai,
        ngay_hen: addForm.ngay_hen,
        gio_hen: addForm.gio_hen || null,
        ly_do: addForm.ly_do,
        ghichu: addForm.ghichu,
      });
      toast.success('Đã thêm lịch hẹn');
      setOpenAdd(false);
      setAddForm({ ten_benhnhan: '', dienthoai: '', ngay_hen: getToday(), gio_hen: '08:00', ly_do: 'Tái khám', ghichu: '' });
      setSelectedPatientId(0);
      setPatientSearch('');
      setPatientResults([]);
      fetchData();
    } catch {
      toast.error('Lỗi khi thêm lịch hẹn');
    }
  };

  const stats = useMemo(() => ({
    total: data.length,
    cho: data.filter(h => h.trang_thai === 'cho').length,
    da_den: data.filter(h => h.trang_thai === 'da_den').length,
    huy: data.filter(h => h.trang_thai === 'huy').length,
    qua_han: data.filter(h => h.trang_thai === 'qua_han').length,
  }), [data]);

  const pendingOverdueCount = useMemo(() => (
    data.filter(h => h.trang_thai === 'cho' && h.ngay_hen < getToday()).length
  ), [data]);

  const currentRangeLabel = useMemo(() => {
    if (tab === 'hom_nay') return 'Hôm nay';
    if (tab === '7_ngay_toi') return '7 ngày tới';
    if (tab === '1_thang_toi') return '1 tháng tới';
    return `${formatNgay(fromDate)} - ${formatNgay(toDate)}`;
  }, [tab, fromDate, toDate]);

  const statusQuickFilters = [
    {
      key: 'tat_ca',
      label: 'Tổng',
      count: stats.total,
      countClass: 'text-blue-700',
      dotClass: 'bg-blue-500',
      activeClass: 'border-blue-400 bg-blue-50 ring-1 ring-blue-200'
    },
    {
      key: 'cho',
      label: 'Đang chờ',
      count: stats.cho,
      countClass: 'text-yellow-700',
      dotClass: 'bg-yellow-500',
      activeClass: 'border-yellow-400 bg-yellow-50 ring-1 ring-yellow-200'
    },
    {
      key: 'da_den',
      label: 'Đã đến',
      count: stats.da_den,
      countClass: 'text-green-700',
      dotClass: 'bg-green-500',
      activeClass: 'border-green-400 bg-green-50 ring-1 ring-green-200'
    },
    {
      key: 'huy',
      label: 'Đã hủy',
      count: stats.huy,
      countClass: 'text-red-700',
      dotClass: 'bg-red-500',
      activeClass: 'border-red-400 bg-red-50 ring-1 ring-red-200'
    },
    {
      key: 'qua_han',
      label: 'Quá hạn',
      count: stats.qua_han,
      countClass: 'text-slate-700',
      dotClass: 'bg-slate-500',
      activeClass: 'border-slate-400 bg-slate-100 ring-1 ring-slate-200'
    },
  ] as const;

  // Batch mark all overdue as qua_han + notify
  const batchMarkOverdue = useCallback(async () => {
    const overdueItems = data.filter(h => h.trang_thai === 'cho' && h.ngay_hen < getToday());
    if (overdueItems.length === 0) { toast('Không có lịch hẹn quá hạn nào cần xử lý'); return; }
    if (!await confirm(`Đánh dấu ${overdueItems.length} lịch hẹn là quá hạn?`)) return;
    try {
      await Promise.all(overdueItems.map(h => axios.put('/api/hen-kham-lai', { id: h.id, trang_thai: 'qua_han' })));
      toast.success(`Đã đánh dấu ${overdueItems.length} lịch hẹn quá hạn`);
      fetchData();
    } catch { toast.error('Lỗi khi cập nhật'); }
  }, [data, confirm, fetchData]);

  // Batch reschedule all overdue
  const batchRescheduleOverdue = useCallback(async (days: number) => {
    const overdueItems = data.filter(h => h.trang_thai === 'qua_han' || (h.trang_thai === 'cho' && h.ngay_hen < getToday()));
    if (overdueItems.length === 0) { toast('Không có lịch hẹn quá hạn nào'); return; }
    if (!await confirm(`Dời ${overdueItems.length} lịch hẹn quá hạn thêm ${days} ngày?`)) return;
    const newDate = addDaysFromToday(days);
    try {
      await Promise.all(overdueItems.map(h => axios.put('/api/hen-kham-lai', { id: h.id, ngay_hen: newDate, trang_thai: 'cho' })));
      toast.success(`Đã dời ${overdueItems.length} lịch hẹn → ${formatNgay(newDate)}`);
      fetchData();
    } catch { toast.error('Lỗi khi dời lịch'); }
  }, [data, confirm, fetchData]);

  return (
    <ProtectedRoute>
      <FeatureGate feature="appointments">
      <div className="min-h-screen bg-[#d8d9dd]">
        <div className="mx-auto min-h-screen w-full bg-[#d8d9dd] pb-28 lg:hidden">
          <div className="bg-[#1f74cc] px-4 pb-5 pt-5 lg:px-6 lg:pb-6 lg:pt-6">
            <div className="mb-4 flex items-center justify-between gap-2">
              <h1 className="text-[23px] font-semibold leading-none text-white lg:text-2xl">Lịch hẹn</h1>
              <div className="flex items-center gap-2">
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#ffd954]" />
                  Chờ {stats.cho}
                </div>
                <div className="inline-flex items-center gap-1.5 rounded-full bg-white/15 px-3 py-1.5 text-[12px] font-semibold text-white">
                  <span className="h-2.5 w-2.5 rounded-full bg-[#60f0b2]" />
                  Đến {stats.da_den}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-4 gap-1 rounded-2xl bg-[#1d67b4] p-1.5">
              {([['hom_nay', 'Hôm nay'], ['7_ngay_toi', '7 ngày'], ['1_thang_toi', '1 tháng'], ['khoang_ngay', 'Khoảng']] as const).map(([key, label]) => (
                <button
                  key={key}
                  type="button"
                  onClick={() => setTab(key)}
                  className={`rounded-xl py-2 text-[13px] font-semibold leading-none transition-colors ${tab === key ? 'bg-white text-[#1f74cc]' : 'text-white/70'}`}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          <div className="border-b border-[#cfd2d8] bg-[#d8d9dd] px-3 py-3 lg:px-6 lg:py-4">
            <div>
              <Input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Tìm tên, SĐT..."
                className="h-11 w-full rounded-xl border border-[#ccd1d9] bg-white px-4 text-[14px] placeholder:text-slate-500 focus-visible:ring-1 focus-visible:ring-[#1f74cc]"
              />
            </div>

            {tab === 'khoang_ngay' && (
              <div className="mt-2 space-y-2">
                <div className="grid grid-cols-2 gap-2">
                  <Input type="date" className="h-10 rounded-xl bg-white" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                  <Input type="date" className="h-10 rounded-xl bg-white" value={toDate} onChange={e => setToDate(e.target.value)} />
                </div>
                <button
                  type="button"
                  className="h-9 w-full rounded-xl bg-[#1f74cc] text-[12px] font-semibold text-white"
                  onClick={fetchData}
                >
                  Áp dụng khoảng ngày
                </button>
              </div>
            )}
          </div>

          <div className="space-y-2 px-3 py-3 lg:space-y-3 lg:px-6 lg:py-4">
            {loading ? (
              <div className="py-8 text-center text-sm text-slate-500">Đang tải...</div>
            ) : filteredData.length === 0 ? (
              <div className="py-8 text-center text-sm text-slate-500">Không có lịch hẹn nào</div>
            ) : (
              filteredData.map(hen => {
                const st = TRANG_THAI_MAP[hen.trang_thai] || TRANG_THAI_MAP.cho;
                const countdown = getCountdownLabel(hen.ngay_hen, hen.trang_thai);
                const isExpanded = expandedCardId === hen.id;
                const isWaiting = hen.trang_thai === 'cho' || hen.trang_thai === 'qua_han';
                const translateX = getCardTranslateX(hen.id);
                return (
                  <div key={hen.id} className="relative overflow-hidden rounded-xl border border-[#d5d1ca] bg-white shadow-sm">
                    <div className="absolute inset-y-0 right-0 flex w-[180px]">
                      <button
                        type="button"
                        className="flex-1 bg-[#ece9e2] text-sm font-semibold text-slate-700"
                        onClick={() => {
                          setSwipedCardId(null);
                          openEditDialog(hen);
                        }}
                      >
                        Sửa
                      </button>
                      <button
                        type="button"
                        className="flex-1 bg-[#fde3e3] text-sm font-semibold text-red-700"
                        onClick={() => {
                          setSwipedCardId(null);
                          updateTrangThai(hen.id, 'huy');
                        }}
                      >
                        Hủy
                      </button>
                      <button
                        type="button"
                        className="flex-1 bg-[#dc2626] text-sm font-semibold text-white"
                        onClick={() => {
                          setSwipedCardId(null);
                          deleteHen(hen.id);
                        }}
                      >
                        Xóa
                      </button>
                    </div>

                    <div
                      className={`relative bg-white px-3.5 py-3.5 ${draggingCardId === hen.id ? '' : 'transition-transform duration-200 ease-out'}`}
                      style={{ transform: `translateX(${translateX}px)` }}
                      onTouchStart={(e) => handleCardTouchStart(hen.id, e.touches[0].clientX)}
                      onTouchMove={(e) => handleCardTouchMove(hen.id, e.touches[0].clientX)}
                      onTouchEnd={() => handleCardTouchEnd(hen.id)}
                      onTouchCancel={resetSwipeGesture}
                      onClick={() => handleCardTap(hen.id)}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <Link
                          href={hen.benhnhanid ? `/ke-don-kinh?bn=${hen.benhnhanid}` : '#'}
                          className={`truncate text-[18px] font-semibold ${hen.trang_thai === 'da_den' ? 'text-slate-500 line-through' : 'text-slate-900'}`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          {hen.ten_benhnhan || 'Không tên'}
                        </Link>
                        <div className="flex items-center gap-1.5">
                          <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${st.bg} ${st.color}`}>
                            {st.label}
                          </span>
                          {countdown && (
                            <span className={`rounded-full px-2.5 py-1 text-[12px] font-semibold ${countdown.className}`}>
                              {countdown.text}
                            </span>
                          )}
                        </div>
                      </div>

                      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-slate-800">
                        <span className="inline-flex items-center gap-1">
                          <CalendarDays className="h-4 w-4" />
                          {formatNgay(hen.ngay_hen)}
                        </span>
                        {hen.dienthoai && <span>· {hen.dienthoai}</span>}
                        {hen.ly_do && <span>· {hen.ly_do}</span>}
                      </div>

                      {hen.ghichu && (
                        <p className="mt-1 text-[13px] text-slate-700">{hen.ghichu}</p>
                      )}

                      {isExpanded && (
                        <div className="mt-3 space-y-2.5 border-t border-[#d8d5cf] pt-2.5">
                          {isWaiting && (
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span className="text-[13px] text-slate-700">Dời:</span>
                              {[
                                { days: 7, label: '+7 ngày' },
                                { days: 14, label: '+14 ngày' },
                                { days: 30, label: '+1 tháng' },
                              ].map(({ days, label }) => (
                                <button
                                  key={days}
                                  type="button"
                                  className="rounded-full border border-[#8dc2ff] bg-[#e9f4ff] px-3 py-1 text-[12px] font-medium text-[#1f74cc]"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    reschedule(hen.id, days);
                                  }}
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}

                          <div className="grid grid-cols-4 gap-1.5">
                            {hen.dienthoai && (
                              <a
                                href={`tel:${hen.dienthoai}`}
                                className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#dfe9d8] text-[13px] font-semibold text-[#2d7a3f]"
                                onClick={(e) => e.stopPropagation()}
                              >
                                Gọi
                              </a>
                            )}
                            {hen.dienthoai && (
                              <button
                                type="button"
                                className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#dbe8f6] text-[13px] font-semibold text-[#1f66b1]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openZaloDialog(hen);
                                }}
                              >
                                Zalo
                              </button>
                            )}
                            {hen.dienthoai && (
                              <button
                                type="button"
                                className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#e7d8ec] text-[13px] font-semibold text-[#7a2fa0]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openSmsDialog(hen);
                                }}
                              >
                                SMS
                              </button>
                            )}
                            <button
                              type="button"
                              className="inline-flex h-10 items-center justify-center rounded-2xl bg-[#e5e2dd] text-[13px] font-semibold text-slate-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                openEditDialog(hen);
                              }}
                            >
                              Sửa
                            </button>
                          </div>

                          {isWaiting && (
                            <div className="grid grid-cols-3 gap-1.5">
                              <button
                                type="button"
                                className="col-span-2 inline-flex h-11 items-center justify-center rounded-2xl bg-[#43a047] text-[18px] font-semibold text-white"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTrangThai(hen.id, 'da_den');
                                }}
                              >
                                ✓ Đã đến
                              </button>
                              <button
                                type="button"
                                className="inline-flex h-11 items-center justify-center rounded-2xl bg-[#fbe2e2] text-[18px] font-semibold text-[#bd2e2e]"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  updateTrangThai(hen.id, 'huy');
                                }}
                              >
                                Hủy
                              </button>
                            </div>
                          )}

                          {hen.trang_thai === 'da_den' && (
                            <button
                              type="button"
                              className="inline-flex h-10 w-full items-center justify-center rounded-2xl bg-[#e4e8ef] text-[14px] font-semibold text-slate-700"
                              onClick={(e) => {
                                e.stopPropagation();
                                updateTrangThai(hen.id, 'cho');
                              }}
                            >
                              <RefreshCw className="mr-1 h-4 w-4" /> Chưa đến
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          <div className="mx-3 rounded-r-2xl border-l-4 border-[#f0bf2e] bg-[#efe5ca] px-3 py-2 text-[12px] text-[#af7b00] lg:hidden">
            ← Vuốt trái: Sửa / Hủy / Xóa
          </div>

          <div className="pointer-events-none fixed bottom-24 left-1/2 z-30 w-full max-w-3xl lg:max-w-6xl -translate-x-1/2 px-4">
            <div className="flex justify-end">
              <button
                type="button"
                className="pointer-events-auto flex h-16 w-16 items-center justify-center rounded-full bg-[#1f74cc] text-[36px] leading-none text-white shadow-lg"
                onClick={() => setOpenAdd(true)}
              >
                +
              </button>
            </div>
          </div>
        </div>

        <div className="hidden lg:block">
        <div className="max-w-6xl mx-auto p-3 md:p-4 pb-24 md:pb-6 space-y-3 md:space-y-4">
          {/* Page summary + actions */}
          <Card className="relative overflow-hidden border-blue-100 bg-gradient-to-br from-white via-blue-50 to-cyan-50 shadow-sm">
            <div className="pointer-events-none absolute -top-16 -right-10 h-36 w-36 rounded-full bg-blue-200/40 blur-3xl" />
            <div className="pointer-events-none absolute -bottom-14 left-10 h-32 w-32 rounded-full bg-cyan-200/35 blur-3xl" />
            <CardContent className="relative p-3 md:p-4 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <CalendarDays className="w-5 h-5 text-blue-700" />
                    <h1 className="text-lg md:text-xl font-bold text-slate-800 leading-tight">Lịch hẹn khám</h1>
                  </div>
                  <p className="mt-1 text-xs md:text-sm text-slate-600">
                    {currentRangeLabel} • {filteredData.length}/{data.length} lịch hẹn
                  </p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    <span className="inline-flex items-center rounded-full border border-blue-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-blue-700">
                      Chờ {stats.cho}
                    </span>
                    <span className="inline-flex items-center rounded-full border border-green-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-green-700">
                      Đã đến {stats.da_den}
                    </span>
                    {(stats.qua_han > 0 || pendingOverdueCount > 0) && (
                      <span className="inline-flex items-center rounded-full border border-amber-200 bg-white/90 px-2.5 py-1 text-[11px] font-semibold text-amber-700">
                        Cần xử lý {stats.qua_han + pendingOverdueCount}
                      </span>
                    )}
                  </div>
                </div>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={fetchData}
                  disabled={loading}
                  className="h-9 px-2.5 md:px-3 shrink-0 border-blue-200 bg-white/90 hover:bg-white"
                >
                  <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
                  <span className="hidden sm:inline ml-1">Tải lại</span>
                </Button>
              </div>

              <div className="grid grid-cols-2 gap-2 md:flex md:items-center md:gap-2">
                <Button className="h-10 md:h-9 bg-slate-900 hover:bg-slate-800" onClick={() => setOpenAdd(true)}>
                  <Plus className="w-4 h-4 mr-1" /> Thêm hẹn
                </Button>
                <Button variant="outline" className="h-10 md:h-9 border-slate-300 bg-white/90 hover:bg-white" onClick={() => setOpenTemplateManager(true)}>
                  <Settings className="w-4 h-4 mr-1" /> Mẫu tin
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Status quick filters */}
          <div className="overflow-x-auto pb-1">
            <div className="flex min-w-max gap-2 md:grid md:min-w-0 md:grid-cols-5 md:gap-3">
            {statusQuickFilters.map(item => (
              <button
                key={item.key}
                onClick={() => setFilterTrangThai(item.key)}
                className={`min-w-[136px] rounded-2xl border p-3 text-left transition-all ${
                  filterTrangThai === item.key
                    ? `${item.activeClass} shadow-sm`
                    : 'border-slate-200 bg-white hover:border-slate-300'
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="text-xs text-slate-500">{item.label}</div>
                  <span className={`h-2 w-2 rounded-full ${item.dotClass}`} />
                </div>
                <div className={`mt-1 text-2xl font-bold leading-none ${item.countClass}`}>{item.count}</div>
              </button>
            ))}
            </div>
          </div>

          {/* Filters */}
          <Card className="border-slate-200 shadow-sm">
            <CardContent className="p-3 space-y-3">
              {/* Time tabs */}
              <div className="overflow-x-auto">
                <div className="flex min-w-max gap-2">
                  {([['hom_nay', 'Hôm nay'], ['7_ngay_toi', '7 ngày tới'], ['1_thang_toi', '1 tháng tới'], ['khoang_ngay', 'Khoảng ngày']] as const).map(([key, label]) => (
                    <button
                      key={key}
                      className={`h-9 px-4 rounded-full text-sm font-medium whitespace-nowrap transition-colors ${tab === key ? 'bg-blue-600 text-white shadow-sm' : 'bg-slate-100 text-slate-700 hover:bg-slate-200'}`}
                      onClick={() => setTab(key)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Date range picker */}
              {tab === 'khoang_ngay' && (
                <div className="space-y-2">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <Input type="date" className="h-10 w-full" value={fromDate} onChange={e => setFromDate(e.target.value)} />
                    <Input type="date" className="h-10 w-full" value={toDate} onChange={e => setToDate(e.target.value)} />
                  </div>
                  <Button size="sm" className="h-9 w-full sm:w-auto" onClick={fetchData}>Áp dụng khoảng ngày</Button>
                </div>
              )}

              {/* Search */}
              <div className="flex gap-2 flex-wrap items-center">
                <Input className="h-10 w-full" placeholder="Tìm tên, SĐT..." value={search} onChange={e => setSearch(e.target.value)} />
                {search.trim() && (
                  <button
                    type="button"
                    className="h-10 px-3 rounded-lg border border-slate-200 bg-white text-sm font-medium text-slate-600 hover:bg-slate-100 transition-colors"
                    onClick={() => setSearch('')}
                  >
                    Xóa tìm
                  </button>
                )}
              </div>

              {/* Batch actions for overdue */}
              {(stats.qua_han > 0 || pendingOverdueCount > 0) && (
                <div className="flex items-center gap-2 flex-wrap bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                  <AlertTriangle className="w-4 h-4 text-amber-700" />
                  {pendingOverdueCount > 0 && (
                    <button
                      type="button"
                      onClick={batchMarkOverdue}
                      className="px-2.5 py-1 text-xs bg-amber-100 text-amber-800 rounded-lg hover:bg-amber-200 border border-amber-200 font-medium transition-colors"
                    >
                      Cập nhật quá hạn ({pendingOverdueCount})
                    </button>
                  )}
                  <span className="text-sm text-amber-800 font-medium">{stats.qua_han + pendingOverdueCount} lịch cần xử lý</span>
                  <span className="text-xs text-amber-700">Dời tất cả:</span>
                  {[7, 14, 30].map(d => (
                    <button key={d} onClick={() => batchRescheduleOverdue(d)} className="px-2.5 py-1 text-xs bg-white text-amber-700 rounded-lg hover:bg-amber-100 border border-amber-200 font-medium transition-colors">
                      +{d < 30 ? `${d} ngày` : '1 tháng'}
                    </button>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* List */}
          {loading ? (
            <div className="text-center py-10 text-gray-500">Đang tải...</div>
          ) : filteredData.length === 0 ? (
            <div className="text-center py-10 text-gray-400">Không có lịch hẹn nào</div>
          ) : (
            <div className="space-y-2.5">
              {filteredData.map(hen => {
                const st = TRANG_THAI_MAP[hen.trang_thai] || TRANG_THAI_MAP.cho;
                const countdown = getCountdownLabel(hen.ngay_hen, hen.trang_thai);
                const statusBorderClass = hen.trang_thai === 'da_den'
                  ? 'border-l-4 border-l-green-300'
                  : hen.trang_thai === 'huy'
                    ? 'border-l-4 border-l-red-300'
                    : hen.trang_thai === 'qua_han'
                      ? 'border-l-4 border-l-slate-300'
                      : 'border-l-4 border-l-yellow-300';
                return (
                  <Card key={hen.id} className={`${statusBorderClass} border-slate-200 hover:shadow-md transition-shadow ${countdown && getDaysDiff(hen.ngay_hen) < 0 ? 'border-red-300' : countdown && getDaysDiff(hen.ngay_hen) === 0 ? 'border-orange-300' : ''}`}>
                    <CardContent className="p-3 md:p-4">
                      <div className="flex flex-col md:flex-row md:items-start gap-3">
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1 flex-wrap">
                            <Link href={hen.benhnhanid ? `/ke-don-kinh?bn=${hen.benhnhanid}` : '#'} className="font-bold text-blue-700 hover:underline truncate">
                              {hen.ten_benhnhan || 'Không tên'}
                            </Link>
                            <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${st.bg} ${st.color}`}>
                              {st.label}
                            </span>
                            {countdown && (
                              <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${countdown.className}`}>
                                {countdown.text}
                              </span>
                            )}
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-sm text-gray-600">
                            <span className="flex items-center gap-1">
                              <CalendarDays className="w-3.5 h-3.5" /> {formatNgay(hen.ngay_hen)}
                            </span>
                            {hen.gio_hen && (
                              <span className="flex items-center gap-1">
                                <Clock className="w-3.5 h-3.5" /> {formatGio(hen.gio_hen)}
                              </span>
                            )}
                            {hen.dienthoai && <span>SĐT: {hen.dienthoai}</span>}
                            {hen.ly_do && <span className="text-gray-500">• {hen.ly_do}</span>}
                          </div>
                          {hen.ghichu && <p className="text-xs text-gray-400 mt-1">{hen.ghichu}</p>}

                          {/* Quick reschedule buttons */}
                          {(hen.trang_thai === 'cho' || hen.trang_thai === 'qua_han') && (
                            <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                              <span className="text-xs text-slate-400">Dời lịch:</span>
                              {[
                                { days: 7, label: '+7 ngày' },
                                { days: 14, label: '+14 ngày' },
                                { days: 30, label: '+1 tháng' },
                              ].map(({ days, label }) => (
                                <button
                                  key={days}
                                  onClick={() => reschedule(hen.id, days)}
                                  className="px-2 py-0.5 text-xs bg-indigo-50 text-indigo-700 rounded-md hover:bg-indigo-100 border border-indigo-200 transition-colors font-medium"
                                >
                                  {label}
                                </button>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Actions */}
                        <div className="w-full md:w-auto md:min-w-[260px]">
                          <div className="grid grid-cols-2 sm:grid-cols-4 md:flex md:flex-wrap gap-2">
                            {/* Edit button */}
                            <button
                              className="inline-flex h-9 items-center justify-center gap-1 px-3 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                              onClick={() => {
                                setEditForm({
                                  id: hen.id,
                                  ngay_hen: hen.ngay_hen,
                                  gio_hen: hen.gio_hen ? formatGio(hen.gio_hen) : '',
                                  ly_do: hen.ly_do || '',
                                  ghichu: hen.ghichu || '',
                                });
                                setOpenEdit(true);
                              }}
                            >
                              <Pencil className="w-4 h-4" /> Sửa
                            </button>
                            {/* Gọi điện */}
                            {hen.dienthoai && (
                              <a href={`tel:${hen.dienthoai}`} className="inline-flex h-9 items-center justify-center gap-1 px-3 bg-green-50 text-green-700 rounded-lg text-sm font-medium hover:bg-green-100 transition-colors">
                                <Phone className="w-4 h-4" /> Gọi
                              </a>
                            )}
                            {/* Nhắn tin SMS */}
                            {hen.dienthoai && (
                              <button
                                className="inline-flex h-9 items-center justify-center gap-1 px-3 bg-blue-50 text-blue-700 rounded-lg text-sm font-medium hover:bg-blue-100 transition-colors"
                                onClick={() => { setSmsTarget(hen); setSelectedTemplate(0); setOpenSms(true); }}
                              >
                                <MessageSquare className="w-4 h-4" /> SMS
                              </button>
                            )}
                            {/* Zalo */}
                            {hen.dienthoai && (
                              <button
                                className="inline-flex h-9 items-center justify-center gap-1 px-3 bg-blue-500 text-white rounded-lg text-sm font-medium hover:bg-blue-600 transition-colors"
                                onClick={() => { setZaloTarget(hen); setSelectedZaloTemplate(0); setOpenZalo(true); }}
                              >
                                Zalo
                              </button>
                            )}
                          </div>

                          <div className="mt-2 grid grid-cols-2 sm:grid-cols-3 gap-2">
                            {/* Status actions */}
                            {(hen.trang_thai === 'cho' || hen.trang_thai === 'qua_han') && (
                              <>
                                <button
                                  className="inline-flex h-9 items-center justify-center gap-1 px-3 bg-green-600 text-white rounded-lg text-sm font-medium hover:bg-green-700 transition-colors"
                                  onClick={() => updateTrangThai(hen.id, 'da_den')}
                                >
                                  <Check className="w-4 h-4" /> Đã đến
                                </button>
                                <button
                                  className="inline-flex h-9 items-center justify-center gap-1 px-3 bg-red-50 text-red-600 rounded-lg text-sm font-medium hover:bg-red-100 transition-colors"
                                  onClick={() => updateTrangThai(hen.id, 'huy')}
                                >
                                  <X className="w-4 h-4" /> Hủy
                                </button>
                              </>
                            )}
                            {hen.trang_thai === 'da_den' && (
                              <button
                                className="inline-flex h-9 items-center justify-center gap-1 px-3 bg-slate-100 text-slate-700 rounded-lg text-sm font-medium hover:bg-slate-200 transition-colors"
                                onClick={() => updateTrangThai(hen.id, 'cho')}
                              >
                                <RefreshCw className="w-4 h-4" /> Chưa đến
                              </button>
                            )}
                            <button
                              className="inline-flex h-9 items-center justify-center gap-1 px-3 border border-slate-200 text-slate-500 rounded-lg text-sm font-medium hover:text-red-600 hover:border-red-200 transition-colors"
                              onClick={() => deleteHen(hen.id)}
                            >
                              <Trash2 className="w-4 h-4" /> Xóa
                            </button>
                          </div>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}
        </div>
        </div>

        {/* SMS Template Dialog */}
        <Dialog open={openSms} onOpenChange={setOpenSms}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nhắn tin SMS cho {smsTarget?.ten_benhnhan}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <Label>Chọn mẫu tin nhắn:</Label>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {getAllTemplates(smsTarget).map((tpl, i) => (
                  <button
                    key={i}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${selectedTemplate === i ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                    onClick={() => setSelectedTemplate(i)}
                  >
                    <div className="font-medium text-gray-800 mb-1">{tpl.label}</div>
                    <div className="text-gray-600">{tpl.text}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenSms(false)}>Đóng</Button>
              <Button onClick={() => {
                const templates = getAllTemplates(smsTarget);
                const msg = templates[selectedTemplate]?.text || '';
                const phone = smsTarget?.dienthoai || '';
                window.open(`sms:${encodeURIComponent(phone)}?body=${encodeURIComponent(msg)}`, '_self');
                setOpenSms(false);
              }}>
                <MessageSquare className="w-4 h-4 mr-1" /> Gửi SMS
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Zalo Dialog */}
        <Dialog open={openZalo} onOpenChange={setOpenZalo}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Nhắn Zalo cho {zaloTarget?.ten_benhnhan}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-700">
                Chọn mẫu → bấm <strong>"Copy & Mở Zalo"</strong> → dán tin nhắn vào Zalo.
              </div>
              <div className="space-y-2 max-h-80 overflow-y-auto">
                {getAllTemplates(zaloTarget).map((tpl, i) => (
                  <button
                    key={i}
                    className={`w-full text-left p-3 rounded-lg border text-sm transition-colors ${selectedZaloTemplate === i ? 'border-blue-500 bg-blue-50' : 'border-gray-200 hover:border-gray-300'}`}
                    onClick={() => setSelectedZaloTemplate(i)}
                  >
                    <div className="font-medium text-gray-800 mb-1">{tpl.label}</div>
                    <div className="text-gray-600">{tpl.text}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenZalo(false)}>Đóng</Button>
              <Button className="bg-blue-500 hover:bg-blue-600" onClick={async () => {
                const templates = getAllTemplates(zaloTarget);
                const msg = templates[selectedZaloTemplate]?.text || '';
                const phone = zaloTarget?.dienthoai || '';
                try {
                  await navigator.clipboard.writeText(msg);
                  toast.success('Đã copy tin nhắn! Dán vào Zalo nhé.');
                } catch {
                  // Fallback cho trình duyệt không hỗ trợ clipboard API
                  const ta = document.createElement('textarea');
                  ta.value = msg;
                  document.body.appendChild(ta);
                  ta.select();
                  document.execCommand('copy');
                  document.body.removeChild(ta);
                  toast.success('Đã copy tin nhắn!');
                }
                // Mở Zalo chat
                window.open(`https://zalo.me/${phone.replace(/^0/, '84')}`, '_blank');
                setOpenZalo(false);
              }}>
                <Copy className="w-4 h-4 mr-1" /> Copy & Mở Zalo
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Quản lý mẫu tin nhắn Dialog */}
        <Dialog open={openTemplateManager} onOpenChange={setOpenTemplateManager}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Quản lý mẫu tin nhắn tùy chỉnh</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="bg-gray-50 border rounded-lg p-3 text-sm text-gray-600">
                Dùng <code className="bg-gray-200 px-1 rounded">[Tên]</code>, <code className="bg-gray-200 px-1 rounded">[Ngày]</code>, <code className="bg-gray-200 px-1 rounded">[Giờ]</code> để tự động thay thế khi gửi.
              </div>

              {/* Danh sách mẫu tùy chỉnh */}
              {customTemplates.length === 0 && !editingTemplate && (
                <p className="text-sm text-gray-400 text-center py-4">Chưa có mẫu tùy chỉnh nào</p>
              )}
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {customTemplates.map((tpl, i) => (
                  <div key={i} className="flex items-start gap-2 p-3 border rounded-lg">
                    <div className="flex-1 min-w-0">
                      <div className="font-medium text-sm text-gray-800">{tpl.label}</div>
                      <div className="text-xs text-gray-500 mt-1">{tpl.text}</div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <button
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        onClick={() => setEditingTemplate({ index: i, label: tpl.label, text: tpl.text })}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        onClick={() => {
                          const next = customTemplates.filter((_, j) => j !== i);
                          saveCustomTemplates(next);
                          toast.success('Đã xóa mẫu');
                        }}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              {/* Form thêm/sửa mẫu */}
              {editingTemplate ? (
                <div className="border-t pt-3 space-y-2">
                  <Label>{editingTemplate.index >= 0 && editingTemplate.index < customTemplates.length ? 'Sửa mẫu' : 'Thêm mẫu mới'}</Label>
                  <Input
                    placeholder="Tên mẫu (VD: Chúc mừng sinh nhật)"
                    value={editingTemplate.label}
                    onChange={e => setEditingTemplate({ ...editingTemplate, label: e.target.value })}
                  />
                  <Textarea
                    placeholder="Nội dung tin nhắn... Dùng [Tên], [Ngày], [Giờ]"
                    value={editingTemplate.text}
                    onChange={e => setEditingTemplate({ ...editingTemplate, text: e.target.value })}
                    rows={3}
                  />
                  <div className="flex gap-2">
                    <Button size="sm" onClick={() => {
                      if (!editingTemplate.label || !editingTemplate.text) {
                        toast.error('Vui lòng nhập tên và nội dung');
                        return;
                      }
                      const next = [...customTemplates];
                      if (editingTemplate.index >= 0 && editingTemplate.index < customTemplates.length) {
                        next[editingTemplate.index] = { label: editingTemplate.label, text: editingTemplate.text };
                      } else {
                        next.push({ label: editingTemplate.label, text: editingTemplate.text });
                      }
                      saveCustomTemplates(next);
                      setEditingTemplate(null);
                      toast.success('Đã lưu mẫu');
                    }}>
                      Lưu mẫu
                    </Button>
                    <Button variant="outline" size="sm" onClick={() => setEditingTemplate(null)}>Hủy</Button>
                  </div>
                </div>
              ) : (
                <Button variant="outline" size="sm" className="w-full" onClick={() => setEditingTemplate({ index: -1, label: '', text: '' })}>
                  <Plus className="w-4 h-4 mr-1" /> Thêm mẫu mới
                </Button>
              )}
            </div>
            <div className="flex justify-end">
              <Button variant="outline" onClick={() => setOpenTemplateManager(false)}>Đóng</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Thêm lịch hẹn Dialog */}
        <Dialog open={openAdd} onOpenChange={(v) => {
          setOpenAdd(v);
          if (!v) { setPatientSearch(''); setPatientResults([]); setSelectedPatientId(0); }
        }}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Thêm lịch hẹn mới</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              {/* Patient search */}
              <div>
                <Label>Tìm bệnh nhân</Label>
                <Input
                  value={patientSearch}
                  onChange={e => setPatientSearch(e.target.value)}
                  placeholder="Gõ tên hoặc SĐT để tìm..."
                  className="mb-1"
                />
                {searchingPatient && <p className="text-xs text-gray-400">Đang tìm...</p>}
                {patientResults.length > 0 && (
                  <div className="border rounded-md max-h-40 overflow-y-auto bg-white">
                    {patientResults.map(p => (
                      <button
                        key={p.id}
                        type="button"
                        className={`w-full text-left px-3 py-2 text-sm hover:bg-blue-50 transition-colors border-b last:border-b-0 ${selectedPatientId === p.id ? 'bg-blue-100 font-medium' : ''}`}
                        onClick={() => {
                          setSelectedPatientId(p.id);
                          setAddForm(f => ({ ...f, ten_benhnhan: p.ten, dienthoai: p.dienthoai || '' }));
                          setPatientResults([]);
                          setPatientSearch('');
                        }}
                      >
                        <span className="font-medium">{p.ten}</span>
                        {p.dienthoai && <span className="text-gray-500 ml-2">• {p.dienthoai}</span>}
                        <span className="text-gray-400 ml-2 text-xs">ID: {p.id}</span>
                      </button>
                    ))}
                  </div>
                )}
                {selectedPatientId > 0 && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-green-600 font-medium">✓ Đã chọn bệnh nhân ID: {selectedPatientId}</span>
                    <button type="button" className="text-xs text-red-500 hover:underline" onClick={() => { setSelectedPatientId(0); setAddForm(f => ({ ...f, ten_benhnhan: '', dienthoai: '' })); }}>Bỏ chọn</button>
                  </div>
                )}
              </div>

              <div>
                <Label>Tên bệnh nhân *</Label>
                <Input value={addForm.ten_benhnhan} onChange={e => { setAddForm(f => ({ ...f, ten_benhnhan: e.target.value })); if (selectedPatientId) setSelectedPatientId(0); }} placeholder="Họ tên..." />
              </div>
              <div>
                <Label>Số điện thoại</Label>
                <Input value={addForm.dienthoai} onChange={e => setAddForm(f => ({ ...f, dienthoai: e.target.value }))} placeholder="0xxx..." />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ngày hẹn *</Label>
                  <Input type="date" value={addForm.ngay_hen} onChange={e => setAddForm(f => ({ ...f, ngay_hen: e.target.value }))} />
                </div>
                <div>
                  <Label>Giờ hẹn</Label>
                  <Input type="time" value={addForm.gio_hen} onChange={e => setAddForm(f => ({ ...f, gio_hen: e.target.value }))} />
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
                ].map(({ days, label }) => (
                  <button
                    key={days}
                    type="button"
                    className="px-2 py-0.5 text-xs bg-blue-50 text-blue-700 rounded-md hover:bg-blue-100 border border-blue-200 font-medium"
                    onClick={() => setAddForm(f => ({ ...f, ngay_hen: addDaysFromToday(days) }))}
                  >
                    +{label}
                  </button>
                ))}
              </div>
              <div>
                <Label>Lý do</Label>
                <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={addForm.ly_do} onChange={e => setAddForm(f => ({ ...f, ly_do: e.target.value }))}>
                  {lyDoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <Label>Ghi chú</Label>
                <Input value={addForm.ghichu} onChange={e => setAddForm(f => ({ ...f, ghichu: e.target.value }))} placeholder="Ghi chú..." />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenAdd(false)}>Hủy</Button>
              <Button onClick={addHenKham}>Lưu lịch hẹn</Button>
            </div>
          </DialogContent>
        </Dialog>

        {/* Sửa lịch hẹn Dialog */}
        <Dialog open={openEdit} onOpenChange={setOpenEdit}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Sửa lịch hẹn</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 py-2">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Ngày hẹn *</Label>
                  <Input type="date" value={editForm.ngay_hen} onChange={e => setEditForm(f => ({ ...f, ngay_hen: e.target.value }))} />
                </div>
                <div>
                  <Label>Giờ hẹn</Label>
                  <Input type="time" value={editForm.gio_hen} onChange={e => setEditForm(f => ({ ...f, gio_hen: e.target.value }))} />
                </div>
              </div>
              {/* Quick date buttons for edit */}
              <div className="flex items-center gap-1.5 flex-wrap">
                <span className="text-xs text-gray-500">Dời lịch:</span>
                {[
                  { days: 7, label: '+7 ngày' },
                  { days: 14, label: '+14 ngày' },
                  { days: 30, label: '+1 tháng' },
                  { days: 90, label: '+3 tháng' },
                ].map(({ days, label }) => (
                  <button
                    key={days}
                    type="button"
                    className="px-2 py-0.5 text-xs bg-purple-50 text-purple-700 rounded-md hover:bg-purple-100 border border-purple-200 font-medium"
                    onClick={() => setEditForm(f => ({ ...f, ngay_hen: addDaysFromToday(days) }))}
                  >
                    {label}
                  </button>
                ))}
              </div>
              <div>
                <Label>Lý do</Label>
                <select className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm" value={editForm.ly_do} onChange={e => setEditForm(f => ({ ...f, ly_do: e.target.value }))}>
                  {lyDoOptions.map(opt => <option key={opt} value={opt}>{opt}</option>)}
                </select>
              </div>
              <div>
                <Label>Ghi chú</Label>
                <Input value={editForm.ghichu} onChange={e => setEditForm(f => ({ ...f, ghichu: e.target.value }))} placeholder="Ghi chú..." />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpenEdit(false)}>Hủy</Button>
              <Button onClick={editHenKham}>Lưu thay đổi</Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
      </FeatureGate>
    </ProtectedRoute>
  );
}
