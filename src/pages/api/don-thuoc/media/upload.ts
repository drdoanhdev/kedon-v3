import type { NextApiRequest, NextApiResponse } from 'next';
import { requirePermission } from '../../../../lib/permissions';
import {
  requireTenant,
  resolveBranchAccess,
  setNoCacheHeaders,
} from '../../../../lib/tenantApi';
import { handleMediaUploadPut } from '../../../../lib/media/uploadProxyHandler';
import { DEFAULT_MEDIA_MAX_FILE_BYTES } from '../../../../lib/media/types';

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

  const branchAccess = await resolveBranchAccess(ctx, res, { requireForStaff: true, allowAllForOwner: true });
  if (!branchAccess) return;

  if (!(await requirePermission(ctx, res, 'write_prescription'))) return;

  try {
    return await handleMediaUploadPut(req, res, {
      tenantId: ctx.tenantId,
      branchId: branchAccess.branchId,
      table: 'don_thuoc_media',
      maxFileBytes: resolveMaxFileBytes(),
    });
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('don-thuoc/media/upload error:', error);
    return res.status(500).json({ message: 'Loi upload media DonThuoc', details: message });
  }
}
