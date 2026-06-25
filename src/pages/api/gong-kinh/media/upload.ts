import type { NextApiRequest, NextApiResponse } from 'next';
import { requirePermission } from '../../../../lib/permissions';
import { requireTenant, setNoCacheHeaders } from '../../../../lib/tenantApi';
import { handleMediaUploadPut } from '../../../../lib/media/uploadProxyHandler';
import { DEFAULT_MEDIA_MAX_FILE_BYTES } from '../../../../lib/media/types';

const FRAME_MEDIA_WRITE_PERMISSIONS = ['manage_inventory', 'write_prescription'] as const;

export const config = {
  api: {
    bodyParser: false,
  },
};

function resolveMaxFileBytes(): number {
  const fromEnv = Number.parseInt(process.env.MEDIA_IMAGE_MAX_FILE_BYTES || '', 10);
  if (!Number.isFinite(fromEnv) || fromEnv <= 0) return DEFAULT_MEDIA_MAX_FILE_BYTES;
  return fromEnv;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  const ctx = await requireTenant(req, res);
  if (!ctx) return;

  if (!(await requirePermission(ctx, res, FRAME_MEDIA_WRITE_PERMISSIONS))) return;

  try {
    return await handleMediaUploadPut(req, res, {
      tenantId: ctx.tenantId,
      branchId: null,
      table: 'gong_kinh_media',
      maxFileBytes: resolveMaxFileBytes(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('gong-kinh/media/upload error:', error);
    return res.status(500).json({ message: 'Loi upload media GongKinh', details: message });
  }
}
