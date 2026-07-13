import type { NextApiRequest, NextApiResponse } from 'next';
import { requireTenant, supabaseAdmin, setNoCacheHeaders } from '../../../lib/tenantApi';
import {
  generatePairingCode,
  generatePendingTokenPrefix,
  hashDeviceToken,
} from '../../../lib/faceDeviceAuth';

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!ctx) return;

  const { id } = req.query;
  if (!id || typeof id !== 'string') {
    return res.status(400).json({ success: false, error: 'Missing device id' });
  }

  // Xoay vòng token: đưa thiết bị về trạng thái chờ ghép nối với mã mới,
  // vô hiệu hóa token hiện tại (agent phải ghép nối lại).
  if (req.method === 'POST' && req.query.action === 'rotate') {
    const pairingCode = generatePairingCode();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();
    const placeholderHash = hashDeviceToken(`pending_${pairingCode}_${Date.now()}`);

    const { data, error } = await supabaseAdmin
      .from('face_devices')
      .update({
        token_hash: placeholderHash,
        token_prefix: generatePendingTokenPrefix(),
        pairing_code: pairingCode,
        pairing_expires_at: expiresAt,
        status: 'pending_pair',
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .select('id, device_label, pairing_code, pairing_expires_at, status')
      .single();

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({
      success: true,
      data,
      message: 'Token cũ đã bị vô hiệu. Chạy lại ghép nối trên PC camera với mã mới trong 15 phút.',
    });
  }

  // Tạo / xoay kiosk token để mở màn hình chào bệnh nhân
  if (req.method === 'POST' && req.query.action === 'kiosk-token') {
    const { generateKioskToken } = await import('../../../lib/faceKiosk');
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from('face_devices')
      .select('id, status, settings, device_label')
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId)
      .maybeSingle();

    if (fetchError || !existing) {
      return res.status(404).json({ success: false, error: 'Không tìm thấy thiết bị' });
    }
    if (existing.status !== 'active') {
      return res.status(400).json({ success: false, error: 'Thiết bị cần ở trạng thái active' });
    }

    const settings = (existing.settings as Record<string, unknown>) || {};
    const rotate = Boolean(req.body?.rotate);
    const current =
      typeof settings.kiosk_token === 'string' && settings.kiosk_token.startsWith('fk_')
        ? settings.kiosk_token
        : null;
    const kioskToken = rotate || !current ? generateKioskToken() : current;

    const { error: updateError } = await supabaseAdmin
      .from('face_devices')
      .update({
        settings: {
          ...settings,
          kiosk_token: kioskToken,
          kiosk_token_rotated_at: new Date().toISOString(),
        },
        updated_at: new Date().toISOString(),
      })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (updateError) {
      return res.status(500).json({ success: false, error: updateError.message });
    }

    return res.status(200).json({
      success: true,
      data: {
        device_id: id,
        device_label: existing.device_label,
        kiosk_token: kioskToken,
        kiosk_path: `/kiosk-nhan-dien/${id}?token=${encodeURIComponent(kioskToken)}`,
      },
      message: rotate || !current ? 'Đã tạo kiosk token mới' : 'Đã lấy kiosk token hiện có',
    });
  }

  if (req.method === 'PATCH') {
    const { device_label, branch_id, pending_camera_url } = req.body || {};
    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    if (device_label?.trim()) patch.device_label = device_label.trim();
    if (branch_id !== undefined) patch.branch_id = branch_id || null;

    // Cho phép admin cập nhật RTSP URL từ xa — agent sẽ tự áp dụng ở lần đồng bộ tiếp theo
    // (xem heartbeat.ts / main.py heartbeat()), không cần chạm vào PC camera.
    if (pending_camera_url !== undefined) {
      const trimmed = typeof pending_camera_url === 'string' ? pending_camera_url.trim() : '';
      if (trimmed && !trimmed.toLowerCase().startsWith('rtsp://')) {
        return res.status(400).json({ success: false, error: 'URL phải bắt đầu bằng rtsp://' });
      }

      const { data: existing } = await supabaseAdmin
        .from('face_devices')
        .select('settings')
        .eq('id', id)
        .eq('tenant_id', ctx.tenantId)
        .maybeSingle();
      const settings = (existing?.settings as Record<string, unknown>) || {};

      if (trimmed) {
        patch.settings = {
          ...settings,
          pending_camera_url: trimmed,
          pending_camera_requested_at: new Date().toISOString(),
        };
      } else {
        const { pending_camera_url: _drop, pending_camera_requested_at: _drop2, ...rest } = settings;
        patch.settings = rest;
      }
    }

    const { error } = await supabaseAdmin
      .from('face_devices')
      .update(patch)
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({
      success: true,
      message: pending_camera_url
        ? 'Đã gửi yêu cầu đổi camera — PC sẽ tự áp dụng trong vài phút (khi agent đồng bộ tiếp theo).'
        : 'Đã cập nhật thiết bị',
    });
  }

  if (req.method === 'DELETE') {
    const { error } = await supabaseAdmin
      .from('face_devices')
      .update({ status: 'revoked', updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('tenant_id', ctx.tenantId);

    if (error) return res.status(500).json({ success: false, error: error.message });
    return res.status(200).json({ success: true, message: 'Đã thu hồi thiết bị' });
  }

  return res.status(405).json({ success: false, error: 'Method not allowed' });
}
