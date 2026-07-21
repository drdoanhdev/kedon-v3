/**
 * Xác thực token kiosk (public, không cần đăng nhập nhân viên).
 * Chỉ lưu SHA-256 hash trong settings.kiosk_token_hash; plaintext trả về một lần khi tạo/xoay.
 */
import { createHash, randomBytes } from 'crypto';
import type { NextApiRequest, NextApiResponse } from 'next';
import { supabaseAdmin } from './tenantApi';
import { timingSafeEqualString } from './timingSafeEqual';

export function generateKioskToken(): string {
  return `fk_${randomBytes(24).toString('base64url')}`;
}

export function hashKioskToken(token: string): string {
  return createHash('sha256').update(token, 'utf8').digest('hex');
}

export interface KioskDeviceContext {
  deviceId: string;
  tenantId: string;
  branchId: string | null;
  deviceLabel: string;
}

function extractKioskToken(req: NextApiRequest): string {
  const header = req.headers['x-kiosk-token'];
  const fromHeader = Array.isArray(header) ? header[0] : header;
  if (typeof fromHeader === 'string' && fromHeader.trim()) {
    return fromHeader.trim();
  }
  // Legacy query — vẫn chấp nhận để không gãy bookmark cũ
  if (typeof req.query.token === 'string' && req.query.token.trim()) {
    return req.query.token.trim();
  }
  return '';
}

export async function requireKioskDevice(
  req: NextApiRequest,
  res: NextApiResponse
): Promise<KioskDeviceContext | null> {
  const deviceId = Array.isArray(req.query.deviceId)
    ? req.query.deviceId[0]
    : (req.query.deviceId as string | undefined) ||
      (Array.isArray(req.query.id) ? req.query.id[0] : (req.query.id as string | undefined));

  const token = extractKioskToken(req);
  if (!deviceId || !token || !token.startsWith('fk_')) {
    res.status(401).json({ success: false, error: 'Thiếu deviceId hoặc kiosk token' });
    return null;
  }

  const { data: device, error } = await supabaseAdmin
    .from('face_devices')
    .select('id, tenant_id, branch_id, device_label, status, settings')
    .eq('id', deviceId)
    .maybeSingle();

  if (error || !device) {
    res.status(404).json({ success: false, error: 'Không tìm thấy thiết bị' });
    return null;
  }

  if (device.status !== 'active') {
    res.status(403).json({ success: false, error: 'Thiết bị chưa kích hoạt' });
    return null;
  }

  const settings = (device.settings as Record<string, unknown>) || {};
  const storedHash =
    typeof settings.kiosk_token_hash === 'string' ? settings.kiosk_token_hash : '';
  const legacyPlain =
    typeof settings.kiosk_token === 'string' && settings.kiosk_token.startsWith('fk_')
      ? settings.kiosk_token
      : '';

  const tokenHash = hashKioskToken(token);
  const hashOk = Boolean(storedHash && timingSafeEqualString(storedHash, tokenHash));
  const legacyOk = Boolean(legacyPlain && timingSafeEqualString(legacyPlain, token));

  if (!hashOk && !legacyOk) {
    res.status(401).json({ success: false, error: 'Kiosk token không hợp lệ' });
    return null;
  }

  // Migrate legacy plaintext → hash
  if (legacyOk && !storedHash) {
    const { kiosk_token: _removed, ...rest } = settings;
    void supabaseAdmin
      .from('face_devices')
      .update({
        settings: {
          ...rest,
          kiosk_token_hash: tokenHash,
          kiosk_token_rotated_at:
            settings.kiosk_token_rotated_at || new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', device.id);
  }

  return {
    deviceId: device.id,
    tenantId: device.tenant_id,
    branchId: device.branch_id,
    deviceLabel: device.device_label || 'Camera',
  };
}

function todayStartVN(): string {
  const now = new Date();
  const vnNow = new Date(now.getTime() + 7 * 60 * 60 * 1000);
  const vnDateStr = vnNow.toISOString().split('T')[0];
  return new Date(`${vnDateStr}T00:00:00+07:00`).toISOString();
}

export interface KioskEvent {
  type: 'check_in' | 'already_in_queue' | 'unknown_face';
  at: string;
  patient_name?: string;
  patient_id?: number;
  queue_id?: number;
  queue_position?: number;
  avatar_url?: string | null;
  pending_id?: number;
  snapshot_url?: string | null;
  message: string;
}

/** Lấy sự kiện gần nhất cho kiosk (check-in từ device + pending faces). */
export async function fetchKioskRecentEvents(
  ctx: KioskDeviceContext,
  sinceMs = 120000
): Promise<KioskEvent[]> {
  const sinceIso = new Date(Date.now() - sinceMs).toISOString();
  const source = `device:${ctx.deviceId}`;
  const todayStart = todayStartVN();
  const events: KioskEvent[] = [];

  let queueQuery = supabaseAdmin
    .from('ChoKham')
    .select('id, thoigian, avatar_url, check_in_source, last_face_checkin_at, trangthai, benhnhanid, BenhNhan(id, ten)')
    .eq('tenant_id', ctx.tenantId)
    .eq('check_in_source', source)
    .gte('thoigian', todayStart)
    .order('thoigian', { ascending: false })
    .limit(20);

  if (ctx.branchId) {
    queueQuery = queueQuery.eq('branch_id', ctx.branchId);
  }

  let { data: queueRows, error: queueError } = await queueQuery;

  // Fallback nếu chưa chạy migration V090
  if (queueError?.message?.includes('last_face_checkin_at')) {
    let fallback = supabaseAdmin
      .from('ChoKham')
      .select('id, thoigian, avatar_url, check_in_source, trangthai, benhnhanid, BenhNhan(id, ten)')
      .eq('tenant_id', ctx.tenantId)
      .eq('check_in_source', source)
      .gte('thoigian', todayStart)
      .gte('thoigian', sinceIso)
      .order('thoigian', { ascending: false })
      .limit(5);
    if (ctx.branchId) fallback = fallback.eq('branch_id', ctx.branchId);
    const retry = await fallback;
    queueRows = retry.data;
    queueError = retry.error;
  }

  if (queueError) {
    console.warn('kiosk queue query:', queueError.message);
  }

  // Đếm vị trí chờ hôm nay
  let waitingQuery = supabaseAdmin
    .from('ChoKham')
    .select('id, thoigian')
    .eq('tenant_id', ctx.tenantId)
    .gte('thoigian', todayStart)
    .eq('trangthai', 'chờ')
    .order('thoigian', { ascending: true });

  if (ctx.branchId) {
    waitingQuery = waitingQuery.eq('branch_id', ctx.branchId);
  }

  const { data: waitingRows } = await waitingQuery;
  const positionById = new Map<number, number>();
  (waitingRows || []).forEach((row, idx) => {
    positionById.set(row.id as number, idx + 1);
  });

  const sinceTs = Date.now() - sinceMs;

  for (const row of queueRows || []) {
    const faceAt = (row.last_face_checkin_at as string | null) || (row.thoigian as string);
    if (new Date(faceAt).getTime() < sinceTs) continue;

    const bn = row.BenhNhan as { id: number; ten: string } | { id: number; ten: string }[] | null;
    const patient = Array.isArray(bn) ? bn[0] : bn;
    const pos = positionById.get(row.id as number);
    const isWaiting = row.trangthai === 'chờ' || row.trangthai === 'đang_khám';
    // Nếu last_face_checkin_at sau thoigian khá nhiều → lần nhận diện lại
    const firstCheckin = new Date(row.thoigian as string).getTime();
    const lastFace = new Date(faceAt).getTime();
    const isReRecognition = lastFace - firstCheckin > 15000 && isWaiting;

    events.push({
      type: isReRecognition ? 'already_in_queue' : 'check_in',
      at: faceAt,
      patient_id: patient?.id,
      patient_name: patient?.ten,
      queue_id: row.id as number,
      queue_position: pos,
      avatar_url: (row.avatar_url as string | null) ?? null,
      message: patient?.ten
        ? isReRecognition
          ? `${patient.ten} đã có trong danh sách chờ`
          : `Xin chào ${patient.ten}! Đã check-in thành công.`
        : 'Đã check-in thành công.',
    });
  }

  const { data: pendingRows } = await supabaseAdmin
    .from('PendingFaces')
    .select('id, detected_at, snapshot_url, status')
    .eq('tenant_id', ctx.tenantId)
    .eq('device_id', ctx.deviceId)
    .eq('status', 'pending')
    .gte('detected_at', sinceIso)
    .order('detected_at', { ascending: false })
    .limit(3);

  for (const row of pendingRows || []) {
    events.push({
      type: 'unknown_face',
      at: row.detected_at as string,
      pending_id: row.id as number,
      snapshot_url: (row.snapshot_url as string | null) ?? null,
      message: 'Chưa nhận diện được. Vui lòng đăng ký tại quầy lễ tân.',
    });
  }

  events.sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime());
  return events.slice(0, 8);
}
