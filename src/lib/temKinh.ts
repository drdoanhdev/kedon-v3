export type TemElementKind = 'text' | 'box' | 'qr' | 'barcode';
export type TemTextAlign = 'left' | 'center' | 'right';

export interface TemLabelElement {
  id: string;
  kind: TemElementKind;
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  rotate: number;
  z: number;
  text?: string;
  value?: string;
  fontSize?: number;
  fontWeight?: number;
  align?: TemTextAlign;
  color?: string;
  bgColor?: string;
  radius?: number;
}

export interface TemLabelTemplate {
  name: string;
  widthMm: number;
  heightMm: number;
  dpi: number;
  gapMm: number;
  speed: number;
  density: number;
  bitmapInvert: boolean;
  bitmapRotate180: boolean;
  bitmapOffsetXmm: number;
  bitmapOffsetYmm: number;
  background: string;
  copies: number;
  elements: TemLabelElement[];
}

export interface TemFrameSource {
  id: number;
  ten_gong: string;
  ma_gong?: string | null;
  chat_lieu?: string | null;
  hang_san_xuat?: string | null;
  mau_sac?: string | null;
  kich_co?: string | null;
  gia_nhap?: number | null;
  gia_ban?: number | null;
  NhaCungCap?: { ten?: string | null } | null;
}

export interface TemStoreSource {
  ten_cua_hang?: string | null;
  dia_chi?: string | null;
  dien_thoai?: string | null;
  ten_chi_nhanh?: string | null;
}

export type TemTokenMap = Record<string, string>;

const TOKEN_PATTERN = /{{\s*([a-zA-Z0-9_.-]+)\s*}}/g;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function asFiniteNumber(value: unknown, fallback: number): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function asText(value: unknown, fallback = ''): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return fallback;
}

function normalizeElement(raw: unknown, index: number): TemLabelElement {
  const item = (raw && typeof raw === 'object' ? raw : {}) as Partial<TemLabelElement>;
  const kind = item.kind === 'box' || item.kind === 'qr' || item.kind === 'barcode' ? item.kind : 'text';

  const normalized: TemLabelElement = {
    id: asText(item.id, `${kind}-${index + 1}`),
    kind,
    name: asText(item.name, `${kind}-${index + 1}`),
    x: asFiniteNumber(item.x, 0),
    y: asFiniteNumber(item.y, 0),
    w: clamp(asFiniteNumber(item.w, 10), 0.1, 400),
    h: clamp(asFiniteNumber(item.h, 6), 0.1, 400),
    rotate: clamp(asFiniteNumber(item.rotate, 0), -360, 360),
    z: Math.max(0, Math.round(asFiniteNumber(item.z, index + 1))),
  };

  if (kind === 'text') {
    normalized.text = asText(item.text, '');
    normalized.fontSize = clamp(asFiniteNumber(item.fontSize, 2.5), 0.1, 24);
    normalized.fontWeight = clamp(Math.round(asFiniteNumber(item.fontWeight, 600)), 100, 900);
    normalized.align = item.align === 'left' || item.align === 'right' ? item.align : 'center';
    normalized.color = asText(item.color, '#111111');
  }

  if (kind === 'box') {
    normalized.bgColor = asText(item.bgColor, '#ffffff');
    normalized.radius = clamp(asFiniteNumber(item.radius, 0), 0, 50);
  }

  if (kind === 'qr' || kind === 'barcode') {
    normalized.value = asText(item.value, '');
  }

  return normalized;
}

export function createDefaultTemKinhTemplate(): TemLabelTemplate {
  return {
    name: 'Tem kinh 70x50',
    widthMm: 70,
    heightMm: 50,
    dpi: 203,
    gapMm: 2,
    speed: 4,
    density: 10,
    bitmapInvert: true,
    bitmapRotate180: true,
    bitmapOffsetXmm: 0,
    bitmapOffsetYmm: 0,
    background: '#4d74bf',
    copies: 1,
    elements: [
      {
        id: 'box-left',
        kind: 'box',
        name: 'Nen trai',
        x: 5,
        y: 2.5,
        w: 15,
        h: 45,
        rotate: 0,
        z: 1,
        bgColor: '#f2f2f2',
        radius: 1.1,
      },
      {
        id: 'box-right',
        kind: 'box',
        name: 'Nen giua',
        x: 20,
        y: 2.5,
        w: 15,
        h: 45,
        rotate: 0,
        z: 2,
        bgColor: '#f2f2f2',
        radius: 1.1,
      },
      {
        id: 'slot-arm',
        kind: 'box',
        name: 'Thanh ngang',
        x: 37.5,
        y: 23.1,
        w: 30,
        h: 4.2,
        rotate: 0,
        z: 3,
        bgColor: '#edf0f6',
        radius: 1,
      },
      {
        id: 'qr-main',
        kind: 'qr',
        name: 'QR',
        x: 12.7,
        y: 3.3,
        w: 6.5,
        h: 6.5,
        rotate: 0,
        z: 4,
        value: '{{qr_value}}',
      },
      {
        id: 'shop-name',
        kind: 'text',
        name: 'Ten cua hang',
        x: -11.79,
        y: 23.62,
        w: 40,
        h: 4,
        rotate: 270,
        z: 6,
        text: '{{store_name}}',
        fontSize: 3.1,
        fontWeight: 700,
        align: 'center',
        color: '#081123',
      },
      {
        id: 'left-meta-1',
        kind: 'text',
        name: 'Thong tin 1',
        x: -7.63,
        y: 25.42,
        w: 38,
        h: 1.8,
        rotate: 270,
        z: 7,
        text: 'Dia chi: {{store_address}}',
        fontSize: 2.3,
        fontWeight: 500,
        align: 'center',
        color: '#111111',
      },
      {
        id: 'left-meta-2',
        kind: 'text',
        name: 'Hang',
        x: 0.05,
        y: 30.33,
        w: 28,
        h: 1.8,
        rotate: 270,
        z: 7,
        text: 'Hang: {{brand}}',
        fontSize: 2.3,
        fontWeight: 500,
        align: 'left',
        color: '#111111',
      },
      {
        id: 'left-meta-3',
        kind: 'text',
        name: 'Chat lieu',
        x: 2.85,
        y: 30.5,
        w: 28,
        h: 1.8,
        rotate: 270,
        z: 7,
        text: 'Chat lieu: {{material}}',
        fontSize: 2.3,
        fontWeight: 500,
        align: 'left',
        color: '#111111',
      },
      {
        id: 'price',
        kind: 'text',
        name: 'Gia',
        x: 7.9,
        y: 22.87,
        w: 32,
        h: 3.6,
        rotate: 90,
        z: 7,
        text: '{{sell_price_vnd}}',
        fontSize: 3.1,
        fontWeight: 800,
        align: 'center',
        color: '#081123',
      },
      {
        id: 'serial',
        kind: 'text',
        name: 'Serial',
        x: 15.95,
        y: 23.41,
        w: 22,
        h: 1.6,
        rotate: 90,
        z: 7,
        text: '{{frame_code}}',
        fontSize: 2.2,
        fontWeight: 500,
        align: 'center',
        color: '#111111',
      },
      {
        id: 'barcode-main',
        kind: 'barcode',
        name: 'Barcode',
        x: 17.61,
        y: 21.2,
        w: 27.8,
        h: 5.3,
        rotate: 90,
        z: 8,
        value: '{{barcode_value}}',
      },
    ],
  };
}

export function normalizeTemLabelTemplate(input: unknown): TemLabelTemplate {
  const fallback = createDefaultTemKinhTemplate();
  const raw = (input && typeof input === 'object' ? input : {}) as Partial<TemLabelTemplate>;

  const elementsRaw = Array.isArray(raw.elements) ? raw.elements : fallback.elements;
  const elements = elementsRaw.map((item, index) => normalizeElement(item, index));

  return {
    name: asText(raw.name, fallback.name),
    widthMm: clamp(asFiniteNumber(raw.widthMm, fallback.widthMm), 10, 300),
    heightMm: clamp(asFiniteNumber(raw.heightMm, fallback.heightMm), 10, 300),
    dpi: clamp(Math.round(asFiniteNumber(raw.dpi, fallback.dpi)), 200, 600),
    gapMm: clamp(asFiniteNumber(raw.gapMm, fallback.gapMm), 0, 10),
    speed: clamp(Math.round(asFiniteNumber(raw.speed, fallback.speed)), 1, 6),
    density: clamp(Math.round(asFiniteNumber(raw.density, fallback.density)), 1, 15),
    bitmapInvert: typeof raw.bitmapInvert === 'boolean' ? raw.bitmapInvert : fallback.bitmapInvert,
    bitmapRotate180: typeof raw.bitmapRotate180 === 'boolean' ? raw.bitmapRotate180 : fallback.bitmapRotate180,
    bitmapOffsetXmm: clamp(asFiniteNumber(raw.bitmapOffsetXmm, fallback.bitmapOffsetXmm), -8, 8),
    bitmapOffsetYmm: clamp(asFiniteNumber(raw.bitmapOffsetYmm, fallback.bitmapOffsetYmm), -8, 8),
    background: asText(raw.background, fallback.background),
    copies: clamp(Math.round(asFiniteNumber(raw.copies, fallback.copies)), 1, 500),
    elements,
  };
}

export function formatVnd(value: number | null | undefined): string {
  const amount = Number.isFinite(value as number) ? Number(value) : 0;
  return `${amount.toLocaleString('vi-VN')} VND`;
}

function replaceTokenText(text: string, tokens: TemTokenMap): string {
  return text.replace(TOKEN_PATTERN, (_, key: string) => tokens[key] ?? '');
}

export function applyTemplateTokens(template: TemLabelTemplate, tokens: TemTokenMap): TemLabelTemplate {
  return {
    ...template,
    elements: template.elements.map((item) => {
      if (item.kind === 'text' && typeof item.text === 'string') {
        return { ...item, text: replaceTokenText(item.text, tokens) };
      }
      if ((item.kind === 'qr' || item.kind === 'barcode') && typeof item.value === 'string') {
        return { ...item, value: replaceTokenText(item.value, tokens) };
      }
      return item;
    }),
  };
}

export function buildTemTokens(params: {
  frame: TemFrameSource;
  store: TemStoreSource;
  effectiveSellPrice?: number | null;
  qrValue?: string;
  barcodeValue?: string;
}): TemTokenMap {
  const { frame, store } = params;

  const frameCode = asText(frame.ma_gong, '').trim() || String(frame.id);
  const sellPrice = params.effectiveSellPrice ?? frame.gia_ban ?? 0;
  const buyPrice = frame.gia_nhap ?? 0;

  const qrValue = asText(params.qrValue, '').trim() || frameCode;
  const barcodeValue = asText(params.barcodeValue, '').trim() || frameCode;

  return {
    store_name: asText(store.ten_cua_hang, '').trim() || 'Cua hang kinh',
    store_address: asText(store.dia_chi, '').trim(),
    store_phone: asText(store.dien_thoai, '').trim(),
    branch_name: asText(store.ten_chi_nhanh, '').trim(),
    frame_id: String(frame.id),
    frame_name: asText(frame.ten_gong, '').trim(),
    frame_code: frameCode,
    material: asText(frame.chat_lieu, '').trim(),
    manufacturer: asText(frame.hang_san_xuat, '').trim(),
    color: asText(frame.mau_sac, '').trim(),
    size: asText(frame.kich_co, '').trim(),
    brand: asText(frame.hang_san_xuat, '').trim(),
    supplier_name: asText(frame.NhaCungCap?.ten, '').trim(),
    buy_price_vnd: formatVnd(buyPrice),
    sell_price_vnd: formatVnd(sellPrice),
    qr_value: qrValue,
    barcode_value: barcodeValue,
    printed_at: new Date().toLocaleString('vi-VN'),
  };
}
