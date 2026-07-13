//src/pages/ke-don-kinh.tsx giới, năm sinh
'use client';

import { useEffect, useState, useMemo, useCallback, useRef } from 'react';
import axios, { AxiosError } from 'axios';
import { Input } from '../components/ui/input';
import { Button } from '../components/ui/button';
import { Card, CardContent } from '../components/ui/card';
import { Textarea } from '../components/ui/textarea';
import { useSearchParams, useRouter } from 'next/navigation';
import toast from 'react-hot-toast';
import { useConfirm } from '@/components/ui/confirm-dialog';
import { Pill, Pencil, Copy, Trash2, Calendar, Phone, MapPin, CalendarDays, Check, X, Clock, MessageSquare, Glasses, History as HistoryIcon, AlertTriangle, ScanLine, Image as ImageIcon } from 'lucide-react';
import SoKinhInput from '../components/SoKinhInput';
import ThiLucInput from '../components/ThiLucInput';
import ProtectedRoute from '../components/ProtectedRoute';
import Link from 'next/link';
import { useAuth } from '../contexts/AuthContext';
import { useFooter } from '../contexts/FooterContext';
import { isOwnerRole } from '../lib/tenantRoles';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../components/ui/dialog';
import { Label } from '../components/ui/label';
import PrintDonKinh from '../components/ke-don/PrintDonKinh';
import { PatientMobileHeader, PatientDesktopCard } from '../components/PatientPageHeader';
import DonKinhMediaPanel from '@/components/ke-don/DonKinhImageStripPanel';
import type { DraftDonKinhUploadItem } from '@/components/ke-don/DonKinhImageStripPanel';
import { defaultConfig, type PrintConfig } from '../components/ke-don/CauHinhMauIn';
import PatientMediaTimeline from '../components/media/PatientMediaTimeline';
import {
  PatientFamilyProvider,
  PatientFamilyMobileChip,
  PatientFamilyDesktopChip,
} from '../components/family/PatientFamilyControls';
import {
  enqueueBackgroundUploadTask,
  getBackgroundUploadTask,
  listBackgroundUploadTasks,
  persistedItemsToDraftQueue,
  removeBackgroundUploadTask,
  updateBackgroundUploadTask,
} from '@/lib/media/backgroundUploadPersistence';
import { buildActivityPatientRef, pushRecentActivity } from '@/lib/recentActivity';
import { uploadMediaBinary } from '@/lib/media/clientUpload';

interface BenhNhan {
  id: number;
  mabenhnhan?: string | null;
  ten: string;
  namsinh: string; // yyyy hoặc dd/mm/yyyy
  gioitinh?: string | null;
  dienthoai?: string;
  diachi?: string;
  tuoi?: number;
  ghichu?: string | null;
}

interface PatientNote {
  id: number;
  content: string;
  note_type: 'important' | 'normal';
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
  ma_gong?: string | null;
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

interface HistoryProps {
  items: DonKinh[];
  onSelect: (don: DonKinh) => void;
  highlightId?: number | null;
  groupByYear?: boolean;
}

interface BackgroundDonKinhFailedTask {
  taskId: number;
  donKinhId: number;
  failedCount: number;
  lastError: string | null;
}

const History: React.FC<HistoryProps> = ({ items, onSelect, highlightId, groupByYear = false }) => {
  const groupedItems = useMemo(() => {
    if (!groupByYear) return [] as Array<{ year: string; items: DonKinh[] }>;
    const groups: Array<{ year: string; items: DonKinh[] }> = [];

    for (const don of items) {
      const year = formatNgayKhamYear(don.ngaykham || don.ngay_kham);
      const lastGroup = groups[groups.length - 1];
      if (!lastGroup || lastGroup.year !== year) {
        groups.push({ year, items: [don] });
      } else {
        lastGroup.items.push(don);
      }
    }

    return groups;
  }, [items, groupByYear]);

  const renderDon = (don: DonKinh) => (
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
          <span><strong>Ngày:</strong> {formatNgayKhamDdMm(don.ngaykham || don.ngay_kham)}</span>
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
  );

  return (
    <div className="lg:max-h-none lg:h-full lg:flex lg:flex-col contents lg:bg-[#f5f6f8]">
      {/* Header chỉ hiển thị trên desktop — mobile dùng thanh tab ở phần đầu trang. */}
      <h2 className="hidden lg:block font-bold text-gray-900 text-sm tracking-tight px-3 pt-3 pb-2 flex-shrink-0">Lịch sử đơn kính {items.length > 0 && <span className="text-[10px] bg-blue-100 text-blue-600 px-1.5 py-0.5 rounded-full font-bold ml-1">{items.length}</span>}</h2>
      {items.length === 0 ? (
        <p className="text-xs text-gray-500 px-1 lg:px-3">Chưa có đơn kính nào</p>
      ) : (
        <div className="space-y-0.5 lg:overflow-y-auto lg:flex-1 lg:min-h-0 lg:px-3 lg:pb-3">
          {groupByYear
            ? groupedItems.map((group, groupIndex) => (
                <div key={`${group.year}-${groupIndex}`} className="space-y-0.5">
                  <div className="hidden lg:flex items-center px-0.5 pt-1.5 pb-0.5">
                    <span className="inline-flex items-center rounded-full bg-gray-100 px-2.5 py-0.5 text-[11px] font-extrabold text-gray-700">
                      {group.year === 'Không rõ năm'
                        ? `Năm khác (${group.items.length})`
                        : `Năm ${group.year} (${group.items.length})`}
                    </span>
                  </div>
                  {group.items.map((don) => renderDon(don))}
                </div>
              ))
            : items.map((don) => renderDon(don))}
        </div>
      )}
    </div>
  );
};

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

async function uploadDraftMediaQueue(
  donKinhId: number,
  draftQueue: DraftDonKinhUploadItem[]
): Promise<{ successCount: number; failedCount: number; failedItems: DraftDonKinhUploadItem[] }> {
  let successCount = 0;
  let failedCount = 0;
  const failedItems: DraftDonKinhUploadItem[] = [];

  for (const draft of draftQueue) {
    let mediaId: number | null = null;

    try {
      const createRes = await axios.post('/api/don-kinh/media', {
        don_kinh_id: donKinhId,
        loai_anh: 'don_kinh',
        mime_type: draft.file.type || 'image/jpeg',
        size_bytes: draft.file.size,
        original_filename: draft.file.name,
        source_device: draft.sourceDevice,
        captured_at: new Date().toISOString(),
      });

      const uploadMeta = createRes.data?.upload as { method?: 'PUT'; signedUrl?: string; proxyUrl?: string; contentType?: string } | undefined;
      mediaId = Number(createRes.data?.data?.id || 0) || null;
      if (!uploadMeta?.signedUrl && !uploadMeta?.proxyUrl) {
        throw new Error('Không nhận được signed upload URL');
      }

      const uploadRes = await uploadMediaBinary(uploadMeta, draft.file);

      if (!uploadRes.ok) {
        throw new Error(`Upload thất bại (${uploadRes.status})`);
      }

      const imageDimensions = await readImageDimensions(draft.file);
      if (mediaId) {
        await axios.patch('/api/don-kinh/media', {
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
        await axios.patch('/api/don-kinh/media', { id: mediaId, status: 'failed' }).catch(() => {});
      }
    }
  }

  return { successCount, failedCount, failedItems };
}

type DetectedBarcodeValue = { rawValue?: string };
type BarcodeDetectorLike = { detect: (source: HTMLVideoElement) => Promise<DetectedBarcodeValue[]> };
type BarcodeDetectorCtorLike = {
  new (options?: { formats?: string[] }): BarcodeDetectorLike;
  getSupportedFormats?: () => Promise<string[]>;
};

const FRAME_SCAN_FORMATS = ['qr_code', 'code_128', 'code_39', 'ean_13', 'ean_8', 'upc_a', 'upc_e'] as const;
const FRAME_QR_QUERY_KEYS = ['ma_gong', 'ma', 'code', 'frame'] as const;

function extractFrameScanCandidates(rawValue: string): string[] {
  const initial = rawValue.trim();
  if (!initial) return [];

  const candidates: string[] = [initial];

  try {
    const decoded = decodeURIComponent(initial).trim();
    if (decoded && decoded !== initial) candidates.push(decoded);
  } catch {
    // Keep the original value if decodeURIComponent fails.
  }

  for (const value of [...candidates]) {
    if (!/^https?:\/\//i.test(value)) continue;
    try {
      const parsed = new URL(value);
      for (const key of FRAME_QR_QUERY_KEYS) {
        const param = parsed.searchParams.get(key)?.trim();
        if (param) candidates.push(param);
      }
      const lastSegment = parsed.pathname.split('/').filter(Boolean).pop()?.trim();
      if (lastSegment) candidates.push(lastSegment);
    } catch {
      // Ignore malformed URL payloads and continue with other candidates.
    }
  }

  for (const value of [...candidates]) {
    for (const separator of ['|', ':', ';', ',', '\n']) {
      const tail = value.split(separator).pop()?.trim();
      if (tail && tail !== value) candidates.push(tail);
    }
  }

  const seen = new Set<string>();
  const uniqueCandidates: string[] = [];
  for (const candidate of candidates) {
    const cleaned = candidate.trim();
    if (!cleaned) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    uniqueCandidates.push(cleaned);
  }

  return uniqueCandidates;
}

export default function KeDonKinh() {
  const { confirm } = useConfirm();
  const searchParams = useSearchParams();
  const router = useRouter();
  const benhnhanid = searchParams.get('bn');
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
      const response = await axios.get('/api/don-kinh/media', {
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
  const lastActivityPatientIdRef = useRef<number | null>(null);
  const [patientNotes, setPatientNotes] = useState<PatientNote[]>([]);
  const [isEditing, setIsEditing] = useState(false);
  const [donKinhs, setDonKinhs] = useState<DonKinh[]>([]); // lịch sử đơn kính
  const [highlightId, setHighlightId] = useState<number | null>(null); // id đơn kính mới / vừa cập nhật để highlight
  const [activeDonKinhMediaId, setActiveDonKinhMediaId] = useState<number | null>(null);
  const [draftMediaQueue, setDraftMediaQueue] = useState<DraftDonKinhUploadItem[]>([]);
  const [draftQueueResetToken, setDraftQueueResetToken] = useState(0);
  const [backgroundUploadingCount, setBackgroundUploadingCount] = useState(0);
  const [backgroundFailedTasks, setBackgroundFailedTasks] = useState<BackgroundDonKinhFailedTask[]>([]);
  const runningBackgroundOwnersRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!activeDonKinhMediaId) return;
    setDraftQueueResetToken((prev) => prev + 1);
    setDraftMediaQueue([]);
  }, [activeDonKinhMediaId]);

  const syncBackgroundFailedTasks = useCallback(async () => {
    try {
      const tasks = await listBackgroundUploadTasks('don_kinh');
      setBackgroundFailedTasks(
        tasks
          .filter((task) => task.status === 'failed' && typeof task.id === 'number')
          .map((task) => ({
            taskId: Number(task.id),
            donKinhId: task.ownerId,
            failedCount: task.items.length,
            lastError: task.lastError || null,
          }))
      );
    } catch {
      // silent
    }
  }, []);

  const processPersistedDonKinhTask = useCallback(async (taskId: number) => {
    const task = await getBackgroundUploadTask(taskId);
    if (!task || task.scope !== 'don_kinh') return;
    if (task.items.length === 0) {
      await removeBackgroundUploadTask(taskId);
      await syncBackgroundFailedTasks();
      return;
    }

    const toastId = `bg-don-kinh-media-${task.ownerId}-${taskId}`;
    setBackgroundUploadingCount((prev) => prev + 1);
    toast.loading(`Đang tải nền ${task.items.length} ảnh cho đơn kính #${task.ownerId}...`, { id: toastId });

    try {
      await updateBackgroundUploadTask(taskId, {
        status: 'pending',
        attempts: (task.attempts || 0) + 1,
        lastError: null,
      });

      const queue = persistedItemsToDraftQueue(task.items) as DraftDonKinhUploadItem[];
      const result = await uploadDraftMediaQueue(task.ownerId, queue);
      toast.dismiss(toastId);

      if (result.failedCount === 0) {
        await removeBackgroundUploadTask(taskId);
        toast.success(`Đã tải nền ${result.successCount} ảnh lên đơn kính #${task.ownerId}`);
      } else {
        await updateBackgroundUploadTask(taskId, {
          status: 'failed',
          items: result.failedItems.map((item) => ({
            fileName: item.file.name || `upload-${Date.now()}`,
            mimeType: item.file.type || 'application/octet-stream',
            sourceDevice: item.sourceDevice,
            fileBlob: item.file,
            createdAt: new Date().toISOString(),
          })),
          lastError: `Lỗi ${result.failedCount} ảnh khi tải nền`,
        });

        if (result.successCount > 0) {
          toast(`Đơn kính #${task.ownerId}: tải nền ${result.successCount} ảnh, lỗi ${result.failedCount} ảnh`);
        } else {
          toast.error(`Đơn kính #${task.ownerId}: không tải được ${result.failedCount} ảnh`);
        }
      }
    } finally {
      setBackgroundUploadingCount((prev) => Math.max(0, prev - 1));
      await syncBackgroundFailedTasks();
    }
  }, [syncBackgroundFailedTasks]);

  const startBackgroundDonKinhMediaUpload = useCallback((donKinhId: number, items: DraftDonKinhUploadItem[]) => {
    if (items.length === 0) return;
    if (runningBackgroundOwnersRef.current.has(donKinhId)) {
      toast('Đang có tác vụ ảnh nền cho đơn này, hệ thống sẽ tự xử lý tuần tự.');
      return;
    }

    runningBackgroundOwnersRef.current.add(donKinhId);
    void (async () => {
      try {
        const taskId = await enqueueBackgroundUploadTask('don_kinh', donKinhId, items);
        if (!taskId) {
          // Fallback nếu IndexedDB không khả dụng.
          const fallbackResult = await uploadDraftMediaQueue(donKinhId, items);
          if (fallbackResult.failedCount > 0) {
            toast.error(`Đơn kính #${donKinhId}: lỗi ${fallbackResult.failedCount} ảnh (trình duyệt không hỗ trợ lưu tác vụ nền)`);
          }
          return;
        }
        await processPersistedDonKinhTask(taskId);
      } finally {
        runningBackgroundOwnersRef.current.delete(donKinhId);
      }
    })();
  }, [processPersistedDonKinhTask]);

  const retryBackgroundFailedTask = useCallback((taskId: number) => {
    void processPersistedDonKinhTask(taskId);
  }, [processPersistedDonKinhTask]);

  useEffect(() => {
    void (async () => {
      await syncBackgroundFailedTasks();

      // Tự resume các task pending sau khi reload/crash.
      const tasks = await listBackgroundUploadTasks('don_kinh');
      const pendingTasks = tasks.filter((task) => task.status === 'pending' && typeof task.id === 'number');
      for (const task of pendingTasks) {
        if (!task.id) continue;
        // eslint-disable-next-line no-await-in-loop
        await processPersistedDonKinhTask(Number(task.id));
      }
    })();
  }, [processPersistedDonKinhTask, syncBackgroundFailedTasks]);

  useEffect(() => {
    if (backgroundUploadingCount <= 0) return;
    const onBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = 'Ảnh đơn kính đang tải nền. Rời trang có thể làm gián đoạn tải ảnh.';
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
              Đang tải nền {backgroundUploadingCount} tác vụ ảnh đơn kính. Bạn có thể tiếp tục thao tác bình thường.
            </p>
          </div>
        )}

        {backgroundFailedTasks.length > 0 && (
          <div className="rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 space-y-2">
            <p className="text-xs sm:text-sm text-amber-800 font-semibold">
              Có {backgroundFailedTasks.length} tác vụ ảnh lỗi. Vui lòng thử lại để tránh sót dữ liệu.
            </p>
            {backgroundFailedTasks.map((task) => (
              <div key={task.taskId} className="flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-white/70 px-2 py-1.5">
                <p className="text-[11px] sm:text-xs text-amber-900">
                  Đơn kính #{task.donKinhId}: lỗi {task.failedCount} ảnh
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
  // Mobile header scroll-driven ratio (0 = expanded, 1 = compact)
  const [mobileHeaderRatio, setMobileHeaderRatio] = useState(0);
  const mobileHeaderRatioRef = useRef(0);

  // Snap ratio to 0 or 1 với easing khi ngón tay nhả ra giữa chừng
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
      const eased = 1 - Math.pow(1 - t, 3); // ease-out cubic
      const ratio = from + (target - from) * eased;
      mobileHeaderRatioRef.current = ratio;
      setMobileHeaderRatio(ratio);
      if (t < 1) requestAnimationFrame(animate);
    };
    requestAnimationFrame(animate);
  }, []);

  // Touch refs
  const touchStartXRef = useRef(0);
  const touchStartYRef = useRef(0);
  const touchStartRatioRef = useRef(0);
  const mobileContentRef = useRef<HTMLDivElement | null>(null);

  // Non-passive touch interceptor: header "hấp thụ" scroll trước, sau đó panel mới scroll
  useEffect(() => {
    const wrapper = mobileContentRef.current;
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

      // Bỏ qua nếu đây là gesture ngang (chuyển tab)
      if (Math.abs(dx) > Math.abs(dyUp) * 1.4 && Math.abs(dx) > 8) return;

      const startRatio = touchStartRatioRef.current;
      const panel = getActivePanel();
      const touchInPanel = panel?.contains(e.target as Node) ?? false;

      if (dyUp > 0) {
        // ── Cuộn lên ──
        if (startRatio < 1) {
          // Header chưa compact → hấp thụ scroll, chặn native scroll
          e.preventDefault();
          const raw = startRatio + dyUp / MAX_TRAVEL;
          const newRatio = Math.min(1, raw);
          mobileHeaderRatioRef.current = newRatio;
          setMobileHeaderRatio(newRatio);

          if (raw > 1) {
            if (panel) {
              panel.style.overflowY = 'auto';
              panel.scrollTop = (raw - 1) * MAX_TRAVEL;
            }
          }
        } else if (!touchInPanel) {
          // Header compact nhưng touch trên vùng header → chặn native scroll
          e.preventDefault();
        }
        // else: startRatio = 1 và touch trong panel → panel scroll natively
      } else if (dyUp < 0) {
        // ── Cuộn xuống ──
        if ((panel?.scrollTop ?? 0) <= 0 && startRatio > 0) {
          e.preventDefault();
          const newRatio = Math.max(0, startRatio + dyUp / MAX_TRAVEL);
          mobileHeaderRatioRef.current = newRatio;
          setMobileHeaderRatio(newRatio);
        } else if (!touchInPanel) {
          // Touch trên header → chặn native scroll
          e.preventDefault();
        }
      }
    };

    const onTouchEnd = () => {
      const r = mobileHeaderRatioRef.current;
      if (r > 0 && r < 1) {
        snapRatio(r >= 0.5 ? 1 : 0);
      }
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
  // mobileContentRef bao gồm cả header và viewport; re-run khi patient load.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [snapRatio, benhNhan?.id]);

  // Patient notes management dialog state
  const [openNotesDialog, setOpenNotesDialog] = useState(false);
  const [allPatientNotes, setAllPatientNotes] = useState<PatientNote[]>([]);
  const [noteFormContent, setNoteFormContent] = useState('');
  const [noteFormType, setNoteFormType] = useState<'important' | 'normal'>('normal');
  const [editingNoteId, setEditingNoteId] = useState<number | null>(null);
  const [notesSaving, setNotesSaving] = useState(false);

  const fetchAllNotes = useCallback(async () => {
    if (!benhnhanid) return;
    try {
      const res = await axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&includeDeleted=0`);
      const notes: PatientNote[] = res.data?.data || [];
      setAllPatientNotes(notes);
      return notes;
    } catch {
      return [];
    }
  }, [benhnhanid]);

  const openNotesManagement = useCallback(async () => {
    const notes = await fetchAllNotes();
    // Auto-select most important note
    const importantNote = notes?.find((n) => n.note_type === 'important');
    const firstNote = importantNote || notes?.[0] || null;
    if (firstNote) {
      setEditingNoteId(firstNote.id);
      setNoteFormContent(firstNote.content);
      setNoteFormType(firstNote.note_type);
    } else {
      setEditingNoteId(null);
      setNoteFormContent('');
      setNoteFormType('normal');
    }
    setOpenNotesDialog(true);
  }, [fetchAllNotes]);

  const saveNote = useCallback(async () => {
    if (!benhnhanid || !noteFormContent.trim()) {
      toast.error('Vui lòng nhập nội dung ghi chú');
      return;
    }
    setNotesSaving(true);
    try {
      if (editingNoteId) {
        await axios.put('/api/benh-nhan/notes', { id: editingNoteId, content: noteFormContent.trim(), note_type: noteFormType });
        toast.success('Đã cập nhật ghi chú');
      } else {
        await axios.post('/api/benh-nhan/notes', { benhnhanid: parseInt(benhnhanid), content: noteFormContent.trim(), note_type: noteFormType });
        toast.success('Đã thêm ghi chú');
      }
      // Refresh notes in header
      const res = await axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&importantOnly=1`);
      setPatientNotes(res.data?.data || []);
      await fetchAllNotes();
      setEditingNoteId(null);
      setNoteFormContent('');
      setNoteFormType('normal');
    } catch {
      toast.error('Lỗi khi lưu ghi chú');
    } finally {
      setNotesSaving(false);
    }
  }, [benhnhanid, editingNoteId, noteFormContent, noteFormType, fetchAllNotes]);

  const deleteNote = useCallback(async (id: number) => {
    if (!await confirm('Xóa ghi chú này?')) return;
    try {
      await axios.delete(`/api/benh-nhan/notes?id=${id}`);
      toast.success('Đã xóa ghi chú');
      const res = await axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&importantOnly=1`);
      setPatientNotes(res.data?.data || []);
      await fetchAllNotes();
      if (editingNoteId === id) {
        setEditingNoteId(null);
        setNoteFormContent('');
        setNoteFormType('normal');
      }
    } catch {
      toast.error('Lỗi khi xóa');
    }
  }, [benhnhanid, editingNoteId, fetchAllNotes, confirm]);

  // Mobile tab: 0 = Đơn kính (form), 1 = Đơn cũ, 2 = Lịch hẹn, 3 = Ảnh
  const [mobileTab, setMobileTab] = useState<0 | 1 | 2 | 3>(0);
  // ref để closures trong non-passive touch listeners không bị stale
  const mobileTabRef = useRef<0 | 1 | 2 | 3>(0);
  useEffect(() => { mobileTabRef.current = mobileTab; }, [mobileTab]);
  const mobileTabLabels = ['Đơn kính', 'Đơn cũ', 'Lịch hẹn', 'Ảnh'] as const;
  // Desktop left sidebar tab: 'don_cu' | 'lich_hen' | 'anh'
  const [desktopLeftTab, setDesktopLeftTab] = useState<'don_cu' | 'lich_hen' | 'anh'>('don_cu');
  // Ref cho datetime-local trên mobile (để custom Calendar button mở picker)
  const mobileNgayKhamRef = useRef<HTMLInputElement | null>(null);
  // Edit patient dialog state
  const [openEditPatient, setOpenEditPatient] = useState(false);
  const [patientForm, setPatientForm] = useState<BenhNhan | null>(null);
  const [openFrameBarcodeScanner, setOpenFrameBarcodeScanner] = useState(false);
  const [barcodeScannerBusy, setBarcodeScannerBusy] = useState(false);
  const [barcodeScannerError, setBarcodeScannerError] = useState('');
  const [manualFrameBarcode, setManualFrameBarcode] = useState('');
  const frameBarcodeVideoRef = useRef<HTMLVideoElement | null>(null);
  const frameBarcodeStreamRef = useRef<MediaStream | null>(null);
  const frameBarcodeTimerRef = useRef<number | null>(null);
  const frameBarcodeDebounceRef = useRef(0);

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

  // === Swipe ngang để chuyển tab trên mobile ===
  const [tabDragX, setTabDragX] = useState(0);
  const [tabDragging, setTabDragging] = useState(false);
  const tabSwipeStart = useRef<{ x: number; y: number; locked: 'h' | 'v' | null }>({ x: 0, y: 0, locked: null });
  const tabSwipeActive = useRef(false);
  const tabViewportRef = useRef<HTMLDivElement | null>(null);
  const onTabTouchStart = (e: React.TouchEvent) => {
    const t = e.target as HTMLElement;
    // Chỉ chặn ở vùng đã đánh dấu no-swipe (nếu có vùng có gesture riêng).
    // Cho phép bắt đầu vuốt tab ngay cả khi chạm vào input/button để trải nghiệm đồng nhất với kê đơn thuốc.
    if (t.closest('[data-no-tab-swipe]')) return;
    tabSwipeActive.current = true;
    setTabDragging(false);
    setTabDragX(0);
    tabSwipeStart.current = { x: e.touches[0].clientX, y: e.touches[0].clientY, locked: null };
  };
  const onTabTouchMove = (e: React.TouchEvent) => {
    if (!tabSwipeActive.current) return;
    const dx = e.touches[0].clientX - tabSwipeStart.current.x;
    const dy = e.touches[0].clientY - tabSwipeStart.current.y;
    if (tabSwipeStart.current.locked === null) {
      if (Math.abs(dx) > 10 || Math.abs(dy) > 10) {
        tabSwipeStart.current.locked = Math.abs(dx) > Math.abs(dy) * 1.2 ? 'h' : 'v';
        if (tabSwipeStart.current.locked === 'h') setTabDragging(true);
      }
    }
    if (tabSwipeStart.current.locked === 'h') {
      // Ưu tiên gesture ngang chuyển tab thay vì scroll/chọn text.
      e.preventDefault();
      let next = dx;
      if (mobileTab === 0 && next > 0) next = next * 0.3;
      if (mobileTab === 3 && next < 0) next = next * 0.3;
      setTabDragX(next);
    }
  };
  const onTabTouchEnd = (e: React.TouchEvent) => {
    if (!tabSwipeActive.current) return;
    const locked = tabSwipeStart.current.locked;
    tabSwipeActive.current = false;
    setTabDragging(false);
    if (locked !== 'h') {
      setTabDragX(0);
      tabSwipeStart.current.locked = null;
      return;
    }
    const threshold = (tabViewportRef.current?.clientWidth || 360) * 0.22;
    let next = mobileTab;
    if (tabDragX < -threshold && mobileTab < 3) next = (mobileTab + 1) as 0 | 1 | 2 | 3;
    else if (tabDragX > threshold && mobileTab > 0) next = (mobileTab - 1) as 0 | 1 | 2 | 3;
    setMobileTab(next);
    setTabDragX(0);
    tabSwipeStart.current.locked = null;
  };

  const stopFrameBarcodeScanner = useCallback(() => {
    if (frameBarcodeTimerRef.current !== null) {
      window.clearInterval(frameBarcodeTimerRef.current);
      frameBarcodeTimerRef.current = null;
    }
    if (frameBarcodeStreamRef.current) {
      frameBarcodeStreamRef.current.getTracks().forEach((track) => track.stop());
      frameBarcodeStreamRef.current = null;
    }
    if (frameBarcodeVideoRef.current) {
      frameBarcodeVideoRef.current.srcObject = null;
    }
    setBarcodeScannerBusy(false);
  }, []);

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
  const thiLucSuggestions = useMemo(
    () => mauThiLucs.map((tl) => tl.gia_tri).filter(Boolean),
    [mauThiLucs]
  );
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
        const cacheHeaders = {
          'Cache-Control': 'no-cache, no-store, must-revalidate',
          'Pragma': 'no-cache',
          'Expires': '0'
        };

        const [res, alertsRes] = await Promise.all([
          axios.get(`/api/benh-nhan?benhnhanid=${benhnhanid}&_t=${timestamp}`, { headers: cacheHeaders }),
          axios.get(`/api/benh-nhan/notes?benhnhanid=${benhnhanid}&importantOnly=1&_t=${timestamp}`, { headers: cacheHeaders }).catch(() => ({ data: { data: [] } })),
        ]);
        let benhNhanData: BenhNhan | undefined;
        if (res.data && res.data.data) {
          benhNhanData = res.data.data as BenhNhan;
        }

        if (benhNhanData && typeof benhNhanData === 'object' && benhNhanData.id) {
          setBenhNhan({
            id: benhNhanData.id,
            mabenhnhan: benhNhanData.mabenhnhan,
            ten: benhNhanData.ten || '',
            namsinh: benhNhanData.namsinh || '',
            gioitinh: benhNhanData.gioitinh || null,
            dienthoai: benhNhanData.dienthoai || '',
            diachi: benhNhanData.diachi || '',
            tuoi: benhNhanData.tuoi,
          });
          setPatientNotes(alertsRes.data?.data || []);
        } else {
          toast.error('Bệnh nhân không tồn tại hoặc dữ liệu không hợp lệ');
          setBenhNhan(null);
          setPatientNotes([]);
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
        setPatientNotes([]);
      }
    };

    fetchBenhNhan();
  }, [benhnhanid]);

  useEffect(() => {
    lastActivityPatientIdRef.current = null;
  }, [benhnhanid]);

  useEffect(() => {
    if (!benhNhan?.id) return;
    if (lastActivityPatientIdRef.current === benhNhan.id) return;
    lastActivityPatientIdRef.current = benhNhan.id;

    const patient = buildActivityPatientRef(benhNhan);
    if (!patient) return;

    pushRecentActivity({
      action: 'open_rx_glasses',
      patient,
      source: 'ke-don-kinh_page',
    });
  }, [benhNhan]);

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
        const hangTrongRes = await axios.get(`/api/hang-trong?effective_price=1&_t=${timestamp}&_r=${random}`, {
          headers: { 'Cache-Control': 'no-cache, no-store, must-revalidate' }
        });
        setHangTrongs(hangTrongRes.data || []);

        // Fetch frame types
        const gongKinhRes = await axios.get(`/api/gong-kinh?scope=shared&effective_price=1&_t=${timestamp}&_r=${random}`, {
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
      const payload = {
        ...patientForm,
        namsinh: namsinhStr,
        gioitinh: patientForm.gioitinh?.trim() || null,
      };
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

  // Điều hướng Enter theo thứ tự data-order (MP→MT theo cặp chỉ số)
  useEffect(() => {
    const selector = 'input[data-nav="presc"], select[data-nav="presc"], textarea[data-nav="presc"]';
    const isVisible = (el: HTMLElement) => {
      if ((el as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).disabled) return false;
      const style = window.getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') return false;
      return el.offsetParent !== null;
    };
    const keyHandler = (e: KeyboardEvent) => {
      if (e.key !== 'Enter') return;
      const target = e.target as HTMLElement;
      if (!target) return;
      if (target.getAttribute('data-nav') !== 'presc') return;
      e.preventDefault();
      // Sort by data-order numerically (float) so MP→MT pairs are respected
      const inputs = Array.from(document.querySelectorAll<HTMLElement>(selector))
        .filter(isVisible)
        .filter((el) => el.getAttribute('data-order') !== null)
        .sort((a, b) => {
          const oa = parseFloat(a.getAttribute('data-order') || '999');
          const ob = parseFloat(b.getAttribute('data-order') || '999');
          return oa - ob;
        });
      const idx = inputs.indexOf(target);
      if (idx >= 0 && idx < inputs.length - 1) {
        const next = inputs[idx + 1];
        (next as HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement).focus();
        (next as HTMLInputElement | HTMLTextAreaElement).select?.();
      }
    };
    document.addEventListener('keydown', keyHandler);
    return () => document.removeEventListener('keydown', keyHandler);
  }, []);

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
  const handleFrameChange = useCallback((value: string) => {
    const selectedFrame = gongKinhs.find(g => g.ten_gong === value);
    if (selectedFrame) {
      setForm((prev) => ({
        ...prev,
        ten_gong: value,
        ax_mt: selectedFrame.gia_nhap, // legacy
        gianhap_gong: selectedFrame.gia_nhap,
        giagong: selectedFrame.gia_ban // Giá bán gọng
      }));
    } else {
      setForm((prev) => ({
        ...prev,
        ten_gong: value,
        ax_mt: 0,
        gianhap_gong: 0,
        giagong: 0
      }));
    }
  }, [gongKinhs]);

  const applyFrameByBarcode = useCallback((rawValue: string): string | null => {
    const scanCandidates = extractFrameScanCandidates(rawValue);
    if (scanCandidates.length === 0) return null;

    let matchedFrame: GongKinh | null = null;
    for (const candidate of scanCandidates) {
      const normalized = candidate.toLowerCase();
      const matchedByCode = gongKinhs.find((g) => (g.ma_gong || '').trim().toLowerCase() === normalized);
      const matchedByName = matchedByCode ? null : gongKinhs.find((g) => g.ten_gong.trim().toLowerCase() === normalized);
      matchedFrame = matchedByCode || matchedByName || null;
      if (matchedFrame) break;
    }

    if (!matchedFrame) return null;

    handleFrameChange(matchedFrame.ten_gong);
    setFrameMode('gong_cu_the');
    return matchedFrame.ten_gong;
  }, [gongKinhs, handleFrameChange]);

  const openFrameBarcodeDialog = useCallback(() => {
    setFrameMode('gong_cu_the');
    setManualFrameBarcode('');
    setBarcodeScannerError('');
    frameBarcodeDebounceRef.current = 0;
    setOpenFrameBarcodeScanner(true);
  }, []);

  const submitManualFrameBarcode = useCallback(() => {
    const value = manualFrameBarcode.trim();
    if (!value) {
      toast.error('Vui lòng nhập mã gọng');
      return;
    }

    const matchedName = applyFrameByBarcode(value);
    if (!matchedName) {
      setBarcodeScannerError(`Không tìm thấy gọng có mã: ${value}`);
      toast.error(`Không tìm thấy gọng có mã: ${value}`);
      return;
    }

    toast.success(`Đã chọn gọng: ${matchedName}`);
    setOpenFrameBarcodeScanner(false);
  }, [manualFrameBarcode, applyFrameByBarcode]);

  useEffect(() => {
    if (!openFrameBarcodeScanner) {
      stopFrameBarcodeScanner();
      return;
    }

    let cancelled = false;

    const waitForVideoElement = async (): Promise<HTMLVideoElement | null> => {
      for (let i = 0; i < 20; i += 1) {
        if (frameBarcodeVideoRef.current) return frameBarcodeVideoRef.current;
        // Dialog mount có thể đến trễ 1-2 frame sau khi set open=true.
        // Chờ ngắn để chắc chắn ref đã sẵn sàng rồi mới gắn stream.
        // eslint-disable-next-line no-await-in-loop
        await new Promise((resolve) => window.setTimeout(resolve, 50));
      }
      return null;
    };

    const startScanner = async () => {
      setBarcodeScannerError('');
      setBarcodeScannerBusy(true);

      const videoEl = await waitForVideoElement();
      if (!videoEl) {
        setBarcodeScannerError('Không khởi tạo được khung camera. Vui lòng đóng và mở lại hộp quét.');
        setBarcodeScannerBusy(false);
        return;
      }

      try {
        if (!navigator.mediaDevices?.getUserMedia) {
          throw new Error('Thiết bị không hỗ trợ camera để quét mã.');
        }

        let stream: MediaStream;
        try {
          stream = await navigator.mediaDevices.getUserMedia({
            video: { facingMode: { ideal: 'environment' } },
            audio: false,
          });
        } catch {
          // Fallback camera bất kỳ nếu camera sau không khả dụng trên thiết bị.
          stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        }

        if (cancelled) {
          stream.getTracks().forEach((track) => track.stop());
          return;
        }

        frameBarcodeStreamRef.current = stream;
        videoEl.setAttribute('playsinline', 'true');
        videoEl.muted = true;
        videoEl.autoplay = true;
        videoEl.srcObject = stream;
        try {
          await videoEl.play();
        } catch {
          setBarcodeScannerError('Camera đã cấp quyền nhưng preview chưa chạy. Hãy chạm vào khung camera để tiếp tục.');
        }

        const BarcodeDetectorCtor = (window as unknown as { BarcodeDetector?: BarcodeDetectorCtorLike }).BarcodeDetector;
        let detector: BarcodeDetectorLike | null = null;
        let supportedNativeFormats: string[] = [];

        if (BarcodeDetectorCtor) {
          try {
            const nativeFormats = typeof BarcodeDetectorCtor.getSupportedFormats === 'function'
              ? await BarcodeDetectorCtor.getSupportedFormats()
              : [...FRAME_SCAN_FORMATS];
            supportedNativeFormats = FRAME_SCAN_FORMATS.filter((format) => nativeFormats.includes(format));
            const detectorOptions = supportedNativeFormats.length > 0
              ? { formats: supportedNativeFormats }
              : undefined;
            detector = new BarcodeDetectorCtor(detectorOptions);
          } catch {
            detector = null;
            supportedNativeFormats = [];
          }
        }

        let detectQrFallback: ((source: HTMLVideoElement) => string | null) | null = null;
        if (!supportedNativeFormats.includes('qr_code')) {
          try {
            const { default: jsQR } = await import('jsqr');
            const qrCanvas = document.createElement('canvas');
            const qrCtx = qrCanvas.getContext('2d');
            if (qrCtx) {
              detectQrFallback = (source: HTMLVideoElement) => {
                const width = source.videoWidth || source.clientWidth;
                const height = source.videoHeight || source.clientHeight;
                if (!width || !height) return null;

                qrCanvas.width = width;
                qrCanvas.height = height;
                qrCtx.drawImage(source, 0, 0, width, height);

                const imageData = qrCtx.getImageData(0, 0, width, height);
                const qrResult = jsQR(imageData.data, width, height, {
                  inversionAttempts: 'attemptBoth',
                });
                const qrValue = qrResult?.data?.trim() || '';
                return qrValue || null;
              };
            }
          } catch {
            // Ignore dynamic import failures and keep manual input fallback.
          }
        }

        if (!detector && !detectQrFallback) {
          setBarcodeScannerError('Thiết bị chưa hỗ trợ quét mã vạch/QR tự động. Bạn có thể nhập mã thủ công bên dưới.');
          return;
        }

        frameBarcodeTimerRef.current = window.setInterval(async () => {
          try {
            const currentVideo = frameBarcodeVideoRef.current;
            if (!currentVideo || currentVideo.readyState < 2) return;

            let rawValue = '';
            if (detector) {
              const detected = await detector.detect(currentVideo);
              rawValue = typeof detected?.[0]?.rawValue === 'string' ? detected[0].rawValue.trim() : '';
            }
            if (!rawValue && detectQrFallback) {
              rawValue = detectQrFallback(currentVideo) || '';
            }
            if (!rawValue) return;

            const now = Date.now();
            if (now - frameBarcodeDebounceRef.current < 1200) return;
            frameBarcodeDebounceRef.current = now;

            setManualFrameBarcode(rawValue);
            const matchedName = applyFrameByBarcode(rawValue);
            if (matchedName) {
              toast.success(`Đã chọn gọng: ${matchedName}`);
              setOpenFrameBarcodeScanner(false);
              return;
            }

            setBarcodeScannerError(`Không tìm thấy gọng có mã: ${rawValue}`);
          } catch {
            // Ignore transient detect errors while camera frame is initializing.
          }
        }, 320);
      } catch (error: unknown) {
        const message = error instanceof Error ? error.message : String(error);
        setBarcodeScannerError(message || 'Không mở được camera quét mã.');
      } finally {
        if (!cancelled) setBarcodeScannerBusy(false);
      }
    };

    void startScanner();

    return () => {
      cancelled = true;
      stopFrameBarcodeScanner();
    };
  }, [openFrameBarcodeScanner, applyFrameByBarcode, stopFrameBarcodeScanner]);

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
      setActiveDonKinhMediaId(don.id);
      setHighlightId(don.id);
      setTimeout(() => setHighlightId(current => current === don.id ? null : current), 3000);
    }
  };
  const updateHistory = (don: DonKinh) => {
    setDonKinhs(prev => prev.map(d => d.id === don.id ? { ...d, ...don } : d));
    if (don.id) {
      setActiveDonKinhMediaId(don.id);
      setHighlightId(don.id);
      setTimeout(() => setHighlightId(current => current === don.id ? null : current), 3000);
    }
  };
  const removeHistory = (id?: number) => {
    if (!id) return;
    setDonKinhs(prev => prev.filter(d => d.id !== id));
    setActiveDonKinhMediaId(prev => prev === id ? null : prev);
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
        const draftQueueSnapshot = [...draftMediaQueue];
        toast.success('Đã lưu đơn kính');
        // Auto chuyển trạng thái chờ khám → đã_xong
        axios.patch('/api/cho-kham', {
          benhnhanid: parseInt(benhnhanid || '0'),
          trangthai: 'đã_xong',
        }).catch(() => {});
        // Show inventory warnings
        const warnings: string[] = res.data.inventoryWarnings || [];
        warnings.forEach((w: string) => toast(w, { duration: 6000, icon: '📦' }));
        const createdDon = res.data.data as DonKinh;
        const createdDonId = createdDon?.id;

        addHistory(createdDon);
        setDraftQueueResetToken((prev) => prev + 1);
        setDraftMediaQueue([]);
        if (createdDonId && draftQueueSnapshot.length > 0) {
          startBackgroundDonKinhMediaUpload(createdDonId, draftQueueSnapshot);
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
    setActiveDonKinhMediaId(null);
    setDraftQueueResetToken((prev) => prev + 1);
    setDraftMediaQueue([]);
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
    // Reset media panel - bỏ liên kết với đơn vừa thao tác
    setActiveDonKinhMediaId(null);
    setDraftQueueResetToken((prev) => prev + 1);
    setDraftMediaQueue([]);
  };

  // Tiêu đề động cho panel ảnh mobile
  const mobileMediaPanelTitle = useMemo(() => {
    if (!activeDonKinhMediaId || !form.ngaykham) return 'Thêm ảnh vào đơn mới';
    const dt = new Date(form.ngaykham);
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
  }, [activeDonKinhMediaId, form.ngaykham]);

  const mobileMediaDraftNotice = activeDonKinhMediaId ? undefined : 'Ảnh sẽ bị mất nếu không lưu đơn kính.';

  // Chọn đơn từ lịch sử
  const handleSelectDon = (don: DonKinh) => {
    // Mobile: chuyển sang tab Đơn kính (form) để xem/sửa
    setMobileTab(0);
    setActiveDonKinhMediaId(don.id || null);
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

  const confirmBeforeFamilySwitch = async () => {
    const hasDraftMedia = draftMediaQueue.length > 0;
    const hasUnsavedRx = !isEditing && !activeDonKinhMediaId && (
      (form.chandoan?.trim().length ?? 0) > 0
      || (form.giatrong ?? 0) > 0
      || (form.giagong ?? 0) > 0
      || (form.ten_gong?.trim().length ?? 0) > 0
    );
    if (!hasDraftMedia && !hasUnsavedRx) return true;
    return confirm({
      title: 'Chuyển sang thành viên khác?',
      message: hasDraftMedia
        ? 'Đơn kính hoặc ảnh tạm chưa lưu sẽ bị mất nếu bạn chuyển bệnh nhân.'
        : 'Đơn kính đang soạn chưa lưu sẽ bị mất nếu bạn chuyển bệnh nhân.',
      confirmText: 'Chuyển',
      variant: 'danger',
    });
  };

  const handleOpenFamilyMember = (memberPatientId: number) => {
    if (!memberPatientId || memberPatientId === patientIdNumber) return;
    router.push(`/ke-don-kinh?bn=${memberPatientId}`);
  };

  return (
    <ProtectedRoute>
    <PatientFamilyProvider
      benhnhanId={patientIdNumber}
      patientName={benhNhan?.ten ?? ''}
      onSelectMember={handleOpenFamilyMember}
      beforeMemberSwitch={confirmBeforeFamilySwitch}
    >
      {/* Mobile: Stack layout, Desktop: Keep sidebar */}
      <div className="flex flex-col h-[calc(100dvh-68px)] overflow-hidden lg:mt-0 lg:flex-row lg:h-[calc(100vh-72px)]">
        
        {/* Left sidebar - Hidden on mobile, shown on desktop (tab layout) */}
        <aside className="hidden lg:flex lg:flex-col w-72 flex-shrink-0 border-r border-gray-200 bg-[#f5f6f8] overflow-hidden">
          <div className="px-3 pt-3 pb-2 border-b border-gray-200 bg-white/60">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => setDesktopLeftTab('don_cu')}
                  className={`relative h-8 px-0 text-xs font-bold transition-colors ${desktopLeftTab === 'don_cu' ? 'text-blue-700' : 'text-gray-600 hover:text-gray-800'}`}
                >
                  Đơn cũ
                  {donKinhs.length > 0 && (
                    <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">{donKinhs.length}</span>
                  )}
                  <span className={`absolute bottom-0 left-0 right-0 h-[2px] rounded-full transition-colors ${desktopLeftTab === 'don_cu' ? 'bg-blue-500/45' : 'bg-transparent'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopLeftTab('lich_hen')}
                  className={`relative h-8 px-0 text-xs font-bold transition-colors ${desktopLeftTab === 'lich_hen' ? 'text-blue-700' : 'text-gray-600 hover:text-gray-800'}`}
                >
                  Lịch hẹn
                  {(henKhamStats.cho > 0 || henKhamStats.qua_han > 0) && (
                    <span className="ml-1 rounded-full bg-yellow-100 px-1.5 py-0.5 text-[10px] text-yellow-700">{henKhamStats.cho + henKhamStats.qua_han}</span>
                  )}
                  <span className={`absolute bottom-0 left-0 right-0 h-[2px] rounded-full transition-colors ${desktopLeftTab === 'lich_hen' ? 'bg-blue-500/45' : 'bg-transparent'}`} />
                </button>
                <button
                  type="button"
                  onClick={() => setDesktopLeftTab('anh')}
                  className={`relative h-8 px-0 text-xs font-bold transition-colors ${desktopLeftTab === 'anh' ? 'text-blue-700' : 'text-gray-600 hover:text-gray-800'}`}
                >
                  Ảnh
                  <span className="ml-1 rounded-full bg-blue-100 px-1.5 py-0.5 text-[10px] text-blue-700">{imageTabCount}</span>
                  <span className={`absolute bottom-0 left-0 right-0 h-[2px] rounded-full transition-colors ${desktopLeftTab === 'anh' ? 'bg-blue-500/45' : 'bg-transparent'}`} />
                </button>
              </div>
              <button
                className="text-blue-600 hover:text-blue-800 text-xs font-bold flex items-center gap-0.5 transition-colors"
                onClick={() => { setDesktopLeftTab('lich_hen'); setEditHenForm(null); setAddHenForm({ ngay_hen: addDaysToToday(7), gio_hen: '', ly_do: 'Lấy kính', ghichu: '' }); setOpenHenDialog(true); }}
              >
                + Thêm
              </button>
            </div>
          </div>

          {desktopLeftTab === 'don_cu' ? (
            <div className="min-h-0 flex-1">
              <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} groupByYear />
            </div>
          ) : desktopLeftTab === 'anh' ? (
            <div className="min-h-0 flex-1 overflow-y-auto px-3 py-2">
              <PatientMediaTimeline
                patientId={patientIdNumber}
                sourceFilter="don_kinh"
                dense
                hideHeader
                onCountChange={setImageTabCount}
              />
            </div>
          ) : (
            <div className="min-h-0 flex-1 flex flex-col">
              <div className="px-3 pt-2 flex-shrink-0">
                <div className="flex items-center gap-1 mb-2">
                  <h2 className="font-bold text-gray-900 text-sm tracking-tight flex items-center gap-1">
                    <CalendarDays className="w-4 h-4 text-blue-600" /> Lịch hẹn
                    {henKhamStats.cho > 0 && <span className="ml-1 text-[10px] bg-yellow-100 text-yellow-700 px-1.5 py-0.5 rounded-full font-bold">{henKhamStats.cho}</span>}
                    {henKhamStats.qua_han > 0 && <span className="text-[10px] bg-red-100 text-red-600 px-1.5 py-0.5 rounded-full font-bold">{henKhamStats.qua_han}</span>}
                  </h2>
                </div>
              </div>
              <div className="overflow-y-auto flex-1 min-h-0 px-3 pb-3">
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
          )}
        </aside>

        {/* Main content area */}
        <div ref={mobileContentRef} className="flex-1 flex flex-col min-h-0 bg-[#f5f6f8] overflow-hidden">
            {/* Patient info — Mobile: sticky header + tabs + notes */}
            <PatientMobileHeader
              className="lg:hidden flex-shrink-0"
              benhNhan={benhNhan}
              benhnhanid={benhnhanid}
              patientNotes={patientNotes}
              onEditPatient={() => { if (benhNhan) { setPatientForm({ ...benhNhan }); setOpenEditPatient(true); } }}
              onManageNotes={openNotesManagement}
              switchPageLink={`/ke-don?bn=${benhnhanid}`}
              switchPageIcon={<Pill className="w-[18px] h-[18px]" />}
              switchPageLabel="Đơn thuốc"
              extraLinks={benhnhanid ? [{ href: `/tien-luong-ksct?bn=${benhnhanid}`, label: 'Tiên lượng KSCT' }] : []}
              mobileTab={mobileTab}
              mobileTabLabels={mobileTabLabels}
              onTabChange={(idx) => setMobileTab(idx as 0 | 1 | 2 | 3)}
              mobileHeaderRatio={mobileHeaderRatio}
              familySection={<PatientFamilyMobileChip benhnhanId={patientIdNumber} />}
              renderBackgroundUploadNotice={renderBackgroundUploadNotice}
            />

            {/* Scrollable content area (chứa form, payment, history, lịch hẹn) */}
            <div
              ref={tabViewportRef}
              className="relative flex-1 min-h-0 overflow-hidden"
              onTouchStart={onTabTouchStart}
              onTouchMove={onTabTouchMove}
              onTouchEnd={onTabTouchEnd}
              onTouchCancel={onTabTouchEnd}
            >
            <div
              data-panel-idx="0"
              className={`absolute inset-0 overscroll-y-contain px-2 py-2 flex flex-col gap-2 ${mobileTab === 0 ? 'pointer-events-auto' : 'pointer-events-none'} lg:static lg:inset-auto lg:p-4 lg:gap-4 lg:pointer-events-auto lg:overflow-y-auto`}
              style={{
                overflowY: mobileHeaderRatio > 0 && mobileHeaderRatio < 1 ? 'hidden' : 'auto',
                transform: `translate3d(calc(${-mobileTab * 100}% + ${tabDragX}px), 0, 0)`,
                transition: tabDragging ? 'none' : 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)',
                willChange: 'transform',
              }}
            >

            {/* Patient info — Desktop card + notes + background upload */}
            <PatientDesktopCard
              className="hidden lg:block"
              benhNhan={benhNhan}
              benhnhanid={benhnhanid}
              patientNotes={patientNotes}
              onEditPatient={() => { if (benhNhan) { setPatientForm({ ...benhNhan }); setOpenEditPatient(true); } }}
              onManageNotes={openNotesManagement}
              switchPageLink={`/ke-don?bn=${benhnhanid}`}
              switchPageLabel="Đơn thuốc"
              extraLinks={benhnhanid ? [{ href: `/tien-luong-ksct?bn=${benhnhanid}`, label: 'Tiên lượng KSCT' }] : []}
              familySection={<PatientFamilyDesktopChip benhnhanId={patientIdNumber} />}
              renderBackgroundUploadNotice={renderBackgroundUploadNotice}
            />

            {/* Form kê đơn kính - Responsive Layout */}
            <div className="space-y-4">
              {/* Thông tin chung */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 lg:p-4 p-2 block lg:block">
                  {/* Mobile: flat layout (giống /ke-don) */}
                  <div className="lg:hidden px-1.5 py-1">
                    <div className="flex items-center gap-1 pb-1">
                      <p className="text-[15px] text-gray-700 leading-none">
                        <span className="font-extrabold text-gray-900">Chẩn đoán:</span>
                      </p>
                      <div className="ml-auto flex items-center gap-0.5">
                        <Input
                          ref={mobileNgayKhamRef}
                          type="datetime-local"
                          value={form.ngaykham || ''}
                          onChange={(e) => setForm({ ...form, ngaykham: e.target.value })}
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
                    <input
                      list="chandoan-list"
                      value={form.chandoan || ''}
                      onChange={(e) => setForm({ ...form, chandoan: e.target.value })}
                      className="w-full bg-transparent border-0 outline-none px-0 py-1 text-[16px] leading-6 placeholder:text-gray-400 focus:ring-0"
                      placeholder="Nhập chẩn đoán..."
                    />
                  </div>

                  {/* Desktop: original bordered layout */}
                  <div className="hidden lg:block space-y-2">
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
                  </div>

                  <div className="mt-3 pt-3 border-t border-gray-100">
                      {/* Mobile: Unified 2-column table layout */}
                      <div className="block sm:hidden -mx-2 -mb-2">
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
                              <ThiLucInput dataNavOrder={1} dataFirstFocus="thiluc_khongkinh_mp" customValues={thiLucSuggestions} value={form.thiluc_khongkinh_mp || ''} onChange={(val) => setForm({ ...form, thiluc_khongkinh_mp: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5 border-b border-gray-200">
                              <ThiLucInput dataNavOrder={2} customValues={thiLucSuggestions} value={form.thiluc_khongkinh_mt || ''} onChange={(val) => setForm({ ...form, thiluc_khongkinh_mt: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                          </div>
                          {/* TL Kính cũ */}
                          <div className="grid grid-cols-[3rem_1fr_1fr]">
                            <div className="px-1 py-1.5 border-b border-r border-gray-200 flex items-center"><span className="text-[10px] font-medium text-gray-600 leading-tight">TL cũ</span></div>
                            <div className="px-1 py-1.5 border-b border-r border-gray-200">
                              <ThiLucInput dataNavOrder={3} customValues={thiLucSuggestions} value={form.thiluc_kinhcu_mp || ''} onChange={(val) => setForm({ ...form, thiluc_kinhcu_mp: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5 border-b border-gray-200">
                              <ThiLucInput dataNavOrder={4} customValues={thiLucSuggestions} value={form.thiluc_kinhcu_mt || ''} onChange={(val) => setForm({ ...form, thiluc_kinhcu_mt: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                          </div>
                          {/* TL Kính mới */}
                          <div className="grid grid-cols-[3rem_1fr_1fr]">
                            <div className="px-1 py-1.5 border-b border-r border-gray-200 flex items-center"><span className="text-[10px] font-medium text-gray-600 leading-tight">TL mới</span></div>
                            <div className="px-1 py-1.5 border-b border-r border-gray-200">
                              <ThiLucInput dataNavOrder={5} customValues={thiLucSuggestions} value={form.thiluc_kinhmoi_mp || ''} onChange={(val) => setForm({ ...form, thiluc_kinhmoi_mp: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
                            </div>
                            <div className="px-1 py-1.5 border-b border-gray-200">
                              <ThiLucInput dataNavOrder={6} customValues={thiLucSuggestions} value={form.thiluc_kinhmoi_mt || ''} onChange={(val) => setForm({ ...form, thiluc_kinhmoi_mt: val })} className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" />
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
                              <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={form.pd_mp || ''} onChange={(e) => setForm({ ...form, pd_mp: e.target.value })} placeholder="mm" className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" data-nav="presc" data-order="10.1" />
                            </div>
                            <div className="px-1 py-1.5">
                              <input type="text" inputMode="decimal" pattern="[0-9]*[.,]?[0-9]*" value={form.pd_mt || ''} onChange={(e) => setForm({ ...form, pd_mt: e.target.value })} placeholder="mm" className="h-9 w-full bg-white border border-gray-300 rounded-lg px-2 text-sm text-center text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500" data-nav="presc" data-order="10.2" />
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
            <ThiLucInput
              dataNavOrder={1}
              dataFirstFocus="thiluc_khongkinh_mp"
              customValues={thiLucSuggestions}
              value={form.thiluc_khongkinh_mp || ''}
              onChange={(val) => setForm({ ...form, thiluc_khongkinh_mp: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-b border-r border-gray-300 bg-white">
            <ThiLucInput
              dataNavOrder={3}
              customValues={thiLucSuggestions}
              value={form.thiluc_kinhcu_mp || ''}
              onChange={(val) => setForm({ ...form, thiluc_kinhcu_mp: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-b border-r border-gray-300 bg-white">
            <ThiLucInput
              dataNavOrder={5}
              customValues={thiLucSuggestions}
              value={form.thiluc_kinhmoi_mp || ''}
              onChange={(val) => setForm({ ...form, thiluc_kinhmoi_mp: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-b border-r border-gray-300 bg-white">
            <SoKinhInput
              dataNavOrder={7}
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
              dataNavOrder={9}
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
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              value={form.pd_mp || ''}
              onChange={(e) => setForm({ ...form, pd_mp: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="mm"
              data-nav="presc"
              data-order="10.1"
            />
          </td>
        </tr>

        {/* Mắt Trái */}
        <tr className="hover:bg-green-50/50 transition-colors">
          <td className="px-1.5 py-1 border-r border-gray-300 font-bold text-center text-gray-900">MT</td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <ThiLucInput
              dataNavOrder={2}
              customValues={thiLucSuggestions}
              value={form.thiluc_khongkinh_mt || ''}
              onChange={(val) => setForm({ ...form, thiluc_khongkinh_mt: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <ThiLucInput
              dataNavOrder={4}
              customValues={thiLucSuggestions}
              value={form.thiluc_kinhcu_mt || ''}
              onChange={(val) => setForm({ ...form, thiluc_kinhcu_mt: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <ThiLucInput
              dataNavOrder={6}
              customValues={thiLucSuggestions}
              value={form.thiluc_kinhmoi_mt || ''}
              onChange={(val) => setForm({ ...form, thiluc_kinhmoi_mt: val })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
            />
          </td>

          <td className="px-1.5 py-1 border-r border-gray-300 bg-white">
            <SoKinhInput
              dataNavOrder={8}
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
              dataNavOrder={10}
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
              inputMode="decimal"
              pattern="[0-9]*[.,]?[0-9]*"
              value={form.pd_mt || ''}
              onChange={(e) => setForm({ ...form, pd_mt: e.target.value })}
              className="h-7 w-full bg-white border border-gray-300 rounded-md px-2 text-sm text-gray-900 text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              placeholder="mm"
              data-nav="presc"
              data-order="10.2"
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
              <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-gray-200 block lg:block">
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
                        <>
                          <input
                            list="gongkinh-list"
                            value={form.ten_gong || ''}
                            onChange={(e) => handleFrameChange(e.target.value)}
                            className="h-9 bg-white border border-gray-300 rounded-lg px-2 text-sm font-medium flex-1 min-w-0 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                            placeholder="Chọn loại gọng"
                            data-nav="presc"
                            data-order="11"
                          />
                          <button
                            type="button"
                            onClick={openFrameBarcodeDialog}
                            className="h-9 px-2.5 rounded-lg border border-blue-200 bg-blue-50 text-blue-700 text-[11px] font-bold inline-flex items-center gap-1 shrink-0"
                          >
                            <ScanLine className="w-3.5 h-3.5" /> Quét
                          </button>
                        </>
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

              {/* Ghi chú đơn kính — dưới phần Sản phẩm, trên Thanh toán (cả mobile & desktop) */}
              <div className="bg-white rounded-xl shadow-sm border border-gray-200 px-3 py-2.5">
                <div className="flex items-start gap-2">
                  <span className="text-xs font-semibold text-gray-500 uppercase tracking-wide shrink-0 pt-1.5">Ghi chú</span>
                  <textarea
                    rows={1}
                    value={form.ghichu || ''}
                    onChange={(e) => {
                      setForm({ ...form, ghichu: e.target.value });
                      e.target.style.height = 'auto';
                      e.target.style.height = e.target.scrollHeight + 'px';
                    }}
                    onFocus={(e) => { e.target.style.height = 'auto'; e.target.style.height = e.target.scrollHeight + 'px'; }}
                    className="flex-1 min-w-0 min-h-[28px] resize-none bg-transparent border-0 outline-none px-0 py-1 text-sm leading-6 placeholder:text-gray-400 focus:ring-0 overflow-hidden"
                    placeholder="Ghi chú thêm về đơn kính..."
                    data-nav="presc"
                    data-order="16"
                  />
                </div>
              </div>

              {/* Mobile Thanh toán + History + Appointment - ẩn trên desktop */}
              <div className="block lg:hidden">
                <div className="bg-white rounded-xl shadow-sm p-4 space-y-3 border border-gray-200 block">
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
                <div className="pt-4 border-t border-gray-200 space-y-2">
                  {!isEditing ? (
                    <div className="grid grid-cols-3 gap-2">
                      <button
                        className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold py-3 rounded-xl shadow-md shadow-blue-200/70 active:scale-[0.98] transition-all text-sm touch-manipulation"
                        onClick={luuDonKinh}
                      >
                        Lưu đơn
                      </button>
                      <button
                        className="col-span-1 bg-white border border-gray-300 text-gray-600 font-semibold py-3 rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all text-sm touch-manipulation"
                        onClick={resetForm}
                      >
                        Đơn mới
                      </button>
                    </div>
                  ) : form.id ? (
                    <>
                      <div className="grid grid-cols-3 gap-2">
                        <button
                          className="bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl shadow-sm active:scale-[0.98] transition-all text-sm touch-manipulation"
                          onClick={handleUpdate}
                        >
                          Sửa đơn
                        </button>
                        <button
                          className="bg-white border border-gray-300 text-gray-700 font-bold py-2.5 rounded-xl hover:bg-gray-50 active:scale-[0.98] transition-all text-sm touch-manipulation"
                          onClick={handleCopy}
                        >
                          Sao chép
                        </button>
                        <button
                          className="bg-amber-50 border border-amber-200 text-amber-700 font-bold py-2.5 rounded-xl hover:bg-amber-100 active:scale-[0.98] transition-all text-sm touch-manipulation"
                          onClick={resetForm}
                        >
                          Đơn mới
                        </button>
                      </div>
                      <div className={`grid gap-2 ${benhNhan ? 'grid-cols-2' : 'grid-cols-1'}`}>
                        {benhNhan && (
                          <div className="[&>button]:w-full [&>button]:justify-center">
                            <PrintDonKinh config={printConfig} don={form as any} benhNhan={benhNhan} />
                          </div>
                        )}
                        <button
                          className="bg-white border border-red-200 text-red-600 font-bold py-2.5 rounded-xl hover:bg-red-50 active:scale-[0.98] transition-all text-sm touch-manipulation flex items-center justify-center gap-1"
                          onClick={handleDelete}
                        >
                          <Trash2 className="w-4 h-4" /> Xóa
                        </button>
                      </div>
                    </>
                  ) : null}
                </div>

                {/* Mobile History Section */}
                <div className="hidden">
                  <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} />
                </div>

                {/* Mobile Appointment Section */}
                <div className="hidden">
                  <div>
                    <div className="px-1 pt-1 pb-2 flex justify-between items-center">
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
                    <div className="space-y-2">
                      {dsHenKham.length === 0 ? (
                        <p className="text-xs text-gray-400 px-1">Chưa có lịch hẹn nào</p>
                      ) : (
                        dsHenKham.map(hen => {
                          const st = TRANG_THAI_HEN[hen.trang_thai] || TRANG_THAI_HEN.cho;
                          const countdown = getHenCountdown(hen.ngay_hen, hen.trang_thai);
                          return (
                            <div key={hen.id} className={`bg-white px-2.5 py-2 rounded-xl border shadow-sm ${hen.trang_thai === 'qua_han' ? 'border-red-200' : 'border-gray-200'}`}>
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

            {/* Panel 1: Đơn cũ (mobile viewport track) */}
            <div
              data-panel-idx="1"
              className={`lg:hidden absolute inset-0 overscroll-y-contain px-2 py-2 ${mobileTab === 1 ? 'pointer-events-auto' : 'pointer-events-none'}`}
              style={{
                overflowY: mobileHeaderRatio > 0 && mobileHeaderRatio < 1 ? 'hidden' : 'auto',
                transform: `translate3d(calc(${(1 - mobileTab) * 100}% + ${tabDragX}px), 0, 0)`,
                transition: tabDragging ? 'none' : 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)',
                willChange: 'transform',
              }}
            >
              <History items={donKinhs} onSelect={handleSelectDon} highlightId={highlightId} />
            </div>

            {/* Panel 2: Lịch hẹn (mobile viewport track) */}
            <div
              data-panel-idx="2"
              className={`lg:hidden absolute inset-0 overscroll-y-contain px-2 py-2 ${mobileTab === 2 ? 'pointer-events-auto' : 'pointer-events-none'}`}
              style={{
                overflowY: mobileHeaderRatio > 0 && mobileHeaderRatio < 1 ? 'hidden' : 'auto',
                transform: `translate3d(calc(${(2 - mobileTab) * 100}% + ${tabDragX}px), 0, 0)`,
                transition: tabDragging ? 'none' : 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)',
                willChange: 'transform',
              }}
            >
              <div>
                <div className="px-1 pt-1 pb-2 flex justify-between items-center">
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
                <div className="space-y-2">
                  {dsHenKham.length === 0 ? (
                    <p className="text-xs text-gray-400 px-1">Chưa có lịch hẹn nào</p>
                  ) : (
                    dsHenKham.map(hen => {
                      const st = TRANG_THAI_HEN[hen.trang_thai] || TRANG_THAI_HEN.cho;
                      const countdown = getHenCountdown(hen.ngay_hen, hen.trang_thai);
                      return (
                        <div key={hen.id} className={`bg-white px-2.5 py-2 rounded-xl border shadow-sm ${hen.trang_thai === 'qua_han' ? 'border-red-200' : 'border-gray-200'}`}>
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

            {/* Panel 3: Ảnh đơn kính (mobile viewport track) */}
            <div
              data-panel-idx="3"
              className={`lg:hidden absolute inset-0 overscroll-y-contain px-2 py-2 space-y-2 ${mobileTab === 3 ? 'pointer-events-auto' : 'pointer-events-none'}`}
              style={{
                overflowY: mobileHeaderRatio > 0 && mobileHeaderRatio < 1 ? 'hidden' : 'auto',
                transform: `translate3d(calc(${(3 - mobileTab) * 100}% + ${tabDragX}px), 0, 0)`,
                transition: tabDragging ? 'none' : 'transform 0.26s cubic-bezier(0.32, 0.72, 0, 1)',
                willChange: 'transform',
              }}
            >
              <DonKinhMediaPanel
                donKinhId={activeDonKinhMediaId}
                onDraftQueueChange={setDraftMediaQueue}
                draftQueueResetToken={draftQueueResetToken}
                onPhotoAdded={() => setMobileTab(0)}
                headerTitle={mobileMediaPanelTitle}
                draftNoticeText={mobileMediaDraftNotice}
              />
              <PatientMediaTimeline
                patientId={patientIdNumber}
                sourceFilter="don_kinh"
                hideHeader
                onCountChange={setImageTabCount}
                ownerIdFilter={activeDonKinhMediaId}
              />
            </div>
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

          <DonKinhMediaPanel
            donKinhId={activeDonKinhMediaId}
            onDraftQueueChange={setDraftMediaQueue}
            draftQueueResetToken={draftQueueResetToken}
          />

          </div>
          {/* end scrollable zone */}

          {/* Fixed-bottom action buttons */}
          <div className="flex-shrink-0 p-3 border-t border-gray-200 space-y-2">
            {!isEditing ? (
              <div className="grid grid-cols-3 gap-1.5">
                <button
                  className="col-span-2 bg-blue-600 hover:bg-blue-700 text-white font-bold text-xs py-2.5 rounded-xl shadow-sm flex items-center justify-center gap-1.5 transition-all active:scale-[0.98]"
                  onClick={luuDonKinh}
                >
                  ✓ Lưu đơn
                </button>
                <button
                  className="col-span-1 bg-white border border-gray-300 text-gray-600 font-semibold text-[11px] py-2.5 rounded-xl hover:bg-gray-50 transition-colors"
                  onClick={resetForm}
                >
                  Đơn mới
                </button>
              </div>
            ) : form.id ? (
              <>
                <div className="grid grid-cols-3 gap-1.5">
                  <button
                    className="bg-blue-600 hover:bg-blue-700 text-white font-bold text-[11px] py-2 rounded-xl transition-colors"
                    onClick={handleUpdate}
                  >
                    Sửa đơn
                  </button>
                  <button
                    className="bg-white border border-gray-300 text-gray-700 font-bold text-[11px] py-2 rounded-xl hover:bg-gray-50 transition-colors"
                    onClick={handleCopy}
                  >
                    Sao chép
                  </button>
                  <button
                    className="bg-amber-50 border border-amber-200 text-amber-700 font-bold text-[11px] py-2 rounded-xl hover:bg-amber-100 transition-colors"
                    onClick={resetForm}
                  >
                    Đơn mới
                  </button>
                </div>
                <div className={`grid gap-1.5 ${benhNhan ? 'grid-cols-2' : 'grid-cols-1'}`}>
                  {benhNhan && (
                    <div className="[&>button]:w-full [&>button]:justify-center [&>button]:text-[11px] [&>button]:py-2">
                      <PrintDonKinh config={printConfig} don={form as any} benhNhan={benhNhan} />
                    </div>
                  )}
                  <button
                    className="bg-white border border-red-200 text-red-600 font-bold text-[11px] py-2 rounded-xl hover:bg-red-50 transition-colors flex items-center justify-center gap-1"
                    onClick={handleDelete}
                  >
                    <Trash2 className="w-3.5 h-3.5" /> Xóa
                  </button>
                </div>
              </>
            ) : null}
          </div>
        </aside>
      </div>

      <Dialog
        open={openFrameBarcodeScanner}
        onOpenChange={(open) => {
          setOpenFrameBarcodeScanner(open);
          if (!open) stopFrameBarcodeScanner();
        }}
      >
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Quét mã gọng (Barcode/QR)</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <div className="relative aspect-video overflow-hidden rounded-lg border border-gray-200 bg-black">
              <video
                ref={frameBarcodeVideoRef}
                className="w-full h-full object-cover"
                playsInline
                muted
                autoPlay
                onClick={() => {
                  frameBarcodeVideoRef.current?.play().catch(() => {});
                }}
              />
              {barcodeScannerBusy && (
                <div className="absolute inset-0 flex items-center justify-center text-xs text-white/90 bg-black/40">
                  Đang mở camera...
                </div>
              )}
            </div>

            {barcodeScannerError && (
              <p className="text-xs text-red-600">{barcodeScannerError}</p>
            )}

            <div className="space-y-1.5">
              <Label htmlFor="manual-frame-barcode">Nhập mã gọng thủ công</Label>
              <div className="flex items-center gap-2">
                <Input
                  id="manual-frame-barcode"
                  value={manualFrameBarcode}
                  onChange={(e) => setManualFrameBarcode(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      submitManualFrameBarcode();
                    }
                  }}
                  placeholder="VD: GK001"
                />
                <Button type="button" onClick={submitManualFrameBarcode} className="shrink-0">
                  Áp dụng
                </Button>
              </div>
            </div>

            <p className="text-[11px] text-gray-500">
              Quét mã vạch hoặc QR code để tự điền loại gọng vào đơn.
            </p>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Patient Dialog */}
      <Dialog open={openEditPatient} onOpenChange={setOpenEditPatient}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Sửa thông tin bệnh nhân</DialogTitle>
            {patientForm?.id && (
              <div className="text-sm text-gray-500">Mã BN: {patientForm.mabenhnhan || '—'}</div>
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
            <Label>Giới tính</Label>
            <select
              className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              value={patientForm?.gioitinh || ''}
              onChange={(e) => setPatientForm((prev) => prev ? { ...prev, gioitinh: e.target.value } as BenhNhan : prev)}
            >
              <option value="">— Chưa chọn —</option>
              <option value="Nam">Nam</option>
              <option value="Nữ">Nữ</option>
            </select>
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

      {/* Notes Management Dialog */}
      <Dialog open={openNotesDialog} onOpenChange={(v) => { setOpenNotesDialog(v); if (!v) { setEditingNoteId(null); setNoteFormContent(''); setNoteFormType('normal'); } }}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Ghi chú bệnh nhân</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-1">
            {/* List of existing notes */}
            {allPatientNotes.length > 0 && (
              <div className="space-y-1.5 max-h-40 overflow-y-auto">
                {allPatientNotes.map((note) => (
                  <div
                    key={note.id}
                    className={`flex items-start gap-2 rounded-lg px-3 py-2 cursor-pointer transition-colors border ${
                      editingNoteId === note.id
                        ? 'bg-blue-50 border-blue-300'
                        : 'bg-gray-50 border-gray-200 hover:bg-gray-100'
                    }`}
                    onClick={() => {
                      setEditingNoteId(note.id);
                      setNoteFormContent(note.content);
                      setNoteFormType(note.note_type);
                    }}
                  >
                    <AlertTriangle className={`w-3.5 h-3.5 flex-shrink-0 mt-0.5 ${note.note_type === 'important' ? 'text-red-500' : 'text-amber-500'}`} />
                    <p className={`flex-1 text-xs leading-snug ${note.note_type === 'important' ? 'text-red-700 font-semibold' : 'text-gray-700'}`}>
                      {note.content}
                    </p>
                    <button
                      type="button"
                      className="text-gray-300 hover:text-red-400 transition-colors flex-shrink-0"
                      onClick={(e) => { e.stopPropagation(); deleteNote(note.id); }}
                      aria-label="Xóa ghi chú"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Editor */}
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
                  <input
                    type="radio"
                    checked={noteFormType === 'normal'}
                    onChange={() => setNoteFormType('normal')}
                    className="text-blue-600"
                  />
                  <span className="text-sm text-gray-600">Thường</span>
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={noteFormType === 'important'}
                    onChange={() => setNoteFormType('important')}
                    className="text-red-600"
                  />
                  <span className="text-sm text-red-700 font-medium">Quan trọng</span>
                </label>
                {editingNoteId && (
                  <button
                    type="button"
                    className="ml-auto text-xs text-gray-400 hover:text-gray-600"
                    onClick={() => { setEditingNoteId(null); setNoteFormContent(''); setNoteFormType('normal'); }}
                  >
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