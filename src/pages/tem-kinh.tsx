import React, { ChangeEvent, PointerEvent, useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/router';
import axios from 'axios';
import toast from 'react-hot-toast';
import QRCode from 'qrcode';
import JsBarcode from 'jsbarcode';
import ProtectedRoute from '../components/ProtectedRoute';
import { FeatureGate } from '../components/FeatureGate';
import {
  createDefaultTemKinhTemplate,
  normalizeTemLabelTemplate,
  type TemLabelElement,
  type TemLabelTemplate,
} from '../lib/temKinh';
import { printResolvedTemTemplate } from '../lib/temKinhClientPrint';
import styles from './tem-kinh-designer.module.css';

const TEMPLATE_STORAGE_KEY = 'tem-kinh:default-template-id';
const DIRECT_PRINTER_STORAGE_KEY = 'tem-kinh:direct-printer-name';

type TemTemplate = TemLabelTemplate & {
  id?: number | null;
  source?: string;
};

type GongKinh = {
  id: number;
  ten_gong: string;
  ma_gong?: string | null;
};

type TemplateListItem = TemTemplate & {
  id: number | null;
  is_default?: boolean;
  branch_id?: string | null;
};

type DragState = {
  id: string;
  startX: number;
  startY: number;
  originX: number;
  originY: number;
};

type TokenInputTarget = 'text' | 'code';

type TokenOption = {
  token: string;
  label: string;
  hint: string;
  targets: TokenInputTarget[];
};

type TemDataResponse = {
  frame: {
    id: number;
    ten_gong: string;
    ma_gong?: string | null;
    chat_lieu?: string | null;
    hang_san_xuat?: string | null;
    mau_sac?: string | null;
    kich_co?: string | null;
    ton_kho?: number;
    nha_cung_cap?: string | null;
  };
  store: {
    ten_cua_hang?: string;
    dia_chi?: string;
    dien_thoai?: string;
    ten_chi_nhanh?: string;
  };
  pricing: {
    buy_price: number;
    catalog_sell_price: number;
    effective_sell_price: number;
    source: 'catalog_default' | 'branch_override';
    override_id: number | null;
  };
  template: TemTemplate;
  resolved_template: TemTemplate;
  tokens: Record<string, string>;
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function parsePositiveInt(value: unknown): number | null {
  if (typeof value !== 'string' && typeof value !== 'number') return null;
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) return null;
  return parsed;
}

function nextId(prefix: string): string {
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}`;
}

function formatVnd(value: number | null | undefined): string {
  const amount = Number.isFinite(value as number) ? Number(value) : 0;
  return `${amount.toLocaleString('vi-VN')} VND`;
}

function buildQrSrc(value: string, sizePx: number): string {
  const size = Math.max(64, Math.round(sizePx));
  return `https://api.qrserver.com/v1/create-qr-code/?margin=0&size=${size}x${size}&data=${encodeURIComponent(value || ' ')}`;
}

function buildBarcodeSrc(value: string, heightPx: number): string {
  const height = Math.max(12, Math.round(heightPx / 3));
  return `https://bwipjs-api.metafloor.com/?bcid=code128&text=${encodeURIComponent(value || '0')}&includetext=false&scale=3&height=${height}`;
}

function normalizeTemplateForSave(template: TemLabelTemplate): TemLabelTemplate {
  const normalized = normalizeTemLabelTemplate(template);
  return {
    ...normalized,
    name: normalized.name.trim() || 'Tem kinh mac dinh',
  };
}

const TOKEN_OPTIONS: TokenOption[] = [
  { token: '{{store_name}}', label: 'Tên cửa hàng', hint: 'Ví dụ: Kính mắt Ánh Sáng', targets: ['text'] },
  { token: '{{store_address}}', label: 'Địa chỉ cửa hàng', hint: 'Địa chỉ in lên tem', targets: ['text'] },
  { token: '{{store_phone}}', label: 'Số điện thoại cửa hàng', hint: 'Hotline cửa hàng', targets: ['text'] },
  { token: '{{branch_name}}', label: 'Tên chi nhánh', hint: 'Chi nhánh đang thao tác', targets: ['text'] },
  { token: '{{frame_name}}', label: 'Tên gọng kính', hint: 'Tên sản phẩm gọng', targets: ['text'] },
  { token: '{{frame_code}}', label: 'Mã gọng', hint: 'Mã sản phẩm gọng', targets: ['text', 'code'] },
  { token: '{{brand}}', label: 'Hãng', hint: 'Thương hiệu gọng kính', targets: ['text'] },
  { token: '{{material}}', label: 'Chất liệu', hint: 'Ví dụ: Titanium, nhựa...', targets: ['text'] },
  { token: '{{color}}', label: 'Màu sắc', hint: 'Màu gọng đang chọn', targets: ['text'] },
  { token: '{{size}}', label: 'Kích cỡ', hint: 'Thông số kích cỡ gọng', targets: ['text'] },
  { token: '{{supplier_name}}', label: 'Nhà cung cấp', hint: 'Tên nhà cung cấp gọng', targets: ['text'] },
  { token: '{{sell_price_vnd}}', label: 'Giá bán', hint: 'Giá bán thực tế theo chi nhánh', targets: ['text'] },
  { token: '{{buy_price_vnd}}', label: 'Giá nhập', hint: 'Giá nhập sản phẩm', targets: ['text'] },
  { token: '{{printed_at}}', label: 'Thời điểm in', hint: 'Ngày giờ in tem', targets: ['text'] },
  { token: '{{qr_value}}', label: 'Giá trị QR', hint: 'Nội dung mã QR', targets: ['text', 'code'] },
  { token: '{{barcode_value}}', label: 'Giá trị Barcode', hint: 'Nội dung mã vạch', targets: ['text', 'code'] },
];

function normalizeSearchText(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

function findAtTriggerRange(value: string, caretPos: number): { start: number; end: number; query: string } | null {
  const before = value.slice(0, caretPos);
  const atIndex = before.lastIndexOf('@');
  if (atIndex < 0) return null;

  const segment = before.slice(atIndex + 1);
  if (/\s/.test(segment)) return null;

  return {
    start: atIndex,
    end: caretPos,
    query: segment,
  };
}

function filterTokenOptions(options: TokenOption[], query: string, target: TokenInputTarget): TokenOption[] {
  const normalizedQuery = normalizeSearchText(query.trim());
  return options.filter((option) => {
    if (!option.targets.includes(target)) return false;
    if (!normalizedQuery) return true;

    const haystack = normalizeSearchText(`${option.label} ${option.token} ${option.hint}`);
    return haystack.includes(normalizedQuery);
  });
}

function mmToDots(mm: number, dpi: number): number {
  return Math.round((mm * dpi) / 25.4);
}

function isLightColor(color?: string): boolean {
  if (!color) return true;
  const hex = color.trim();
  const full = /^#([0-9a-fA-F]{6})$/.exec(hex);
  if (!full) return true;

  const rgb = full[1];
  const r = parseInt(rgb.slice(0, 2), 16);
  const g = parseInt(rgb.slice(2, 4), 16);
  const b = parseInt(rgb.slice(4, 6), 16);
  const luminance = 0.299 * r + 0.587 * g + 0.114 * b;
  return luminance > 170;
}

function isDarkColor(color?: string): boolean {
  return !isLightColor(color);
}

function rotationRad(deg: number): number {
  return (deg * Math.PI) / 180;
}

function uint8ToBase64(bytes: Uint8Array): string {
  const chunkSize = 0x8000;
  let binary = '';
  for (let index = 0; index < bytes.length; index += chunkSize) {
    const chunk = bytes.subarray(index, index + chunkSize);
    binary += String.fromCharCode(...chunk);
  }
  return btoa(binary);
}

function loadImageFromDataUrl(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error('load image failed'));
    image.src = src;
  });
}

function buildIntegral(values: Float32Array, width: number, height: number): Float64Array {
  const integral = new Float64Array((width + 1) * (height + 1));
  for (let y = 1; y <= height; y += 1) {
    let rowSum = 0;
    for (let x = 1; x <= width; x += 1) {
      rowSum += values[(y - 1) * width + (x - 1)];
      integral[y * (width + 1) + x] = integral[(y - 1) * (width + 1) + x] + rowSum;
    }
  }
  return integral;
}

function localMean(integral: Float64Array, width: number, x0: number, y0: number, x1: number, y1: number): number {
  const stride = width + 1;
  const ax = x0;
  const ay = y0;
  const bx = x1 + 1;
  const by = y1 + 1;
  const sum = integral[by * stride + bx] - integral[ay * stride + bx] - integral[by * stride + ax] + integral[ay * stride + ax];
  const area = (x1 - x0 + 1) * (y1 - y0 + 1);
  return sum / Math.max(1, area);
}

function adaptiveBinaryLuminance(
  rgba: Uint8ClampedArray,
  width: number,
  height: number,
  dpi: number,
  gamma: number,
  localBias: number
): Uint8Array {
  const corrected = new Float32Array(width * height);

  for (let index = 0; index < width * height; index += 1) {
    const offset = index * 4;
    const lum = (0.299 * rgba[offset] + 0.587 * rgba[offset + 1] + 0.114 * rgba[offset + 2]) / 255;
    corrected[index] = Math.pow(lum, gamma);
  }

  const integral = buildIntegral(corrected, width, height);
  const radius = Math.max(2, Math.round((dpi / 25.4) * 1.2));
  const out = new Uint8Array(width * height);

  for (let y = 0; y < height; y += 1) {
    const y0 = Math.max(0, y - radius);
    const y1 = Math.min(height - 1, y + radius);
    for (let x = 0; x < width; x += 1) {
      const x0 = Math.max(0, x - radius);
      const x1 = Math.min(width - 1, x + radius);
      const mean = localMean(integral, width, x0, y0, x1, y1);
      const threshold = Math.max(0, Math.min(1, mean - localBias));
      const idx = y * width + x;
      out[idx] = corrected[idx] < threshold ? 1 : 0;
    }
  }

  return out;
}

async function buildQrDataUrl(value: string, widthDots: number): Promise<string> {
  return QRCode.toDataURL(value || ' ', {
    margin: 0,
    width: Math.max(36, widthDots),
    color: { dark: '#111111', light: '#ffffff' },
  });
}

function buildBarcodeDataUrl(value: string, heightDots: number): string {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  JsBarcode(svg, value || '0', {
    format: 'CODE128',
    width: 1.25,
    height: Math.max(24, Math.round(heightDots)),
    margin: 0,
    displayValue: false,
    background: '#ffffff',
  });
  const xml = new XMLSerializer().serializeToString(svg);
  return `data:image/svg+xml;utf8,${encodeURIComponent(xml)}`;
}

export default function TemKinhPage() {
  const router = useRouter();

  const [template, setTemplate] = useState<TemLabelTemplate>(() => createDefaultTemKinhTemplate());
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [zoom, setZoom] = useState(8);
  const [dragState, setDragState] = useState<DragState | null>(null);

  const [frames, setFrames] = useState<GongKinh[]>([]);
  const [templates, setTemplates] = useState<TemplateListItem[]>([]);
  const [selectedFrameId, setSelectedFrameId] = useState<number | null>(null);
  const [selectedTemplateId, setSelectedTemplateId] = useState<number | null>(null);
  const [editorIsDefault, setEditorIsDefault] = useState(false);
  const [isPreviewMode, setIsPreviewMode] = useState(false);
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [offsetXInput, setOffsetXInput] = useState('0');
  const [offsetYInput, setOffsetYInput] = useState('0');

  const [payload, setPayload] = useState<TemDataResponse | null>(null);
  const [loadingInitial, setLoadingInitial] = useState(true);
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [savingTemplate, setSavingTemplate] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(false);
  const [printers, setPrinters] = useState<string[]>([]);
  const [printerName, setPrinterName] = useState('');
  const [printerStatus, setPrinterStatus] = useState('');
  const [isDirectPrinting, setIsDirectPrinting] = useState(false);

  const autoPrintedRef = useRef(false);
  const importInputRef = useRef<HTMLInputElement | null>(null);
  const textTokenInputRef = useRef<HTMLInputElement | null>(null);
  const codeTokenInputRef = useRef<HTMLInputElement | null>(null);

  const [showTextTokenMenu, setShowTextTokenMenu] = useState(false);
  const [showCodeTokenMenu, setShowCodeTokenMenu] = useState(false);
  const [textTokenQuery, setTextTokenQuery] = useState('');
  const [codeTokenQuery, setCodeTokenQuery] = useState('');

  const sortedElements = useMemo(() => [...template.elements].sort((a, b) => a.z - b.z), [template.elements]);
  const selectedElement = useMemo(
    () => template.elements.find((item) => item.id === selectedId) ?? null,
    [template.elements, selectedId]
  );
  const textTokenOptions = useMemo(
    () => filterTokenOptions(TOKEN_OPTIONS, textTokenQuery, 'text'),
    [textTokenQuery]
  );
  const codeTokenOptions = useMemo(
    () => filterTokenOptions(TOKEN_OPTIONS, codeTokenQuery, 'code'),
    [codeTokenQuery]
  );
  const canvasTemplate = useMemo(
    () => (isPreviewMode && payload?.resolved_template ? payload.resolved_template : template),
    [isPreviewMode, payload, template]
  );
  const canvasElements = useMemo(() => [...canvasTemplate.elements].sort((a, b) => a.z - b.z), [canvasTemplate.elements]);

  useEffect(() => {
    document.title = 'In tem kính';
  }, []);

  useEffect(() => {
    setOffsetXInput(String(template.bitmapOffsetXmm ?? 0));
    setOffsetYInput(String(template.bitmapOffsetYmm ?? 0));
  }, [template.bitmapOffsetXmm, template.bitmapOffsetYmm]);

  useEffect(() => {
    setShowTextTokenMenu(false);
    setShowCodeTokenMenu(false);
    setTextTokenQuery('');
    setCodeTokenQuery('');
  }, [selectedId]);

  const applyTemplateToDesigner = (nextTemplate: TemLabelTemplate, options?: { isDefault?: boolean }) => {
    const normalized = normalizeTemLabelTemplate(nextTemplate);
    setTemplate(normalized);
    setSelectedId(null);
    setEditorIsDefault(Boolean(options?.isDefault));
  };

  const fetchTemplates = async (): Promise<TemplateListItem[]> => {
    const response = await axios.get('/api/tem-kinh/templates?scope=all');
    return Array.isArray(response.data?.items) ? (response.data.items as TemplateListItem[]) : [];
  };

  const refreshTemplates = async (preferredTemplateId?: number | null) => {
    const nextTemplates = await fetchTemplates();
    setTemplates(nextTemplates);

    const selectedStillExists =
      preferredTemplateId == null
        ? nextTemplates.find((item) => item.id === selectedTemplateId && item.id != null)
        : nextTemplates.find((item) => item.id === preferredTemplateId && item.id != null);

    const chosen =
      selectedStillExists ||
      nextTemplates.find((item) => item.is_default && item.id != null) ||
      nextTemplates.find((item) => item.id != null) ||
      null;

    setSelectedTemplateId(chosen?.id ?? null);

    if (chosen) {
      applyTemplateToDesigner(chosen, { isDefault: Boolean(chosen.is_default) });
    } else {
      applyTemplateToDesigner(createDefaultTemKinhTemplate(), { isDefault: false });
    }
  };

  const loadPrinters = async () => {
    try {
      setPrinterStatus('Đang tải danh sách máy in...');
      const response = await axios.get('/api/print-tspl');
      const printerList = Array.isArray(response.data?.printers)
        ? (response.data.printers as string[]).filter((item) => typeof item === 'string' && item.trim())
        : [];

      setPrinters(printerList);

      const localPrinter =
        typeof window !== 'undefined' ? (window.localStorage.getItem(DIRECT_PRINTER_STORAGE_KEY) || '').trim() : '';
      const defaultPrinter = typeof response.data?.defaultPrinter === 'string' ? response.data.defaultPrinter.trim() : '';

      const nextPrinter =
        (localPrinter && printerList.includes(localPrinter) ? localPrinter : '') ||
        (defaultPrinter && printerList.includes(defaultPrinter) ? defaultPrinter : '') ||
        printerList[0] ||
        '';

      setPrinterName(nextPrinter);
      if (nextPrinter && typeof window !== 'undefined') {
        window.localStorage.setItem(DIRECT_PRINTER_STORAGE_KEY, nextPrinter);
      }

      setPrinterStatus(printerList.length > 0 ? `Đã tìm thấy ${printerList.length} máy in.` : 'Không tìm thấy máy in nào.');
    } catch (err: any) {
      console.error('loadPrinters error:', err);
      const message = err?.response?.data?.error || err?.message || 'Không tải được danh sách máy in.';
      setPrinterStatus(message);
    }
  };

  useEffect(() => {
    const bootstrap = async () => {
      setLoadingInitial(true);
      try {
        const [framesRes, templatesRes] = await Promise.allSettled([
          axios.get('/api/gong-kinh?scope=shared'),
          fetchTemplates(),
        ]);

        const frameItems =
          framesRes.status === 'fulfilled' && Array.isArray(framesRes.value.data)
            ? (framesRes.value.data as GongKinh[])
            : [];
        setFrames(frameItems);

        const templateItems = templatesRes.status === 'fulfilled' ? templatesRes.value : [];
        setTemplates(templateItems);

        if (framesRes.status === 'rejected') {
          console.error('bootstrap tem-kinh frames error:', framesRes.reason);
          toast.error('Không tải được danh sách gọng kính');
        }

        if (templatesRes.status === 'rejected') {
          console.error('bootstrap tem-kinh templates error:', templatesRes.reason);
          toast.error('Không tải được danh sách template, sẽ dùng mẫu mặc định');
        }

        const queryFrameId = parsePositiveInt(router.query.gong_kinh_id);
        if (queryFrameId) {
          setSelectedFrameId(queryFrameId);
        } else if (frameItems.length > 0) {
          setSelectedFrameId(frameItems[0].id);
        }

        const queryTemplateId = parsePositiveInt(router.query.template_id);
        let localTemplateId: number | null = null;
        if (typeof window !== 'undefined') {
          localTemplateId = parsePositiveInt(window.localStorage.getItem(TEMPLATE_STORAGE_KEY));
        }

        const selectedTemplate =
          templateItems.find((item) => item.id === queryTemplateId) ||
          templateItems.find((item) => item.id === localTemplateId) ||
          templateItems.find((item) => item.is_default && item.id != null) ||
          templateItems.find((item) => item.id != null) ||
          null;

        setSelectedTemplateId(selectedTemplate?.id ?? null);

        if (selectedTemplate) {
          applyTemplateToDesigner(selectedTemplate, { isDefault: Boolean(selectedTemplate.is_default) });
        } else {
          applyTemplateToDesigner(createDefaultTemKinhTemplate(), { isDefault: false });
        }

        autoPrintedRef.current = false;
      } catch (error) {
        console.error('bootstrap tem-kinh error:', error);
        toast.error('Không tải được dữ liệu tem kính');
      } finally {
        setLoadingInitial(false);
      }
    };

    void bootstrap();
  }, [router.query.gong_kinh_id, router.query.template_id]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (selectedTemplateId && selectedTemplateId > 0) {
      window.localStorage.setItem(TEMPLATE_STORAGE_KEY, String(selectedTemplateId));
    }
  }, [selectedTemplateId]);

  useEffect(() => {
    void loadPrinters();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (!printerName.trim()) return;
    window.localStorage.setItem(DIRECT_PRINTER_STORAGE_KEY, printerName.trim());
  }, [printerName]);

  const loadPreview = async (useDraft: boolean): Promise<TemDataResponse | null> => {
    if (!selectedFrameId) {
      toast.error('Vui lòng chọn gọng kính');
      return null;
    }

    setLoadingPreview(true);
    try {
      let response;

      if (useDraft) {
        const draftTemplate = normalizeTemplateForSave(template);
        response = await axios.post('/api/tem-kinh/data', {
          gong_kinh_id: selectedFrameId,
          template: draftTemplate,
        });
      } else {
        response = await axios.get('/api/tem-kinh/data', {
          params: {
            gong_kinh_id: selectedFrameId,
            template_id: selectedTemplateId || undefined,
          },
        });
      }

      const nextPayload = response.data as TemDataResponse;
      setPayload(nextPayload);
      return nextPayload;
    } catch (err: any) {
      console.error('loadPreview error:', err);
      const message = err?.response?.data?.error || err?.message || 'Lỗi tải preview tem';
      toast.error(message);
      return null;
    } finally {
      setLoadingPreview(false);
    }
  };

  useEffect(() => {
    setIsPreviewMode(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedFrameId, selectedTemplateId]);

  const ensureDraftPreview = async (): Promise<TemDataResponse | null> => {
    const next = await loadPreview(true);
    if (!next) return null;
    return next;
  };

  const printPayloadInBrowser = (targetPayload: TemDataResponse): boolean => {
    const copies = clamp(
      Math.round(targetPayload.resolved_template?.copies || template.copies || 1),
      1,
      500
    );

    const popup = printResolvedTemTemplate({
      template: targetPayload.resolved_template,
      copies,
    });

    if (!popup) {
      toast.error('Không mở được cửa sổ in. Hãy cho phép pop-up.');
      return false;
    }

    return true;
  };

  const buildBitmapPayloadFromTemplate = async (resolvedTemplate: TemTemplate) => {
    const dpi = clamp(Math.round(Number(resolvedTemplate.dpi || 203)), 200, 600);
    const widthDots = Math.max(1, mmToDots(resolvedTemplate.widthMm, dpi));
    const heightDots = Math.max(1, mmToDots(resolvedTemplate.heightMm, dpi));
    const widthBytes = Math.ceil(widthDots / 8);
    const sorted = [...resolvedTemplate.elements].sort((a, b) => a.z - b.z);

    const canvas = document.createElement('canvas');
    canvas.width = widthDots;
    canvas.height = heightDots;
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Không khởi tạo được canvas để raster hóa tem');
    }

    ctx.imageSmoothingEnabled = false;
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, widthDots, heightDots);

    for (const item of sorted) {
      const x = mmToDots(item.x, dpi);
      const y = mmToDots(item.y, dpi);
      const w = Math.max(1, mmToDots(item.w, dpi));
      const h = Math.max(1, mmToDots(item.h, dpi));

      ctx.save();
      ctx.translate(x + w / 2, y + h / 2);
      ctx.rotate(rotationRad(item.rotate));
      ctx.translate(-w / 2, -h / 2);

      if (item.kind === 'box') {
        if (isDarkColor(item.bgColor)) {
          ctx.fillStyle = '#000000';
          ctx.fillRect(0, 0, w, h);
        }
        ctx.restore();
        continue;
      }

      if (item.kind === 'text') {
        ctx.fillStyle = '#000000';
        const px = Math.max(8, Math.round(((item.fontSize ?? 2.5) * dpi) / 25.4));
        ctx.font = `${item.fontWeight ?? 600} ${px}px Arial`;
        ctx.textBaseline = 'middle';

        if (item.align === 'left') {
          ctx.textAlign = 'left';
          ctx.fillText(item.text ?? '', 0, h / 2);
        } else if (item.align === 'right') {
          ctx.textAlign = 'right';
          ctx.fillText(item.text ?? '', w, h / 2);
        } else {
          ctx.textAlign = 'center';
          ctx.fillText(item.text ?? '', w / 2, h / 2);
        }

        ctx.restore();
        continue;
      }

      let src = '';
      if (item.kind === 'qr') {
        src = await buildQrDataUrl(item.value || ' ', Math.max(36, Math.round(w)));
      } else if (item.kind === 'barcode') {
        src = buildBarcodeDataUrl(item.value || '0', Math.max(24, Math.round(h * 0.95)));
      }

      if (src) {
        try {
          const image = await loadImageFromDataUrl(src);
          ctx.imageSmoothingEnabled = false;
          ctx.drawImage(image, 0, 0, w, h);
        } catch {
          // Ignore broken image and continue rasterization.
        }
      }

      ctx.restore();
    }

    const imageData = ctx.getImageData(0, 0, widthDots, heightDots).data;
    const packed = new Uint8Array(widthBytes * heightDots);
    if (resolvedTemplate.bitmapInvert) packed.fill(0xff);

    const binary = adaptiveBinaryLuminance(imageData, widthDots, heightDots, dpi, 1.2, 0.055);

    for (let yy = 0; yy < heightDots; yy += 1) {
      for (let xx = 0; xx < widthDots; xx += 1) {
        const isDark = binary[yy * widthDots + xx] === 1;
        if (!isDark) continue;

        const tx = resolvedTemplate.bitmapRotate180 ? widthDots - 1 - xx : xx;
        const ty = resolvedTemplate.bitmapRotate180 ? heightDots - 1 - yy : yy;
        const byteIndex = ty * widthBytes + Math.floor(tx / 8);
        const bitMask = 1 << (7 - (tx % 8));

        if (resolvedTemplate.bitmapInvert) {
          packed[byteIndex] &= ~bitMask;
        } else {
          packed[byteIndex] |= bitMask;
        }
      }
    }

    return {
      dpi,
      widthBytes,
      heightDots,
      bitmapBase64: uint8ToBase64(packed),
    };
  };

  const printPayloadDirect = async (targetPayload: TemDataResponse): Promise<boolean> => {
    const printer = printerName.trim();
    if (!printer) {
      const msg = 'Vui lòng chọn máy in trước khi in trực tiếp.';
      setPrinterStatus(msg);
      toast.error(msg);
      return false;
    }

    const resolved = targetPayload.resolved_template;
    setIsDirectPrinting(true);
    setPrinterStatus('Đang chuyển layout sang dot và gửi máy in...');

    try {
      const bitmap = await buildBitmapPayloadFromTemplate(resolved);
      const copies = clamp(Math.round(resolved.copies || 1), 1, 500);

      const response = await axios.post('/api/print-tspl', {
        mode: 'bitmap',
        printerName: printer,
        widthMm: resolved.widthMm,
        heightMm: resolved.heightMm,
        dpi: bitmap.dpi,
        gapMm: resolved.gapMm,
        speed: resolved.speed,
        density: resolved.density,
        copies,
        bitmapOffsetXmm: resolved.bitmapOffsetXmm,
        bitmapOffsetYmm: resolved.bitmapOffsetYmm,
        widthBytes: bitmap.widthBytes,
        heightDots: bitmap.heightDots,
        bitmapBase64: bitmap.bitmapBase64,
      });

      const message = response.data?.message || `Đã gửi lệnh in trực tiếp tới ${printer}`;
      setPrinterStatus(message);
      toast.success(message);
      return true;
    } catch (err: any) {
      console.error('printPayloadDirect error:', err);
      const message = err?.response?.data?.error || err?.message || 'In trực tiếp thất bại.';
      setPrinterStatus(message);
      toast.error(message);
      return false;
    } finally {
      setIsDirectPrinting(false);
    }
  };

  const handlePrintCurrent = async () => {
    const nextPayload = await ensureDraftPreview();
    if (!nextPayload) return;
    setIsPreviewMode(true);
    await printPayloadDirect(nextPayload);
  };

  const handlePrintCurrentInBrowser = () => {
    if (!selectedFrameId) {
      toast.error('Vui lòng chọn gọng kính trước khi in');
      return;
    }

    void (async () => {
      const nextPayload = await ensureDraftPreview();
      if (!nextPayload) return;
      setIsPreviewMode(true);
      printPayloadInBrowser(nextPayload);
    })();
  };

  const handleTogglePreviewMode = () => {
    if (isPreviewMode) {
      setIsPreviewMode(false);
      return;
    }

    if (!selectedFrameId) {
      toast.error('Vui lòng chọn gọng kính để xem trước');
      return;
    }

    void (async () => {
      const nextPayload = await ensureDraftPreview();
      if (!nextPayload) return;
      setIsPreviewMode(true);
      toast.success('Đã chuyển sang chế độ xem dữ liệu thực tế');
    })();
  };

  useEffect(() => {
    if (router.query.auto_print !== '1') return;
    if (autoPrintedRef.current) return;
    autoPrintedRef.current = true;
    void (async () => {
      const nextPayload = await ensureDraftPreview();
      if (!nextPayload) {
        autoPrintedRef.current = false;
        return;
      }

      setIsPreviewMode(true);
      const ok = printerName.trim() ? await printPayloadDirect(nextPayload) : printPayloadInBrowser(nextPayload);
      if (!ok) {
        autoPrintedRef.current = false;
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.auto_print, selectedFrameId, selectedTemplateId, printerName]);

  useEffect(() => {
    if (!dragState) return;
    const activeDrag = dragState;

    function onMove(event: globalThis.PointerEvent) {
      const dxPx = event.clientX - activeDrag.startX;
      const dyPx = event.clientY - activeDrag.startY;
      const dxMm = dxPx / zoom;
      const dyMm = dyPx / zoom;

      setTemplate((prev) => ({
        ...prev,
        elements: prev.elements.map((item) => {
          if (item.id !== activeDrag.id) return item;
          return {
            ...item,
            x: Number((activeDrag.originX + dxMm).toFixed(2)),
            y: Number((activeDrag.originY + dyMm).toFixed(2)),
          };
        }),
      }));
    }

    function onUp() {
      setDragState(null);
    }

    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);

    return () => {
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
  }, [dragState, zoom]);

  const handleTemplateSelect = (nextTemplateId: number | null) => {
    setSelectedTemplateId(nextTemplateId);
    autoPrintedRef.current = false;

    const selectedTemplate = templates.find((item) => item.id === nextTemplateId);
    if (selectedTemplate) {
      applyTemplateToDesigner(selectedTemplate, { isDefault: Boolean(selectedTemplate.is_default) });
      return;
    }

    applyTemplateToDesigner(createDefaultTemKinhTemplate(), { isDefault: false });
  };

  const handleCreateNewTemplateDraft = () => {
    const base = normalizeTemLabelTemplate({
      ...template,
      name: `Mau in ${templates.length + 1}`,
    });
    setTemplate(base);
    setSelectedTemplateId(null);
    setEditorIsDefault(false);
    setSelectedId(null);
    autoPrintedRef.current = false;
  };

  const handleSaveTemplate = async (createNew: boolean) => {
    const toSave = normalizeTemplateForSave(template);

    setSavingTemplate(true);
    try {
      const payloadBody = {
        scope: 'shared',
        is_default: editorIsDefault,
        name: toSave.name,
        template: toSave,
      };

      const response =
        createNew || !selectedTemplateId
          ? await axios.post('/api/tem-kinh/templates', payloadBody)
          : await axios.put('/api/tem-kinh/templates', { ...payloadBody, id: selectedTemplateId });

      const savedId = parsePositiveInt(response.data?.item?.id);
      await refreshTemplates(savedId);
      toast.success(createNew || !selectedTemplateId ? 'Đã tạo mẫu mới' : 'Đã cập nhật mẫu in');
    } catch (err: any) {
      console.error('save template error:', err);
      const code = err?.response?.data?.code;
      const message = err?.response?.data?.error || err?.message || 'Lỗi lưu template';
      if (code === 'MIGRATION_REQUIRED') {
        toast.error('Thiếu migration tem kính (V078, V079)');
      } else {
        toast.error(message);
      }
    } finally {
      setSavingTemplate(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) {
      toast.error('Vui lòng chọn mẫu cần xóa');
      return;
    }

    const selectedTemplate = templates.find((item) => item.id === selectedTemplateId);
    const confirmed = window.confirm(`Xóa mẫu "${selectedTemplate?.name || selectedTemplateId}"?`);
    if (!confirmed) return;

    setDeletingTemplate(true);
    try {
      await axios.delete('/api/tem-kinh/templates', {
        params: { id: selectedTemplateId },
      });
      await refreshTemplates();
      toast.success('Đã xóa mẫu in');
    } catch (err: any) {
      console.error('delete template error:', err);
      const message = err?.response?.data?.error || err?.message || 'Lỗi xóa template';
      toast.error(message);
    } finally {
      setDeletingTemplate(false);
    }
  };

  const updateTemplateField = <K extends keyof TemLabelTemplate>(key: K, value: TemLabelTemplate[K]) => {
    setTemplate((prev) => normalizeTemLabelTemplate({ ...prev, [key]: value }));
  };

  const updateSelected = (patch: Partial<TemLabelElement>) => {
    if (!selectedId) return;
    setTemplate((prev) => ({
      ...prev,
      elements: prev.elements.map((item) => (item.id === selectedId ? { ...item, ...patch } : item)),
    }));
  };

  const getCurrentTokenFieldValue = (target: TokenInputTarget): string => {
    if (!selectedElement) return '';
    return target === 'text' ? selectedElement.text ?? '' : selectedElement.value ?? '';
  };

  const updateTokenFieldValue = (target: TokenInputTarget, value: string) => {
    if (target === 'text') {
      updateSelected({ text: value });
      return;
    }
    updateSelected({ value });
  };

  const setTokenMenuState = (target: TokenInputTarget, open: boolean, query: string) => {
    if (target === 'text') {
      setShowTextTokenMenu(open);
      setTextTokenQuery(query);
      return;
    }

    setShowCodeTokenMenu(open);
    setCodeTokenQuery(query);
  };

  const getTokenInputRef = (target: TokenInputTarget) => {
    return target === 'text' ? textTokenInputRef : codeTokenInputRef;
  };

  const handleTokenFieldChange = (target: TokenInputTarget, value: string, caretPos: number | null) => {
    updateTokenFieldValue(target, value);

    const nextCaret = caretPos ?? value.length;
    const atRange = findAtTriggerRange(value, nextCaret);
    if (atRange) {
      setTokenMenuState(target, true, atRange.query);
      return;
    }

    setTokenMenuState(target, false, '');
  };

  const toggleTokenMenu = (target: TokenInputTarget) => {
    const inputRef = getTokenInputRef(target);
    const currentValue = getCurrentTokenFieldValue(target);
    const caretPos = inputRef.current?.selectionStart ?? currentValue.length;
    const atRange = findAtTriggerRange(currentValue, caretPos);

    if (target === 'text') {
      const nextOpen = !showTextTokenMenu;
      setShowTextTokenMenu(nextOpen);
      setTextTokenQuery(nextOpen ? atRange?.query ?? '' : '');
      if (nextOpen) inputRef.current?.focus();
      return;
    }

    const nextOpen = !showCodeTokenMenu;
    setShowCodeTokenMenu(nextOpen);
    setCodeTokenQuery(nextOpen ? atRange?.query ?? '' : '');
    if (nextOpen) inputRef.current?.focus();
  };

  const closeTokenMenuWithDelay = (target: TokenInputTarget) => {
    window.setTimeout(() => {
      setTokenMenuState(target, false, '');
    }, 120);
  };

  const insertTokenFromMenu = (target: TokenInputTarget, option: TokenOption) => {
    const inputRef = getTokenInputRef(target);
    const currentValue = getCurrentTokenFieldValue(target);
    const caretPos = inputRef.current?.selectionStart ?? currentValue.length;
    const atRange = findAtTriggerRange(currentValue, caretPos);

    let start = caretPos;
    let end = caretPos;
    let insertion = option.token;

    if (atRange) {
      start = atRange.start;
      end = atRange.end;
    } else {
      const before = currentValue.slice(0, start);
      const after = currentValue.slice(end);

      const needSpaceBefore = before.length > 0 && !/\s/.test(before[before.length - 1]);
      const needSpaceAfter = after.length > 0 && !/[\s,.;:!?)]/.test(after[0]);

      if (needSpaceBefore) insertion = ` ${insertion}`;
      if (needSpaceAfter) insertion = `${insertion} `;
    }

    const nextValue = `${currentValue.slice(0, start)}${insertion}${currentValue.slice(end)}`;
    updateTokenFieldValue(target, nextValue);
    setTokenMenuState(target, false, '');

    const nextCaret = start + insertion.length;
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const addElement = (kind: TemLabelElement['kind']) => {
    const nextZ = Math.max(0, ...template.elements.map((item) => item.z)) + 1;

    const base: TemLabelElement =
      kind === 'text'
        ? {
            id: nextId('text'),
            kind,
            name: 'Van ban moi',
            x: 5,
            y: 5,
            w: 12,
            h: 4,
            rotate: 0,
            z: nextZ,
            text: '{{frame_name}}',
            fontSize: 2.6,
            fontWeight: 600,
            align: 'center',
            color: '#111111',
          }
        : kind === 'box'
          ? {
              id: nextId('box'),
              kind,
              name: 'Khoi moi',
              x: 5,
              y: 5,
              w: 14,
              h: 6,
              rotate: 0,
              z: nextZ,
              bgColor: '#f2f2f2',
              radius: 0.8,
            }
          : kind === 'qr'
            ? {
                id: nextId('qr'),
                kind,
                name: 'QR moi',
                x: 5,
                y: 5,
                w: 8,
                h: 8,
                rotate: 0,
                z: nextZ,
                value: '{{qr_value}}',
              }
            : {
                id: nextId('barcode'),
                kind,
                name: 'Barcode moi',
                x: 5,
                y: 5,
                w: 16,
                h: 5,
                rotate: 0,
                z: nextZ,
                value: '{{barcode_value}}',
              };

    setTemplate((prev) => ({ ...prev, elements: [...prev.elements, base] }));
    setSelectedId(base.id);
  };

  const deleteSelected = () => {
    if (!selectedId) return;
    setTemplate((prev) => ({ ...prev, elements: prev.elements.filter((item) => item.id !== selectedId) }));
    setSelectedId(null);
  };

  const moveLayer = (direction: 'up' | 'down') => {
    if (!selectedElement) return;
    const ordered = [...template.elements].sort((a, b) => a.z - b.z);
    const index = ordered.findIndex((item) => item.id === selectedElement.id);
    if (index < 0) return;

    const target = direction === 'up' ? index + 1 : index - 1;
    if (target < 0 || target >= ordered.length) return;

    const current = ordered[index];
    const swapped = ordered[target];

    setTemplate((prev) => ({
      ...prev,
      elements: prev.elements.map((item) => {
        if (item.id === current.id) return { ...item, z: swapped.z };
        if (item.id === swapped.id) return { ...item, z: current.z };
        return item;
      }),
    }));
  };

  const startDrag = (event: PointerEvent<HTMLDivElement>, item: TemLabelElement) => {
    if (isPreviewMode) return;
    if (event.button !== 0) return;
    event.stopPropagation();
    setSelectedId(item.id);
    setDragState({
      id: item.id,
      startX: event.clientX,
      startY: event.clientY,
      originX: item.x,
      originY: item.y,
    });
  };

  const exportJson = () => {
    const blob = new Blob([JSON.stringify(template, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `${template.name || 'template'}.json`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const importJson = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(String(reader.result));
        const normalized = normalizeTemLabelTemplate(parsed);
        setTemplate(normalized);
        setSelectedId(null);
        setSelectedTemplateId(null);
        setEditorIsDefault(false);
        autoPrintedRef.current = false;
      } catch {
        toast.error('JSON template không hợp lệ');
      }
    };

    reader.readAsText(file);
    event.target.value = '';
  };

  return (
    <ProtectedRoute>
      <FeatureGate feature="print_config">
        <main className={styles.page}>
          <section className={styles.leftPanel}>
            <h1>Tem Designer kéo-thả</h1>
            <p>Kéo thả phần tử giống mẫu của bạn, sau đó bấm xem trước để thấy dữ liệu thực tế trên tem.</p>

            <div className={styles.block}>
              <h2>Dữ liệu in nhanh</h2>
              <label>
                Gọng kính
                <select value={selectedFrameId ?? ''} onChange={(e) => setSelectedFrameId(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">-- Chọn gọng kính --</option>
                  {frames.map((frame) => (
                    <option key={frame.id} value={frame.id}>
                      {frame.ten_gong} {frame.ma_gong ? `(${frame.ma_gong})` : ''}
                    </option>
                  ))}
                </select>
              </label>

              <label>
                Mẫu đã lưu
                <select value={selectedTemplateId ?? ''} onChange={(e) => handleTemplateSelect(e.target.value ? Number(e.target.value) : null)}>
                  <option value="">Mặc định hệ thống</option>
                  {templates
                    .filter((item) => item.id != null)
                    .map((item) => (
                      <option key={item.id!} value={item.id!}>
                        {item.name}
                        {item.is_default ? ' (mặc định in nhanh)' : ''}
                      </option>
                    ))}
                </select>
              </label>

              <div className={styles.grid2}>
                <label>
                  Máy in trực tiếp
                  <select value={printerName} onChange={(e) => setPrinterName(e.target.value)}>
                    {!printers.length ? <option value="">(Chưa có dữ liệu)</option> : null}
                    {printers.map((printer) => (
                      <option key={printer} value={printer}>
                        {printer}
                      </option>
                    ))}
                  </select>
                </label>
                <button onClick={() => void loadPrinters()}>Nạp lại máy in</button>
              </div>

              <div className={styles.grid2}>
                <button onClick={handleTogglePreviewMode} disabled={loadingPreview || !selectedFrameId}>
                  {loadingPreview
                    ? 'Đang tải...'
                    : isPreviewMode
                      ? 'Quay lại chế độ chỉnh sửa'
                      : 'Xem trước dữ liệu thực tế'}
                </button>
                <button onClick={() => void handlePrintCurrent()} disabled={loadingPreview || isDirectPrinting || !selectedFrameId}>
                  {isDirectPrinting ? 'Đang in trực tiếp...' : 'In trực tiếp'}
                </button>
              </div>

              <div className={styles.grid2}>
                <button onClick={handlePrintCurrentInBrowser} disabled={loadingPreview || isDirectPrinting || !selectedFrameId}>
                  In qua trình duyệt
                </button>
                <div className={styles.statusText}>{printerStatus || 'Mẹo: bấm xem trước để xem dữ liệu thật trước khi in.'}</div>
              </div>

              {loadingInitial ? <p className={styles.statusText}>Đang tải dữ liệu...</p> : null}
            </div>

            <div className={styles.block}>
              <h2>Template</h2>
              <label>
                Tên mẫu
                <input value={template.name} onChange={(e) => updateTemplateField('name', e.target.value)} placeholder="Tem kinh 70x50" />
              </label>

              <label className={styles.inlineCheck}>
                <input type="checkbox" checked={editorIsDefault} onChange={(e) => setEditorIsDefault(e.target.checked)} />
                Dùng làm mẫu mặc định in nhanh
              </label>

              <div className={styles.grid2}>
                <label>
                  Rộng (mm)
                  <input
                    type="number"
                    min={10}
                    max={300}
                    step={0.1}
                    value={template.widthMm}
                    onChange={(e) => updateTemplateField('widthMm', clamp(Number(e.target.value) || 10, 10, 300))}
                  />
                </label>
                <label>
                  Cao (mm)
                  <input
                    type="number"
                    min={10}
                    max={300}
                    step={0.1}
                    value={template.heightMm}
                    onChange={(e) => updateTemplateField('heightMm', clamp(Number(e.target.value) || 10, 10, 300))}
                  />
                </label>
              </div>

              <div className={styles.grid2}>
                <label>
                  Số bản in
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={1}
                    value={template.copies}
                    onChange={(e) => updateTemplateField('copies', clamp(Math.round(Number(e.target.value) || 1), 1, 500))}
                  />
                </label>
                <label>
                  Bù lệch X/Y (mm)
                  <div className={styles.grid2}>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={offsetXInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!/^[-]?\d*(?:[\.,]\d*)?$/.test(raw)) return;
                        setOffsetXInput(raw);
                        const parsed = Number(raw.replace(',', '.'));
                        if (Number.isFinite(parsed)) {
                          updateTemplateField('bitmapOffsetXmm', clamp(parsed, -8, 8));
                        }
                      }}
                      onBlur={() => {
                        const parsed = Number(offsetXInput.replace(',', '.'));
                        const safe = Number.isFinite(parsed) ? clamp(parsed, -8, 8) : 0;
                        updateTemplateField('bitmapOffsetXmm', safe);
                        setOffsetXInput(String(safe));
                      }}
                      onWheel={(event) => event.preventDefault()}
                      placeholder="0"
                    />
                    <input
                      type="text"
                      inputMode="decimal"
                      value={offsetYInput}
                      onChange={(e) => {
                        const raw = e.target.value;
                        if (!/^[-]?\d*(?:[\.,]\d*)?$/.test(raw)) return;
                        setOffsetYInput(raw);
                        const parsed = Number(raw.replace(',', '.'));
                        if (Number.isFinite(parsed)) {
                          updateTemplateField('bitmapOffsetYmm', clamp(parsed, -8, 8));
                        }
                      }}
                      onBlur={() => {
                        const parsed = Number(offsetYInput.replace(',', '.'));
                        const safe = Number.isFinite(parsed) ? clamp(parsed, -8, 8) : 0;
                        updateTemplateField('bitmapOffsetYmm', safe);
                        setOffsetYInput(String(safe));
                      }}
                      onWheel={(event) => event.preventDefault()}
                      placeholder="0"
                    />
                  </div>
                </label>
              </div>

              <button type="button" onClick={() => setAdvancedOpen((prev) => !prev)}>
                {advancedOpen ? 'Ẩn cài đặt nâng cao' : 'Hiện cài đặt nâng cao'}
              </button>
              {advancedOpen ? (
                <>
                  <p className={styles.statusText}>
                    Gợi ý: thường chỉ cần để mặc định. Speed là tốc độ kéo giấy, Density là độ đậm, Zoom chỉ dùng để phóng to thu nhỏ khi thiết kế trên màn hình.
                  </p>
                  <div className={styles.grid2}>
                    <label>
                      DPI
                      <input
                        type="number"
                        min={200}
                        max={600}
                        step={1}
                        value={template.dpi}
                        onChange={(e) => updateTemplateField('dpi', clamp(Math.round(Number(e.target.value) || 203), 200, 600))}
                      />
                    </label>
                    <label>
                      Gap (mm)
                      <input
                        type="number"
                        min={0}
                        max={10}
                        step={0.1}
                        value={template.gapMm}
                        onChange={(e) => updateTemplateField('gapMm', clamp(Number(e.target.value) || 0, 0, 10))}
                      />
                    </label>
                  </div>

                  <div className={styles.grid2}>
                    <label>
                      Speed
                      <input
                        type="number"
                        min={1}
                        max={6}
                        step={1}
                        value={template.speed}
                        onChange={(e) => updateTemplateField('speed', clamp(Math.round(Number(e.target.value) || 4), 1, 6))}
                      />
                    </label>
                    <label>
                      Density
                      <input
                        type="number"
                        min={1}
                        max={15}
                        step={1}
                        value={template.density}
                        onChange={(e) => updateTemplateField('density', clamp(Math.round(Number(e.target.value) || 10), 1, 15))}
                      />
                    </label>
                  </div>

                  <label>
                    Zoom khi thiết kế (px/mm)
                    <input
                      type="number"
                      min={3}
                      max={20}
                      step={0.5}
                      value={zoom}
                      onChange={(e) => setZoom(clamp(Number(e.target.value) || 8, 3, 20))}
                    />
                  </label>
                </>
              ) : null}

              <div className={styles.grid2}>
                <label>
                  Màu nền
                  <input type="color" value={template.background} onChange={(e) => updateTemplateField('background', e.target.value)} />
                </label>
              </div>

              <label className={styles.inlineCheck}>
                <input type="checkbox" checked={template.bitmapInvert} onChange={(e) => updateTemplateField('bitmapInvert', e.target.checked)} />
                Bitmap invert
              </label>
              <label className={styles.inlineCheck}>
                <input
                  type="checkbox"
                  checked={template.bitmapRotate180}
                  onChange={(e) => updateTemplateField('bitmapRotate180', e.target.checked)}
                />
                Bitmap rotate 180
              </label>
            </div>

            <div className={styles.block}>
              <h2>Lưu / Quản lý mẫu</h2>
              <div className={styles.grid2}>
                <button onClick={handleCreateNewTemplateDraft}>Tạo mẫu mới</button>
                <button onClick={() => void handleSaveTemplate(false)} disabled={savingTemplate}>
                  {selectedTemplateId ? 'Lưu đè mẫu hiện tại' : 'Lưu mẫu mới'}
                </button>
              </div>
              <div className={styles.grid2}>
                <button onClick={() => void handleSaveTemplate(true)} disabled={savingTemplate}>
                  Lưu thành mẫu mới
                </button>
                <button className={styles.danger} onClick={() => void handleDeleteTemplate()} disabled={!selectedTemplateId || deletingTemplate}>
                  Xóa mẫu đã chọn
                </button>
              </div>
              <div className={styles.grid2}>
                <button onClick={exportJson}>Xuất JSON</button>
                <button onClick={() => importInputRef.current?.click()}>Nhập JSON</button>
              </div>
              <input ref={importInputRef} type="file" accept="application/json" onChange={importJson} className={styles.hiddenInput} />
            </div>
          </section>

          <section className={styles.centerPanel}>
            <div className={styles.canvasHeader}>
              <span>
                {canvasTemplate.name} | {canvasTemplate.widthMm} x {canvasTemplate.heightMm} mm
              </span>
              <span>{isPreviewMode ? 'Đang xem dữ liệu thực tế (không chỉnh sửa trực tiếp).' : 'Click để chọn, giữ chuột trái để kéo-thả phần tử.'}</span>
            </div>

            <div className={styles.canvasWrap}>
              <div
                className={styles.canvas}
                style={{
                  width: `${canvasTemplate.widthMm * zoom}px`,
                  height: `${canvasTemplate.heightMm * zoom}px`,
                  background: canvasTemplate.background,
                }}
                onPointerDown={() => {
                  if (!isPreviewMode) setSelectedId(null);
                }}
              >
                {canvasElements.map((item) => {
                  const isSelected = item.id === selectedId;
                  const common: React.CSSProperties = {
                    left: `${item.x * zoom}px`,
                    top: `${item.y * zoom}px`,
                    width: `${item.w * zoom}px`,
                    height: `${item.h * zoom}px`,
                    transform: `rotate(${item.rotate}deg)`,
                    zIndex: item.z,
                  };

                  if (item.kind === 'box') {
                    return (
                      <div
                        key={item.id}
                        className={!isPreviewMode && isSelected ? styles.elSelected : styles.el}
                        style={{
                          ...common,
                          background: item.bgColor ?? '#ffffff',
                          borderRadius: `${(item.radius ?? 0) * zoom}px`,
                        }}
                        onPointerDown={(event) => startDrag(event, item)}
                      />
                    );
                  }

                  if (item.kind === 'text') {
                    const justify = item.align === 'left' ? 'flex-start' : item.align === 'right' ? 'flex-end' : 'center';
                    return (
                      <div
                        key={item.id}
                        className={!isPreviewMode && isSelected ? styles.elSelected : styles.el}
                        style={{
                          ...common,
                          color: item.color ?? '#111111',
                          fontSize: `${(item.fontSize ?? 2.5) * zoom}px`,
                          fontWeight: item.fontWeight ?? 600,
                          justifyContent: justify,
                        }}
                        onPointerDown={(event) => startDrag(event, item)}
                      >
                        {item.text}
                      </div>
                    );
                  }

                  if (item.kind === 'qr') {
                    const src = buildQrSrc(item.value || '', Math.round(item.w * zoom * 3));
                    return (
                      <div
                        key={item.id}
                        className={!isPreviewMode && isSelected ? styles.elSelected : styles.el}
                        style={common}
                        onPointerDown={(event) => startDrag(event, item)}
                      >
                        <img src={src} alt="QR" className={styles.assetImage} />
                      </div>
                    );
                  }

                  const src = buildBarcodeSrc(item.value || '', Math.round(item.h * zoom * 3));
                  return (
                    <div
                      key={item.id}
                      className={!isPreviewMode && isSelected ? styles.elSelected : styles.el}
                      style={common}
                      onPointerDown={(event) => startDrag(event, item)}
                    >
                      <img src={src} alt="Barcode" className={styles.assetImage} />
                    </div>
                  );
                })}
              </div>
            </div>
          </section>

          <section className={styles.rightPanel}>
            <div className={styles.block}>
              <h2>Thêm phần tử</h2>
              <div className={styles.grid4}>
                <button onClick={() => addElement('text')}>Văn bản</button>
                <button onClick={() => addElement('box')}>Khối</button>
                <button onClick={() => addElement('qr')}>QR</button>
                <button onClick={() => addElement('barcode')}>Barcode</button>
              </div>
            </div>

            <h2>Thuộc tính phần tử</h2>
            {isPreviewMode ? (
              <p className={styles.muted}>Đang ở chế độ xem dữ liệu thực tế. Bấm "Quay lại chế độ chỉnh sửa" để sửa layout.</p>
            ) : !selectedElement ? (
              <p className={styles.muted}>Chọn một phần tử trên canvas để chỉnh.</p>
            ) : (
              <div className={styles.block}>
                <label>
                  Tên
                  <input value={selectedElement.name} onChange={(e) => updateSelected({ name: e.target.value })} />
                </label>

                <div className={styles.grid2}>
                  <label>
                    X (mm)
                    <input type="number" step={0.1} value={selectedElement.x} onChange={(e) => updateSelected({ x: Number(e.target.value) || 0 })} />
                  </label>
                  <label>
                    Y (mm)
                    <input type="number" step={0.1} value={selectedElement.y} onChange={(e) => updateSelected({ y: Number(e.target.value) || 0 })} />
                  </label>
                </div>

                <div className={styles.grid2}>
                  <label>
                    Rộng (mm)
                    <input
                      type="number"
                      step={0.1}
                      value={selectedElement.w}
                      onChange={(e) => updateSelected({ w: clamp(Number(e.target.value) || 0.1, 0.1, 300) })}
                    />
                  </label>
                  <label>
                    Cao (mm)
                    <input
                      type="number"
                      step={0.1}
                      value={selectedElement.h}
                      onChange={(e) => updateSelected({ h: clamp(Number(e.target.value) || 0.1, 0.1, 300) })}
                    />
                  </label>
                </div>

                <div className={styles.grid2}>
                  <label>
                    Rotate (deg)
                    <input type="number" step={1} value={selectedElement.rotate} onChange={(e) => updateSelected({ rotate: Number(e.target.value) || 0 })} />
                  </label>
                  <label>
                    Z-index
                    <input type="number" step={1} value={selectedElement.z} onChange={(e) => updateSelected({ z: Number(e.target.value) || 1 })} />
                  </label>
                </div>

                {selectedElement.kind === 'text' ? (
                  <>
                    <label>
                      Nội dung
                      <div className={styles.tokenFieldWrap}>
                        <div className={styles.tokenInputRow}>
                          <input
                            ref={textTokenInputRef}
                            value={selectedElement.text ?? ''}
                            onChange={(e) => handleTokenFieldChange('text', e.target.value, e.target.selectionStart)}
                            onBlur={() => closeTokenMenuWithDelay('text')}
                            placeholder="Ví dụ: Màu sắc: @"
                          />
                          <button
                            type="button"
                            className={styles.tokenToggle}
                            onMouseDown={(event) => event.preventDefault()}
                            onClick={() => toggleTokenMenu('text')}
                            title="Chèn thuộc tính sản phẩm"
                          >
                            ▼
                          </button>
                        </div>
                        {showTextTokenMenu ? (
                          <div className={styles.tokenMenu}>
                            {textTokenOptions.length === 0 ? (
                              <p className={styles.tokenEmpty}>Không tìm thấy thuộc tính phù hợp.</p>
                            ) : (
                              textTokenOptions.map((option) => (
                                <button
                                  key={option.token}
                                  type="button"
                                  className={styles.tokenMenuItem}
                                  onMouseDown={(event) => event.preventDefault()}
                                  onClick={() => insertTokenFromMenu('text', option)}
                                >
                                  <span className={styles.tokenMenuLabel}>{option.label}</span>
                                  <span className={styles.tokenMenuMeta}>{option.token}</span>
                                  <span className={styles.tokenMenuHint}>{option.hint}</span>
                                </button>
                              ))
                            )}
                          </div>
                        ) : null}
                      </div>
                      <span className={styles.tokenHelp}>Mẹo: gõ @ để hiện gợi ý thuộc tính sản phẩm, hoặc bấm tam giác ▼ để chọn nhanh.</span>
                    </label>
                    <div className={styles.grid2}>
                      <label>
                        Cỡ chữ (mm)
                        <input
                          type="number"
                          step={0.1}
                          value={selectedElement.fontSize ?? 2.5}
                          onChange={(e) => updateSelected({ fontSize: clamp(Number(e.target.value) || 0.1, 0.1, 20) })}
                        />
                      </label>
                      <label>
                        Độ đậm
                        <input
                          type="number"
                          min={100}
                          max={900}
                          step={100}
                          value={selectedElement.fontWeight ?? 600}
                          onChange={(e) => updateSelected({ fontWeight: clamp(Number(e.target.value) || 600, 100, 900) })}
                        />
                      </label>
                    </div>

                    <div className={styles.grid2}>
                      <label>
                        Căn lề
                        <select
                          value={selectedElement.align ?? 'center'}
                          onChange={(e) => updateSelected({ align: e.target.value as TemLabelElement['align'] })}
                        >
                          <option value="left">Trái</option>
                          <option value="center">Giữa</option>
                          <option value="right">Phải</option>
                        </select>
                      </label>
                      <label>
                        Màu chữ
                        <input type="color" value={selectedElement.color ?? '#111111'} onChange={(e) => updateSelected({ color: e.target.value })} />
                      </label>
                    </div>
                  </>
                ) : null}

                {selectedElement.kind === 'box' ? (
                  <div className={styles.grid2}>
                    <label>
                      Màu nền
                      <input type="color" value={selectedElement.bgColor ?? '#ffffff'} onChange={(e) => updateSelected({ bgColor: e.target.value })} />
                    </label>
                    <label>
                      Bo góc (mm)
                      <input
                        type="number"
                        step={0.1}
                        value={selectedElement.radius ?? 0}
                        onChange={(e) => updateSelected({ radius: clamp(Number(e.target.value) || 0, 0, 20) })}
                      />
                    </label>
                  </div>
                ) : null}

                {selectedElement.kind === 'qr' || selectedElement.kind === 'barcode' ? (
                  <label>
                    Giá trị mã
                    <div className={styles.tokenFieldWrap}>
                      <div className={styles.tokenInputRow}>
                        <input
                          ref={codeTokenInputRef}
                          value={selectedElement.value ?? ''}
                          onChange={(e) => handleTokenFieldChange('code', e.target.value, e.target.selectionStart)}
                          onBlur={() => closeTokenMenuWithDelay('code')}
                          placeholder="Nhập giá trị hoặc gõ @ để chèn token"
                        />
                        <button
                          type="button"
                          className={styles.tokenToggle}
                          onMouseDown={(event) => event.preventDefault()}
                          onClick={() => toggleTokenMenu('code')}
                          title="Chèn token QR/Barcode"
                        >
                          ▼
                        </button>
                      </div>
                      {showCodeTokenMenu ? (
                        <div className={styles.tokenMenu}>
                          {codeTokenOptions.length === 0 ? (
                            <p className={styles.tokenEmpty}>Không tìm thấy token phù hợp.</p>
                          ) : (
                            codeTokenOptions.map((option) => (
                              <button
                                key={option.token}
                                type="button"
                                className={styles.tokenMenuItem}
                                onMouseDown={(event) => event.preventDefault()}
                                onClick={() => insertTokenFromMenu('code', option)}
                              >
                                <span className={styles.tokenMenuLabel}>{option.label}</span>
                                <span className={styles.tokenMenuMeta}>{option.token}</span>
                                <span className={styles.tokenMenuHint}>{option.hint}</span>
                              </button>
                            ))
                          )}
                        </div>
                      ) : null}
                    </div>
                    <span className={styles.tokenHelp}>Mẹo: dùng @ để chèn nhanh mã gọng, QR hoặc Barcode động theo sản phẩm.</span>
                  </label>
                ) : null}

                <div className={styles.grid2}>
                  <button onClick={() => moveLayer('down')}>Layer -</button>
                  <button onClick={() => moveLayer('up')}>Layer +</button>
                </div>

                <button className={styles.danger} onClick={deleteSelected}>
                  Xóa phần tử
                </button>
              </div>
            )}

            <div className={styles.block}>
              <h2>Dữ liệu test gần nhất</h2>
              {payload ? (
                <div className={styles.dataSummary}>
                  <p>
                    <strong>Gọng:</strong> {payload.frame.ten_gong} {payload.frame.ma_gong ? `(${payload.frame.ma_gong})` : ''}
                  </p>
                  <p>
                    <strong>Giá in tem:</strong> {formatVnd(payload.pricing.effective_sell_price)}
                  </p>
                  <p>
                    <strong>Nguồn giá:</strong> {payload.pricing.source === 'branch_override' ? 'Override chi nhánh' : 'Giá danh mục'}
                  </p>
                  {payload.store?.ten_cua_hang ? (
                    <p>
                      <strong>Cửa hàng:</strong> {payload.store.ten_cua_hang}
                    </p>
                  ) : null}
                </div>
              ) : (
                <p className={styles.muted}>Chưa có dữ liệu test. Bấm "Test bản nháp" để nạp dữ liệu thật.</p>
              )}
            </div>
          </section>
        </main>
      </FeatureGate>
    </ProtectedRoute>
  );
}
