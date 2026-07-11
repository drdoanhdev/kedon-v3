import type { NextApiRequest, NextApiResponse } from 'next';
import { requireFaceDevice, touchFaceDevice } from '../../lib/faceDeviceAuth';
import { checkInPatientToQueue, MIN_CHECKIN_CONFIDENCE, validateFaceEmbedding } from '../../lib/faceRecognition';
import { trySmartLearningUpdate } from '../../lib/faceSmartLearning';

interface ApiResponse {
  success: boolean;
  message: string;
  data?: Record<string, unknown>;
  error?: string;
}

export default async function handler(
  req: NextApiRequest,
  res: NextApiResponse<ApiResponse>
) {
  if (req.method === 'OPTIONS') {
    res.status(200).end();
    return;
  }

  if (req.method === 'GET') {
    return res.status(200).json({
      success: true,
      message: 'API Nhận diện bệnh nhân — yêu cầu device token (gói Pro)',
      data: {
        version: '3.0.0',
        auth: 'Authorization: Bearer fd_...',
        endpoints: {
          POST: 'Check-in bệnh nhân vào danh sách chờ (device token bắt buộc)',
        },
        required_fields: ['patient_id', 'name', 'timestamp', 'action'],
        optional_fields: ['phone', 'note', 'image_data', 'confidence'],
      },
    });
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ success: false, message: `Method ${req.method} không được hỗ trợ` });
  }

  const device = await requireFaceDevice(req, res);
  if (!device) return;

  try {
    const {
      patient_id,
      name,
      timestamp,
      action,
      image_data,
      confidence,
      embedding,
    } = req.body || {};

    const patientId = parseInt(String(patient_id), 10);
    if (!patientId || !name || !timestamp || !action) {
      return res.status(400).json({
        success: false,
        message: 'Thiếu thông tin bắt buộc (patient_id, name, timestamp, action)',
      });
    }

    if (typeof confidence === 'number' && confidence < MIN_CHECKIN_CONFIDENCE) {
      return res.status(422).json({
        success: false,
        message: 'Độ tin cậy quá thấp, không tự động check-in',
        error: 'low_confidence',
      });
    }

    const result = await checkInPatientToQueue({
      tenantId: device.tenantId,
      branchId: device.branchId,
      patientId,
      avatar: image_data || null,
      source: `device:${device.deviceId}`,
    });

    await touchFaceDevice(device.deviceId, { ip: device.clientIp });

    if (
      result.status !== 'patient_not_found' &&
      Array.isArray(embedding) &&
      !validateFaceEmbedding(embedding) &&
      typeof confidence === 'number'
    ) {
      trySmartLearningUpdate(device.tenantId, patientId, embedding, confidence).catch((err) => {
        console.warn('smart learning skipped:', err);
      });
    }

    if (result.status === 'patient_not_found') {
      return res.status(404).json({ success: false, message: result.message });
    }

    return res.status(200).json({
      success: result.success,
      message: result.message,
      data: {
        ...result.data,
        action,
        status: result.status,
        detected_at: timestamp,
        device_id: device.deviceId,
      },
    });
  } catch (error) {
    console.error('nhan-dien error:', error);
    return res.status(500).json({
      success: false,
      message: 'Lỗi server khi xử lý nhận diện',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}
