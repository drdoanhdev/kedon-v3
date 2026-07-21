/**
 * Tải gói Optigo Face Agent — chỉ khi đã đăng nhập + có feature face_recognition còn hiệu lực.
 * Zip nằm ngoài public/ (private/downloads) để không tải được ẩn danh.
 */
import type { NextApiRequest, NextApiResponse } from 'next';
import fs from 'fs';
import path from 'path';
import { requireTenant, requireFeature, setNoCacheHeaders } from '../../../lib/tenantApi';

export const config = {
  api: {
    responseLimit: false,
  },
};

function resolveAgentZipPath(): string | null {
  const fromEnv = process.env.FACE_AGENT_ZIP_PATH?.trim();
  const candidates = [
    fromEnv,
    path.join(process.cwd(), 'private', 'downloads', 'OptigoFaceAgent.zip'),
    path.join(process.cwd(), 'services', 'face-agent', 'dist', 'OptigoFaceAgent.zip'),
  ].filter(Boolean) as string[];

  for (const p of candidates) {
    try {
      if (fs.existsSync(p) && fs.statSync(p).isFile()) return p;
    } catch {
      /* ignore */
    }
  }
  return null;
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  setNoCacheHeaders(res);

  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET']);
    return res.status(405).json({ success: false, error: 'Method not allowed' });
  }

  const ctx = await requireTenant(req, res, { allowedRoles: ['owner', 'admin'] });
  if (!ctx) return;
  if (!(await requireFeature(ctx, res, 'face_recognition'))) return;

  const zipPath = resolveAgentZipPath();
  if (!zipPath) {
    return res.status(404).json({
      success: false,
      error: 'Gói agent chưa được đóng gói trên server. Chạy npm run pack:face-agent.',
    });
  }

  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', 'attachment; filename="OptigoFaceAgent.zip"');
  res.setHeader('Cache-Control', 'no-store');

  const stream = fs.createReadStream(zipPath);
  stream.on('error', () => {
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Không đọc được file agent' });
    } else {
      res.end();
    }
  });
  stream.pipe(res);
}
