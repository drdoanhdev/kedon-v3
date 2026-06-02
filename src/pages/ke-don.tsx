//src/pages/ke-don.tsx
'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import axios from 'axios';
import { fetchWithAuth } from '../lib/fetchWithAuth';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { Trash2, Pencil, FilePlus, Calendar, Pill, History, Activity, Image as ImageIcon, Glasses, X, AlertTriangle } from 'lucide-react';
import { useSearchParams, useRouter } from 'next/navigation';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import Link from 'next/link';
import { format } from 'date-fns';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import ProtectedRoute from '../components/ProtectedRoute';
import { useAuth } from '../contexts/AuthContext';
import { useFooter } from '../contexts/FooterContext';
import { searchByStartsWith } from '@/lib/utils';
import PrintDonThuoc from '../components/ke-don/PrintDonThuoc';
import { PatientMobileHeader, PatientDesktopCard } from '../components/PatientPageHeader';
import DonKinhMediaPanel, { type DraftDonKinhUploadItem } from '../components/ke-don/DonKinhImageStripPanel';
import PatientMediaTimeline from '../components/media/PatientMediaTimeline';
import {
  PatientFamilyProvider,
  PatientFamilyMobileChip,
  PatientFamilyDesktopChip,
} from '../components/family/PatientFamilyControls';

interface Thuoc {
  id: number;
  tenthuoc: string;
  donvitinh: string;
  giaban: number;
  gianhap: number;
  giaban_goc?: number;
  gianhap_goc?: number;
  gia_nguon?: 'catalog_default' | 'branch_override' | 'snapshot_line';
  gia_override_id?: number | null;
  soluongmacdinh: number;
  la_thu_thuat: boolean;
  cachdung: string;
  hoatchat: string;
  tonkho?: number;
  ngung_kinh_doanh?: boolean;
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
  ghichu?: string | null;
}

interface PatientNote {
  id: number;
  content: string;
  note_type: 'important' | 'normal';
}

interface BackgroundDonThuocFailedTask {
  taskId: string;
  donThuocId: number;
  failedCount: number;
  failedItems: DraftDonKinhUploadItem[];
}

function parseNgayKham(value?: string): Date | null {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatNgayKhamDdMm(value?: string): string {
  const parsed = parseNgayKham(value);
  if (!parsed) return '--/--';
  return parsed.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
  });
}

function formatNgayKhamYear(value?: string): string {
  const parsed = parseNgayKham(value);
  if (!parsed) return 'Không rõ năm';
  return parsed.toLocaleDateString('vi-VN', {
    timeZone: 'Asia/Ho_Chi_Minh',
    year: 'numeric',
  });
}

async function readImageDimensions(file: File): Promise<{ width: number; height: number } | null> {
  const objectUrl = URL.createObjectURL(file);
  try {
    const size = await new Promise<{ width: number; height: number }>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve({ width: img.naturalWidth, height: img.naturalHeight });
      img.onerror = () => reject(new Error('Cannot read image dimensions'));
      img.src = objectUrl;
    });
    return size;
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

async function uploadDraftDonThuocMediaQueue(
  donThuocId: number,
  draftQueue: DraftDonKinhUploadItem[]
): Promise<{ successCount: number; failedCount: number; failedItems: DraftDonKinhUploadItem[] }> {
  let successCount = 0;
  let failedCount = 0;
  const failedItems: DraftDonKinhUploadItem[] = [];

  for (const draft of draftQueue) {
    let mediaId: number | null = null;

    try {
      const createRes = await axios.post('/api/don-thuoc/media', {
        don_thuoc_id: donThuocId,
        loai_anh: 'don_thuoc',
        mime_type: draft.file.type || 'image/jpeg',
        size_bytes: draft.file.size,
        original_filename: draft.file.name,
        source_device: draft.sourceDevice,
        captured_at: new Date().toISOString(),
      });

      const uploadMeta = createRes.data?.upload as { method?: 'PUT'; signedUrl?: string; contentType?: string } | undefined;
      mediaId = Number(createRes.data?.data?.id || 0) || null;
      if (!uploadMeta?.signedUrl) {
        throw new Error('Không nhận được signed upload URL');
      }

      const uploadRes = await fetch(uploadMeta.signedUrl, {
        method: uploadMeta.method || 'PUT',
        headers: {
          'Content-Type': uploadMeta.contentType || draft.file.type || 'application/octet-stream',
        },
        body: draft.file,
      });

      if (!uploadRes.ok) {
        throw new Error(`Upload thất bại (${uploadRes.status})`);
      }

      const imageDimensions = await readImageDimensions(draft.file);
      if (mediaId) {
        await axios.patch('/api/don-thuoc/media', {
          id: mediaId,
          status: 'uploaded',
          width: imageDimensions?.width,
          height: imageDimensions?.height,
          size_bytes: draft.file.size,
        });
      }

      successCount += 1;
    } catch {
      failedCount += 1;
      failedItems.push(draft);
      if (mediaId) {
        await axios.patch('/api/don-thuoc/media', { id: mediaId, status: 'failed' }).catch(() => {});
      }
    }
  }

  return { successCount, failedCount, failedItems };
}

// Mobile swipeable row — vuốt sang trái để hiện nút − / + / 🗑 (giống KiotViet)
interface MobileDrugRowProps {
  item: ChiTietDonThuoc;
  stock?: { tonkho: number; trang_thai: string };
  onTap: () => void;
  onDelete: () => void;
  onIncrement: () => void;
  onDecrement: () => void;
}
function MobileDrugRow({ item, stock, onTap, onDelete, onIncrement, onDecrement }: MobileDrugRowProps) {
  const ACTION_WIDTH = 168; // 3 buttons × 56px
  const [tx, setTx] = useState(0);
  const [dragging, setDragging] = useState(false);
  const startX = useRef(0);
  const startTx = useRef(0);
  const movedRef = useRef(false);

  const onTouchStart = (e: React.TouchEvent) => {
    startX.current = e.touches[0].clientX;
    startTx.current = tx;
    movedRef.current = false;
    setDragging(true);
  };
  const onTouchMove = (e: React.TouchEvent) => {
    const dx = e.touches[0].clientX - startX.current;
    if (Math.abs(dx) > 6) movedRef.current = true;
    let next = startTx.current + dx;
    if (next > 0) next = 0;
    if (next < -ACTION_WIDTH - 24) next = -ACTION_WIDTH - 24;
    setTx(next);
  };
  const onTouchEnd = () => {
    setDragging(false);
    if (tx < -ACTION_WIDTH / 2) setTx(-ACTION_WIDTH);
    else setTx(0);
  };

  const handleRowClick = () => {
    if (movedRef.current) return;
    if (tx !== 0) { setTx(0); return; }
    onTap();
  };

  const isLan = item.thuoc.donvitinh.toLowerCase().includes('lần');

  return (
    <div data-no-tab-swipe className="relative overflow-hidden select-none bg-white">
      {/* Action panel behind */}
      <div className="absolute inset-y-0 right-0 flex items-stretch">
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDecrement(); }}
          className="w-14 bg-amber-500 hover:bg-amber-600 text-white font-extrabold text-2xl flex items-center justify-center"
          aria-label="Giảm số lượng"
        >
          −
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onIncrement(); }}
          className="w-14 bg-emerald-500 hover:bg-emerald-600 text-white font-extrabold text-2xl flex items-center justify-center"
          aria-label="Tăng số lượng"
        >
          +
        </button>
        <button
          type="button"
          onClick={(e) => { e.stopPropagation(); onDelete(); }}
          className="w-14 bg-red-500 hover:bg-red-600 text-white flex items-center justify-center"
          aria-label="Xoá"
        >
          <Trash2 className="w-5 h-5" />
        </button>
      </div>
      {/* Foreground row */}
      <div
        style={{
          transform: `translateX(${tx}px)`,
          transition: dragging ? 'none' : 'transform 0.22s cubic-bezier(0.32, 0.72, 0, 1)',
        }}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onClick={handleRowClick}
        className={`relative bg-white px-3 py-2.5 flex items-center gap-3 active:bg-gray-50 ${isLan ? 'border-l-2 border-l-amber-300' : ''}`}
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <p className="font-bold text-gray-900 text-[15px] leading-tight">{item.thuoc.tenthuoc}</p>
            {!item.thuoc.la_thu_thuat && stock && (
              <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                stock.trang_thai === 'HET' ? 'bg-red-100 text-red-700'
                : stock.trang_thai === 'SAP_HET' ? 'bg-yellow-100 text-yellow-700'
                : 'bg-green-100 text-green-700'
              }`}>
                {stock.tonkho <= 0 ? 'Hết' : `Tồn: ${stock.tonkho}`}
              </span>
            )}
          </div>
          {item.cachdung && (
            <p className="mt-0.5 text-xs text-gray-500 line-clamp-1">{item.cachdung}</p>
          )}
        </div>
        <div className="flex items-baseline gap-1 flex-shrink-0 pl-2">
          <span className="text-blue-600 font-extrabold text-lg tabular-nums">{item.soluong}</span>
          <span className="text-blue-600 font-bold text-sm">{item.thuoc.donvitinh}</span>
        </div>
      </div>
    </div>
  );
}

export default function KeDon() {
  const { confirm } = useConfirm();
  const searchParams = useSearchParams();
  const router = useRouter();
  const benhnhanid = searchParams.get('bn');
  const { loading: authLoading, tenancyLoading, currentTenantId } = useAuth();
  const { setLai: setFooterLai } = useFooter();
  const authReady = !authLoading && !tenancyLoading && !!currentTenantId;
  const patientIdNumber = useMemo(() => {
    const parsed = Number.parseInt(benhnhanid || '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }, [benhnhanid]);
  const [imageTabCount, setImageTabCount] = useState(0);

  const refreshImageTabCount = useCallback(async () => {
    if (!patientIdNumber) {
      setImageTabCount(0);
      return;
    }

    try {
      const response = await axios.get('/api/don-thuoc/media', {
        params: { benhnhan_id: patientIdNumber },
      });
      const rows = Array.isArray(response.data?.data) ? response.data.data : [];
      setImageTabCount(rows.length);
    } catch {
      // Keep current count when refresh fails.
    }
  }, [patientIdNumber]);

  useEffect(() => {
    void refreshImageTabCount();
  }, [refreshImageTabCount]);

  // Auto chuyển trạng thái chờ khám → đang_khám khi mở trang kê đơn
  useEffect(() => {
    if (!benhnhanid || !authReady) return;
    const pid = parseInt(benhnhanid);
    (async () => {
      try {
        await axios.post('/api/cho-kham', { patient_id: pid });
      } catch {}
      try {
        await axios.patch('/api/cho-kham', { benhnhanid: pid, trangthai: 'đang_khám' });
      } catch {}
    })();
  }, [benhnhanid, authReady]);

  const [dsThuoc, setDsThuoc] = useState<Thuoc[]>([]);
  const [dsDonCu, setDsDonCu] = useState<DonThuocCu[]>([]);
  const [dsChiTietDonCu, setDsChiTietDonCu] = useState<{ [donthuocid: number]: ChiTietDonThuoc[] }>({});
  const [dsDienTien, setDsDienTien] = useState<DienTien[]>([]);
  const [benhNhan, setBenhNhan] = useState<BenhNhan | null>(null);
  const [patientNotes, setPatientNotes] = useState<PatientNote[]>([]);
  const [dsChon, setDsChon] = useState<ChiTietDonThuoc[]>([]);
  const [newDienTien, setNewDienTien] = useState({ noidung: '', ngay: new Date().toISOString().slice(0, 10) });
  const [ngayKham, setNgayKham] = useState(() => {
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    return vietnamTime.toISOString().slice(0, 16);
  });
  const [editDienTien, setEditDienTien] = useState<DienTien | null>(null);
  const [openDialog, setOpenDialog] = useState(false);
  const [timThuocDonDangKe, setTimThuocDonDangKe] = useState('');
  const [highlightedIndex, setHighlightedIndex] = useState<number>(-1);
  const [chandoan, setChandoan] = useState('');
  const [chandoanSuggestions, setChandoanSuggestions] = useState<string[]>([]);
  const [showChandoanSuggestions, setShowChandoanSuggestions] = useState(false);
  const [selectedSuggestionIndex, setSelectedSuggestionIndex] = useState<number>(-1);
  const [ghiNo, setGhiNo] = useState(false);
  const [sotienDaThanhToan, setSotienDaThanhToan] = useState(0);
  const [sotienDaThanhToanInput, setSotienDaThanhToanInput] = useState('');
  const [tienKhachDua, setTienKhachDua] = useState(0);
  const [tienKhachDuaInput, setTienKhachDuaInput] = useState('');
  const [editDonThuocId, setEditDonThuocId] = useState<number | null>(null);
  const [activeDonThuocMediaId, setActiveDonThuocMediaId] = useState<number | null>(null);
  const [draftMediaQueue, setDraftMediaQueue] = useState<DraftDonKinhUploadItem[]>([]);
  const [draftQueueResetToken, setDraftQueueResetToken] = useState(0);
  const [backgroundUploadingCount, setBackgroundUploadingCount] = useState(0);
  const [backgroundFailedTasks, setBackgroundFailedTasks] = useState<BackgroundDonThuocFailedTask[]>([]);
  const [highlightId, setHighlightId] = useState<number | null>(null); // highlight đơn mới / cập nhật
  const [focusedRowIdx, setFocusedRowIdx] = useState<number>(-1);
  const chandoanDesktopRef = useRef<HTMLInputElement | null>(null);
  const searchDesktopRef = useRef<HTMLInputElement | null>(null);
  const soluongRefs = useRef<(HTMLInputElement | null)[]>([]);
  const cachdungRefs = useRef<(HTMLInputElement | null)[]>([]);
  useEffect(() => {
    if (!activeDonThuocMediaId) return;
    setDraftQueueResetToken((prev) => prev + 1);
    setDraftMediaQueue([]);
  }, [activeDonThuocMediaId]);

  const startBackgroundDonThuocMediaUpload = useCallback((donThuocId: number, items: DraftDonKinhUploadItem[]) => {
    if (items.length === 0) return;
    const taskId = `bg-don-thuoc-media-${donThuocId}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    setBackgroundUploadingCount((prev) => prev + 1);
    toast.loading(`Đang tải nền ${items.length} ảnh cho đơn #${donThuocId}...`, { id: taskId });

    void (async () => {
      try {
        const result = await uploadDraftDonThuocMediaQueue(donThuocId, items);
        toast.dismiss(taskId);

        if (result.successCount > 0 && result.failedCount === 0) {
          toast.success(`Đã tải nền ${result.successCount} ảnh lên đơn #${donThuocId}`);
          return;
        }

        if (result.failedCount > 0) {
          setBackgroundFailedTasks((prev) => ([
            {
              taskId,
              donThuocId,
              failedCount: result.failedCount,
              failedItems: result.failedItems,
            },
            ...prev,
          ]));

          if (result.successCount > 0) {
            toast(`Đơn #${donThuocId}: tải nền ${result.successCount} ảnh, lỗi ${result.failedCount} ảnh`);
          } else {
            toast.error(`Đơn #${donThuocId}: không tải được ${result.failedCount} ảnh`);
          }
        }
      } finally {
        setBackgroundUploadingCount((prev) => Math.max(0, prev - 1));
      }
    })();
  }, []);

  const retryBackgroundFailedTask = useCallback((taskId: string) => {
    const taskToRetry = backgroundFailedTasks.find((task) => task.taskId === taskId);
    if (!taskToRetry) return;

    setBackgroundFailedTasks((prev) => prev.filter((task) => task.taskId !== taskId));
    startBackgroundDonThuocMediaUpload(taskToRetry.donThuocId, taskToRetry.failedItems);
  }, [backgroundFailedTasks, startBackgroundDonThuocMediaUpload]);

  useEffect(() => {
    if (backgroundUploadingCount <= 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = 'Ảnh đơn thuốc đang tải nền. Rời trang có thể làm gián đoạn tải ảnh.';
      return event.returnValue;
    };

    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [backgroundUploadingCount]);

  const renderBackgroundUploadNotice = useCallback(() => {
    if (backgroundUploadingCount <= 0 && backgroundFailedTasks.length === 0) return null;

    return (
      <div className="px-2 pt-2 space-y-2">
        {backgroundUploadingCount > 0 && (
          <div className="rounded-lg border border-blue-200 bg-blue-50 px-3 py-2">
            <p className="text-xs sm:text-sm text-blue-700 font-semibold">
              Đang tải nền {backgroundUploadingCount} tác vụ ảnh. Bạn có thể tiếp tục kê đơn bình thường.
            </p>
          </div>
        )}

        {backgroundFailedTasks.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 space-y-2">
            <p className="text-xs sm:text-sm text-amber-800 font-semibold">
              Có {backgroundFailedTasks.length} tác vụ ảnh lỗi. Hệ thống không bỏ qua âm thầm, vui lòng thử lại.
            </p>
            {backgroundFailedTasks.map((task) => (
              <div key={task.taskId} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white/70 px-2 py-1.5">
                <p className="text-[11px] sm:text-xs text-amber-900">
                  Đơn #{task.donThuocId}: lỗi {task.failedCount} ảnh
                </p>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md bg-amber-600 text-white text-[11px] hover:bg-amber-700"
                    onClick={() => retryBackgroundFailedTask(task.taskId)}
                  >
                    Thử lại
                  </button>
                  <button
                    type="button"
                    className="h-7 px-2 rounded-md border border-amber-300 text-amber-800 text-[11px] hover:bg-amber-100"
                    onClick={() => setBackgroundFailedTasks((prev) => prev.filter((t) => t.taskId !== task.taskId))}
                  >
                    Ẩn
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }, [backgroundUploadingCount, backgroundFailedTasks, retryBackgroundFailedTask]);
  // Edit patient dialog state
  const [openEditPatient, setOpenEditPatient] = useState(false);
  const [patientForm, setPatientForm] = useState<BenhNhan | null>(null);

  // Tồn kho thuốc: thuoc_id → { tonkho, trang_thai }
  const [thuocStockMap, setThuocStockMap] = useState<Record<number, { tonkho: number; trang_thai: string }>>({});
  
  // States cho đơn thuốc mẫu
  const [showMauDialog, setShowMauDialog] = useState(false);
  const [dsMau, setDsMau] = useState<any[]>([]);
  const [loadingMau, setLoadingMau] = useState(false);
  // Mobile-only UI state
  const [mobileSearchOpen, setMobileSearchOpen] = useState(false);
  const [mobileDetailIdx, setMobileDetailIdx] = useState<number | null>(null);
  const mobileSearchRef = useRef<HTMLInputElement | null>(null);
  const mobileNgayKhamRef = useRef<HTMLInputElement | null>(null);
  const openMobileSearch = useCallback(() => {
    setMobileSearchOpen(true);
    setTimeout(() => {
      mobileSearchRef.current?.focus();
      mobileSearchRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
    }, 60);
  }, []);
  // Mobile tabs: 0 = Đơn thuốc, 1 = Đơn cũ, 2 = Diễn tiến, 3 = Ảnh
  const [mobileTab, setMobileTab] = useState<0 | 1 | 2 | 3>(0);
  const mobileTabRef = useRef<0 | 1 | 2 | 3>(0);
  useEffect(() => { mobileTabRef.current = mobileTab; }, [mobileTab]);
  const mobileTabLabels = ['Đơn thuốc', 'Đơn cũ', 'Diễn tiến', 'Ảnh'] as const;

  // ── Mobile header scroll-driven animation ──────────────────────
  const [mobileHeaderRatio, setMobileHeaderRatio] = useState(0);
  const mobileHeaderRatioRef = useRef(0);

  const snapRatio = useCallback((target: 0 | 1) => {
    const from = mobileHeaderRatioRef.current;
    if (Math.abs(from - target) < 0.01) {
      mobileHeaderRatioRef.current = target;
      setMobileHeaderRatio(target);
      return;
    }
    const duration = 200;
    const startTime = performance.now();
    const animate = (now: number) => {
      const t = Math.min(1, (now - startTime) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      const ratio = from + (target - from) * eased;
      mobileHeaderRatioRef.current = ratio;
      setMobileHeaderRatio(ratio);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartRatioRef = useRef(0);
  const mobileWrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const wrapper = mobileWrapperRef.current;
    if (!wrapper) return;
    const MAX_TRAVEL = 128;

    const getActivePanel = (): HTMLElement | null =>
      wrapper.querySelector<HTMLElement>(`[data-panel-idx="${mobileTabRef.current}"]`);

    const onTouchStart = (e: TouchEvent) => {
      touchStartXRef.current = e.touches[0].clientX;
      touchStartYRef.current = e.touches[0].clientY;
      touchStartRatioRef.current = mobileHeaderRatioRef.current;
    };

    const onTouchMove = (e: TouchEvent) => {
      const dx = e.touches[0].clientX - touchStartXRef.current;
      const dy = e.touches[0].clientY - touchStartYRef.current;
      const dyUp = -dy;
      if (Math.abs(dx) > Math.abs(dyUp) * 1.4 && Math.abs(dx) > 8) return;
      const startRatio = touchStartRatioRef.current;
      const panel = getActivePanel();
      const touchInPanel = panel?.contains(e.target as Node) ?? false;
      if (dyUp > 0) {
        if (startRatio < 1) {
          e.preventDefault();
          const raw = startRatio + dyUp / MAX_TRAVEL;
          const newRatio = Math.min(1, raw);
          mobileHeaderRatioRef.current = newRatio;
          setMobileHeaderRatio(newRatio);
          if (raw > 1) {
            if (panel) { panel.style.overflowY = 'auto'; panel.scrollTop = (raw - 1) * MAX_TRAVEL; }
          }
        } else if (!touchInPanel) {
          // Header compact nhưng touch trên vùng header → chặn native scroll
          e.preventDefault();
        }
      } else if (dyUp < 0) {
        if ((panel?.scrollTop ?? 0) <= 0 && startRatio > 0) {
          e.preventDefault();
          mobileHeaderRatioRef.current = Math.max(0, startRatio + dyUp / MAX_TRAVEL);
          setMobileHeaderRatio(mobileHeaderRatioRef.current);
        } else if (!touchInPanel) {
          // Touch trên header → chặn native scroll
          e.preventDefault();
        }
      }
    };

    const onTouchEnd = () => {
      const r = mobileHeaderRatioRef.current;
      if (r > 0 && r < 1) snapRatio(r >= 0.5 ? 1 : 0);
    };

    wrapper.addEventListener('touchstart', onTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', onTouchMove, { passive: false });
    wrapper.addEventListener('touchend', onTouchEnd, { passive: true });
    wrapper.addEventListener('touchcancel', onTouchEnd, { passive: true });
    return () => {
      wrapper.removeEventListener('touchstart', onTouchStart);
      wrapper.removeEventListener('touchmove', onTouchMove);
      wrapper.removeEventListener('touchend', onTouchEnd);
      wrapper.removeEventListener('touchcancel', onTouchEnd);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapRatio, benhNhan?.id]);

  // ── Notes management ────────────────────────────────────────────
  const [openNotesDialog, setOpenNotesDialog] = useState(false);
  const [allPatientNotes, setAllPatientNotes] = useState<PatientNote[]>([]);
  const [noteFormContent, setNoteFormContent] = useState('');
  const [noteFormType, setNoteFormType] = useState<'important' | 'normal'>('normal');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);

  const fetchAllNotes = useCallback(async () => {
    if (!benhnhanid) return [];
    try {
      const res = await axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&includeDeleted=0`);
      const notes: PatientNote[] = res.data?.data || [];
      setAllPatientNotes(notes);
      return notes;
    } catch { return []; }
  }, [benhnhanid]);

  const openNotesManagement = useCallback(async () => {
    const notes = await fetchAllNotes();
    const first = notes.find((n) => n.note_type === 'important') || notes[0] || null;
    setEditingNoteId(first?.id ?? null);
    setNoteFormContent(first?.content ?? '');
    setNoteFormType(first?.note_type ?? 'normal');
    setOpenNotesDialog(true);
  }, [fetchAllNotes]);

  const saveNote = useCallback(async () => {
    if (!benhnhanid || !noteFormContent.trim()) { toast.error('Vui lòng nhập nội dung'); return; }
    setNotesSaving(true);
    try {
      if (editingNoteId) {
        await axios.put('/api/benh-nhan/notes', { id: editingNoteId, content: noteFormContent.trim(), note_type: noteFormType });
        toast.success('Đã cập nhật ghi chú');
      } else {
        await axios.post('/api/benh-nhan/notes', { benhnhanid: parseInt(benhnhanid), content: noteFormContent.trim(), note_type: noteFormType });
        toast.success('Đã thêm ghi chú');
      }
      const res = await axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&importantOnly=1`);
      setPatientNotes(res.data?.data || []);
      await fetchAllNotes();
      setEditingNoteId(null); setNoteFormContent(''); setNoteFormType('normal');
    } catch { toast.error('Lỗi khi lưu ghi chú'); }
    finally { setNotesSaving(false); }
  }, [benhnhanid, editingNoteId, noteFormContent, noteFormType, fetchAllNotes]);

  const deleteNote = useCallback(async (id: number) => {
    if (!await confirm('Xóa ghi chú này?')) return;
    try {
      await axios.delete(`/api/benh-nhan/notes?id=${id}`);
      toast.success('Đã xóa');
      const res = await axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&importantOnly=1`);
      setPatientNotes(res.data?.data || []);
      await fetchAllNotes();
      if (editingNoteId === id) { setEditingNoteId(null); setNoteFormContent(''); setNoteFormType('normal'); }
    } catch { toast.error('Lỗi khi xóa'); }
  }, [benhnhanid, editingNoteId, fetchAllNotes, confirm]);
  const [desktopLeftTab, setDesktopLeftTab] = useState<'don_cu' | 'dien_bien' | 'anh'>('don_cu');
  const [tabDragX, setTabDragX] = useState(0);
  const [tabDragging, setTabDragging] = useState(false);
  const tabStart = useRef<{ x: number; y: number; locked: 'h' | 'v' | null }>({ x: 0, y: 0, locked: null });
  const tabActive = useRef(false);
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const onTabTouchStart = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement;
    // Chỉ chặn ở các vùng đã đánh dấu rõ ràng là no-swipe (vd: dòng thuốc có swipe riêng).
    // Cho phép bắt đầu vuốt tab từ mọi vùng còn lại, kể cả trên các nút hành động.
    if (t.closest('[data-no-tab-swipe]')) return;
    tabActive.current = true;
    tabStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, locked: null };
  };
  const onTabTouchMove = (e: React.TouchEvent) => {
    if (!tabActive.current) return;
    const dx = e.touches[0].clientX - tabStart.current.x;
    const dy = e.touches[0].clientY - tabStart.current.y;
    if (tabStart.current.locked === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        tabStart.current.locked = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
        if (tabStart.current.locked === 'h') setTabDragging(true);
      }
    }
    if (tabStart.current.locked === 'h') {
      // Ưu tiên gesture ngang để chuyển tab thay vì scroll/select text.
      e.preventDefault();
      let next = dx;
      if (mobileTab === 0 && next > 0) next = next * 0.3;
      if (mobileTab === 3 && next < 0) next = next * 0.3;
      setTabDragX(next);
    }
  };
  const onTabTouchEnd = () => {
    if (!tabActive.current) return;
    tabActive.current = false;
    setTabDragging(false);
    const w = viewportRef.current?.clientWidth || 360;
    const threshold = w * 0.22;
    let next = mobileTab;
    if (tabDragX < -threshold && mobileTab < 3) next = (mobileTab + 1) as 0 | 1 | 2 | 3;
    else if (tabDragX > threshold && mobileTab > 0) next = (mobileTab - 1) as 0 | 1 | 2 | 3;
    setMobileTab(next);
    setTabDragX(0);
    tabStart.current.locked = null;
  };
  // Print config
  const [printConfig, setPrintConfig] = useState<{
    ten_cua_hang: string; dia_chi: string; dien_thoai: string; logo_url: string;
    hien_thi_logo_thuoc: boolean; hien_thi_chan_doan_thuoc: boolean; hien_thi_gia_thuoc: boolean; hien_thi_ghi_chu_thuoc: boolean; ghi_chu_cuoi_thuoc: string;
    chuc_danh_nguoi_ky: string; ho_ten_nguoi_ky: string; chu_ky_url: string; hien_thi_nguoi_ky_thuoc: boolean; hien_thi_ngay_kham_thuoc: boolean;
  }>({
    ten_cua_hang: '', dia_chi: '', dien_thoai: '', logo_url: '',
    hien_thi_logo_thuoc: true, hien_thi_chan_doan_thuoc: true, hien_thi_gia_thuoc: false, hien_thi_ghi_chu_thuoc: true, ghi_chu_cuoi_thuoc: '',
    chuc_danh_nguoi_ky: '', ho_ten_nguoi_ky: '', chu_ky_url: '', hien_thi_nguoi_ky_thuoc: true, hien_thi_ngay_kham_thuoc: true,
  });

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

  // Fetch initial data - đợi auth sẵn sàng trước khi gọi API
  useEffect(() => {
    if (!authReady) return;
    // Fetch print config
    axios.get('/api/cau-hinh-mau-in')
      .then(res => {
        const d = res.data?.data || res.data;
        if (d) setPrintConfig(prev => ({ ...prev, ...d }));
      })
      .catch(() => {});
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
          axios.get(`/api/thuoc?scope=shared&effective_price=1&_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: [] } })),
          benhnhanid
            ? axios.get(`/api/don-thuoc?benhnhanid=${benhnhanid}&limit=100&_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: [] } }))
            : Promise.resolve({ data: { data: [] } }),
          benhnhanid
            ? axios.get(`/api/dien-tien?benhnhanid=${benhnhanid}&_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: [] } }))
            : Promise.resolve({ data: { data: [] } }),
          benhnhanid
            ? axios.get(`/api/benh-nhan?benhnhanid=${benhnhanid}&_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: null } }))
            : Promise.resolve({ data: { data: null } }),
          benhnhanid
            ? axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&importantOnly=1&_t=${timestamp}&_r=${random}`, { headers: cacheHeaders }).catch((err: unknown) => ({ error: err, data: { data: [] } }))
            : Promise.resolve({ data: { data: [] } }),
        ];

        const [resThuoc, resDonCu, resDienTien, resBenhNhan, resAlerts] = await Promise.all(requests);

        if ('error' in resThuoc && resThuoc.error) {
          const error = resThuoc.error as any;
          toast.error(`Lỗi tải danh sách thuốc: ${error.response?.data?.message || error.message || 'Unknown error'}`);
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
        if ('error' in resAlerts && resAlerts.error) {
          const error = resAlerts.error as any;
          toast.error(`Lỗi tải cảnh báo bệnh nhân: ${error.response?.data?.message || error.message || 'Unknown error'}`);
        }

        setDsThuoc(resThuoc.data.data || []);
        setDsDonCu(Array.isArray(resDonCu.data.data) ? resDonCu.data.data : []);
        setDsDienTien(resDienTien.data.data || []);
        setBenhNhan(resBenhNhan.data.data || null);
        setPatientNotes(resAlerts.data.data || []);

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
                  giaban: (item as any).don_gia_ban ?? item.thuoc.giaban,
                  gianhap: (item as any).don_gia_von ?? (item.thuoc.gianhap || 0),
                  gia_nguon: 'snapshot_line',
                  soluongmacdinh: item.thuoc.soluongmacdinh,
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
  }, [benhnhanid, authReady]);

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
  const tongTienThuoc = useMemo(() => dsChon.filter(item => !item.thuoc.donvitinh?.toLowerCase().includes('lần')).reduce((sum, item) => sum + item.soluong * item.thuoc.giaban, 0), [dsChon]);
  const tongTienThuThuat = useMemo(() => dsChon.filter(item => item.thuoc.donvitinh?.toLowerCase().includes('lần')).reduce((sum, item) => sum + item.soluong * item.thuoc.giaban, 0), [dsChon]);
  const dsDonCuGroupedByYear = useMemo(() => {
    const map = new Map<string, DonThuocCu[]>();
    for (const don of dsDonCu) {
      const year = formatNgayKhamYear(don.ngay_kham);
      if (!map.has(year)) map.set(year, []);
      map.get(year)?.push(don);
    }
    return Array.from(map.entries()).map(([year, items]) => ({ year, items }));
  }, [dsDonCu]);
  const lai = useMemo(
    () => (dsChon.reduce((sum, item) => sum + (item.thuoc.giaban - (item.thuoc.gianhap || 0)) * item.soluong, 0) / 1000).toFixed(0),
    [dsChon]
  );
  const sotienConNo = useMemo(() => Math.max(0, tongTien - sotienDaThanhToan), [tongTien, sotienDaThanhToan]);
  const tienTraLai = useMemo(() => Math.max(0, tienKhachDua - tongTien), [tienKhachDua, tongTien]);

  const getPriceSourceLabel = useCallback((source?: string) => {
    if (source === 'branch_override') return 'Gia CN';
    if (source === 'snapshot_line') return 'Gia chot';
    return 'Gia DM';
  }, []);

  const getPriceSourceClass = useCallback((source?: string) => {
    if (source === 'branch_override') return 'bg-blue-100 text-blue-700';
    if (source === 'snapshot_line') return 'bg-slate-100 text-slate-700';
    return 'bg-gray-100 text-gray-700';
  }, []);

  // Sync lãi lên Footer
  useEffect(() => { setFooterLai(lai); return () => setFooterLai(null); }, [lai, setFooterLai]);

  // Fetch tồn kho thuốc khi dsChon thay đổi (debounce)
  useEffect(() => {
    const ids = dsChon.map(i => i.thuoc.id).filter(id => !dsChon.find(c => c.thuoc.id === id)?.thuoc.la_thu_thuat);
    if (ids.length === 0) { setThuocStockMap({}); return; }
    const t = setTimeout(async () => {
      try {
        const { data } = await axios.get(`/api/inventory/check-thuoc-stock?thuoc_ids=${ids.join(',')}`);
        setThuocStockMap(data || {});
      } catch { /* silent */ }
    }, 400);
    return () => clearTimeout(t);
  }, [dsChon]);

  const danhSachThuocDonDangKe = useMemo(() => {
    return dsThuoc.filter((t) => !t.ngung_kinh_doanh && searchByStartsWith(t.tenthuoc, timThuocDonDangKe));
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
      setMobileSearchOpen(false);
      setTimThuocDonDangKe('');
      setHighlightedIndex(-1); // Reset highlighted index
    },
    [dsChon]
  );

  const xoaThuoc = useCallback((id: number) => {
    setDsChon((prev) => prev.filter((t) => t.thuoc.id !== id));
  }, []);

  const saoChepDon = useCallback(
    async (don: DonThuocCu) => {
      if (!await confirm('Bạn có chắc muốn sao chép đơn thuốc này?')) return;
      const chiTiet = dsChiTietDonCu[don.id] || [];
      setDsChon(chiTiet);
      setChandoan(don.chandoan);
      setSotienDaThanhToan(0);
      setSotienDaThanhToanInput('');
      setEditDonThuocId(null);
      setGhiNo(false);
      setActiveDonThuocMediaId(null);
      setDraftQueueResetToken((prev) => prev + 1);
      setDraftMediaQueue([]);
      // Cập nhật ngày giờ về thời gian hiện tại khi sao chép đơn
      const now = new Date();
      const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
      setNgayKham(vietnamTime.toISOString().slice(0, 16));
      toast.success('Đã sao chép đơn thuốc');
    },
    [dsChiTietDonCu]
  );

  // Sao chép đơn đang sửa dở (giữ nguyên những sửa đổi trong form)
  const saoChepDonDangSua = useCallback(async () => {
    if (!await confirm('Bạn có chắc muốn sao chép đơn đang sửa thành một đơn mới?')) return;
    // Reset trạng thái sửa
    setEditDonThuocId(null);
    setSotienDaThanhToan(0);
    setSotienDaThanhToanInput('');
    setGhiNo(false);
    setActiveDonThuocMediaId(null);
    setDraftQueueResetToken((prev) => prev + 1);
    setDraftMediaQueue([]);
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
      setActiveDonThuocMediaId(don.id);
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
    setTienKhachDua(0);
    setTienKhachDuaInput('');
    setEditDonThuocId(null);
    setActiveDonThuocMediaId(null);
    setTimThuocDonDangKe('');
    setHighlightedIndex(-1);
    setDraftQueueResetToken((prev) => prev + 1);
    setDraftMediaQueue([]);
    const now = new Date();
    const vietnamTime = new Date(now.getTime() + (7 * 60 * 60 * 1000)); // UTC+7
    setNgayKham(vietnamTime.toISOString().slice(0, 16)); // Reset về ngày giờ hiện tại theo UTC+7
    toast.success('Đã reset form đơn thuốc');
  }, []);

  // Tiêu đề động cho panel ảnh mobile
  const mobileMediaPanelTitle = useMemo(() => {
    if (!editDonThuocId) return 'Thêm ảnh vào đơn mới';
    const dt = new Date(ngayKham);
    const label = dt.toLocaleDateString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    const time = dt.toLocaleTimeString('vi-VN', {
      timeZone: 'Asia/Ho_Chi_Minh',
      hour: '2-digit',
      minute: '2-digit',
    });
    return `Thêm ảnh vào đơn ngày ${label} ${time}`;
  }, [editDonThuocId, ngayKham]);

  const mobileMediaDraftNotice = (!editDonThuocId && !activeDonThuocMediaId)
    ? 'Ảnh sẽ bị mất nếu không lưu đơn thuốc.'
    : undefined;

  const xoaDon = useCallback(
    async (id: number) => {
      if (!await confirm('Bạn có chắc muốn xóa đơn thuốc này?')) return;
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
    if (!await confirm('Bạn có chắc muốn xóa diễn tiến này?')) return;
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
    if (!await confirm(`Bạn có chắc muốn ${editDonThuocId ? 'cập nhật' : 'lưu'} đơn thuốc này?`)) return;

    try {
      const payload = {
        benhnhanid: parseInt(benhnhanid!),
        chandoan,
        ngay_kham: ngayKham,
        thuocs: dsChon.map((t) => ({
          id: t.thuoc.id,
          soluong: Math.max(1, Math.floor(t.soluong)), // Đảm bảo là integer >= 1
          giaban: t.thuoc.giaban,
          giavon: t.thuoc.gianhap || 0,
          gia_nguon: t.thuoc.gia_nguon || 'catalog_default',
          donvitinh: t.thuoc.donvitinh,
          cachdung: t.cachdung,
        })),
  sotien_da_thanh_toan: ghiNo ? paidClamped : tongTien,
      };

      let res;
      if (editDonThuocId) {
        res = await fetchWithAuth(`/api/don-thuoc`, {
          method: 'PUT',
          body: JSON.stringify({ id: editDonThuocId, ...payload }),
        });
      } else {
        res = await fetchWithAuth('/api/don-thuoc', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      }

      const data = await res.json();
      if (res.ok) {
        const draftQueueSnapshot = [...draftMediaQueue];
        saveChandoanToHistory(chandoan);
        toast.success(`Đã ${editDonThuocId ? 'cập nhật' : 'lưu'} đơn thuốc: ${data.data.madonthuoc}`);
        // Auto chuyển trạng thái chờ khám → đã_xong
        axios.patch('/api/cho-kham', {
          benhnhanid: parseInt(benhnhanid!),
          trangthai: 'đã_xong',
        }).catch(() => {});
        // Hiển thị cảnh báo tồn kho
        const warnings: string[] = data.inventoryWarnings || [];
        warnings.forEach((w: string) => toast(w, { duration: 6000, icon: '📦' }));
        const savedDonThuocId = editDonThuocId || data?.data?.id;

        setDraftQueueResetToken((prev) => prev + 1);
        setDraftMediaQueue([]);
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
        if (savedDonThuocId) {
          setActiveDonThuocMediaId(savedDonThuocId);
          if (draftQueueSnapshot.length > 0) {
            startBackgroundDonThuocMediaUpload(savedDonThuocId, draftQueueSnapshot);
          }
        }
      } else {
        toast.error(`Lỗi khi lưu đơn thuốc: ${data.message}`);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(`Lỗi khi lưu đơn thuốc: ${message}`);
    }
  }, [benhnhanid, chandoan, dsChon, ghiNo, tongTien, sotienDaThanhToan, editDonThuocId, ngayKham, resetForm, draftMediaQueue, startBackgroundDonThuocMediaUpload]);

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
          gia_nguon: 'catalog_default',
          soluongmacdinh: thuoc.soluong,
          la_thu_thuat: false,
          cachdung: thuoc.cachdung || '',
          hoatchat: ''
        },
        soluong: thuoc.soluong,
        cachdung: thuoc.cachdung || ''
      }));
      
      // Thêm vào đơn đang kê (hoặc thay thế)
      const shouldReplace = dsChon.length === 0 || await confirm('Bạn có muốn thay thế đơn thuốc hiện tại không?');
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

  const confirmBeforeFamilySwitch = useCallback(async () => {
    const hasDraftMedia = draftMediaQueue.length > 0;
    const hasUnsavedRx = !editDonThuocId && (dsChon.length > 0 || chandoan.trim().length > 0);
    if (!hasDraftMedia && !hasUnsavedRx) return true;
    return confirm({
      title: 'Chuyển sang thành viên khác?',
      message: hasDraftMedia
        ? 'Đơn thuốc hoặc ảnh tạm chưa lưu sẽ bị mất nếu bạn chuyển bệnh nhân.'
        : 'Đơn thuốc đang soạn chưa lưu sẽ bị mất nếu bạn chuyển bệnh nhân.',
      confirmText: 'Chuyển',
      variant: 'danger',
    });
  }, [chandoan, confirm, draftMediaQueue.length, dsChon.length, editDonThuocId]);

  const handleOpenFamilyMember = useCallback(
    (memberPatientId: number) => {
      if (!memberPatientId || memberPatientId === patientIdNumber) return;
      router.push(`/ke-don?bn=${memberPatientId}`);
    },
    [patientIdNumber, router],
  );

  if (!benhnhanid) {
    return (
      <div className="p-4">
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

  // Inline search box rendered tại vị trí nút "+ Thêm thuốc vào đơn" trên mobile
  const renderMobileInlineSearch = (compact = false) => (
    <div className={`${compact ? 'relative' : 'relative m-2 w-[calc(100%-1rem)]'}`}>
      <div className={`${compact ? 'border' : 'border-2'} border-dashed border-blue-200 rounded-xl bg-blue-50/40`}>
        <Input
          ref={mobileSearchRef}
          placeholder="Nhập tên thuốc, hoạt chất..."
          value={timThuocDonDangKe}
          onChange={(e) => {
            setTimThuocDonDangKe(e.target.value);
            setHighlightedIndex(-1);
          }}
          onKeyDown={(e) => {
            if (e.key === 'Escape') {
              setMobileSearchOpen(false);
              setTimThuocDonDangKe('');
              return;
            }
            handleKeyDown(e);
          }}
          className={`${compact ? 'h-10 text-sm px-3' : 'h-14 text-base px-4'} bg-transparent border-0 rounded-xl shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-500`}
        />
      </div>
      {timThuocDonDangKe && (
        <ul className="absolute top-full left-0 right-0 mt-1 text-sm max-h-60 overflow-y-auto bg-white border rounded-xl shadow-lg z-50">
          {danhSachThuocDonDangKe.map((t, index) => (
            <li
              key={t.id}
              className={`cursor-pointer px-3 py-2 flex items-center justify-between ${index === highlightedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'} ${dsChon.some((item) => item.thuoc.id === t.id) ? 'text-blue-600' : ''}`}
              onClick={() => themThuoc(t)}
            >
              <span className="flex items-center gap-1.5">
                <span>{dsChon.some((item) => item.thuoc.id === t.id) && '✓ '}{t.tenthuoc}</span>
              </span>
              {!t.la_thu_thuat && t.tonkho !== undefined && (
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-2 ${
                  (t.tonkho ?? 0) <= 0 ? 'bg-red-100 text-red-700'
                  : (t.tonkho ?? 0) <= 10 ? 'bg-yellow-100 text-yellow-700'
                  : 'bg-green-100 text-green-700'
                }`}>
                  {(t.tonkho ?? 0) <= 0 ? 'Hết' : `${t.tonkho}`}
                </span>
              )}
            </li>
          ))}
          {danhSachThuocDonDangKe.length === 0 && (
            <li className="px-3 py-2 text-gray-400">Không tìm thấy thuốc</li>
          )}
        </ul>
      )}
    </div>
  );

  return (
    <ProtectedRoute>
    <PatientFamilyProvider
      benhnhanId={patientIdNumber}
      patientName={benhNhan?.ten ?? ''}
      onSelectMember={handleOpenFamilyMember}
      beforeMemberSwitch={confirmBeforeFamilySwitch}
    >
  {/* Mobile: Stack layout, Desktop: Keep current grid (lg and up) */}
  <div className="flex flex-col lg:block">

        {/* Mobile layout - Clinical blue theme */}
  <div ref={mobileWrapperRef} className="block lg:hidden bg-[#f5f6f8] h-[calc(100dvh-68px)] flex flex-col overflow-hidden">

          {/* Patient Mobile Header — sticky + scroll-driven animation */}
          <PatientMobileHeader
            className="flex-shrink-0"
            benhNhan={benhNhan}
            benhnhanid={benhnhanid}
            patientNotes={patientNotes}
            onEditPatient={openEditPatientDialog}
            onManageNotes={openNotesManagement}
            switchPageLink={`/ke-don-kinh?bn=${benhnhanid}`}
            switchPageIcon={<Glasses className="w-[18px] h-[18px]" />}
            switchPageLabel="Kê đơn kính"
            mobileTab={mobileTab}
            mobileTabLabels={mobileTabLabels}
            onTabChange={(idx) => setMobileTab(idx as 0 | 1 | 2 | 3)}
            mobileHeaderRatio={mobileHeaderRatio}
            familySection={<PatientFamilyMobileChip benhnhanId={patientIdNumber} />}
            renderBackgroundUploadNotice={renderBackgroundUploadNotice}
          />

          {/* Swipeable viewport (4 panels: Đơn thuốc | Đơn cũ | Diễn tiến | Ảnh) */}
          <div
            ref={viewportRef}
            className="relative flex-1 min-h-0 overflow-hidden"
            onTouchStart={onTabTouchStart}
            onTouchMove={onTabTouchMove}
            onTouchEnd={onTabTouchEnd}
            onTouchCancel={onTabTouchEnd}
          >
            <div
              className="flex items-stretch h-full"
              style={{
                transform: `translate3d(calc(${-mobileTab * 100}vw + ${tabDragX}px), 0, 0)`,
                transition: tabDragging ? 'none' : 'transform 0.28s cubic-bezier(0.32, 0.72, 0, 1)',
                willChange: 'transform',
              }}
            >

          {/* === Panel 0: Đơn thuốc === */}
          <div
            data-panel-idx="0"
            style={{ width: '100vw', overflowY: mobileHeaderRatio > 0 && mobileHeaderRatio < 1 ? 'hidden' : 'auto' }}
            className="flex-shrink-0 h-full p-2 space-y-2"
          >

          {/* Diagnosis & Date - Mobile flat style */}
          <div className="px-1">
            <div className="bg-white rounded-xl px-2 py-1.5">
              <div className="flex items-center gap-1 px-1.5 pb-1">
                <p className="text-[15px] text-gray-700 leading-none">
                  <span className="font-extrabold text-gray-900">Chẩn đoán:</span>
                </p>
                <div className="ml-auto flex items-center gap-0.5">
                  <Input
                    ref={mobileNgayKhamRef}
                    type="datetime-local"
                    value={ngayKham}
                    onChange={(e) => setNgayKham(e.target.value)}
                    className="h-9 w-[150px] bg-transparent border-0 rounded-none px-0 py-0 text-[14px] font-semibold text-gray-600 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 [&::-webkit-datetime-edit]:pr-0 [&::-webkit-datetime-edit-fields-wrapper]:p-0 [&::-webkit-calendar-picker-indicator]:opacity-0 [&::-webkit-calendar-picker-indicator]:pointer-events-none"
                    style={{ colorScheme: 'light' }}
                  />
                  <button
                    type="button"
                    onClick={() => {
                      const input = mobileNgayKhamRef.current as (HTMLInputElement & { showPicker?: () => void }) | null;
                      input?.focus();
                      input?.showPicker?.();
                    }}
                    className="h-8 w-8 rounded-md border border-gray-200 text-gray-600 flex items-center justify-center active:bg-gray-100"
                    aria-label="Chọn ngày giờ khám"
                  >
                    <Calendar className="w-4.5 h-4.5" />
                  </button>
                </div>
              </div>
              <div className="relative">
                <Textarea
                  rows={2}
                  placeholder="Nhập chẩn đoán bệnh lý..."
                  value={chandoan}
                  onChange={(e) => handleChandoanChange(e.target.value)}
                  onFocus={(e) => { e.target.select(); chandoanSuggestions.length > 0 && setShowChandoanSuggestions(true); }}
                  onBlur={() => { setTimeout(() => setShowChandoanSuggestions(false), 150); }}
                  onKeyDown={(e) => { if (e.key === 'Escape') { setShowChandoanSuggestions(false); } }}
                  className="min-h-[56px] resize-none bg-transparent border-0 rounded-none px-1.5 py-2 text-[16px] leading-6 shadow-none focus-visible:ring-0 focus-visible:ring-offset-0 placeholder:text-gray-400"
                />
                {showChandoanSuggestions && chandoanSuggestions.length > 0 && (
                  <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                    {chandoanSuggestions.map((suggestion, idx) => (
                      <div
                        key={idx}
                        className={`px-3 py-2 cursor-pointer text-sm ${
                          idx === selectedSuggestionIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
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
          </div>

          {/* Drug Prescription Card - Mobile */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex flex-col">
            <div className="p-3 border-b border-gray-200 flex justify-between items-start gap-2">
              <div className="min-w-0">
                <h3 className="font-bold text-gray-900 text-sm tracking-tight">
                  📝 Đơn thuốc{' '}
                  {dsChon.length > 0 && (
                    <span className="text-blue-600 font-extrabold ml-0.5">({dsChon.length})</span>
                  )}
                  {editDonThuocId ? <span className="text-orange-500 text-xs font-medium ml-1">(Đang sửa)</span> : ''}
                </h3>
                {dsChon.length > 0 && (
                  <p className="text-[11px] text-gray-400 italic mt-0.5">Vuốt sang trái để chỉnh số lượng hoặc xoá</p>
                )}
              </div>
              <Dialog open={showMauDialog} onOpenChange={setShowMauDialog}>
                <DialogTrigger asChild>
                  <button
                    className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-1 transition-colors"
                    onClick={() => {
                      setShowMauDialog(true);
                      fetchDonThuocMau();
                    }}
                  >
                    📋 Đơn mẫu
                  </button>
                </DialogTrigger>
                <DialogContent className="max-w-[95vw] max-h-[80vh] overflow-y-auto">
                  <DialogHeader>
                    <DialogTitle>Chọn đơn thuốc mẫu</DialogTitle>
                  </DialogHeader>
                  {loadingMau ? (
                    <div className="text-center py-4">Đang tải...</div>
                  ) : dsMau.length === 0 ? (
                    <div className="text-center py-4 text-gray-500">Không có đơn thuốc mẫu nào</div>
                  ) : (
                    <div className="space-y-2">
                      {dsMau.map((mau) => (
                        <div
                          key={mau.id}
                          className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                          onClick={() => apDungDonMau(mau.id)}
                        >
                          <h3 className="font-semibold">{mau.ten_mau}</h3>
                          {mau.mo_ta && <p className="text-sm text-gray-600 mb-2">{mau.mo_ta}</p>}
                          {mau.chitiet && mau.chitiet.length > 0 && (
                            <div className="mt-2 text-xs">
                              <strong>Thuốc:</strong> {mau.chitiet.map((ct: any) => `${ct.thuoc.tenthuoc} x${ct.soluong}`).join(', ')}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </DialogContent>
              </Dialog>
            </div>

            {/* Selected drugs - Mobile cards */}
            <div className="p-0">
              {dsChon.length === 0 ? (
                mobileSearchOpen ? (
                  renderMobileInlineSearch()
                ) : (
                  <button
                    type="button"
                    onClick={openMobileSearch}
                    className="m-2 w-[calc(100%-1rem)] text-center py-4 text-sm font-semibold text-blue-600 hover:text-blue-700 border-2 border-dashed border-blue-200 rounded-xl bg-blue-50/40 hover:bg-blue-50 transition-colors"
                  >
                    + Thêm thuốc vào đơn
                  </button>
                )
              ) : (
                <>
                  <div className="divide-y divide-gray-100">
                    {dsChon.map((item, idx) => (
                      <MobileDrugRow
                        key={item.thuoc.id}
                        item={item}
                        stock={thuocStockMap[item.thuoc.id]}
                        onTap={() => setMobileDetailIdx(idx)}
                        onDelete={() => xoaThuoc(item.thuoc.id)}
                        onIncrement={() => setDsChon((prev) => {
                          const updated = [...prev];
                          updated[idx] = { ...updated[idx], soluong: (updated[idx].soluong || 0) + 1 };
                          delete updated[idx].soluongInput;
                          return updated;
                        })}
                        onDecrement={() => setDsChon((prev) => {
                          const updated = [...prev];
                          const next = (updated[idx].soluong || 0) - 1;
                          updated[idx] = { ...updated[idx], soluong: next < 1 ? 1 : next };
                          delete updated[idx].soluongInput;
                          return updated;
                        })}
                      />
                    ))}
                  </div>
                  {/* Trigger to add more — biến thành ô tìm kiếm khi bấm */}
                  <div className="p-2 border-t border-gray-100">
                    {mobileSearchOpen ? (
                      renderMobileInlineSearch(true)
                    ) : (
                      <button
                        type="button"
                        onClick={openMobileSearch}
                        className="w-full text-center py-2.5 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-dashed border-blue-200 rounded-xl bg-blue-50/40 hover:bg-blue-50 transition-colors"
                      >
                        + Thêm thuốc vào đơn
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          </div>

          {/* (Đã chuyển ô tìm kiếm vào ngay vị trí nút "+ Thêm thuốc vào đơn") */}
          {false && mobileSearchOpen && (
            <div className="bg-white rounded-xl shadow-sm border border-blue-200 p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-sm font-bold text-gray-700">Tìm thuốc</label>
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-gray-700 px-2 py-1"
                  onClick={() => { setMobileSearchOpen(false); setTimThuocDonDangKe(''); }}
                >
                  Đóng
                </button>
              </div>
              <div className="relative">
                <Input
                  ref={mobileSearchRef}
                  placeholder="Nhập tên thuốc, hoạt chất..."
                  value={timThuocDonDangKe}
                  onChange={(e) => {
                    setTimThuocDonDangKe(e.target.value);
                    setHighlightedIndex(-1);
                  }}
                  onKeyDown={handleKeyDown}
                  className="bg-white border border-gray-300 rounded-xl px-4 py-3 text-base focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
                />
                {timThuocDonDangKe && (
                  <ul className="absolute top-full left-0 right-0 mt-1 text-sm max-h-60 overflow-y-auto bg-white border rounded-xl shadow-lg z-50">
                    {danhSachThuocDonDangKe.map((t, index) => (
                      <li
                        key={t.id}
                        className={`cursor-pointer px-3 py-2 flex items-center justify-between ${index === highlightedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'} ${dsChon.some((item) => item.thuoc.id === t.id) ? 'text-blue-600' : ''}`}
                        onClick={() => themThuoc(t)}
                      >
                        <span className="flex items-center gap-1.5">
                          <span>{dsChon.some((item) => item.thuoc.id === t.id) && '✓ '}{t.tenthuoc}</span>
                        </span>
                        {!t.la_thu_thuat && t.tonkho !== undefined && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-2 ${
                            (t.tonkho ?? 0) <= 0 ? 'bg-red-100 text-red-700'
                            : (t.tonkho ?? 0) <= 10 ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                          }`}>
                            {(t.tonkho ?? 0) <= 0 ? 'Hết' : `${t.tonkho}`}
                          </span>
                        )}
                      </li>
                    ))}
                    {danhSachThuocDonDangKe.length === 0 && (
                      <li className="px-3 py-2 text-gray-400">Không tìm thấy thuốc</li>
                    )}
                  </ul>
                )}
              </div>
            </div>
          )}

          {/* Mobile detail dialog for a selected medicine — show cách dùng & remove */}
          <Dialog open={mobileDetailIdx !== null} onOpenChange={(o) => { if (!o) setMobileDetailIdx(null); }}>
            <DialogContent className="max-w-[92vw]">
              {mobileDetailIdx !== null && dsChon[mobileDetailIdx] && (
                <>
                  <DialogHeader>
                    <DialogTitle className="text-base">{dsChon[mobileDetailIdx].thuoc.tenthuoc}</DialogTitle>
                  </DialogHeader>
                  <div className="space-y-3">
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">Cách dùng</Label>
                      <Textarea
                        autoFocus
                        rows={3}
                        placeholder="VD: Uống 1 viên sau ăn sáng, 1 viên sau ăn tối..."
                        value={dsChon[mobileDetailIdx].cachdung}
                        onChange={(e) => {
                          const val = e.target.value;
                          setDsChon((prev) => {
                            const updated = [...prev];
                            if (mobileDetailIdx !== null && updated[mobileDetailIdx]) {
                              updated[mobileDetailIdx].cachdung = val;
                            }
                            return updated;
                          });
                        }}
                        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="space-y-1">
                      <Label className="text-xs text-gray-600">Số lượng ({dsChon[mobileDetailIdx].thuoc.donvitinh})</Label>
                      <Input
                        type="number"
                        min={1}
                        step={1}
                        value={dsChon[mobileDetailIdx].soluongInput !== undefined ? dsChon[mobileDetailIdx].soluongInput : String(dsChon[mobileDetailIdx].soluong)}
                        onFocus={(e) => e.target.select()}
                        onChange={(e) => {
                          const raw = e.target.value;
                          setDsChon((prev) => {
                            const updated = [...prev];
                            if (mobileDetailIdx === null || !updated[mobileDetailIdx]) return updated;
                            updated[mobileDetailIdx].soluongInput = raw;
                            if (raw !== '') {
                              const parsed = parseInt(raw, 10);
                              if (!Number.isNaN(parsed)) updated[mobileDetailIdx].soluong = parsed;
                            }
                            return updated;
                          });
                        }}
                        onBlur={() => {
                          setDsChon((prev) => {
                            const updated = [...prev];
                            if (mobileDetailIdx === null || !updated[mobileDetailIdx]) return updated;
                            const buf = updated[mobileDetailIdx].soluongInput;
                            if (buf === undefined) return updated;
                            const parsed = buf !== '' ? parseInt(buf, 10) : NaN;
                            updated[mobileDetailIdx].soluong = (Number.isNaN(parsed) || parsed < 1) ? 1 : parsed;
                            delete updated[mobileDetailIdx].soluongInput;
                            return updated;
                          });
                        }}
                        className="bg-white border border-gray-300 rounded-lg px-3 py-2 text-base focus:outline-none focus:ring-2 focus:ring-blue-500"
                      />
                    </div>
                    <div className="flex justify-between gap-2 pt-1">
                      <Button
                        variant="outline"
                        className="text-red-600 border-red-200 hover:bg-red-50"
                        onClick={() => {
                          const id = dsChon[mobileDetailIdx!]?.thuoc.id;
                          setMobileDetailIdx(null);
                          if (id !== undefined) xoaThuoc(id);
                        }}
                      >
                        <Trash2 className="w-4 h-4 mr-1" /> Xoá khỏi đơn
                      </Button>
                      <Button onClick={() => setMobileDetailIdx(null)}>Xong</Button>
                    </div>
                  </div>
                </>
              )}
            </DialogContent>
          </Dialog>

          {/* Payment & Actions - Mobile */}
          <div className="bg-white rounded-xl shadow-sm border border-gray-200 p-3 space-y-3">
            {/* Payment summary */}
            <div className="space-y-1.5">
              {tongTienThuoc > 0 && (
                <div className="flex justify-between items-center pb-1.5 border-b border-gray-200">
                  <span className="text-xs text-gray-500 font-medium">Tiền thuốc</span>
                  <span className="text-sm font-bold text-gray-800">{tongTienThuoc.toLocaleString()}đ</span>
                </div>
              )}
              {tongTienThuThuat > 0 && (
                <div className="flex justify-between items-center pb-1.5 border-b border-gray-200">
                  <span className="text-xs text-amber-600 font-medium">Tiền thủ thuật</span>
                  <span className="text-sm font-bold text-amber-700">{tongTienThuThuat.toLocaleString()}đ</span>
                </div>
              )}
              {ghiNo && (
                <>
                  <div className="flex justify-between items-center pb-1.5 border-b border-gray-200">
                    <span className="text-xs text-gray-500 font-medium">Đã thanh toán</span>
                    <span className="text-sm font-bold text-green-600">{sotienDaThanhToan.toLocaleString()}đ</span>
                  </div>
                  <div className="flex justify-between items-center pb-1.5 border-b border-gray-200">
                    <span className="text-xs text-gray-500 font-medium">Còn nợ</span>
                    <span className="text-sm font-bold text-red-600">{sotienConNo.toLocaleString()}đ</span>
                  </div>
                </>
              )}
              <div className="pt-2 flex justify-between items-center">
                <span className="font-extrabold text-gray-900 tracking-tight">TỔNG CỘNG</span>
                <span className="font-extrabold text-2xl text-blue-600">{tongTien.toLocaleString()}đ</span>
              </div>
            </div>

            {/* Tiền khách đưa */}
            <div className="space-y-1 px-1">
              <label className="text-xs font-medium text-gray-700 uppercase">Khách đưa</label>
              <div className="flex items-center bg-white border border-gray-300 rounded-xl px-3 py-2.5">
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
                  className="bg-transparent flex-1 outline-none text-sm min-w-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                />
                {tienKhachDuaInput && Number(tienKhachDuaInput) !== 0 && (
                  <span className="text-sm text-gray-400 font-mono ml-0.5">.000</span>
                )}
              </div>
            </div>

            {tienKhachDua > 0 && tienTraLai > 0 && (
              <div className="flex justify-between items-center px-1">
                <span className="text-xs text-gray-500 font-medium">Tiền trả lại khách</span>
                <span className="text-sm font-bold text-blue-600">{tienTraLai.toLocaleString()}đ</span>
              </div>
            )}

            {/* Debt checkbox */}
            <div className="flex items-center gap-2 px-1">
              <input
                type="checkbox"
                id="ghiNo-mobile"
                checked={ghiNo}
                onChange={(e) => setGhiNo(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-blue-600 focus:ring-blue-200"
              />
              <label htmlFor="ghiNo-mobile" className="text-sm font-semibold text-gray-700 cursor-pointer">
                Ghi nợ đơn hàng này
              </label>
            </div>
            {ghiNo && (
              <div className="space-y-1 px-1">
                <label className="text-xs font-medium text-gray-700 uppercase">Đã thanh toán</label>
                <div className="flex items-center bg-white border border-gray-300 rounded-xl px-3 py-2.5">
                  <input
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
                    placeholder="Nhập số"
                    className="bg-transparent flex-1 outline-none text-sm min-w-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
                  />
                  {sotienDaThanhToanInput && Number(sotienDaThanhToanInput) !== 0 && (
                    <span className="text-sm text-gray-400 font-mono ml-0.5">.000</span>
                  )}
                </div>
              </div>
            )}

            {/* Action buttons - Mobile */}
            <div className="space-y-2 pt-1">
              {!editDonThuocId && (
                <button
                  className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-extrabold py-3 rounded-xl shadow-clinical flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  onClick={luuDonThuoc}
                  disabled={!chandoan || dsChon.length === 0}
                >
                  ✓ LƯU ĐƠN THUỐC
                </button>
              )}
              {editDonThuocId && (
                <button
                  className="w-full bg-blue-700 hover:bg-blue-800 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-extrabold py-3 rounded-xl shadow-clinical flex items-center justify-center gap-2 transition-all active:scale-[0.98]"
                  onClick={luuDonThuoc}
                  disabled={!chandoan || dsChon.length === 0}
                >
                  ✓ CẬP NHẬT ĐƠN
                </button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <button
                  className="bg-white border border-gray-200 text-gray-700 font-bold text-sm py-2.5 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                  onClick={resetForm}
                >
                  <FilePlus className="w-4 h-4" /> Đơn mới
                </button>
                {editDonThuocId ? (
                  <button
                    className="bg-white border border-gray-200 text-gray-700 font-bold text-sm py-2.5 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                    onClick={() => saoChepDonDangSua()}
                  >
                    📋 Sao chép
                  </button>
                ) : (
                  <Dialog open={showMauDialog} onOpenChange={setShowMauDialog}>
                    <DialogTrigger asChild>
                      <button
                        className="bg-white border border-gray-200 text-gray-700 font-bold text-sm py-2.5 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1.5"
                        onClick={() => {
                          setShowMauDialog(true);
                          fetchDonThuocMau();
                        }}
                      >
                        📋 Đơn mẫu
                      </button>
                    </DialogTrigger>
                  </Dialog>
                )}
              </div>
              {editDonThuocId && (
                <button
                  className="w-full bg-white border border-red-200 text-red-500 font-bold text-sm py-2.5 rounded-xl hover:bg-red-50 transition-colors"
                  onClick={() => xoaDon(editDonThuocId)}
                >
                  Xóa đơn thuốc
                </button>
              )}
              {editDonThuocId && benhNhan && (
                <PrintDonThuoc
                  config={printConfig}
                  chandoan={chandoan}
                  ngayKham={ngayKham}
                  dsThuoc={dsChon}
                  benhNhan={benhNhan}
                  tongTien={tongTien}
                  buttonClassName="w-full justify-center border-gray-200 transition-colors gap-1.5"
                />
              )}
            </div>
          </div>

          {/* === End Panel 0 === */}
          </div>

          {/* === Panel 1: Đơn cũ — mỗi đơn là 1 card độc lập === */}
          <div
            data-panel-idx="1"
            style={{ width: '100vw', overflowY: mobileHeaderRatio > 0 && mobileHeaderRatio < 1 ? 'hidden' : 'auto' }}
            className="flex-shrink-0 h-full p-2 space-y-0.5"
          >
            {dsDonCu.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">Chưa có đơn thuốc nào.</div>
            ) : (
              dsDonCu.map((don) => {
                const items = dsChiTietDonCu[don.id] || [];
                const isActive = don.id === highlightId || don.id === editDonThuocId;
                return (
                  <div
                    key={don.id}
                    className={`bg-white rounded-xl shadow-sm border-2 transition-all overflow-hidden ${isActive ? 'border-blue-500 ring-2 ring-blue-100' : 'border-gray-200'}`}
                    onClick={() => { suaDon(don); setMobileTab(0); }}
                  >
                    {/* Header: ngày khám + tổng tiền */}
                    <div className="px-3 py-2 bg-blue-50/60 border-b border-blue-100 flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Calendar className="w-4 h-4 text-blue-600" />
                        <p className="text-sm font-bold text-gray-800">
                          {new Date(don.ngay_kham).toLocaleDateString('vi-VN', {
                            timeZone: 'Asia/Ho_Chi_Minh',
                            day: '2-digit',
                            month: '2-digit',
                            year: 'numeric',
                          })}
                        </p>
                      </div>
                      <div className="flex flex-col items-end gap-0.5">
                        <p className="text-sm font-extrabold text-blue-700 tabular-nums">{don.tongtien.toLocaleString()}đ</p>
                        {(don.tongtien - (don.sotien_da_thanh_toan || 0)) > 0 && (
                          <p className="text-xs font-semibold text-red-600">Nợ {((don.tongtien - (don.sotien_da_thanh_toan || 0)) / 1000).toFixed(0)}k</p>
                        )}
                      </div>
                    </div>
                    {/* Chẩn đoán */}
                    {don.chandoan && (
                      <div className="px-3 pt-2">
                        <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide">Chẩn đoán</p>
                        <p className="text-sm font-semibold text-gray-800 leading-snug mt-0.5">{don.chandoan}</p>
                      </div>
                    )}
                    {/* Danh sách thuốc */}
                    <div className="px-3 py-2">
                      <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wide mb-1">Thuốc ({items.length})</p>
                      {items.length === 0 ? (
                        <p className="text-xs text-gray-400 italic">Không có thuốc</p>
                      ) : (
                        <ul className="divide-y divide-gray-100">
                          {items.map((item, i) => (
                            <li key={i} className="py-1.5 flex items-start gap-2">
                              <span className="flex-shrink-0 w-5 h-5 rounded-full bg-blue-100 text-blue-700 text-[11px] font-bold flex items-center justify-center mt-0.5">{i + 1}</span>
                              <div className="flex-1 min-w-0">
                                <div className="flex items-baseline justify-between gap-2">
                                  <p className="text-sm font-semibold text-gray-900 truncate">{item.thuoc.tenthuoc}</p>
                                  <p className="text-sm font-bold text-gray-700 whitespace-nowrap tabular-nums">{item.soluong} {item.thuoc.donvitinh}</p>
                                </div>
                                {item.cachdung && (
                                  <p className="text-xs text-gray-500 mt-0.5">{item.cachdung}</p>
                                )}
                              </div>
                            </li>
                          ))}
                        </ul>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {/* === Panel 2: Diễn tiến — mỗi ghi chú là 1 card độc lập === */}
          <div
            data-panel-idx="2"
            style={{ width: '100vw', overflowY: mobileHeaderRatio > 0 && mobileHeaderRatio < 1 ? 'hidden' : 'auto' }}
            className="flex-shrink-0 h-full p-2 space-y-2"
          >
            <div className="flex justify-end">
              <Dialog open={openDialog} onOpenChange={setOpenDialog}>
                <DialogTrigger asChild>
                  <button className="bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold px-3 py-1.5 rounded-lg flex items-center gap-1 transition-colors shadow-sm">+ Thêm diễn tiến</button>
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
                    <Button onClick={editDienTien ? suaDienTien : themDienTien} className="w-full">
                      {editDienTien ? 'Lưu' : 'Thêm'}
                    </Button>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
            {dsDienTien.length === 0 ? (
              <div className="bg-white rounded-xl border border-gray-200 px-4 py-8 text-center text-sm text-gray-400">Chưa có diễn tiến nào.</div>
            ) : (
              dsDienTien.map((d) => (
                <div key={d.id} className="bg-white rounded-xl shadow-sm border-2 border-gray-200 overflow-hidden">
                  <div className="px-3 py-2 bg-emerald-50/60 border-b border-emerald-100 flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Calendar className="w-4 h-4 text-emerald-600" />
                      <p className="text-sm font-bold text-gray-800">{format(new Date(d.ngay), 'dd/MM/yyyy')}</p>
                    </div>
                    <div className="flex gap-1">
                      <button
                        className="p-1.5 text-gray-400 hover:text-blue-600 transition-colors"
                        onClick={() => { setEditDienTien(d); setOpenDialog(true); }}
                      >
                        <Pencil className="w-4 h-4" />
                      </button>
                      <button
                        className="p-1.5 text-gray-400 hover:text-red-500 transition-colors"
                        onClick={() => xoaDienTien(d.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                  <p className="px-3 py-2.5 text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{d.noidung}</p>
                </div>
              ))
            )}
          </div>

          {/* === Panel 3: Ảnh đơn thuốc === */}
          <div
            data-panel-idx="3"
            style={{ width: '100vw', overflowY: mobileHeaderRatio > 0 && mobileHeaderRatio < 1 ? 'hidden' : 'auto' }}
            className="flex-shrink-0 h-full p-2 space-y-2"
          >
            <DonKinhMediaPanel
              donKinhId={null}
              mediaOwnerId={activeDonThuocMediaId || editDonThuocId}
              apiBasePath="/api/don-thuoc/media"
              ownerIdField="don_thuoc_id"
              ownerLabel="đơn thuốc"
              missingOwnerMessage="Chưa có đơn thuốc đang chọn."
              mediaKind="don_thuoc"
              enableDraftWhenNoDonKinhId
              draftQueueResetToken={draftQueueResetToken}
              onDraftQueueChange={setDraftMediaQueue}
              onPhotoAdded={() => setMobileTab(0)}
              headerTitle={mobileMediaPanelTitle}
              draftNoticeText={mobileMediaDraftNotice}
            />
            <PatientMediaTimeline
              patientId={patientIdNumber}
              sourceFilter="don_thuoc"
              hideHeader
              onCountChange={setImageTabCount}
              ownerIdFilter={activeDonThuocMediaId || editDonThuocId || null}
            />
          </div>

            {/* === End rail === */}
            </div>
          {/* === End viewport === */}
          </div>
        </div>

  {/* Desktop layout - Clinical 3-panel design (lg and up) */}
  <div className="hidden lg:flex h-[calc(100vh-76px)] overflow-hidden">

    {/* ═══ LEFT SIDEBAR: Tab Đơn cũ / Diễn biến ═══ */}
    <aside className="w-72 flex-shrink-0 border-r border-gray-200 bg-[#f5f6f8] flex flex-col overflow-hidden">
      <div className="px-3 pt-3 pb-2">
        <div className="flex items-center justify-between gap-2">
          <div className="inline-flex items-center gap-1">
            <button
              type="button"
              onClick={() => setDesktopLeftTab('don_cu')}
              className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${desktopLeftTab === 'don_cu' ? 'text-blue-700 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Đơn cũ ({dsDonCu.length})
            </button>
            <button
              type="button"
              onClick={() => setDesktopLeftTab('dien_bien')}
              className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${desktopLeftTab === 'dien_bien' ? 'text-blue-700 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Diễn biến ({dsDienTien.length})
            </button>
            <button
              type="button"
              onClick={() => setDesktopLeftTab('anh')}
              className={`px-2 py-1 text-xs font-bold rounded-md transition-colors ${desktopLeftTab === 'anh' ? 'text-blue-700 bg-blue-50' : 'text-gray-600 hover:bg-gray-100'}`}
            >
              Ảnh ({imageTabCount})
            </button>
          </div>
          {desktopLeftTab === 'dien_bien' && (
            <Dialog open={openDialog} onOpenChange={setOpenDialog}>
              <DialogTrigger asChild>
                <button className="text-blue-600 hover:text-blue-800 text-xs font-bold px-2 py-1 rounded-md hover:bg-blue-50 transition-colors">
                  + Thêm
                </button>
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
          )}
        </div>
      </div>
      <div className="px-3 pb-2">
        <div className="h-px bg-gradient-to-r from-transparent via-gray-300/80 to-transparent" />
      </div>

      <div className="flex-1 overflow-y-auto clinical-scrollbar px-2 pb-2 space-y-1.5 min-h-0">
        {desktopLeftTab === 'don_cu' && (
          <>
            {dsDonCu.length === 0 && (
              <p className="text-xs text-gray-400 px-1">Chưa có đơn thuốc nào.</p>
            )}
            <div className="space-y-1">
              {dsDonCuGroupedByYear.map((group) => (
                <div key={group.year} className="space-y-0.5">
                  <div className="flex items-center px-0.5 pt-1.5 pb-0.5">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-extrabold text-gray-700">
                      {group.year === 'Không rõ năm'
                        ? `Năm khác (${group.items.length})`
                        : `Năm ${group.year} (${group.items.length})`}
                    </span>
                  </div>
                  {group.items.map((don) => (
                    <div
                      key={don.id}
                      className={`px-2.5 py-2 rounded-xl cursor-pointer transition-all border ${don.id === highlightId || don.id === editDonThuocId ? 'bg-blue-50 border-blue-400 shadow-sm' : 'bg-transparent border-transparent hover:bg-white hover:border-blue-300 hover:shadow-sm'}`}
                      onClick={() => suaDon(don)}
                    >
                      <div className="flex items-center justify-between gap-2 mb-0.5">
                        <p className="text-[11px] font-semibold text-gray-600 whitespace-nowrap">
                          {formatNgayKhamDdMm(don.ngay_kham)}
                        </p>
                        <p className="text-xs font-bold text-gray-900 truncate flex-1">{don.chandoan || '—'}</p>
                        <div className="flex flex-col items-end gap-0.5 flex-shrink-0">
                          <p className="text-[11px] font-bold text-blue-600">{(don.tongtien / 1000).toFixed(0)}k</p>
                          {(don.tongtien - (don.sotien_da_thanh_toan || 0)) > 0 && (
                            <p className="text-[10px] font-semibold text-red-600">Nợ {(((don.tongtien - (don.sotien_da_thanh_toan || 0)) / 1000).toFixed(0))}k</p>
                          )}
                        </div>
                      </div>
                      <p className="text-[11px] text-gray-500 leading-tight">
                        {dsChiTietDonCu[don.id]?.map((item) => `${item.thuoc.tenthuoc} x${item.soluong}`).join(', ') || 'Không có thuốc'}
                      </p>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </>
        )}

        {desktopLeftTab === 'dien_bien' && (
          <>
            {dsDienTien.length === 0 && (
              <p className="text-xs text-gray-400 px-1">Chưa có diễn tiến nào.</p>
            )}
            {dsDienTien.map((d) => (
              <div key={d.id} className="px-2.5 py-2 rounded-xl border border-transparent bg-transparent hover:bg-white hover:border-blue-300 hover:shadow-sm group transition-all">
                <div className="flex justify-between items-start gap-2">
                  <div className="flex-1 min-w-0">
                    <p className="text-[11px] font-bold text-gray-500 uppercase">{format(new Date(d.ngay), 'dd/MM/yyyy')}</p>
                    <p className="text-xs text-gray-700 mt-0.5 line-clamp-2">{d.noidung}</p>
                  </div>
                  <div className="flex gap-0.5 ml-1 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button
                      className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                      onClick={() => {
                        setEditDienTien(d);
                        setOpenDialog(true);
                      }}
                    >
                      <Pencil className="w-3 h-3" />
                    </button>
                    <button
                      className="p-1 text-gray-400 hover:text-red-500 transition-colors"
                      onClick={() => xoaDienTien(d.id)}
                    >
                      <Trash2 className="w-3 h-3" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </>
        )}

        {desktopLeftTab === 'anh' && (
          <PatientMediaTimeline
            patientId={patientIdNumber}
            sourceFilter="don_thuoc"
            dense
            hideHeader
            onCountChange={setImageTabCount}
          />
        )}
      </div>
    </aside>

    {/* ═══ MIDDLE: Prescription Core ═══ */}
    <section className="flex-1 overflow-y-auto clinical-scrollbar p-4 flex flex-col gap-3 bg-[#f5f6f8]">
      {/* Patient Desktop Card — info + notes + background upload */}
      <PatientDesktopCard
        benhNhan={benhNhan}
        benhnhanid={benhnhanid}
        patientNotes={patientNotes}
        onEditPatient={openEditPatientDialog}
        onManageNotes={openNotesManagement}
        switchPageLink={`/ke-don-kinh?bn=${benhnhanid}`}
        switchPageLabel="Kê đơn kính"
        familySection={<PatientFamilyDesktopChip benhnhanId={patientIdNumber} />}
        renderBackgroundUploadNotice={renderBackgroundUploadNotice}
      />

      {/* Diagnosis & Date Row */}
      <div className="grid grid-cols-3 gap-3">
        <div className="col-span-2 space-y-1">
          <label className="text-xs font-medium text-gray-700 uppercase ml-1">Chẩn đoán</label>
          <div className="relative">
            <Input
              ref={chandoanDesktopRef}
              placeholder="Nhập chẩn đoán..."
              value={chandoan}
              onChange={(e) => handleChandoanChange(e.target.value)}
              onFocus={(e) => { e.target.select(); chandoanSuggestions.length > 0 && setShowChandoanSuggestions(true); }}
              onBlur={() => { setTimeout(() => setShowChandoanSuggestions(false), 150); }}
              onKeyDown={(e) => {
                if (e.key === 'Escape') {
                  setShowChandoanSuggestions(false);
                } else if (e.key === 'ArrowDown' && showChandoanSuggestions) {
                  e.preventDefault();
                  setSelectedSuggestionIndex(prev =>
                    prev < chandoanSuggestions.length - 1 ? prev + 1 : prev
                  );
                } else if (e.key === 'ArrowUp' && showChandoanSuggestions) {
                  e.preventDefault();
                  setSelectedSuggestionIndex(prev => prev > 0 ? prev - 1 : -1);
                } else if (e.key === 'Enter') {
                  e.preventDefault();
                  if (showChandoanSuggestions && selectedSuggestionIndex >= 0) {
                    selectChandoanSuggestion(chandoanSuggestions[selectedSuggestionIndex]);
                  } else {
                    // Keep the currently typed diagnosis even if suggestions are still visible.
                    setShowChandoanSuggestions(false);
                    setSelectedSuggestionIndex(-1);
                    searchDesktopRef.current?.focus();
                  }
                }
              }}
              className="bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm font-medium text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
            />
            {showChandoanSuggestions && chandoanSuggestions.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border rounded-xl shadow-lg z-50 max-h-48 overflow-y-auto">
                {chandoanSuggestions.map((suggestion, idx) => (
                  <div
                    key={idx}
                    className={`px-4 py-2.5 cursor-pointer text-sm ${
                      idx === selectedSuggestionIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'
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
        <div className="space-y-1">
          <label className="text-xs font-medium text-gray-700 uppercase ml-1">Ngày giờ khám</label>
          <Input
            type="datetime-local"
            value={ngayKham}
            onChange={(e) => setNgayKham(e.target.value)}
            className="bg-white border border-gray-300 rounded-lg px-3 py-2.5 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
            style={{ colorScheme: 'light' }}
          />
        </div>
      </div>

      {/* Medicine Table Card */}
      <div className="bg-white rounded-xl shadow-sm border border-gray-200 flex-1 flex flex-col min-h-[300px]">
        {/* Table Header */}
        <div className="p-3 border-b border-gray-200 flex justify-between items-center">
          <div className="flex items-center gap-2">
            <div className="relative w-72">
              <Input
                ref={searchDesktopRef}
                placeholder="Tìm thuốc để thêm..."
                value={timThuocDonDangKe}
                onChange={(e) => {
                  setTimThuocDonDangKe(e.target.value);
                  setHighlightedIndex(-1);
                }}
                onKeyDown={handleKeyDown}
                className="bg-white border border-gray-300 rounded-lg pl-4 pr-4 py-2 text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 transition-shadow"
              />
              {timThuocDonDangKe && (
                <ul className="absolute top-full left-0 right-0 mt-1 text-xs max-h-48 overflow-y-auto bg-white border rounded-xl shadow-lg z-50">
                  {danhSachThuocDonDangKe.map((t, index) => (
                    <li
                      key={t.id}
                      className={`cursor-pointer px-4 py-2 flex items-center justify-between ${index === highlightedIndex ? 'bg-blue-50 text-blue-700' : 'hover:bg-gray-50'} ${dsChon.some((item) => item.thuoc.id === t.id) ? 'text-blue-600' : ''}`}
                      onClick={() => themThuoc(t)}
                    >
                      <span className="flex items-center gap-1.5">
                        <span>{dsChon.some((item) => item.thuoc.id === t.id) && '✓ '}{t.tenthuoc}</span>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ${getPriceSourceClass(t.gia_nguon)}`}>
                          {getPriceSourceLabel(t.gia_nguon)}
                        </span>
                      </span>
                      {!t.la_thu_thuat && t.tonkho !== undefined && (
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium ml-2 ${
                          (t.tonkho ?? 0) <= 0 ? 'bg-red-100 text-red-700'
                          : (t.tonkho ?? 0) <= 10 ? 'bg-yellow-100 text-yellow-700'
                          : 'bg-green-100 text-green-700'
                        }`}>
                          {(t.tonkho ?? 0) <= 0 ? 'Hết' : `${t.tonkho}`}
                        </span>
                      )}
                    </li>
                  ))}
                  {danhSachThuocDonDangKe.length === 0 && (
                    <li className="px-4 py-2 text-gray-400">Không tìm thấy thuốc</li>
                  )}
                </ul>
              )}
            </div>
            <Dialog open={showMauDialog} onOpenChange={setShowMauDialog}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="text-xs rounded-full px-3 h-8 border-gray-200"
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
                  <div className="text-center py-4 text-gray-500">Không có đơn thuốc mẫu nào</div>
                ) : (
                  <div className="space-y-2">
                    {dsMau.map((mau) => (
                      <div
                        key={mau.id}
                        className="border rounded-lg p-3 hover:bg-gray-50 cursor-pointer"
                        onClick={() => apDungDonMau(mau.id)}
                      >
                        <h3 className="font-semibold">{mau.ten_mau}</h3>
                        {mau.mo_ta && <p className="text-sm text-gray-600 mb-2">{mau.mo_ta}</p>}
                        {mau.chitiet && mau.chitiet.length > 0 && (
                          <div className="mt-2 text-xs">
                            <strong>Thuốc:</strong> {mau.chitiet.map((ct: any) => `${ct.thuoc.tenthuoc} x${ct.soluong}`).join(', ')}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </DialogContent>
            </Dialog>
          </div>
          <h3 className="font-bold text-gray-900 text-sm tracking-tight whitespace-nowrap">
            📝 Đơn thuốc đang kê {editDonThuocId ? <span className="text-orange-500 text-sm font-medium ml-1">(Đang sửa)</span> : ''}
          </h3>
        </div>

        {/* Drug Table */}
        <div className="flex-1 overflow-x-auto overflow-y-auto clinical-scrollbar">
          {dsChon.length === 0 ? (
            <div className="flex items-center justify-center h-full">
              <p className="text-sm text-gray-400">Tìm và thêm thuốc vào đơn từ ô tìm kiếm phía trên</p>
            </div>
          ) : (
            <table className="w-full text-left border-separate border-spacing-0">
              <thead>
                <tr className="bg-gray-100">
                  <th className="px-2 py-1.5 text-xs font-semibold text-gray-900 uppercase w-8 border-b border-gray-300">TT</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-gray-900 uppercase border-b border-gray-300">Tên thuốc</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-gray-900 uppercase w-16 border-b border-gray-300">SL</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-gray-900 uppercase w-16 border-b border-gray-300">Đơn vị</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-gray-900 uppercase border-b border-gray-300">Cách dùng</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-gray-900 uppercase border-b border-gray-300">Hoạt chất</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-gray-900 uppercase text-right border-b border-gray-300">Đơn giá</th>
                  <th className="px-2 py-1.5 text-xs font-semibold text-gray-900 uppercase text-right border-b border-gray-300">Thành tiền</th>
                  <th className="px-2 py-1.5 w-8 border-b border-gray-300"></th>
                </tr>
              </thead>
              <tbody>
                {dsChon.map((item, idx) => (
                  <tr
                    key={item.thuoc.id}
                    className={`hover:bg-gray-50 transition-colors group ${focusedRowIdx === idx ? 'bg-blue-50/50' : item.thuoc.donvitinh.toLowerCase().includes('lần') ? 'bg-amber-100' : ''}`}
                  >
                    <td className="px-2 py-1.5 text-sm text-gray-900 text-center border-b border-gray-200">{idx + 1}</td>
                    <td className="px-2 py-1.5 border-b border-gray-200">
                      <div className="flex items-center gap-1.5">
                        <p className="text-sm font-semibold text-gray-900">{item.thuoc.tenthuoc}</p>
                        <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${getPriceSourceClass(item.thuoc.gia_nguon)}`}>
                          {getPriceSourceLabel(item.thuoc.gia_nguon)}
                        </span>
                        {!item.thuoc.la_thu_thuat && thuocStockMap[item.thuoc.id] && (
                          <span className={`text-[10px] px-1.5 py-0.5 rounded-full font-medium whitespace-nowrap ${
                            thuocStockMap[item.thuoc.id].trang_thai === 'HET' ? 'bg-red-100 text-red-700'
                            : thuocStockMap[item.thuoc.id].trang_thai === 'SAP_HET' ? 'bg-yellow-100 text-yellow-700'
                            : 'bg-green-100 text-green-700'
                          }`}>
                            {thuocStockMap[item.thuoc.id].tonkho <= 0 ? 'Hết' : `Tồn: ${thuocStockMap[item.thuoc.id].tonkho}`}
                          </span>
                        )}
                      </div>
                    </td>
                    <td className="px-2 py-1.5 border-b border-gray-200">
                      <Input
                        type="number"
                        className="w-16 h-7 text-sm text-center px-2 py-0.5 rounded-md border border-transparent bg-transparent shadow-none transition-all with-spinner hover:border-blue-200 hover:bg-white/80 group-hover:border-blue-200 group-hover:bg-white/80 focus-visible:bg-white focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                        ref={(el) => { soluongRefs.current[idx] = el; }}
                        onFocus={(e) => { e.target.select(); setFocusedRowIdx(idx); }}
                        onBlurCapture={() => setFocusedRowIdx(-1)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            cachdungRefs.current[idx]?.focus();
                          }
                        }}
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
                            if (buf === undefined) return updated;
                            const parsed = buf !== '' ? parseInt(buf, 10) : NaN;
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
                    <td className="px-2 py-1.5 text-sm font-medium text-gray-900 border-b border-gray-200">{item.thuoc.donvitinh}</td>
                    <td className="px-2 py-1.5 border-b border-gray-200">
                      <Input
                        className="h-7 w-full text-sm text-gray-900 px-2 py-0.5 rounded-md border border-transparent bg-transparent shadow-none transition-all hover:border-blue-200 hover:bg-white/80 group-hover:border-blue-200 group-hover:bg-white/80 focus-visible:bg-white focus-visible:border-blue-500 focus-visible:ring-2 focus-visible:ring-blue-500"
                        ref={(el) => { cachdungRefs.current[idx] = el; }}
                        onFocus={(e) => { e.target.select(); setFocusedRowIdx(idx); }}
                        onBlurCapture={() => setFocusedRowIdx(-1)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            if (idx < dsChon.length - 1) {
                              soluongRefs.current[idx + 1]?.focus();
                            } else {
                              searchDesktopRef.current?.focus();
                            }
                          }
                        }}
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
                    <td className="px-2 py-1.5 text-sm text-gray-500 border-b border-gray-200">{item.thuoc.hoatchat || '-'}</td>
                    <td className="px-2 py-1.5 text-sm text-right text-gray-900 border-b border-gray-200">{item.thuoc.giaban.toLocaleString()}đ</td>
                    <td className="px-2 py-1.5 text-sm text-right font-medium text-gray-900 border-b border-gray-200">{(item.soluong * item.thuoc.giaban).toLocaleString()}đ</td>
                    <td className="px-2 py-1.5 text-right border-b border-gray-200">
                      <button
                        className="opacity-0 group-hover:opacity-100 text-red-400 hover:text-red-600 hover:scale-110 transition-all"
                        onClick={() => xoaThuoc(item.thuoc.id)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>

    {/* ═══ RIGHT SIDEBAR: Thanh toán & Hành động ═══ */}
    <aside className="w-[clamp(220px,16.67%,320px)] flex-shrink-0 border-l border-gray-200 bg-[#f5f6f8] flex flex-col h-full">
      <div className="flex-1 overflow-y-auto clinical-scrollbar p-3 min-h-0">
      <h2 className="font-bold text-gray-900 text-sm tracking-tight mb-2">Thanh toán</h2>

      {/* Payment Summary Card */}
      <div className="bg-white rounded-xl p-3 shadow-sm border border-gray-200 space-y-2 mb-3">
        {tongTienThuoc > 0 && (
          <div className="flex justify-between items-center pb-2 border-b border-gray-200">
            <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Tiền thuốc</span>
            <span className="text-sm font-bold text-gray-900 whitespace-nowrap">{tongTienThuoc.toLocaleString()}đ</span>
          </div>
        )}
        {tongTienThuThuat > 0 && (
          <div className="flex justify-between items-center pb-2 border-b border-gray-200">
            <span className="text-xs text-amber-600 font-medium whitespace-nowrap">Thủ thuật</span>
            <span className="text-sm font-bold text-amber-700 whitespace-nowrap">{tongTienThuThuat.toLocaleString()}đ</span>
          </div>
        )}
        {ghiNo && (
          <>
            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Đã thanh toán</span>
              <span className="text-sm font-bold text-green-600 whitespace-nowrap">{sotienDaThanhToan.toLocaleString()}đ</span>
            </div>
            <div className="flex justify-between items-center pb-2 border-b border-gray-200">
              <span className="text-xs text-gray-500 font-medium whitespace-nowrap">Còn nợ</span>
              <span className="text-sm font-bold text-red-600 whitespace-nowrap">{sotienConNo.toLocaleString()}đ</span>
            </div>
          </>
        )}
        <div className="pt-2 flex justify-between items-center">
          <span className="font-bold text-xs text-gray-900 tracking-tight whitespace-nowrap">TỔNG CỘNG</span>
          <span className="font-extrabold text-base text-blue-600 whitespace-nowrap">{tongTien.toLocaleString()}đ</span>
        </div>
      </div>

      {/* Tiền khách đưa */}
      <div className="space-y-1.5 mb-3 px-0.5">
        <label className="text-xs font-medium text-gray-700 uppercase">Khách đưa</label>
        <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2">
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
            className="bg-transparent flex-1 outline-none text-xs min-w-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
          />
          {tienKhachDuaInput && Number(tienKhachDuaInput) !== 0 && (
            <span className="text-xs text-gray-400 font-mono ml-0.5">.000</span>
          )}
        </div>
        {tienKhachDua > 0 && tienTraLai > 0 && (
          <div className="flex justify-between items-center">
            <span className="text-[11px] text-gray-500 font-medium">Trả lại</span>
            <span className="text-xs font-bold text-blue-600">{tienTraLai.toLocaleString()}đ</span>
          </div>
        )}
      </div>

      {/* Debt section */}
      <div className="space-y-1.5 mb-3">
        <div className="flex items-center gap-2 px-0.5">
          <input
            type="checkbox"
            id="ghiNo-desktop"
            checked={ghiNo}
            onChange={(e) => setGhiNo(e.target.checked)}
            className="h-3.5 w-3.5 rounded border-gray-300 text-blue-600 focus:ring-blue-200"
          />
          <label htmlFor="ghiNo-desktop" className="text-xs font-semibold text-gray-700 cursor-pointer">
            Ghi nợ
          </label>
        </div>
        {ghiNo && (
          <div className="space-y-1.5 px-0.5">
            <label className="text-xs font-medium text-gray-700 uppercase">Đã TT</label>
            <div className="flex items-center bg-white border border-gray-300 rounded-lg px-3 py-2">
              <input
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
                placeholder="Nhập số"
                className="bg-transparent flex-1 outline-none text-xs min-w-0 [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none [-moz-appearance:textfield]"
              />
              {sotienDaThanhToanInput && Number(sotienDaThanhToanInput) !== 0 && (
                <span className="text-xs text-gray-400 font-mono ml-0.5">.000</span>
              )}
            </div>
          </div>
        )}
      </div>

      <DonKinhMediaPanel
        donKinhId={null}
        mediaOwnerId={activeDonThuocMediaId || editDonThuocId}
        apiBasePath="/api/don-thuoc/media"
        ownerIdField="don_thuoc_id"
        ownerLabel="đơn thuốc"
        missingOwnerMessage="Chưa có đơn thuốc đang chọn."
        mediaKind="don_thuoc"
        enableDraftWhenNoDonKinhId
        draftQueueResetToken={draftQueueResetToken}
        onDraftQueueChange={setDraftMediaQueue}
        className="mb-3"
      />

      </div>

      {/* Action buttons */}
      <div className="flex-shrink-0 p-3 border-t border-gray-200 space-y-2">
        {!editDonThuocId && (
          <button
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-extrabold text-sm py-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            onClick={luuDonThuoc}
            disabled={!chandoan || dsChon.length === 0}
          >
            ✓ LƯU ĐƠN
          </button>
        )}
        {editDonThuocId && (
          <button
            className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed text-white font-extrabold text-sm py-3 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
            onClick={luuDonThuoc}
            disabled={!chandoan || dsChon.length === 0}
          >
            ✓ CẬP NHẬT
          </button>
        )}

        <div className="grid grid-cols-2 gap-2">
          <button
            className="bg-white border border-gray-200 text-gray-700 font-bold text-xs py-2.5 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
            onClick={resetForm}
          >
            <FilePlus className="w-3.5 h-3.5" /> Mới
          </button>
          {editDonThuocId ? (
            <button
              className="bg-white border border-gray-200 text-gray-700 font-bold text-xs py-2.5 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
              onClick={() => saoChepDonDangSua()}
            >
              📋 Chép
            </button>
          ) : (
            <Dialog open={showMauDialog} onOpenChange={setShowMauDialog}>
              <DialogTrigger asChild>
                <button
                  className="bg-white border border-gray-200 text-gray-700 font-bold text-xs py-2.5 rounded-xl hover:bg-gray-50 transition-colors flex items-center justify-center gap-1"
                  onClick={() => {
                    setShowMauDialog(true);
                    fetchDonThuocMau();
                  }}
                >
                  📋 Đơn mẫu
                </button>
              </DialogTrigger>
            </Dialog>
          )}
        </div>

        {editDonThuocId && (
          <button
            className="w-full bg-white border border-red-200 text-red-500 font-bold text-xs py-2.5 rounded-xl hover:bg-red-50 transition-colors"
            onClick={() => xoaDon(editDonThuocId)}
          >
            Xóa đơn
          </button>
        )}
        {editDonThuocId && benhNhan && (
          <PrintDonThuoc
            config={printConfig}
            chandoan={chandoan}
            ngayKham={ngayKham}
            dsThuoc={dsChon}
            benhNhan={benhNhan}
            tongTien={tongTien}
            buttonClassName="w-full justify-center border-gray-200 text-xs py-2.5 transition-colors gap-1"
          />
        )}
      </div>      
    </aside>
  </div>
      </div>
      {/* Edit Patient Dialog */}
      <Dialog open={openEditPatient} onOpenChange={setOpenEditPatient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa thông tin bệnh nhân</DialogTitle>
            {patientForm?.id && (
              <div className="text-sm text-gray-500">ID: {patientForm.id}</div>
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

      {/* Notes Management Dialog */}
      <Dialog open={openNotesDialog} onOpenChange={(v) => { setOpenNotesDialog(v); if (!v) { setEditingNoteId(null); setNoteFormContent(''); setNoteFormType('normal'); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi chú bệnh nhân</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {allPatientNotes.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {allPatientNotes.map((note) => (
                  <div
                    key={note.id}
                    className={`flex items-start gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors border ${
                      editingNoteId === note.id ? 'bg-blue-50 border-blue-300' : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                    onClick={() => { setEditingNoteId(note.id); setNoteFormContent(note.content); setNoteFormType(note.note_type); }}
                  >
                    <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${note.note_type === 'important' ? 'text-red-500' : 'text-amber-500'}`} />
                    <p className={`flex-1 text-xs leading-snug ${note.note_type === 'important' ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
                      {note.content}
                    </p>
                    <button type="button" className="text-gray-300 hover:text-red-400 flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}>
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
            <div className="space-y-2 border-t border-gray-100 pt-3">
              <Label>{editingNoteId ? 'Sửa ghi chú' : 'Thêm ghi chú mới'}</Label>
              <textarea
                rows={3}
                value={noteFormContent}
                onChange={(e) => setNoteFormContent(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-blue-500"
                placeholder="Nhập nội dung ghi chú..."
              />
              <div className="flex items-center gap-3">
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={noteFormType === 'normal'} onChange={() => setNoteFormType('normal')} />
                  <span className="text-sm text-gray-600">Thường</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input type="radio" checked={noteFormType === 'important'} onChange={() => setNoteFormType('important')} />
                  <span className="text-sm text-red-700 font-medium">Quan trọng</span>
                </label>
                {editingNoteId && (
                  <button type="button" className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                    onClick={() => { setEditingNoteId(null); setNoteFormContent(''); setNoteFormType('normal'); }}>
                    + Ghi chú mới
                  </button>
                )}
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={() => setOpenNotesDialog(false)}>Đóng</Button>
            <Button onClick={saveNote} disabled={notesSaving || !noteFormContent.trim()}>
              {notesSaving ? 'Đang lưu...' : editingNoteId ? 'Cập nhật' : 'Thêm'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </PatientFamilyProvider>
    </ProtectedRoute>
  );
}